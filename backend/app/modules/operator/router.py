import csv
import io
from datetime import date, datetime, timedelta
import json
import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.modules.auth.models import User
from app.modules.auth.service import ensure_operator_access, require_operator_or_admin
from app.modules.booking.models import Booking, BookingSeat, Passenger
from app.modules.booking.seat_service import count_available_seats, validate_seats_available
from app.modules.operator import models, schemas

router = APIRouter(prefix="/operator", tags=["Operator Management"])

ACTIVE_TRIP_STATUSES = {"SCHEDULED", "RUNNING", "DELAYED"}
BUS_STATUS_VALUES = {"ACTIVE", "INACTIVE", "MAINTENANCE"}
TRIP_STATUS_VALUES = {"DRAFT", "SCHEDULED", "RUNNING", "COMPLETED", "CANCELLED", "DELAYED"}
BOOKING_OPS_STATUS_VALUES = {"PENDING", "CONFIRMED", "BOARDED", "CANCELLED", "COMPLETED", "NO_SHOW", "RESCHEDULED"}
PAYMENT_STATUS_LABELS = {"PENDING": "Pending", "SUCCESS": "Paid", "FAILED": "Failed"}
LAYOUT_CAPACITIES = {"2+2": 40, "2+1": 30, "1+1": 20}
PLATFORM_COMMISSION_RATE = 0.10
GST_RATE = 0.05


def encode_amenities(items):
    cleaned = [item.strip() for item in (items or []) if item and item.strip()]
    return json.dumps(cleaned) if cleaned else None


def decode_amenities(raw):
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def validate_bus_status(value):
    upper = value.upper()
    if upper not in BUS_STATUS_VALUES:
        raise HTTPException(status_code=400, detail=f"Invalid bus status. Allowed: {sorted(BUS_STATUS_VALUES)}")
    return upper


def validate_trip_status(value):
    upper = value.upper()
    if upper not in TRIP_STATUS_VALUES:
        raise HTTPException(status_code=400, detail=f"Invalid trip status. Allowed: {sorted(TRIP_STATUS_VALUES)}")
    return upper


def validate_booking_ops_status(value):
    upper = value.upper()
    if upper not in BOOKING_OPS_STATUS_VALUES:
        raise HTTPException(status_code=400, detail=f"Invalid booking operational status. Allowed: {sorted(BOOKING_OPS_STATUS_VALUES)}")
    return upper


def get_bus_capacity(layout):
    return LAYOUT_CAPACITIES.get(layout or "", 40)


def create_operator_notification(
    db: Session,
    operator_id: int,
    category: str,
    title: str,
    message: str,
    severity: str = "info",
    channel: str | None = None,
    recipient: str | None = None,
    delivery_status: str | None = None,
    provider_name: str | None = None,
    provider_reference: str | None = None,
    delivered_at: datetime | None = None,
    failed_reason: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    href: str | None = None,
):
    entry = models.OperatorNotificationLog(
        operator_id=operator_id,
        category=category,
        title=title,
        message=message,
        severity=severity,
        channel=channel,
        recipient=recipient,
        delivery_status=delivery_status or ("PREPARED" if channel else "IN_APP"),
        provider_name=provider_name,
        provider_reference=provider_reference,
        delivered_at=delivered_at,
        failed_reason=failed_reason,
        entity_type=entity_type,
        entity_id=entity_id,
        href=href,
    )
    db.add(entry)
    return entry


def get_bus_or_404(db, user, bus_id):
    bus = db.query(models.Bus).filter(models.Bus.id == bus_id, models.Bus.operator_id == user.id).first()
    if not bus:
        raise HTTPException(status_code=404, detail="Bus not found")
    return bus


def get_route_or_404(db, user, route_id):
    route = db.query(models.Route).filter(models.Route.id == route_id, models.Route.operator_id == user.id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    return route


def get_trip_or_404(db, user, trip_id):
    trip = db.query(models.Trip).filter(models.Trip.id == trip_id, models.Trip.operator_id == user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


def ensure_bus_unique(db, reg_number, bus_id=None):
    query = db.query(models.Bus).filter(models.Bus.reg_number == reg_number)
    if bus_id:
        query = query.filter(models.Bus.id != bus_id)
    if query.first():
        raise HTTPException(status_code=400, detail="Bus with this registration number already exists")


def validate_route_payload(route_data):
    stops = route_data.stops
    if stops is not None:
        if len(stops) < 2:
            raise HTTPException(status_code=400, detail="A route must have at least 2 stops")
        city_ids = [stop.city_id for stop in stops]
        if len(city_ids) != len(set(city_ids)):
            raise HTTPException(status_code=400, detail="Duplicate stops are not allowed in a route")
        sequences = [stop.stop_sequence for stop in stops]
        if sequences != list(range(1, len(sequences) + 1)):
            raise HTTPException(status_code=400, detail="Stop sequence must be continuous starting from 1")
        offsets = [stop.time_offset_mins for stop in stops]
        if offsets[0] != 0 or any(offsets[i] >= offsets[i + 1] for i in range(len(offsets) - 1)):
            raise HTTPException(status_code=400, detail="Stop timings must increase and start from 0")


def validate_pricing(stops, pricing):
    valid_pairs = {(stops[i].city_id, stops[j].city_id) for i in range(len(stops)) for j in range(i + 1, len(stops))}
    provided_pairs = {(price.origin_city_id, price.destination_city_id) for price in pricing}
    if valid_pairs != provided_pairs:
        raise HTTPException(status_code=400, detail="Pricing must be provided for every valid route segment")
    if any(price.price <= 0 for price in pricing):
        raise HTTPException(status_code=400, detail="Pricing must be greater than zero")


def has_future_trips_for_bus(db, bus_id):
    return db.query(models.Trip).filter(
        models.Trip.bus_id == bus_id,
        models.Trip.departure_time >= datetime.utcnow(),
        models.Trip.status.in_(ACTIVE_TRIP_STATUSES),
    ).first() is not None


def has_future_trips_for_route(db, route_id):
    return db.query(models.Trip).filter(
        models.Trip.route_id == route_id,
        models.Trip.departure_time >= datetime.utcnow(),
        models.Trip.status.in_(ACTIVE_TRIP_STATUSES),
    ).first() is not None


def ensure_trip_conflict_free(db, bus_id, departure_time, ignore_trip_id=None):
    query = db.query(models.Trip).filter(
        models.Trip.bus_id == bus_id,
        models.Trip.departure_time == departure_time,
        models.Trip.status.in_(ACTIVE_TRIP_STATUSES.union({"DRAFT"})),
    )
    if ignore_trip_id:
        query = query.filter(models.Trip.id != ignore_trip_id)
    if query.first():
        raise HTTPException(status_code=409, detail="This bus already has a trip scheduled at the selected departure time")


def bus_status_tag(bus, upcoming_count):
    if not bus.is_active or (bus.operational_status or "ACTIVE") == "INACTIVE":
        return "INACTIVE"
    if (bus.operational_status or "ACTIVE") == "MAINTENANCE":
        return "MAINTENANCE"
    return "SCHEDULED" if upcoming_count else "ACTIVE"


def serialize_bus(db, bus):
    upcoming = db.query(models.Trip).filter(
        models.Trip.bus_id == bus.id,
        models.Trip.departure_time >= datetime.utcnow(),
        models.Trip.status.in_(ACTIVE_TRIP_STATUSES),
    ).order_by(models.Trip.departure_time.asc()).all()
    assigned = db.query(models.Trip).filter(models.Trip.bus_id == bus.id).count()
    return schemas.BusResponse(
        id=bus.id,
        operator_id=bus.operator_id,
        bus_type_id=bus.bus_type_id,
        name=bus.name,
        reg_number=bus.reg_number,
        internal_code=bus.internal_code,
        operational_status=bus.operational_status or "ACTIVE",
        status_tag=bus_status_tag(bus, len(upcoming)),
        amenities=decode_amenities(bus.amenities),
        notes=bus.notes,
        is_active=bus.is_active,
        created_at=bus.created_at,
        bus_type_name=bus.bus_type.name if bus.bus_type else None,
        bus_layout=bus.bus_type.layout if bus.bus_type else None,
        has_ac=bool(bus.bus_type.has_ac) if bus.bus_type else False,
        has_sleeper=bool(bus.bus_type.has_sleeper) if bus.bus_type else False,
        assigned_trip_count=assigned,
        upcoming_trip_count=len(upcoming),
        next_trip_at=upcoming[0].departure_time if upcoming else None,
    )


def serialize_route(route):
    return schemas.RouteResponse(
        id=route.id,
        operator_id=route.operator_id,
        name=route.name,
        route_code=route.route_code,
        estimated_distance_km=route.estimated_distance_km,
        estimated_duration_mins=route.estimated_duration_mins,
        is_active=route.is_active,
        created_at=route.created_at,
        stop_count=len(route.stops),
        trip_count=len(route.trips),
        upcoming_trip_count=len([trip for trip in route.trips if trip.departure_time >= datetime.utcnow() and trip.status in ACTIVE_TRIP_STATUSES]),
        stops=[
            schemas.RouteStopResponse(
                id=stop.id,
                route_id=stop.route_id,
                city_id=stop.city_id,
                city_name=stop.city.name if stop.city else None,
                stop_sequence=stop.stop_sequence,
                time_offset_mins=stop.time_offset_mins,
                allows_boarding=stop.allows_boarding,
                allows_dropping=stop.allows_dropping,
            )
            for stop in route.stops
        ],
        pricing=[
            schemas.RoutePricingResponse(
                id=price.id,
                route_id=price.route_id,
                origin_city_id=price.origin_city_id,
                destination_city_id=price.destination_city_id,
                origin_city_name=price.origin.name if price.origin else None,
                destination_city_name=price.destination.name if price.destination else None,
                price=price.price,
            )
            for price in route.pricing
        ],
    )


def trip_arrival_time(trip):
    if not trip.route or not trip.route.stops:
        return None
    return trip.departure_time + timedelta(minutes=max(stop.time_offset_mins for stop in trip.route.stops))


def serialize_trip(db, trip):
    upcoming_for_bus = len([
        item for item in trip.bus.trips
        if item.departure_time >= datetime.utcnow() and item.status in ACTIVE_TRIP_STATUSES
    ]) if trip.bus else 0
    return schemas.TripResponse(
        id=trip.id,
        operator_id=trip.operator_id,
        bus_id=trip.bus_id,
        route_id=trip.route_id,
        departure_time=trip.departure_time,
        arrival_time=trip_arrival_time(trip),
        status=trip.status,
        is_active=trip.is_active,
        created_at=trip.created_at,
        series_code=trip.series_code,
        recurrence_label=trip.recurrence_label,
        delay_mins=trip.delay_mins or 0,
        ops_notes=trip.ops_notes,
        actual_start_time=trip.actual_start_time,
        actual_end_time=trip.actual_end_time,
        bus_name=trip.bus.name if trip.bus else None,
        bus_reg_number=trip.bus.reg_number if trip.bus else None,
        bus_status_tag=bus_status_tag(trip.bus, upcoming_for_bus) if trip.bus else None,
        route_name=trip.route.name if trip.route else None,
        route_code=trip.route.route_code if trip.route else None,
        total_stops=len(trip.route.stops) if trip.route else 0,
    )


def build_recurrence_dates(data):
    if data.schedule_type.upper() == "ONE_TIME":
        if not data.departure_time:
            raise HTTPException(status_code=400, detail="Departure time is required for one-time trips")
        return [data.departure_time]

    if not data.start_date or not data.end_date or not data.departure_clock:
        raise HTTPException(status_code=400, detail="Start date, end date, and departure clock are required for recurring schedules")
    if data.end_date < data.start_date:
        raise HTTPException(status_code=400, detail="End date cannot be before start date")

    results = []
    current_day = data.start_date
    schedule_type = data.schedule_type.upper()
    while current_day <= data.end_date:
        include = False
        if schedule_type == "DAILY":
            include = True
        elif schedule_type == "SELECTED_WEEKDAYS":
            include = current_day.weekday() in data.weekdays
        elif schedule_type == "EVERY_X_DAYS":
            include = ((current_day - data.start_date).days % max(data.every_x_days, 1)) == 0
        if include:
            results.append(datetime.combine(current_day, data.departure_clock))
        current_day += timedelta(days=1)
    if not results:
        raise HTTPException(status_code=400, detail="The selected recurrence rule generated no trips")
    return results


def recurrence_label(data):
    schedule_type = data.schedule_type.upper()
    if schedule_type == "ONE_TIME":
        return None
    if schedule_type == "DAILY":
        return "Daily service"
    if schedule_type == "SELECTED_WEEKDAYS":
        names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        return "Weekly on " + ", ".join(names[item] for item in data.weekdays if 0 <= item <= 6)
    if schedule_type == "EVERY_X_DAYS":
        return f"Every {max(data.every_x_days, 1)} day(s)"
    raise HTTPException(status_code=400, detail="Unsupported schedule type")


def payment_status_display(booking):
    if booking.status == "REFUNDED":
        return "Refunded"
    if booking.refunded_amount and booking.refunded_amount > 0:
        return "Partially Refunded" if booking.refunded_amount < booking.total_fare else "Refunded"
    return PAYMENT_STATUS_LABELS.get(booking.payment_status, booking.payment_status.title())


def booking_status_display(booking):
    if booking.status == "INITIATED":
        return "Pending"
    if booking.status == "SEAT_LOCKED":
        return "Seat Locked"
    return booking.status.replace("_", " ").title()


def booking_has_successful_payment(booking):
    return booking.payment_status == "SUCCESS"


def get_booking_or_404(db, user, booking_id):
    booking = (
        db.query(Booking)
        .join(models.Trip, Booking.trip_id == models.Trip.id)
        .filter(Booking.id == booking_id, models.Trip.operator_id == user.id)
        .options(
            joinedload(Booking.trip).joinedload(models.Trip.route).joinedload(models.Route.stops).joinedload(models.RouteStop.city),
            joinedload(Booking.trip).joinedload(models.Trip.bus),
            joinedload(Booking.user),
            joinedload(Booking.passengers),
            joinedload(Booking.seats),
            joinedload(Booking.boarding_city),
            joinedload(Booking.dropping_city),
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


def base_operator_bookings_query(db, operator_id):
    return (
        db.query(Booking)
        .join(models.Trip, Booking.trip_id == models.Trip.id)
        .filter(models.Trip.operator_id == operator_id)
        .options(
            joinedload(Booking.trip).joinedload(models.Trip.route).joinedload(models.Route.stops).joinedload(models.RouteStop.city),
            joinedload(Booking.trip).joinedload(models.Trip.bus),
            joinedload(Booking.user),
            joinedload(Booking.passengers),
            joinedload(Booking.seats),
            joinedload(Booking.boarding_city),
            joinedload(Booking.dropping_city),
        )
    )


def booking_arrival_time(booking):
    if not booking.trip or not booking.trip.route or not booking.trip.route.stops:
        return None
    stop_map = {stop.id: stop for stop in booking.trip.route.stops}
    dropping_stop = stop_map.get(booking.dropping_stop_id)
    if not dropping_stop:
        return None
    return booking.trip.departure_time + timedelta(minutes=dropping_stop.time_offset_mins)


def get_trip_stop_for_city(trip, city_id):
    if not trip or not trip.route:
        return None
    for stop in trip.route.stops:
        if stop.city_id == city_id:
            return stop
    return None


def booking_boarding_name(booking):
    return booking.boarding_city.name if booking.boarding_city else "Unknown Boarding"


def booking_dropping_name(booking):
    return booking.dropping_city.name if booking.dropping_city else "Unknown Dropping"


def serialize_booking_list_item(booking):
    primary_passenger = booking.passengers[0].name if booking.passengers else "Passenger"
    return schemas.OperatorBookingListItem(
        id=booking.id,
        booking_ref=booking.booking_ref,
        ticket_number=booking.ticket_number or booking.booking_ref,
        trip_id=booking.trip_id,
        trip_departure_time=booking.trip.departure_time,
        booking_time=booking.created_at,
        passenger_name=primary_passenger,
        passenger_phone=booking.user.phone if booking.user else None,
        route_name=booking.trip.route.name if booking.trip and booking.trip.route else None,
        route_code=booking.trip.route.route_code if booking.trip and booking.trip.route else None,
        bus_name=booking.trip.bus.name if booking.trip and booking.trip.bus else None,
        bus_reg_number=booking.trip.bus.reg_number if booking.trip and booking.trip.bus else None,
        boarding_point=booking_boarding_name(booking),
        dropping_point=booking_dropping_name(booking),
        seat_numbers=[seat.seat_label for seat in booking.seats],
        total_passengers=booking.total_passengers,
        total_fare=booking.total_fare,
        booking_status=booking_status_display(booking),
        ops_status=(booking.ops_status or "CONFIRMED").replace("_", " ").title(),
        payment_status=payment_status_display(booking),
        booking_source=(booking.booking_source or "WEB").title(),
        issue_flag=booking.issue_flag,
    )


def serialize_booking_detail(booking):
    route = booking.trip.route if booking.trip else None
    fare_breakup = {
        "base_fare": booking.total_fare,
        "refunded_amount": booking.refunded_amount or 0,
        "net_amount": booking.total_fare - (booking.refunded_amount or 0),
    }
    return schemas.OperatorBookingDetail(
        **serialize_booking_list_item(booking).model_dump(),
        arrival_time=booking_arrival_time(booking),
        route_stops=[
            schemas.RouteStopResponse(
                id=stop.id,
                route_id=stop.route_id,
                city_id=stop.city_id,
                city_name=stop.city.name if stop.city else None,
                stop_sequence=stop.stop_sequence,
                time_offset_mins=stop.time_offset_mins,
                allows_boarding=stop.allows_boarding,
                allows_dropping=stop.allows_dropping,
            )
            for stop in (route.stops if route else [])
        ],
        passengers=[schemas.OperatorPassengerResponse.model_validate(passenger) for passenger in booking.passengers],
        fare_breakup=fare_breakup,
        refunded_amount=booking.refunded_amount or 0,
        operator_notes=booking.operator_notes,
        last_ticket_sent_at=booking.last_ticket_sent_at,
        last_ticket_sent_channel=booking.last_ticket_sent_channel,
        user_id=booking.user_id,
        user_name=booking.user.name if booking.user else None,
    )


def filter_booking_records(bookings, search=None, date_from=None, date_to=None, route_id=None, trip_id=None, bus_id=None, boarding_city=None, dropping_city=None, booking_status=None, payment_status=None, booking_source=None):
    filtered = []
    query = (search or "").strip().lower()
    for booking in bookings:
        if query:
            haystack = [
                booking.booking_ref,
                booking.ticket_number,
                booking.user.phone if booking.user else None,
                booking.user.name if booking.user else None,
                booking.trip.route.name if booking.trip and booking.trip.route else None,
                booking.trip.bus.name if booking.trip and booking.trip.bus else None,
                booking.trip.bus.reg_number if booking.trip and booking.trip.bus else None,
                booking_boarding_name(booking),
                booking_dropping_name(booking),
                " ".join(passenger.name for passenger in booking.passengers),
            ]
            if not any(value and query in str(value).lower() for value in haystack):
                continue
        if date_from and booking.trip.departure_time.date() < date_from:
            continue
        if date_to and booking.trip.departure_time.date() > date_to:
            continue
        if route_id and booking.trip.route_id != route_id:
            continue
        if trip_id and booking.trip_id != trip_id:
            continue
        if bus_id and booking.trip.bus_id != bus_id:
            continue
        if boarding_city and booking.boarding_city_id != boarding_city:
            continue
        if dropping_city and booking.dropping_city_id != dropping_city:
            continue
        if booking_status and booking_status_display(booking).upper().replace(" ", "_") != booking_status.upper():
            continue
        if payment_status and payment_status_display(booking).upper().replace(" ", "_") != payment_status.upper():
            continue
        if booking_source and (booking.booking_source or "WEB").upper() != booking_source.upper():
            continue
        filtered.append(booking)
    return filtered


def sort_booking_records(bookings, sort_by):
    if sort_by == "oldest":
        return sorted(bookings, key=lambda booking: booking.created_at)
    if sort_by == "departure_date":
        return sorted(bookings, key=lambda booking: booking.trip.departure_time)
    if sort_by == "booking_date":
        return sorted(bookings, key=lambda booking: booking.created_at, reverse=True)
    if sort_by == "amount":
        return sorted(bookings, key=lambda booking: booking.total_fare, reverse=True)
    return sorted(bookings, key=lambda booking: booking.created_at, reverse=True)


def generate_csv_response(filename, headers, rows):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(rows)
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def generate_html_response(filename, html):
    return Response(
        content=html,
        media_type="text/html",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


def render_document_html(title, subtitle, summary_rows, table_headers, table_rows):
    summary_html = "".join(
        f'<div class="summary-item"><span>{label}</span><strong>{value}</strong></div>'
        for label, value in summary_rows
    )
    headers_html = "".join(f"<th>{header}</th>" for header in table_headers)
    rows_html = "".join(
        f"<tr>{''.join(f'<td>{cell}</td>' for cell in row)}</tr>"
        for row in table_rows
    )
    return f"""
    <html>
      <head>
        <title>{title}</title>
        <style>
          body {{ font-family: Arial, sans-serif; padding: 28px; color: #111827; background: #f8fafc; }}
          .sheet {{ max-width: 960px; margin: 0 auto; background: #ffffff; border: 1px solid #dbe4ee; border-radius: 20px; overflow: hidden; }}
          .hero {{ background: linear-gradient(135deg, #0f172a, #1d4ed8); color: white; padding: 24px 28px; }}
          .eyebrow {{ font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.82; }}
          h1 {{ margin: 8px 0 6px; font-size: 28px; }}
          .subtitle {{ opacity: 0.9; font-size: 14px; }}
          .content {{ padding: 24px 28px 28px; }}
          .summary {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }}
          .summary-item {{ border: 1px solid #dbe4ee; border-radius: 14px; padding: 12px 14px; background: #f8fafc; }}
          .summary-item span {{ display: block; font-size: 12px; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }}
          .summary-item strong {{ font-size: 15px; }}
          table {{ width: 100%; border-collapse: collapse; }}
          th, td {{ border: 1px solid #dbe4ee; padding: 10px 12px; text-align: left; font-size: 12px; }}
          th {{ background: #eff6ff; color: #1e3a8a; }}
          .footer {{ margin-top: 18px; font-size: 12px; color: #64748b; }}
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="hero">
            <div class="eyebrow">Bus Ticketing Platform</div>
            <h1>{title}</h1>
            <div class="subtitle">{subtitle}</div>
          </div>
          <div class="content">
            <div class="summary">{summary_html}</div>
            <table>
              <thead><tr>{headers_html}</tr></thead>
              <tbody>{rows_html}</tbody>
            </table>
            <div class="footer">Generated from operator console for dispatch, support, and trip-day operations.</div>
          </div>
        </div>
      </body>
    </html>
    """


@router.get("/dashboard-summary", response_model=schemas.OperatorDashboardSummary)
def get_dashboard_summary(db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    buses = db.query(models.Bus).filter(models.Bus.operator_id == current_user.id).all()
    routes = db.query(models.Route).filter(models.Route.operator_id == current_user.id).all()
    trips = db.query(models.Trip).filter(models.Trip.operator_id == current_user.id).order_by(models.Trip.departure_time.asc()).all()
    bookings = base_operator_bookings_query(db, current_user.id).all()
    today = datetime.utcnow().date()
    next_trip = next((trip for trip in trips if trip.departure_time >= datetime.utcnow() and trip.status in ACTIVE_TRIP_STATUSES), None)
    return schemas.OperatorDashboardSummary(
        total_buses=len(buses),
        active_buses=len([bus for bus in buses if bus.is_active and (bus.operational_status or "ACTIVE") == "ACTIVE"]),
        maintenance_buses=len([bus for bus in buses if (bus.operational_status or "").upper() == "MAINTENANCE"]),
        total_routes=len(routes),
        active_routes=len([route for route in routes if route.is_active]),
        upcoming_trips=len([trip for trip in trips if trip.departure_time >= datetime.utcnow() and trip.status in ACTIVE_TRIP_STATUSES]),
        recurring_series=len({trip.series_code for trip in trips if trip.series_code}),
        todays_departures=len([trip for trip in trips if trip.departure_time.date() == today and trip.status in ACTIVE_TRIP_STATUSES]),
        delayed_trips=len([trip for trip in trips if trip.status == "DELAYED" or (trip.delay_mins or 0) > 0]),
        pending_payment_bookings=len([booking for booking in bookings if payment_status_display(booking) == "Pending"]),
        open_issue_bookings=len([booking for booking in bookings if booking.issue_flag]),
        ready_to_schedule=bool(buses and routes),
        next_trip=serialize_trip(db, next_trip) if next_trip else None,
    )


@router.post("/buses", response_model=schemas.BusResponse)
def create_bus(bus_data: schemas.BusCreate, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    ensure_bus_unique(db, bus_data.reg_number)
    new_bus = models.Bus(
        operator_id=current_user.id,
        bus_type_id=bus_data.bus_type_id,
        name=bus_data.name,
        reg_number=bus_data.reg_number,
        internal_code=bus_data.internal_code,
        operational_status=validate_bus_status(bus_data.operational_status),
        amenities=encode_amenities(bus_data.amenities),
        notes=bus_data.notes,
        is_active=bus_data.is_active,
    )
    db.add(new_bus)
    db.commit()
    db.refresh(new_bus)
    return serialize_bus(db, new_bus)


@router.get("/buses", response_model=list[schemas.BusResponse])
def get_my_buses(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    buses = db.query(models.Bus).filter(models.Bus.operator_id == current_user.id).order_by(models.Bus.created_at.desc()).offset(skip).limit(limit).all()
    return [serialize_bus(db, bus) for bus in buses]


@router.put("/buses/{bus_id}", response_model=schemas.BusResponse)
def update_bus(bus_id: int, bus_data: schemas.BusUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    bus = get_bus_or_404(db, current_user, bus_id)
    updates = bus_data.model_dump(exclude_unset=True)
    if "reg_number" in updates:
        ensure_bus_unique(db, updates["reg_number"], bus.id)
    if "operational_status" in updates:
        updates["operational_status"] = validate_bus_status(updates["operational_status"])
    if "amenities" in updates:
        updates["amenities"] = encode_amenities(updates["amenities"])
    for field, value in updates.items():
        setattr(bus, field, value)
    db.commit()
    db.refresh(bus)
    return serialize_bus(db, bus)


@router.patch("/buses/{bus_id}/status", response_model=schemas.BusResponse)
def update_bus_status(bus_id: int, status_data: schemas.BusStatusUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    bus = get_bus_or_404(db, current_user, bus_id)
    bus.operational_status = validate_bus_status(status_data.operational_status)
    if status_data.is_active is not None:
        bus.is_active = status_data.is_active
    elif bus.operational_status == "INACTIVE":
        bus.is_active = False
    else:
        bus.is_active = True
    db.commit()
    db.refresh(bus)
    return serialize_bus(db, bus)


@router.post("/buses/{bus_id}/clone", response_model=schemas.BusResponse)
def clone_bus(bus_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    bus = get_bus_or_404(db, current_user, bus_id)
    cloned = models.Bus(
        operator_id=current_user.id,
        bus_type_id=bus.bus_type_id,
        name=f"{bus.name} Copy",
        reg_number=f"{bus.reg_number}-COPY-{uuid.uuid4().hex[:4].upper()}",
        internal_code=f"{(bus.internal_code or bus.name)[:38]}-COPY",
        operational_status="INACTIVE",
        amenities=bus.amenities,
        notes=bus.notes,
        is_active=False,
    )
    db.add(cloned)
    db.commit()
    db.refresh(cloned)
    return serialize_bus(db, cloned)


@router.delete("/buses/{bus_id}")
def delete_bus(bus_id: int, archive_if_used: bool = Query(default=True), db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    bus = get_bus_or_404(db, current_user, bus_id)
    if db.query(models.Trip).filter(models.Trip.bus_id == bus.id).count() > 0:
        if not archive_if_used:
            raise HTTPException(status_code=409, detail="This bus already has trips attached. Archive it instead of deleting.")
        bus.is_active = False
        bus.operational_status = "INACTIVE"
        db.commit()
        return {"message": "Bus archived because trips are already attached"}
    db.delete(bus)
    db.commit()
    return {"message": "Bus deleted successfully"}


@router.post("/routes", response_model=schemas.RouteResponse)
def create_route(route_data: schemas.RouteCreate, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    validate_route_payload(route_data)
    validate_pricing(route_data.stops, route_data.pricing)
    route = models.Route(
        operator_id=current_user.id,
        name=route_data.name,
        route_code=route_data.route_code,
        estimated_distance_km=route_data.estimated_distance_km,
        estimated_duration_mins=route_data.estimated_duration_mins,
        is_active=route_data.is_active,
    )
    db.add(route)
    db.flush()
    for stop in route_data.stops:
        db.add(models.RouteStop(route_id=route.id, city_id=stop.city_id, stop_sequence=stop.stop_sequence, time_offset_mins=stop.time_offset_mins, allows_boarding=stop.allows_boarding, allows_dropping=stop.allows_dropping))
    for price in route_data.pricing:
        db.add(models.RoutePricing(route_id=route.id, origin_city_id=price.origin_city_id, destination_city_id=price.destination_city_id, price=price.price))
    db.commit()
    db.refresh(route)
    return serialize_route(route)


@router.get("/routes", response_model=list[schemas.RouteResponse])
def get_my_routes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    routes = db.query(models.Route).filter(models.Route.operator_id == current_user.id).order_by(models.Route.created_at.desc()).offset(skip).limit(limit).all()
    return [serialize_route(route) for route in routes]


@router.put("/routes/{route_id}", response_model=schemas.RouteResponse)
def update_route(route_id: int, route_data: schemas.RouteUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    route = get_route_or_404(db, current_user, route_id)
    validate_route_payload(route_data)
    updates = route_data.model_dump(exclude_unset=True)
    if "stops" in updates and "pricing" in updates:
        validate_pricing(route_data.stops, route_data.pricing)
    if has_future_trips_for_route(db, route.id) and ("stops" in updates or "pricing" in updates):
        raise HTTPException(status_code=409, detail="This route is already used in future trips. Clone it to make structural changes safely.")
    for field in ["name", "route_code", "estimated_distance_km", "estimated_duration_mins", "is_active"]:
        if field in updates:
            setattr(route, field, updates[field])
    if "stops" in updates:
        route.stops.clear()
        db.flush()
        for stop in route_data.stops:
            route.stops.append(models.RouteStop(city_id=stop.city_id, stop_sequence=stop.stop_sequence, time_offset_mins=stop.time_offset_mins, allows_boarding=stop.allows_boarding, allows_dropping=stop.allows_dropping))
    if "pricing" in updates:
        route.pricing.clear()
        db.flush()
        for price in route_data.pricing:
            route.pricing.append(models.RoutePricing(origin_city_id=price.origin_city_id, destination_city_id=price.destination_city_id, price=price.price))
    db.commit()
    db.refresh(route)
    return serialize_route(route)


@router.post("/routes/{route_id}/clone", response_model=schemas.RouteResponse)
def clone_route(route_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    route = get_route_or_404(db, current_user, route_id)
    cloned = models.Route(operator_id=current_user.id, name=f"{route.name} Copy", route_code=f"{route.route_code or 'ROUTE'}-COPY", estimated_distance_km=route.estimated_distance_km, estimated_duration_mins=route.estimated_duration_mins, is_active=False)
    db.add(cloned)
    db.flush()
    for stop in route.stops:
        db.add(models.RouteStop(route_id=cloned.id, city_id=stop.city_id, stop_sequence=stop.stop_sequence, time_offset_mins=stop.time_offset_mins, allows_boarding=stop.allows_boarding, allows_dropping=stop.allows_dropping))
    for price in route.pricing:
        db.add(models.RoutePricing(route_id=cloned.id, origin_city_id=price.origin_city_id, destination_city_id=price.destination_city_id, price=price.price))
    db.commit()
    db.refresh(cloned)
    return serialize_route(cloned)


@router.delete("/routes/{route_id}")
def delete_route(route_id: int, archive_if_used: bool = Query(default=True), db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    route = get_route_or_404(db, current_user, route_id)
    if db.query(models.Trip).filter(models.Trip.route_id == route.id).count() > 0:
        if not archive_if_used:
            raise HTTPException(status_code=409, detail="This route already has trips attached. Archive it instead of deleting.")
        route.is_active = False
        db.commit()
        return {"message": "Route archived because trips are already attached"}
    db.delete(route)
    db.commit()
    return {"message": "Route deleted successfully"}


@router.post("/trips", response_model=schemas.TripResponse)
def create_trip(trip_data: schemas.TripCreate, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    bus = get_bus_or_404(db, current_user, trip_data.bus_id)
    route = get_route_or_404(db, current_user, trip_data.route_id)
    if not bus.is_active or (bus.operational_status or "ACTIVE") == "MAINTENANCE":
        raise HTTPException(status_code=409, detail="Selected bus is not available for scheduling")
    if not route.is_active:
        raise HTTPException(status_code=409, detail="Selected route is inactive")
    ensure_trip_conflict_free(db, trip_data.bus_id, trip_data.departure_time)
    trip = models.Trip(operator_id=current_user.id, bus_id=trip_data.bus_id, route_id=trip_data.route_id, departure_time=trip_data.departure_time, status=validate_trip_status(trip_data.status))
    db.add(trip)
    db.commit()
    db.refresh(trip)
    return serialize_trip(db, trip)


@router.post("/trips/schedule", response_model=schemas.RecurringTripResponse)
def create_trip_schedule(schedule_data: schemas.RecurringTripCreate, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    bus = get_bus_or_404(db, current_user, schedule_data.bus_id)
    route = get_route_or_404(db, current_user, schedule_data.route_id)
    if not bus.is_active or (bus.operational_status or "ACTIVE") == "MAINTENANCE":
        raise HTTPException(status_code=409, detail="Selected bus is not available for scheduling")
    if not route.is_active:
        raise HTTPException(status_code=409, detail="Selected route is inactive")
    departures = build_recurrence_dates(schedule_data)
    series_code = None if schedule_data.schedule_type.upper() == "ONE_TIME" else f"SER-{uuid.uuid4().hex[:10].upper()}"
    label = recurrence_label(schedule_data)
    created = []
    for departure in departures:
        ensure_trip_conflict_free(db, schedule_data.bus_id, departure)
        trip = models.Trip(operator_id=current_user.id, bus_id=schedule_data.bus_id, route_id=schedule_data.route_id, departure_time=departure, status=validate_trip_status(schedule_data.status), series_code=series_code, recurrence_label=label)
        db.add(trip)
        created.append(trip)
    db.commit()
    for trip in created:
        db.refresh(trip)
    return schemas.RecurringTripResponse(series_code=series_code, created_count=len(created), trips=[serialize_trip(db, trip) for trip in created])


@router.get("/trips", response_model=list[schemas.TripResponse])
def get_my_trips(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    trips = db.query(models.Trip).filter(models.Trip.operator_id == current_user.id).order_by(models.Trip.departure_time.desc()).offset(skip).limit(limit).all()
    return [serialize_trip(db, trip) for trip in trips]


@router.put("/trips/{trip_id}", response_model=schemas.TripResponse)
def update_trip(trip_id: int, trip_data: schemas.TripUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    trip = get_trip_or_404(db, current_user, trip_id)
    updates = trip_data.model_dump(exclude_unset=True)
    if "bus_id" in updates:
        get_bus_or_404(db, current_user, updates["bus_id"])
    if "route_id" in updates:
        get_route_or_404(db, current_user, updates["route_id"])
    ensure_trip_conflict_free(db, updates.get("bus_id", trip.bus_id), updates.get("departure_time", trip.departure_time), ignore_trip_id=trip.id)
    if "status" in updates:
        updates["status"] = validate_trip_status(updates["status"])
    for field, value in updates.items():
        setattr(trip, field, value)
    create_operator_notification(
        db,
        current_user.id,
        category="trip",
        title="Trip updated",
        message=f"Trip {trip.id} on route {trip.route.name if trip.route else trip.route_id} was updated.",
        entity_type="trip",
        entity_id=trip.id,
        href="/operator/trips",
    )
    db.commit()
    db.refresh(trip)
    return serialize_trip(db, trip)


@router.patch("/trips/{trip_id}/status", response_model=schemas.TripResponse)
def update_trip_status(trip_id: int, status_data: schemas.TripStatusUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER", "GROUND_STAFF"])
    trip = get_trip_or_404(db, current_user, trip_id)
    previous_status = trip.status
    trip.status = validate_trip_status(status_data.status)
    if status_data.delay_mins is not None:
        trip.delay_mins = max(status_data.delay_mins, 0)
    if status_data.ops_notes is not None:
        trip.ops_notes = status_data.ops_notes
    if trip.status == "RUNNING" and not trip.actual_start_time:
        trip.actual_start_time = datetime.utcnow()
    if trip.status == "COMPLETED":
        trip.actual_end_time = datetime.utcnow()
    if status_data.is_active is not None:
        trip.is_active = status_data.is_active
    elif trip.status == "CANCELLED":
        trip.is_active = False
    create_operator_notification(
        db,
        current_user.id,
        category="trip",
        title="Trip status changed",
        message=f"Trip {trip.id} moved from {previous_status} to {trip.status}{f' with {trip.delay_mins} min delay' if (trip.delay_mins or 0) > 0 and trip.status == 'DELAYED' else ''}.",
        severity="warning" if trip.status == "DELAYED" else ("danger" if trip.status == "CANCELLED" else "info"),
        entity_type="trip",
        entity_id=trip.id,
        href="/operator/trips",
    )
    db.commit()
    db.refresh(trip)
    return serialize_trip(db, trip)


@router.post("/trips/{trip_id}/clone", response_model=schemas.TripResponse)
def clone_trip(trip_id: int, payload: schemas.TripCloneRequest, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    trip = get_trip_or_404(db, current_user, trip_id)
    new_departure = trip.departure_time + timedelta(days=payload.days_offset)
    ensure_trip_conflict_free(db, trip.bus_id, new_departure)
    cloned = models.Trip(operator_id=current_user.id, bus_id=trip.bus_id, route_id=trip.route_id, departure_time=new_departure, status="SCHEDULED", recurrence_label=trip.recurrence_label)
    db.add(cloned)
    db.commit()
    db.refresh(cloned)
    return serialize_trip(db, cloned)


@router.post("/trips/series/{series_code}/cancel")
def cancel_series(series_code: str, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    trips = db.query(models.Trip).filter(models.Trip.operator_id == current_user.id, models.Trip.series_code == series_code, models.Trip.departure_time >= datetime.utcnow()).all()
    if not trips:
        raise HTTPException(status_code=404, detail="No upcoming trips found for this series")
    for trip in trips:
        trip.status = "CANCELLED"
        trip.is_active = False
    create_operator_notification(
        db,
        current_user.id,
        category="trip",
        title="Recurring series cancelled",
        message=f"Cancelled {len(trips)} upcoming trip(s) for series {series_code}.",
        severity="warning",
        entity_type="trip_series",
        href="/operator/trips",
    )
    db.commit()
    return {"message": f"Cancelled {len(trips)} future trip(s) in the series"}


@router.delete("/trips/{trip_id}")
def delete_trip(trip_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    trip = get_trip_or_404(db, current_user, trip_id)
    if db.query(Booking).filter(Booking.trip_id == trip.id).first():
        trip.status = "CANCELLED"
        trip.is_active = False
        create_operator_notification(
            db,
            current_user.id,
            category="trip",
            title="Trip cancelled instead of deleted",
            message=f"Trip {trip.id} could not be deleted because bookings already exist, so it was cancelled.",
            severity="warning",
            entity_type="trip",
            entity_id=trip.id,
            href="/operator/trips",
        )
        db.commit()
        return {"message": "Trip had bookings, so it was cancelled instead of deleted"}
    create_operator_notification(
        db,
        current_user.id,
        category="trip",
        title="Trip deleted",
        message=f"Trip {trip.id} was deleted before it received bookings.",
        severity="info",
        entity_type="trip",
        entity_id=trip.id,
        href="/operator/trips",
    )
    db.delete(trip)
    db.commit()
    return {"message": "Trip deleted successfully"}


@router.get("/bookings/summary", response_model=schemas.BookingSummaryResponse)
def get_bookings_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    bookings = base_operator_bookings_query(db, current_user.id).all()
    today = datetime.utcnow().date()
    return schemas.BookingSummaryResponse(
        total_bookings=len(bookings),
        confirmed_bookings=len([booking for booking in bookings if (booking.ops_status or "CONFIRMED") == "CONFIRMED"]),
        cancelled_bookings=len([booking for booking in bookings if booking.status == "CANCELLED" or (booking.ops_status or "") == "CANCELLED"]),
        refunded_bookings=len([booking for booking in bookings if booking.status == "REFUNDED" or (booking.refunded_amount or 0) > 0]),
        pending_payment_bookings=len([booking for booking in bookings if payment_status_display(booking) == "Pending"]),
        total_revenue=sum(booking.total_fare for booking in bookings if booking_has_successful_payment(booking)),
        refunded_amount=sum(booking.refunded_amount or 0 for booking in bookings),
        todays_departures=len([booking for booking in bookings if booking.trip.departure_time.date() == today]),
    )


@router.get("/bookings", response_model=list[schemas.OperatorBookingListItem])
def get_operator_bookings(
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    route_id: int | None = None,
    trip_id: int | None = None,
    bus_id: int | None = None,
    boarding_city_id: int | None = None,
    dropping_city_id: int | None = None,
    booking_status: str | None = None,
    payment_status: str | None = None,
    booking_source: str | None = None,
    sort_by: str = "latest",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    bookings = base_operator_bookings_query(db, current_user.id).all()
    filtered = filter_booking_records(
        bookings,
        search=search,
        date_from=date_from,
        date_to=date_to,
        route_id=route_id,
        trip_id=trip_id,
        bus_id=bus_id,
        boarding_city=boarding_city_id,
        dropping_city=dropping_city_id,
        booking_status=booking_status,
        payment_status=payment_status,
        booking_source=booking_source,
    )
    return [serialize_booking_list_item(booking) for booking in sort_booking_records(filtered, sort_by)]


@router.get("/bookings/export")
def export_operator_bookings(
    search: str | None = None,
    route_id: int | None = None,
    trip_id: int | None = None,
    bus_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    bookings = base_operator_bookings_query(db, current_user.id).all()
    filtered = filter_booking_records(bookings, search=search, route_id=route_id, trip_id=trip_id, bus_id=bus_id)
    rows = []
    for booking in filtered:
        rows.append([
            booking.booking_ref,
            booking.ticket_number or booking.booking_ref,
            booking.passengers[0].name if booking.passengers else "Passenger",
            booking.user.phone if booking.user else "",
            booking.trip.departure_time.isoformat(sep=" ", timespec="minutes"),
            booking.trip.route.name if booking.trip and booking.trip.route else "",
            booking.trip.bus.name if booking.trip and booking.trip.bus else "",
            booking_boarding_name(booking),
            booking_dropping_name(booking),
            ", ".join(seat.seat_label for seat in booking.seats),
            booking.total_fare,
            booking_status_display(booking),
            payment_status_display(booking),
            booking.booking_source or "WEB",
        ])
    return generate_csv_response(
        "operator-bookings.csv",
        ["PNR", "Ticket", "Passenger", "Phone", "Departure", "Route", "Bus", "Boarding", "Dropping", "Seats", "Fare", "Booking Status", "Payment Status", "Source"],
        rows,
    )


@router.get("/bookings/{booking_id}", response_model=schemas.OperatorBookingDetail)
def get_operator_booking_detail(booking_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    booking = get_booking_or_404(db, current_user, booking_id)
    return serialize_booking_detail(booking)


@router.get("/bookings/{booking_id}/ticket-document")
def get_operator_ticket_document(booking_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    booking = get_booking_or_404(db, current_user, booking_id)
    detail = serialize_booking_detail(booking)
    html = render_document_html(
        title="Passenger Ticket",
        subtitle=f"{detail.route_name or '-'} | Departure {detail.trip_departure_time.strftime('%d %b %Y %I:%M %p')}",
        summary_rows=[
            ("PNR", detail.booking_ref),
            ("Ticket", detail.ticket_number or detail.booking_ref),
            ("Bus", f"{detail.bus_name or '-'} ({detail.bus_reg_number or '-'})"),
            ("Boarding", detail.boarding_point or "-"),
            ("Dropping", detail.dropping_point or "-"),
            ("Fare", f"Rs. {detail.total_fare}"),
            ("Status", f"{detail.booking_status} / {detail.payment_status}"),
            ("Source", detail.booking_source or "WEB"),
        ],
        table_headers=["Seat", "Passenger", "Age", "Gender"],
        table_rows=[
            [passenger.seat_label, passenger.name, passenger.age, passenger.gender]
            for passenger in detail.passengers
        ],
    )
    return generate_html_response(f"ticket-{detail.booking_ref}.html", html)


@router.post("/bookings/{booking_id}/resend-ticket", response_model=schemas.TicketSendResponse)
def resend_operator_ticket(
    booking_id: int,
    channel: str = Query(default="SMS"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    booking = get_booking_or_404(db, current_user, booking_id)
    channel_name = channel.upper()
    if channel_name not in {"SMS", "EMAIL", "WHATSAPP"}:
        raise HTTPException(status_code=400, detail="Channel must be SMS, EMAIL, or WHATSAPP")
    booking.last_ticket_sent_at = datetime.utcnow()
    booking.last_ticket_sent_channel = channel_name
    create_operator_notification(
        db,
        current_user.id,
        category="booking",
        title="Ticket resend prepared",
        message=f"Booking {booking.booking_ref} ticket resend prepared over {channel_name}.",
        channel=channel_name,
        recipient=booking.user.phone if booking.user else None,
        delivery_status="PREPARED",
        entity_type="booking",
        entity_id=booking.id,
        href="/operator/bookings",
    )
    db.commit()
    message = f"{channel_name} ticket resend prepared for {booking.booking_ref} to passenger contact {booking.user.phone if booking.user else 'unknown'}"
    return schemas.TicketSendResponse(
        booking_id=booking.id,
        booking_ref=booking.booking_ref,
        channel=channel_name,
        sent_at=booking.last_ticket_sent_at,
        message=message,
    )


@router.patch("/bookings/{booking_id}", response_model=schemas.OperatorBookingDetail)
def update_operator_booking(
    booking_id: int,
    payload: schemas.BookingOperatorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    booking = get_booking_or_404(db, current_user, booking_id)
    updates = payload.model_dump(exclude_unset=True)
    requested_ops_only = set(updates.keys()).issubset({"ops_status"})
    if requested_ops_only:
        ensure_operator_access(current_user, ["OWNER", "MANAGER", "BOOKING_STAFF", "GROUND_STAFF"])
    else:
        ensure_operator_access(current_user, ["OWNER", "MANAGER", "BOOKING_STAFF"])
    if "ops_status" in updates and updates["ops_status"]:
        booking.ops_status = validate_booking_ops_status(updates["ops_status"])
        if booking.ops_status == "CANCELLED":
            booking.status = "REFUNDED" if (booking.refunded_amount or 0) >= booking.total_fare and booking.payment_status == "SUCCESS" else "CANCELLED"
            for seat in booking.seats:
                seat.status = "CANCELLED"
        elif booking.ops_status in {"CONFIRMED", "BOARDED", "COMPLETED", "RESCHEDULED"} and booking.status == "CANCELLED":
            booking.status = "CONFIRMED"
    if "operator_notes" in updates:
        booking.operator_notes = updates["operator_notes"]
    if "issue_flag" in updates:
        booking.issue_flag = updates["issue_flag"]
    if "refunded_amount" in updates and updates["refunded_amount"] is not None:
        refund_value = max(0, min(float(updates["refunded_amount"]), booking.total_fare))
        booking.refunded_amount = refund_value
        if refund_value >= booking.total_fare:
            booking.status = "REFUNDED"
        elif refund_value > 0:
            booking.status = "REFUND_INITIATED"
        elif booking.ops_status == "CANCELLED":
            booking.status = "CANCELLED"
    create_operator_notification(
        db,
        current_user.id,
        category="booking",
        title="Booking support details updated",
        message=f"Booking {booking.booking_ref} support details were updated to ops status {(booking.ops_status or 'CONFIRMED').replace('_', ' ').title()}.",
        severity="warning" if booking.issue_flag else "info",
        entity_type="booking",
        entity_id=booking.id,
        href="/operator/bookings",
    )
    db.commit()
    db.refresh(booking)
    return serialize_booking_detail(booking)


@router.post("/bookings/{booking_id}/cancel", response_model=schemas.OperatorBookingDetail)
def cancel_operator_booking(
    booking_id: int,
    payload: schemas.BookingCancelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    ensure_operator_access(current_user, ["OWNER", "MANAGER", "BOOKING_STAFF"])
    booking = get_booking_or_404(db, current_user, booking_id)
    if booking.status in {"CANCELLED", "REFUNDED"}:
        return serialize_booking_detail(booking)
    booking.status = "CANCELLED"
    booking.ops_status = "CANCELLED"
    refund_value = booking.total_fare if payload.refund_amount is None else max(0, min(payload.refund_amount, booking.total_fare))
    booking.refunded_amount = refund_value
    if refund_value >= booking.total_fare and booking.payment_status == "SUCCESS":
        booking.status = "REFUNDED"
    if payload.note:
        existing_notes = booking.operator_notes or ""
        booking.operator_notes = f"{existing_notes}\nCancellation: {payload.note}".strip()
    for seat in booking.seats:
        seat.status = "CANCELLED"
    create_operator_notification(
        db,
        current_user.id,
        category="booking",
        title="Booking cancelled",
        message=f"Booking {booking.booking_ref} was cancelled with refund amount Rs. {refund_value:.0f}.",
        severity="warning",
        entity_type="booking",
        entity_id=booking.id,
        href="/operator/bookings",
    )
    db.commit()
    db.refresh(booking)
    return serialize_booking_detail(booking)


@router.get("/bookings/{booking_id}/reschedule-options", response_model=list[schemas.BookingRescheduleOption])
def get_booking_reschedule_options(booking_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER", "BOOKING_STAFF"])
    booking = get_booking_or_404(db, current_user, booking_id)
    current_trip = booking.trip
    options = []
    future_trips = (
        db.query(models.Trip)
        .filter(
            models.Trip.operator_id == current_user.id,
            models.Trip.route_id == current_trip.route_id,
            models.Trip.id != current_trip.id,
            models.Trip.departure_time >= datetime.utcnow(),
            models.Trip.status.in_(ACTIVE_TRIP_STATUSES),
        )
        .options(joinedload(models.Trip.route).joinedload(models.Route.stops), joinedload(models.Trip.bus).joinedload(models.Bus.bus_type))
        .order_by(models.Trip.departure_time.asc())
        .limit(10)
        .all()
    )
    for trip in future_trips:
        boarding_stop = get_trip_stop_for_city(trip, booking.boarding_city_id)
        dropping_stop = get_trip_stop_for_city(trip, booking.dropping_city_id)
        if not boarding_stop or not dropping_stop or boarding_stop.stop_sequence >= dropping_stop.stop_sequence:
            continue
        available = count_available_seats(
            db=db,
            trip_id=trip.id,
            boarding_seq=boarding_stop.stop_sequence,
            dropping_seq=dropping_stop.stop_sequence,
            total_bus_capacity=get_bus_capacity(trip.bus.bus_type.layout if trip.bus and trip.bus.bus_type else None),
        )
        if available < booking.total_passengers:
            continue
        options.append(
            schemas.BookingRescheduleOption(
                trip_id=trip.id,
                departure_time=trip.departure_time + timedelta(minutes=boarding_stop.time_offset_mins),
                arrival_time=trip.departure_time + timedelta(minutes=dropping_stop.time_offset_mins),
                route_name=trip.route.name if trip.route else None,
                bus_name=trip.bus.name if trip.bus else None,
                available_seats=available,
            )
        )
    return options


@router.post("/bookings/{booking_id}/reschedule", response_model=schemas.OperatorBookingDetail)
def reschedule_operator_booking(
    booking_id: int,
    payload: schemas.BookingRescheduleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    ensure_operator_access(current_user, ["OWNER", "MANAGER", "BOOKING_STAFF"])
    booking = get_booking_or_404(db, current_user, booking_id)
    new_trip = (
        db.query(models.Trip)
        .filter(models.Trip.id == payload.new_trip_id, models.Trip.operator_id == current_user.id)
        .options(joinedload(models.Trip.route).joinedload(models.Route.stops), joinedload(models.Trip.bus))
        .first()
    )
    if not new_trip:
        raise HTTPException(status_code=404, detail="New trip not found")
    boarding_stop = get_trip_stop_for_city(new_trip, booking.boarding_city_id)
    dropping_stop = get_trip_stop_for_city(new_trip, booking.dropping_city_id)
    if not boarding_stop or not dropping_stop or boarding_stop.stop_sequence >= dropping_stop.stop_sequence:
        raise HTTPException(status_code=400, detail="New trip does not support the same boarding and dropping points")
    if len(payload.seat_labels) != booking.total_passengers:
        raise HTTPException(status_code=400, detail="Reschedule seat count must match passenger count")
    conflicts = validate_seats_available(
        db=db,
        trip_id=new_trip.id,
        boarding_seq=boarding_stop.stop_sequence,
        dropping_seq=dropping_stop.stop_sequence,
        requested_seats=payload.seat_labels,
    )
    if conflicts:
        raise HTTPException(status_code=409, detail=f"Selected seats are not available: {conflicts}")
    booking.trip_id = new_trip.id
    booking.boarding_stop_id = boarding_stop.id
    booking.dropping_stop_id = dropping_stop.id
    booking.status = "CONFIRMED"
    booking.ops_status = "RESCHEDULED"
    if payload.note:
        existing_notes = booking.operator_notes or ""
        booking.operator_notes = f"{existing_notes}\nRescheduled: {payload.note}".strip()
    for seat_record, new_label, passenger in zip(sorted(booking.seats, key=lambda item: item.id), payload.seat_labels, sorted(booking.passengers, key=lambda item: item.id)):
        seat_record.trip_id = new_trip.id
        seat_record.seat_label = new_label
        seat_record.boarding_seq = boarding_stop.stop_sequence
        seat_record.dropping_seq = dropping_stop.stop_sequence
        seat_record.status = "CONFIRMED"
        passenger.seat_label = new_label
    create_operator_notification(
        db,
        current_user.id,
        category="booking",
        title="Booking rescheduled",
        message=f"Booking {booking.booking_ref} was moved to trip {new_trip.id}.",
        severity="info",
        entity_type="booking",
        entity_id=booking.id,
        href="/operator/bookings",
    )
    db.commit()
    db.refresh(booking)
    return serialize_booking_detail(booking)


@router.get("/trips/{trip_id}/manifest", response_model=schemas.BookingManifestResponse)
def get_trip_manifest(trip_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    trip = (
        db.query(models.Trip)
        .filter(models.Trip.id == trip_id, models.Trip.operator_id == current_user.id)
        .options(
            joinedload(models.Trip.route).joinedload(models.Route.stops).joinedload(models.RouteStop.city),
            joinedload(models.Trip.bus).joinedload(models.Bus.bus_type),
            joinedload(models.Trip.bookings).joinedload(Booking.passengers),
            joinedload(models.Trip.bookings).joinedload(Booking.user),
            joinedload(models.Trip.bookings).joinedload(Booking.boarding_city),
            joinedload(models.Trip.bookings).joinedload(Booking.dropping_city),
        )
        .first()
    )
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    passengers = []
    boarding_groups = defaultdict(int)
    dropping_groups = defaultdict(int)
    collected_amount = 0.0
    refunded_amount = 0.0
    booked_seats = 0
    boarded_count = 0
    pending_count = 0
    no_show_count = 0
    for booking in trip.bookings:
        booked_seats += len(booking.seats)
        ops_status = (booking.ops_status or "CONFIRMED").upper()
        if ops_status == "BOARDED":
            boarded_count += booking.total_passengers
        elif ops_status == "NO_SHOW":
            no_show_count += booking.total_passengers
        elif ops_status in {"CONFIRMED", "PENDING", "RESCHEDULED"}:
            pending_count += booking.total_passengers
        if booking_has_successful_payment(booking):
            collected_amount += booking.total_fare
        refunded_amount += booking.refunded_amount or 0
        boarding_groups[booking_boarding_name(booking)] += booking.total_passengers
        dropping_groups[booking_dropping_name(booking)] += booking.total_passengers
        for passenger in booking.passengers:
            passengers.append(
                schemas.BookingManifestPassenger(
                    booking_id=booking.id,
                    booking_ref=booking.booking_ref,
                    passenger_name=passenger.name,
                    passenger_phone=booking.user.phone if booking.user else None,
                    seat_label=passenger.seat_label,
                    boarding_point=booking_boarding_name(booking),
                    dropping_point=booking_dropping_name(booking),
                    payment_status=payment_status_display(booking),
                    booking_status=booking_status_display(booking),
                    ops_status=(booking.ops_status or "CONFIRMED").replace("_", " ").title(),
                    issue_flag=booking.issue_flag,
                )
            )
    capacity = get_bus_capacity(trip.bus.bus_type.layout if trip.bus and trip.bus.bus_type else None)
    return schemas.BookingManifestResponse(
        trip=serialize_trip(db, trip),
        route_name=trip.route.name if trip.route else None,
        bus_name=trip.bus.name if trip.bus else None,
        total_capacity=capacity,
        booked_seats=booked_seats,
        available_seats=max(capacity - booked_seats, 0),
        total_passengers=sum(booking.total_passengers for booking in trip.bookings),
        collected_amount=collected_amount,
        refunded_amount=refunded_amount,
        occupancy_percent=round((booked_seats / capacity) * 100, 1) if capacity else 0,
        boarded_count=boarded_count,
        pending_count=pending_count,
        no_show_count=no_show_count,
        boarding_groups=dict(boarding_groups),
        dropping_groups=dict(dropping_groups),
        passengers=sorted(passengers, key=lambda item: item.seat_label),
    )


@router.get("/trips/{trip_id}/manifest/export")
def export_trip_manifest(trip_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    manifest = get_trip_manifest(trip_id, db, current_user)
    rows = []
    for passenger in manifest.passengers:
        rows.append([
            passenger.seat_label,
            passenger.passenger_name,
            passenger.passenger_phone or "",
            passenger.boarding_point,
            passenger.dropping_point,
            passenger.payment_status,
            passenger.booking_status,
            passenger.ops_status,
            passenger.booking_ref,
        ])
    return generate_csv_response(
        f"trip-{trip_id}-manifest.csv",
        ["Seat", "Passenger", "Phone", "Boarding", "Dropping", "Payment", "Booking", "Ops Status", "PNR"],
        rows,
    )


@router.get("/trips/{trip_id}/manifest-document")
def get_trip_manifest_document(
    trip_id: int,
    staff_mode: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    manifest = get_trip_manifest(trip_id, db, current_user)
    table_headers = ["Seat", "Passenger", "Phone", "Boarding"]
    table_rows = [
        [p.seat_label, p.passenger_name, p.passenger_phone or "-", p.boarding_point]
        for p in manifest.passengers
    ]
    title = "Ground Staff Boarding List" if staff_mode else "Trip Passenger Manifest"
    if not staff_mode:
        table_headers.extend(["Dropping", "PNR", "Ops Status"])
        table_rows = [
            [p.seat_label, p.passenger_name, p.passenger_phone or "-", p.boarding_point, p.dropping_point, p.booking_ref, p.ops_status]
            for p in manifest.passengers
        ]
    html = render_document_html(
        title=title,
        subtitle=f"{manifest.route_name or '-'} | {manifest.bus_name or '-'} | Departure {manifest.trip.departure_time.strftime('%d %b %Y %I:%M %p')}",
        summary_rows=[
            ("Route", manifest.route_name or "-"),
            ("Bus", manifest.bus_name or "-"),
            ("Booked Seats", f"{manifest.booked_seats} / {manifest.total_capacity}"),
            ("Passengers", manifest.total_passengers),
            ("Collected", f"Rs. {manifest.collected_amount}"),
            ("Pending Boarding", manifest.pending_count),
            ("Boarded", manifest.boarded_count),
            ("No Show", manifest.no_show_count),
        ],
        table_headers=table_headers,
        table_rows=table_rows,
    )
    filename = f"{'boarding-list' if staff_mode else 'manifest'}-trip-{trip_id}.html"
    return generate_html_response(filename, html)


@router.get("/trips/{trip_id}/operations", response_model=schemas.TripOperationsSummary)
def get_trip_operations_summary(trip_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    trip = (
        db.query(models.Trip)
        .filter(models.Trip.id == trip_id, models.Trip.operator_id == current_user.id)
        .options(
            joinedload(models.Trip.bus).joinedload(models.Bus.bus_type),
            joinedload(models.Trip.bookings).joinedload(Booking.seats),
        )
        .first()
    )
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    capacity = get_bus_capacity(trip.bus.bus_type.layout if trip.bus and trip.bus.bus_type else None)
    booked_seats = sum(len(booking.seats) for booking in trip.bookings if booking.status not in {"CANCELLED"})
    booked_passengers = sum(booking.total_passengers for booking in trip.bookings if booking.status not in {"CANCELLED"})
    boarding_pending = len([booking for booking in trip.bookings if (booking.ops_status or "CONFIRMED") in {"CONFIRMED", "PENDING", "RESCHEDULED"}])
    no_show_count = len([booking for booking in trip.bookings if (booking.ops_status or "") == "NO_SHOW"])
    return schemas.TripOperationsSummary(
        trip=serialize_trip(db, trip),
        booked_passengers=booked_passengers,
        booked_seats=booked_seats,
        available_seats=max(capacity - booked_seats, 0),
        occupancy_percent=round((booked_seats / capacity) * 100, 1) if capacity else 0,
        boarding_pending=boarding_pending,
        no_show_count=no_show_count,
        collected_amount=sum(booking.total_fare for booking in trip.bookings if booking_has_successful_payment(booking)),
        refunded_amount=sum(booking.refunded_amount or 0 for booking in trip.bookings),
    )


@router.get("/financials/summary", response_model=schemas.FinancialSummaryResponse)
def get_financial_summary(db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    bookings = base_operator_bookings_query(db, current_user.id).all()
    now = datetime.utcnow()
    week_start = now - timedelta(days=7)
    month_start = now - timedelta(days=30)
    paid_bookings = [booking for booking in bookings if booking_has_successful_payment(booking)]
    gross = sum(booking.total_fare for booking in paid_bookings)
    refunded = sum(booking.refunded_amount or 0 for booking in bookings)
    commission = sum(booking.total_fare * PLATFORM_COMMISSION_RATE for booking in paid_bookings if (booking.booking_source or "WEB").upper() != "MANUAL")
    tax_amount = round(commission * GST_RATE, 2)
    online_collections = sum(booking.total_fare for booking in paid_bookings if (booking.booking_source or "WEB").upper() in {"WEB", "APP", "ADMIN"})
    manual_collections = sum(booking.total_fare for booking in paid_bookings if (booking.booking_source or "WEB").upper() == "MANUAL")
    seats_booked = sum(len(booking.seats) for booking in bookings)
    total_capacity = sum(get_bus_capacity(booking.trip.bus.bus_type.layout if booking.trip and booking.trip.bus and booking.trip.bus.bus_type else None) for booking in bookings) or 0
    return schemas.FinancialSummaryResponse(
        gross_collections=gross,
        net_collections=gross - refunded,
        today_earnings=sum(booking.total_fare for booking in paid_bookings if booking.created_at.date() == now.date()),
        week_earnings=sum(booking.total_fare for booking in paid_bookings if booking.created_at >= week_start),
        month_earnings=sum(booking.total_fare for booking in paid_bookings if booking.created_at >= month_start),
        refunded_amount=refunded,
        cancelled_loss=sum(booking.total_fare for booking in bookings if booking.status == "CANCELLED"),
        average_ticket_value=round(gross / len(paid_bookings), 2) if paid_bookings else 0,
        occupancy_percent=round((seats_booked / total_capacity) * 100, 1) if total_capacity else 0,
        paid_bookings=len(paid_bookings),
        pending_settlement_amount=sum(booking.total_fare for booking in paid_bookings if (booking.booking_source or "WEB").upper() != "MANUAL"),
        platform_commission_amount=round(commission, 2),
        tax_amount=tax_amount,
        operator_payout_amount=round(max(gross - refunded - commission - tax_amount, 0), 2),
        online_collections=round(online_collections, 2),
        manual_collections=round(manual_collections, 2),
    )


@router.get("/financials/transactions", response_model=list[schemas.FinancialTransactionItem])
def get_financial_transactions(
    search: str | None = None,
    route_id: int | None = None,
    trip_id: int | None = None,
    bus_id: int | None = None,
    payment_status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    bookings = base_operator_bookings_query(db, current_user.id).all()
    filtered = filter_booking_records(bookings, search=search, route_id=route_id, trip_id=trip_id, bus_id=bus_id, payment_status=payment_status)
    items = []
    for booking in sorted(filtered, key=lambda item: item.created_at, reverse=True):
        source = (booking.booking_source or "WEB").upper()
        collected_amount = booking.total_fare if payment_status_display(booking) == "Paid" else 0
        commission_amount = round(collected_amount * PLATFORM_COMMISSION_RATE, 2) if source in {"WEB", "APP", "ADMIN"} else 0
        tax_amount = round(commission_amount * GST_RATE, 2)
        settlement_status = "Pending Settlement" if source in {"WEB", "APP"} and payment_status_display(booking) == "Paid" else "Collected"
        items.append(
            schemas.FinancialTransactionItem(
                booking_id=booking.id,
                booking_ref=booking.booking_ref,
                ticket_number=booking.ticket_number or booking.booking_ref,
                transaction_date=booking.created_at,
                passenger_name=booking.passengers[0].name if booking.passengers else "Passenger",
                passenger_phone=booking.user.phone if booking.user else None,
                route_name=booking.trip.route.name if booking.trip and booking.trip.route else None,
                trip_id=booking.trip_id,
                bus_name=booking.trip.bus.name if booking.trip and booking.trip.bus else None,
                amount_collected=collected_amount,
                amount_refunded=booking.refunded_amount or 0,
                commission_amount=commission_amount,
                tax_amount=tax_amount,
                net_amount=round(max(collected_amount - (booking.refunded_amount or 0) - commission_amount - tax_amount, 0), 2),
                payment_status=payment_status_display(booking),
                booking_status=booking_status_display(booking),
                booking_source=source.title(),
                payment_mode="Cash" if source == "MANUAL" else "Online",
                settlement_status=settlement_status,
            )
        )
    return items


@router.get("/financials/trends")
def get_financial_trends(db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    bookings = base_operator_bookings_query(db, current_user.id).all()
    buckets = defaultdict(lambda: {"revenue": 0.0, "bookings": 0})
    for booking in bookings:
        label = booking.created_at.strftime("%d %b")
        if payment_status_display(booking) == "Paid":
            buckets[label]["revenue"] += booking.total_fare
        buckets[label]["bookings"] += 1
    return [
        schemas.FinancialTrendPoint(label=label, revenue=values["revenue"], bookings=values["bookings"])
        for label, values in sorted(buckets.items(), key=lambda item: datetime.strptime(item[0], "%d %b"))
    ]


@router.get("/financials/performance")
def get_financial_performance(db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    bookings = base_operator_bookings_query(db, current_user.id).all()
    route_buckets = defaultdict(lambda: {"revenue": 0.0, "bookings": 0, "passengers": 0, "capacity": 0})
    bus_buckets = defaultdict(lambda: {"revenue": 0.0, "bookings": 0, "passengers": 0, "capacity": 0})
    for booking in bookings:
        route_name = booking.trip.route.name if booking.trip and booking.trip.route else "Unknown Route"
        bus_name = booking.trip.bus.name if booking.trip and booking.trip.bus else "Unknown Bus"
        capacity = get_bus_capacity(booking.trip.bus.bus_type.layout if booking.trip and booking.trip.bus and booking.trip.bus.bus_type else None)
        for bucket, key in ((route_buckets, route_name), (bus_buckets, bus_name)):
            bucket[key]["bookings"] += 1
            bucket[key]["passengers"] += booking.total_passengers
            bucket[key]["capacity"] += capacity
            if booking_has_successful_payment(booking):
                bucket[key]["revenue"] += booking.total_fare
    serialize_bucket = lambda name, item: schemas.PerformanceBreakdownItem(
        name=name,
        bookings=item["bookings"],
        revenue=item["revenue"],
        passengers=item["passengers"],
        occupancy_percent=round((item["passengers"] / item["capacity"]) * 100, 1) if item["capacity"] else 0,
    )
    return {
        "routes": [serialize_bucket(name, item) for name, item in sorted(route_buckets.items(), key=lambda entry: entry[1]["revenue"], reverse=True)],
        "buses": [serialize_bucket(name, item) for name, item in sorted(bus_buckets.items(), key=lambda entry: entry[1]["revenue"], reverse=True)],
    }


@router.get("/financials/export")
def export_financial_transactions(db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    ensure_operator_access(current_user, ["OWNER", "MANAGER"])
    rows = []
    for item in get_financial_transactions(db=db, current_user=current_user):
        rows.append([
            item.booking_ref,
            item.ticket_number or "",
            item.transaction_date.isoformat(sep=" ", timespec="minutes"),
            item.passenger_name,
            item.passenger_phone or "",
            item.route_name or "",
            item.bus_name or "",
            item.amount_collected,
            item.amount_refunded,
            item.payment_status,
            item.booking_status,
            item.booking_source,
            item.settlement_status,
        ])
    return generate_csv_response(
        "operator-financial-transactions.csv",
        ["PNR", "Ticket", "Transaction Date", "Passenger", "Phone", "Route", "Bus", "Collected", "Refunded", "Payment", "Booking", "Source", "Settlement"],
        rows,
    )


@router.get("/alerts", response_model=list[schemas.OperatorAlertItem])
def get_operator_alerts(db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    trips = db.query(models.Trip).filter(models.Trip.operator_id == current_user.id).all()
    bookings = base_operator_bookings_query(db, current_user.id).all()
    now = datetime.utcnow()
    in_two_hours = now + timedelta(hours=2)
    alerts = []

    departures_soon = [trip for trip in trips if now <= trip.departure_time <= in_two_hours and trip.status in ACTIVE_TRIP_STATUSES]
    if departures_soon:
      alerts.append(schemas.OperatorAlertItem(
          type="departures",
          severity="info",
          title="Trips departing soon",
          message=f"{len(departures_soon)} trip(s) depart in the next 2 hours.",
          href="/operator/trips",
          count=len(departures_soon),
      ))

    delayed = [trip for trip in trips if trip.status == "DELAYED" or (trip.delay_mins or 0) > 0]
    if delayed:
      alerts.append(schemas.OperatorAlertItem(
          type="delays",
          severity="warning",
          title="Delayed trips require updates",
          message=f"{len(delayed)} trip(s) are currently delayed.",
          href="/operator/trips",
          count=len(delayed),
      ))

    pending_payments = [booking for booking in bookings if payment_status_display(booking) == "Pending"]
    if pending_payments:
      alerts.append(schemas.OperatorAlertItem(
          type="payments",
          severity="warning",
          title="Pending payment bookings",
          message=f"{len(pending_payments)} booking(s) are still awaiting payment confirmation.",
          href="/operator/bookings",
          count=len(pending_payments),
      ))

    issue_bookings = [booking for booking in bookings if booking.issue_flag]
    if issue_bookings:
      alerts.append(schemas.OperatorAlertItem(
          type="support",
          severity="danger",
          title="Support issues need review",
          message=f"{len(issue_bookings)} booking(s) are marked with issue flags.",
          href="/operator/bookings",
          count=len(issue_bookings),
      ))

    refunded = [booking for booking in bookings if (booking.refunded_amount or 0) > 0]
    if refunded:
      alerts.append(schemas.OperatorAlertItem(
          type="refunds",
          severity="info",
          title="Refund activity",
          message=f"{len(refunded)} booking(s) have refund activity recorded.",
          href="/operator/financials",
          count=len(refunded),
      ))

    return alerts


@router.get("/notifications", response_model=list[schemas.OperatorNotificationItem])
def get_operator_notifications(
    limit: int = Query(default=12, ge=1, le=50),
    unread_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    query = db.query(models.OperatorNotificationLog).filter(models.OperatorNotificationLog.operator_id == current_user.id)
    if unread_only:
        query = query.filter(models.OperatorNotificationLog.is_read == False)
    items = query.order_by(models.OperatorNotificationLog.created_at.desc()).limit(limit).all()
    return items


@router.get("/notifications/summary", response_model=schemas.NotificationDeliverySummary)
def get_operator_notification_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    items = db.query(models.OperatorNotificationLog).filter(models.OperatorNotificationLog.operator_id == current_user.id).all()
    return schemas.NotificationDeliverySummary(
        total_notifications=len(items),
        unread_notifications=len([item for item in items if not item.is_read]),
        prepared_notifications=len([item for item in items if (item.delivery_status or "IN_APP") == "PREPARED"]),
        delivered_notifications=len([item for item in items if (item.delivery_status or "") == "DELIVERED"]),
        failed_notifications=len([item for item in items if (item.delivery_status or "") == "FAILED"]),
    )


@router.post("/notifications/{notification_id}/read", response_model=schemas.NotificationReadResponse)
def mark_operator_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    item = (
        db.query(models.OperatorNotificationLog)
        .filter(
            models.OperatorNotificationLog.id == notification_id,
            models.OperatorNotificationLog.operator_id == current_user.id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Notification not found")
    item.is_read = True
    db.commit()
    return schemas.NotificationReadResponse(updated_count=1, message="Notification marked as read")


@router.post("/notifications/read-all", response_model=schemas.NotificationReadResponse)
def mark_all_operator_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    items = (
        db.query(models.OperatorNotificationLog)
        .filter(
            models.OperatorNotificationLog.operator_id == current_user.id,
            models.OperatorNotificationLog.is_read == False,
        )
        .all()
    )
    for item in items:
        item.is_read = True
    db.commit()
    return schemas.NotificationReadResponse(
        updated_count=len(items),
        message=f"Marked {len(items)} notification(s) as read",
    )


@router.patch("/notifications/{notification_id}/status", response_model=schemas.OperatorNotificationItem)
def update_operator_notification_status(
    notification_id: int,
    payload: schemas.OperatorNotificationStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin),
):
    item = (
        db.query(models.OperatorNotificationLog)
        .filter(
            models.OperatorNotificationLog.id == notification_id,
            models.OperatorNotificationLog.operator_id == current_user.id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Notification not found")
    item.delivery_status = payload.delivery_status.upper()
    if payload.provider_name is not None:
        item.provider_name = payload.provider_name
    if payload.provider_reference is not None:
        item.provider_reference = payload.provider_reference
    if payload.failed_reason is not None:
        item.failed_reason = payload.failed_reason
    item.delivered_at = datetime.utcnow() if item.delivery_status == "DELIVERED" else item.delivered_at
    db.commit()
    db.refresh(item)
    return item


@router.get("/reports/daily-operations")
def export_daily_operations_report(db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    today = datetime.utcnow().date()
    trips = (
        db.query(models.Trip)
        .filter(models.Trip.operator_id == current_user.id, models.Trip.departure_time >= datetime.combine(today, datetime.min.time()), models.Trip.departure_time < datetime.combine(today + timedelta(days=1), datetime.min.time()))
        .options(joinedload(models.Trip.route), joinedload(models.Trip.bus), joinedload(models.Trip.bookings).joinedload(Booking.seats))
        .order_by(models.Trip.departure_time.asc())
        .all()
    )
    rows = []
    for trip in trips:
        booked_seats = sum(len(booking.seats) for booking in trip.bookings if booking.status not in {"CANCELLED"})
        collected_amount = sum(booking.total_fare for booking in trip.bookings if booking_has_successful_payment(booking))
        refunded_amount = sum(booking.refunded_amount or 0 for booking in trip.bookings)
        rows.append([
            trip.id,
            trip.route.name if trip.route else "",
            trip.bus.name if trip.bus else "",
            trip.departure_time.isoformat(sep=" ", timespec="minutes"),
            trip.status,
            trip.delay_mins or 0,
            booked_seats,
            collected_amount,
            refunded_amount,
            trip.ops_notes or "",
        ])
    return generate_csv_response(
        f"daily-operations-{today.isoformat()}.csv",
        ["Trip ID", "Route", "Bus", "Departure", "Status", "Delay Mins", "Booked Seats", "Collected", "Refunded", "Ops Notes"],
        rows,
    )


@router.get("/reports/cancellations-refunds")
def export_cancellations_refunds_report(db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    bookings = base_operator_bookings_query(db, current_user.id).all()
    rows = []
    for booking in bookings:
        if booking.status not in {"CANCELLED", "REFUNDED", "REFUND_INITIATED"} and not (booking.refunded_amount or 0):
            continue
        rows.append([
            booking.booking_ref,
            booking.ticket_number or booking.booking_ref,
            booking.trip.route.name if booking.trip and booking.trip.route else "",
            booking.trip.departure_time.isoformat(sep=" ", timespec="minutes") if booking.trip else "",
            booking.passengers[0].name if booking.passengers else "Passenger",
            booking.total_fare,
            booking.refunded_amount or 0,
            booking_status_display(booking),
            payment_status_display(booking),
            booking.operator_notes or "",
        ])
    return generate_csv_response(
        "cancellations-refunds-report.csv",
        ["PNR", "Ticket", "Route", "Departure", "Passenger", "Fare", "Refunded", "Booking Status", "Payment Status", "Notes"],
        rows,
    )


@router.get("/reports/route-performance")
def export_route_performance_report(db: Session = Depends(get_db), current_user: User = Depends(require_operator_or_admin)):
    performance = get_financial_performance(db, current_user)
    rows = []
    for item in performance["routes"]:
        rows.append([item.name, item.bookings, item.passengers, item.revenue, item.occupancy_percent])
    return generate_csv_response(
        "route-performance-report.csv",
        ["Route", "Bookings", "Passengers", "Revenue", "Occupancy Percent"],
        rows,
    )
