import csv
import io
import secrets
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.admin import models, schemas
from app.modules.auth import service as auth_service
from app.modules.auth.models import User
from app.modules.auth.schemas import UserResponse
from app.modules.auth.service import require_admin, require_operator_or_admin
from app.modules.booking.models import Booking
from app.modules.operator import models as op_models
from app.modules.operator.models import RouteStop, Trip

router = APIRouter(prefix="/admin", tags=["Admin Management - Core"])


DEFAULT_PLATFORM_SETTINGS = [
    {
        "key": "support_phone",
        "label": "Support Phone",
        "value": "+91 1800-000-000",
        "category": "SUPPORT",
        "description": "Primary support line shown in admin and passenger flows.",
    },
    {
        "key": "support_email",
        "label": "Support Email",
        "value": "support@busgo.in",
        "category": "SUPPORT",
        "description": "Email used for booking support and refund communication.",
    },
    {
        "key": "default_currency",
        "label": "Default Currency",
        "value": "INR",
        "category": "BILLING",
        "description": "Currency code shown across payment and ledger modules.",
    },
    {
        "key": "booking_window_days",
        "label": "Advance Booking Window",
        "value": "45",
        "category": "BOOKING",
        "description": "How many days ahead passengers can reserve seats.",
    },
    {
        "key": "same_day_booking_enabled",
        "label": "Same Day Booking Enabled",
        "value": "true",
        "category": "BOOKING",
        "description": "Whether users can book trips that depart the same day.",
    },
    {
        "key": "auto_refund_limit",
        "label": "Auto Refund Limit",
        "value": "1000",
        "category": "REFUNDS",
        "description": "Maximum refund amount that can be auto-approved.",
    },
]


def get_or_create_revenue_config(db: Session) -> models.RevenueConfig:
    config = (
        db.query(models.RevenueConfig)
        .filter(models.RevenueConfig.is_active == True)
        .order_by(models.RevenueConfig.id.desc())
        .first()
    )
    if config:
        return config

    config = models.RevenueConfig()
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def get_or_create_cancellation_policy(db: Session) -> models.CancellationPolicy:
    policy = (
        db.query(models.CancellationPolicy)
        .filter(models.CancellationPolicy.is_active == True)
        .order_by(models.CancellationPolicy.id.desc())
        .first()
    )
    if policy:
        return policy

    policy = models.CancellationPolicy(
        policy_name="Standard Cancellation",
        cutoff_hours=6,
        refund_percent=80,
        processing_fee=25,
        applies_after_departure=False,
        description="Allow cancellations before departure with partial refund.",
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


def ensure_platform_settings(db: Session):
    existing = {
        item.setting_key: item
        for item in db.query(models.PlatformSetting).all()
    }
    created = False
    for default in DEFAULT_PLATFORM_SETTINGS:
        if default["key"] in existing:
            continue
        db.add(
            models.PlatformSetting(
                setting_key=default["key"],
                label=default["label"],
                setting_value=default["value"],
                category=default["category"],
                description=default["description"],
            )
        )
        created = True
    if created:
        db.commit()


def serialize_platform_settings(db: Session) -> schemas.PlatformSettingsResponse:
    ensure_platform_settings(db)
    settings = (
        db.query(models.PlatformSetting)
        .order_by(models.PlatformSetting.category.asc(), models.PlatformSetting.label.asc())
        .all()
    )
    return schemas.PlatformSettingsResponse(
        settings=[
            schemas.PlatformSettingItem(
                key=item.setting_key,
                label=item.label,
                value=item.setting_value,
                category=item.category,
                description=item.description,
            )
            for item in settings
        ]
    )


def calculate_financials(booking: Booking, config: models.RevenueConfig):
    gross = float(booking.total_fare or 0)
    refunded = float(booking.refunded_amount or 0)
    commission = round(gross * (config.commission_percent / 100.0), 2)
    gateway_fee = round(gross * (config.gateway_fee_percent / 100.0), 2)
    platform_fee = round(float(config.flat_platform_fee or 0), 2)
    taxable_base = commission + gateway_fee + platform_fee
    gst_amount = round(taxable_base * (config.gst_percent / 100.0), 2)
    operator_payout = round(max(gross - refunded - commission - gateway_fee - platform_fee - gst_amount, 0), 2)
    return {
        "commission": commission,
        "gateway_fee": gateway_fee,
        "platform_fee": platform_fee,
        "gst_amount": gst_amount,
        "operator_payout": operator_payout,
    }


def serialize_booking(db: Session, booking: Booking) -> schemas.AdminBookingResponse:
    operator_name = booking.trip.operator.name if booking.trip and booking.trip.operator else None
    origin_city = booking.boarding_city.name if booking.boarding_city else None
    destination_city = booking.dropping_city.name if booking.dropping_city else None
    departure_time = None
    if booking.trip and booking.boarding_stop:
        departure_time = booking.trip.departure_time + timedelta(minutes=booking.boarding_stop.time_offset_mins)
    return schemas.AdminBookingResponse(
        id=booking.id,
        booking_ref=booking.booking_ref,
        ticket_number=booking.ticket_number,
        passenger_name=booking.user.name if booking.user else None,
        passenger_phone=booking.user.phone if booking.user else None,
        operator_name=operator_name,
        origin_city=origin_city,
        destination_city=destination_city,
        departure_time=departure_time,
        booking_status=booking.status,
        payment_status=booking.payment_status,
        ops_status=booking.ops_status,
        total_passengers=booking.total_passengers,
        total_fare=float(booking.total_fare or 0),
        refunded_amount=float(booking.refunded_amount or 0),
        issue_flag=booking.issue_flag,
        created_at=booking.created_at,
    )


def create_admin_audit_log(db: Session, current_admin: User, action: str, entity_type: str, entity_id: int | None = None, details: str | None = None, status: str = "SUCCESS"):
    db.add(
        models.AdminAuditLog(
            actor_id=current_admin.id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
            status=status,
        )
    )


def get_or_create_inventory_rule(db: Session) -> models.InventoryRule:
    rule = db.query(models.InventoryRule).filter(models.InventoryRule.is_active == True).order_by(models.InventoryRule.id.desc()).first()
    if rule:
        return rule
    rule = models.InventoryRule()
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def get_or_create_operator_profile(db: Session, operator_id: int, fallback_name: str | None = None) -> op_models.OperatorCompanyProfile:
    profile = db.query(op_models.OperatorCompanyProfile).filter(op_models.OperatorCompanyProfile.operator_id == operator_id).first()
    if profile:
        return profile
    profile = op_models.OperatorCompanyProfile(
        operator_id=operator_id,
        company_name=fallback_name or "Operator Company",
        contract_status="PENDING",
        verification_status="PENDING",
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def csv_response(filename: str, headers: list[str], rows: list[list]):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(rows)
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/analytics", response_model=schemas.AnalyticsResponse)
def get_analytics(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    total_users = db.query(User).filter(User.role == "USER").count()
    total_operators = db.query(User).filter(User.role == "OPERATOR").count()
    total_cities = db.query(models.City).count()
    total_bus_types = db.query(models.BusType).count()
    total_bookings = db.query(Booking).count()
    total_revenue = db.query(func.coalesce(func.sum(Booking.total_fare - Booking.refunded_amount), 0.0)).scalar() or 0.0
    total_cancellations = db.query(Booking).filter(Booking.status.in_(["CANCELLED", "REFUND_INITIATED", "REFUNDED"])).count()
    pending_refunds = db.query(Booking).filter(Booking.status == "REFUND_INITIATED").count()
    active_trips = db.query(Trip).filter(Trip.is_active == True, Trip.departure_time >= datetime.utcnow()).count()

    return schemas.AnalyticsResponse(
        total_users=total_users,
        total_operators=total_operators,
        total_bookings=total_bookings,
        total_revenue=float(total_revenue),
        total_cancellations=total_cancellations,
        total_cities=total_cities,
        total_bus_types=total_bus_types,
        pending_refunds=pending_refunds,
        active_trips=active_trips,
    )


@router.get("/operators", response_model=List[UserResponse])
def get_operators(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    return (
        db.query(User)
        .filter(User.role == "OPERATOR")
        .order_by(User.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.put("/operators/{operator_id}/status", response_model=UserResponse)
def toggle_operator_status(
    operator_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    operator = db.query(User).filter(User.id == operator_id, User.role == "OPERATOR").first()
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")
    operator.is_active = not operator.is_active
    db.commit()
    db.refresh(operator)
    return operator


@router.put("/operators/{operator_id}", response_model=UserResponse)
def update_operator_account(
    operator_id: int,
    payload: schemas.OperatorAccountUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    operator = db.query(User).filter(User.id == operator_id, User.role == "OPERATOR").first()
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")

    if payload.email and payload.email != operator.email:
        existing = db.query(User).filter(User.email == payload.email, User.id != operator_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")

    operator.name = payload.name if payload.name is not None else operator.name
    operator.email = payload.email if payload.email is not None else operator.email
    operator.operator_access_level = payload.operator_access_level
    operator.is_active = payload.is_active
    db.commit()
    db.refresh(operator)
    return operator


@router.get("/passengers", response_model=List[schemas.AdminPassengerResponse])
def get_passengers(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    passengers = (
        db.query(User)
        .filter(User.role == "USER")
        .order_by(User.created_at.desc())
        .all()
    )
    results = []
    for passenger in passengers:
        bookings = passenger.bookings or []
        results.append(
            schemas.AdminPassengerResponse(
                id=passenger.id,
                name=passenger.name,
                phone=passenger.phone,
                email=passenger.email,
                is_active=passenger.is_active,
                total_bookings=len(bookings),
                total_spend=round(sum(float(item.total_fare or 0) for item in bookings), 2),
                created_at=passenger.created_at,
            )
        )
    return results


@router.post("/cities", response_model=schemas.CityResponse)
def create_city(
    city_data: schemas.CityCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    existing_city = db.query(models.City).filter(func.lower(models.City.name) == city_data.name.lower()).first()
    if existing_city:
        raise HTTPException(status_code=400, detail="City already exists in Master List")

    new_city = models.City(name=city_data.name, state=city_data.state, is_active=city_data.is_active)
    db.add(new_city)
    db.commit()
    db.refresh(new_city)
    return new_city


@router.get("/cities", response_model=List[schemas.CityResponse])
def get_cities(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    return db.query(models.City).order_by(models.City.name.asc()).offset(skip).limit(limit).all()


@router.post("/bus-types", response_model=schemas.BusTypeResponse)
def create_bus_type(
    type_data: schemas.BusTypeCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    existing_type = db.query(models.BusType).filter(func.lower(models.BusType.name) == type_data.name.lower()).first()
    if existing_type:
        raise HTTPException(status_code=400, detail="Bus Type already exists in Master List")

    new_type = models.BusType(
        name=type_data.name,
        layout=type_data.layout,
        has_ac=type_data.has_ac,
        has_sleeper=type_data.has_sleeper,
        is_active=type_data.is_active,
    )
    db.add(new_type)
    db.commit()
    db.refresh(new_type)
    return new_type


@router.get("/bus-types", response_model=List[schemas.BusTypeResponse])
def get_bus_types(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    return db.query(models.BusType).order_by(models.BusType.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/bookings-monitoring", response_model=List[schemas.AdminBookingResponse])
def get_bookings_monitoring(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    bookings = (
        db.query(Booking)
        .order_by(Booking.created_at.desc())
        .limit(200)
        .all()
    )
    return [serialize_booking(db, booking) for booking in bookings]


@router.post("/bookings/{booking_id}/issue-refund", response_model=schemas.AdminBookingResponse)
def issue_refund(
    booking_id: int,
    payload: schemas.RefundRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if payload.refund_amount > float(booking.total_fare or 0):
        raise HTTPException(status_code=400, detail="Refund amount cannot exceed booking fare")

    booking.refunded_amount = float(payload.refund_amount)
    booking.status = "REFUNDED" if payload.mark_as_refunded else "REFUND_INITIATED"
    booking.ops_status = "CANCELLED"

    note = payload.reason or "Refund issued by admin"
    booking.operator_notes = ((booking.operator_notes or "").strip() + f"\nAdmin refund note: {note}").strip()
    for seat in booking.seats:
        seat.status = "CANCELLED"

    audit = models.RefundAudit(
        booking_id=booking.id,
        processed_by=current_admin.id,
        refund_amount=float(payload.refund_amount),
        reason=payload.reason,
        refund_mode="MANUAL",
    )
    db.add(audit)
    db.commit()
    db.refresh(booking)
    return serialize_booking(db, booking)


@router.get("/refund-audits", response_model=List[schemas.RefundAuditResponse])
def get_refund_audits(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    audits = (
        db.query(models.RefundAudit)
        .order_by(models.RefundAudit.created_at.desc())
        .limit(200)
        .all()
    )
    results = []
    for item in audits:
        results.append(
            schemas.RefundAuditResponse(
                id=item.id,
                booking_id=item.booking_id,
                booking_ref=item.booking.booking_ref if item.booking else "",
                operator_name=item.booking.trip.operator.name if item.booking and item.booking.trip and item.booking.trip.operator else None,
                passenger_name=item.booking.user.name if item.booking and item.booking.user else None,
                refund_amount=float(item.refund_amount or 0),
                reason=item.reason,
                refund_mode=item.refund_mode,
                processed_by_name=item.processor.name if item.processor else None,
                created_at=item.created_at,
            )
        )
    return results


@router.get("/payment-ledger", response_model=List[schemas.PaymentLedgerEntry])
def get_payment_ledger(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    config = get_or_create_revenue_config(db)
    bookings = db.query(Booking).order_by(Booking.created_at.desc()).limit(300).all()
    results = []
    for booking in bookings:
        financials = calculate_financials(booking, config)
        results.append(
            schemas.PaymentLedgerEntry(
                booking_id=booking.id,
                booking_ref=booking.booking_ref,
                operator_name=booking.trip.operator.name if booking.trip and booking.trip.operator else None,
                total_fare=float(booking.total_fare or 0),
                refunded_amount=float(booking.refunded_amount or 0),
                commission_amount=financials["commission"],
                gateway_fee_amount=financials["gateway_fee"],
                platform_fee_amount=financials["platform_fee"],
                gst_amount=financials["gst_amount"],
                operator_payout=financials["operator_payout"],
                booking_status=booking.status,
                payment_status=booking.payment_status,
                created_at=booking.created_at,
            )
        )
    return results


@router.get("/cancellation-policy", response_model=schemas.CancellationPolicyResponse)
def get_cancellation_policy(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    return get_or_create_cancellation_policy(db)


@router.put("/cancellation-policy", response_model=schemas.CancellationPolicyResponse)
def update_cancellation_policy(
    payload: schemas.CancellationPolicyUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    policy = get_or_create_cancellation_policy(db)
    policy.policy_name = payload.policy_name
    policy.cutoff_hours = payload.cutoff_hours
    policy.refund_percent = payload.refund_percent
    policy.processing_fee = payload.processing_fee
    policy.applies_after_departure = payload.applies_after_departure
    policy.description = payload.description
    db.commit()
    db.refresh(policy)
    return policy


@router.get("/revenue-config", response_model=schemas.RevenueConfigResponse)
def get_revenue_config(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    return get_or_create_revenue_config(db)


@router.put("/revenue-config", response_model=schemas.RevenueConfigResponse)
def update_revenue_config(
    payload: schemas.RevenueConfigUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    config = get_or_create_revenue_config(db)
    config.commission_percent = payload.commission_percent
    config.gateway_fee_percent = payload.gateway_fee_percent
    config.gst_percent = payload.gst_percent
    config.flat_platform_fee = payload.flat_platform_fee
    config.refund_processing_fee = payload.refund_processing_fee
    db.commit()
    db.refresh(config)
    return config


@router.get("/platform-settings", response_model=schemas.PlatformSettingsResponse)
def get_platform_settings(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    return serialize_platform_settings(db)


@router.put("/platform-settings/{setting_key}", response_model=schemas.PlatformSettingsResponse)
def update_platform_setting(
    setting_key: str,
    payload: schemas.PlatformSettingUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    ensure_platform_settings(db)
    setting = db.query(models.PlatformSetting).filter(models.PlatformSetting.setting_key == setting_key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Platform setting not found")
    setting.setting_value = payload.value
    db.commit()
    return serialize_platform_settings(db)


@router.get("/master-summary")
def get_master_summary(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    city_count = db.query(models.City).count()
    bus_type_count = db.query(models.BusType).count()
    stop_count = db.query(RouteStop).count()
    return {
        "cities": city_count,
        "bus_types": bus_type_count,
        "route_stops": stop_count,
    }


@router.get("/alerts", response_model=List[schemas.AdminAlertResponse])
def get_admin_alerts(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    pending_onboarding = db.query(models.OperatorOnboardingRequest).filter(models.OperatorOnboardingRequest.approval_status == "PENDING").count()
    pending_docs = db.query(models.OperatorDocument).filter(models.OperatorDocument.verification_status == "PENDING").count()
    open_tickets = db.query(models.SupportTicket).filter(models.SupportTicket.status.in_(["OPEN", "IN_PROGRESS"])).count()
    pending_refunds = db.query(Booking).filter(Booking.status == "REFUND_INITIATED").count()
    alerts = []
    if pending_onboarding:
        alerts.append(schemas.AdminAlertResponse(type="onboarding", title="Operator approvals pending", message="New onboarding requests need review.", severity="warning", count=pending_onboarding))
    if pending_docs:
        alerts.append(schemas.AdminAlertResponse(type="documents", title="Documents awaiting verification", message="Operator documents need admin verification.", severity="warning", count=pending_docs))
    if open_tickets:
        alerts.append(schemas.AdminAlertResponse(type="support", title="Open support tickets", message="Customer or operator issues need follow-up.", severity="danger", count=open_tickets))
    if pending_refunds:
        alerts.append(schemas.AdminAlertResponse(type="refunds", title="Refund queue active", message="Refund-initiated bookings are waiting for closure.", severity="info", count=pending_refunds))
    return alerts


@router.get("/audit-logs", response_model=List[schemas.AdminAuditLogResponse])
def get_admin_audit_logs(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    logs = db.query(models.AdminAuditLog).order_by(models.AdminAuditLog.created_at.desc()).limit(200).all()
    return [
        schemas.AdminAuditLogResponse(
            id=item.id,
            actor_name=item.actor.name if item.actor else None,
            action=item.action,
            entity_type=item.entity_type,
            entity_id=item.entity_id,
            status=item.status,
            details=item.details,
            created_at=item.created_at,
        )
        for item in logs
    ]


@router.get("/inventory-rules", response_model=schemas.InventoryRuleResponse)
def get_inventory_rules(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    return get_or_create_inventory_rule(db)


@router.put("/inventory-rules", response_model=schemas.InventoryRuleResponse)
def update_inventory_rules(
    payload: schemas.InventoryRuleUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    rule = get_or_create_inventory_rule(db)
    rule.rule_name = payload.rule_name
    rule.seat_hold_minutes = payload.seat_hold_minutes
    rule.default_capacity_limit = payload.default_capacity_limit
    rule.allow_manual_override = payload.allow_manual_override
    rule.allow_overbooking = payload.allow_overbooking
    rule.max_blocked_seats = payload.max_blocked_seats
    create_admin_audit_log(db, current_admin, "UPDATED_INVENTORY_RULES", "InventoryRule", rule.id, f"Updated {rule.rule_name}")
    db.commit()
    db.refresh(rule)
    return rule


@router.get("/fare-templates", response_model=List[schemas.FareTemplateResponse])
def get_fare_templates(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    return db.query(models.FareTemplate).order_by(models.FareTemplate.updated_at.desc()).all()


@router.post("/fare-templates", response_model=schemas.FareTemplateResponse)
def create_fare_template(
    payload: schemas.FareTemplateCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    template = models.FareTemplate(**payload.model_dump())
    db.add(template)
    create_admin_audit_log(db, current_admin, "CREATED_FARE_TEMPLATE", "FareTemplate", None, payload.name)
    db.commit()
    db.refresh(template)
    return template


@router.put("/fare-templates/{template_id}", response_model=schemas.FareTemplateResponse)
def update_fare_template(
    template_id: int,
    payload: schemas.FareTemplateCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    template = db.query(models.FareTemplate).filter(models.FareTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Fare template not found")
    for key, value in payload.model_dump().items():
        setattr(template, key, value)
    create_admin_audit_log(db, current_admin, "UPDATED_FARE_TEMPLATE", "FareTemplate", template.id, payload.name)
    db.commit()
    db.refresh(template)
    return template


@router.get("/operator-onboarding-requests", response_model=List[schemas.OnboardingRequestResponse])
def get_onboarding_requests(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    return db.query(models.OperatorOnboardingRequest).order_by(models.OperatorOnboardingRequest.created_at.desc()).all()


@router.post("/operator-onboarding-requests", response_model=schemas.OnboardingRequestResponse)
def create_onboarding_request(
    payload: schemas.OnboardingRequestCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    request = models.OperatorOnboardingRequest(**payload.model_dump())
    db.add(request)
    db.flush()
    default_docs = [
        ("BUSINESS_LICENSE", f"{payload.company_name.lower().replace(' ', '-')}-license.pdf"),
        ("GST_CERTIFICATE", f"{payload.company_name.lower().replace(' ', '-')}-gst.pdf"),
    ]
    for doc_type, file_name in default_docs:
        db.add(models.OperatorDocument(onboarding_request_id=request.id, doc_type=doc_type, file_name=file_name))
    create_admin_audit_log(db, current_admin, "CREATED_ONBOARDING_REQUEST", "OperatorOnboardingRequest", request.id, payload.company_name)
    db.commit()
    db.refresh(request)
    return request


@router.post("/operator-onboarding-requests/{request_id}/review", response_model=schemas.OnboardingRequestResponse)
def review_onboarding_request(
    request_id: int,
    payload: schemas.OnboardingRequestReview,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    request = db.query(models.OperatorOnboardingRequest).filter(models.OperatorOnboardingRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Onboarding request not found")
    request.approval_status = payload.approval_status
    request.notes = payload.notes or request.notes
    request.reviewed_by = current_admin.id
    request.reviewed_at = datetime.utcnow()
    if payload.approval_status == "APPROVED" and payload.create_operator_account and not request.created_operator_id:
        temporary_password = secrets.token_urlsafe(8)
        operator = User(
            phone=request.phone,
            name=request.company_name,
            email=request.email,
            password_hash=auth_service.hash_password(temporary_password),
            role="OPERATOR",
            operator_access_level=request.requested_access_level,
            is_active=True,
        )
        db.add(operator)
        db.flush()
        request.created_operator_id = operator.id
        get_or_create_operator_profile(db, operator.id, request.company_name)
        request.notes = " ".join(part for part in [request.notes, "Temporary password generated during approval."] if part)
    create_admin_audit_log(db, current_admin, "REVIEWED_ONBOARDING_REQUEST", "OperatorOnboardingRequest", request.id, payload.approval_status)
    db.commit()
    db.refresh(request)
    return request


@router.post("/operator-documents", response_model=schemas.OperatorDocumentResponse)
def create_operator_document(
    payload: schemas.OperatorDocumentCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    document = models.OperatorDocument(**payload.model_dump())
    db.add(document)
    create_admin_audit_log(db, current_admin, "CREATED_OPERATOR_DOCUMENT", "OperatorDocument", None, payload.doc_type)
    db.commit()
    db.refresh(document)
    return document


@router.get("/operator-documents", response_model=List[schemas.OperatorDocumentResponse])
def get_operator_documents(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    return db.query(models.OperatorDocument).order_by(models.OperatorDocument.created_at.desc()).all()


@router.post("/operator-documents/{document_id}/verify", response_model=schemas.OperatorDocumentResponse)
def verify_operator_document(
    document_id: int,
    payload: schemas.OperatorDocumentReview,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    document = db.query(models.OperatorDocument).filter(models.OperatorDocument.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    document.verification_status = payload.verification_status
    document.notes = payload.notes or document.notes
    document.reviewed_by = current_admin.id
    document.reviewed_at = datetime.utcnow()
    if document.onboarding_request:
        statuses = [item.verification_status for item in document.onboarding_request.documents]
        document.onboarding_request.document_status = "VERIFIED" if statuses and all(value == "VERIFIED" for value in statuses) else "PENDING"
    if document.operator_id:
        profile = get_or_create_operator_profile(db, document.operator_id)
        profile.verification_status = "VERIFIED" if payload.verification_status == "VERIFIED" else profile.verification_status
    create_admin_audit_log(db, current_admin, "VERIFIED_OPERATOR_DOCUMENT", "OperatorDocument", document.id, payload.verification_status)
    db.commit()
    db.refresh(document)
    return document


@router.get("/operators/{operator_id}/commercial-profile", response_model=schemas.OperatorCommercialProfileResponse)
def get_operator_commercial_profile(
    operator_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    operator = db.query(User).filter(User.id == operator_id, User.role == "OPERATOR").first()
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")
    return get_or_create_operator_profile(db, operator_id, operator.name)


@router.put("/operators/{operator_id}/commercial-profile", response_model=schemas.OperatorCommercialProfileResponse)
def update_operator_commercial_profile(
    operator_id: int,
    payload: schemas.OperatorCommercialProfileUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    profile = get_or_create_operator_profile(db, operator_id, payload.company_name)
    for key, value in payload.model_dump().items():
        setattr(profile, key, value)
    create_admin_audit_log(db, current_admin, "UPDATED_OPERATOR_PROFILE", "OperatorCompanyProfile", profile.id, payload.company_name)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/support-tickets", response_model=List[schemas.SupportTicketResponse])
def get_support_tickets(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    tickets = db.query(models.SupportTicket).order_by(models.SupportTicket.created_at.desc()).all()
    return [
        schemas.SupportTicketResponse(
            id=item.id,
            booking_id=item.booking_id,
            operator_id=item.operator_id,
            passenger_id=item.passenger_id,
            category=item.category,
            priority=item.priority,
            status=item.status,
            subject=item.subject,
            description=item.description,
            operator_name=item.operator.name if item.operator else None,
            passenger_name=item.passenger.name if item.passenger else None,
            booking_ref=item.booking.booking_ref if item.booking else None,
            resolution_notes=item.resolution_notes,
            created_at=item.created_at,
        )
        for item in tickets
    ]


@router.post("/support-tickets", response_model=schemas.SupportTicketResponse)
def create_support_ticket(
    payload: schemas.SupportTicketCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    ticket = models.SupportTicket(**payload.model_dump())
    db.add(ticket)
    create_admin_audit_log(db, current_admin, "CREATED_SUPPORT_TICKET", "SupportTicket", None, payload.subject)
    db.commit()
    db.refresh(ticket)
    return schemas.SupportTicketResponse(
        id=ticket.id,
        booking_id=ticket.booking_id,
        operator_id=ticket.operator_id,
        passenger_id=ticket.passenger_id,
        category=ticket.category,
        priority=ticket.priority,
        status=ticket.status,
        subject=ticket.subject,
        description=ticket.description,
        operator_name=ticket.operator.name if ticket.operator else None,
        passenger_name=ticket.passenger.name if ticket.passenger else None,
        booking_ref=ticket.booking.booking_ref if ticket.booking else None,
        resolution_notes=ticket.resolution_notes,
        created_at=ticket.created_at,
    )


@router.put("/support-tickets/{ticket_id}", response_model=schemas.SupportTicketResponse)
def update_support_ticket(
    ticket_id: int,
    payload: schemas.SupportTicketUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    ticket = db.query(models.SupportTicket).filter(models.SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    ticket.status = payload.status
    ticket.resolution_notes = payload.resolution_notes
    ticket.assigned_to = current_admin.id
    create_admin_audit_log(db, current_admin, "UPDATED_SUPPORT_TICKET", "SupportTicket", ticket.id, payload.status)
    db.commit()
    db.refresh(ticket)
    return schemas.SupportTicketResponse(
        id=ticket.id,
        booking_id=ticket.booking_id,
        operator_id=ticket.operator_id,
        passenger_id=ticket.passenger_id,
        category=ticket.category,
        priority=ticket.priority,
        status=ticket.status,
        subject=ticket.subject,
        description=ticket.description,
        operator_name=ticket.operator.name if ticket.operator else None,
        passenger_name=ticket.passenger.name if ticket.passenger else None,
        booking_ref=ticket.booking.booking_ref if ticket.booking else None,
        resolution_notes=ticket.resolution_notes,
        created_at=ticket.created_at,
    )


@router.get("/reports/operators/export")
def export_admin_operators(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    operators = db.query(User).filter(User.role == "OPERATOR").order_by(User.created_at.desc()).all()
    rows = [[item.id, item.name or "", item.phone, item.email or "", item.operator_access_level or "", "Active" if item.is_active else "Inactive"] for item in operators]
    return csv_response("admin-operators.csv", ["ID", "Name", "Phone", "Email", "Access Level", "Status"], rows)


@router.get("/reports/bookings/export")
def export_admin_bookings(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    bookings = db.query(Booking).order_by(Booking.created_at.desc()).all()
    rows = [[item.booking_ref, item.user.name if item.user else "", item.trip.operator.name if item.trip and item.trip.operator else "", item.total_fare, item.refunded_amount or 0, item.status, item.payment_status] for item in bookings]
    return csv_response("admin-bookings.csv", ["PNR", "Passenger", "Operator", "Fare", "Refunded", "Booking Status", "Payment Status"], rows)


@router.get("/reports/support/export")
def export_admin_support_tickets(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    tickets = db.query(models.SupportTicket).order_by(models.SupportTicket.created_at.desc()).all()
    rows = [[item.id, item.subject, item.category, item.priority, item.status, item.operator.name if item.operator else "", item.booking.booking_ref if item.booking else ""] for item in tickets]
    return csv_response("admin-support-tickets.csv", ["Ticket ID", "Subject", "Category", "Priority", "Status", "Operator", "Booking Ref"], rows)
