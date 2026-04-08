from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class CityCreate(BaseModel):
    name: str = Field(..., max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    is_active: bool = True


class CityResponse(BaseModel):
    id: int
    name: str
    state: Optional[str]
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BusTypeCreate(BaseModel):
    name: str = Field(..., max_length=100)
    layout: str = Field(..., max_length=50)
    has_ac: bool = True
    has_sleeper: bool = False
    is_active: bool = True


class BusTypeResponse(BaseModel):
    id: int
    name: str
    layout: str
    has_ac: bool
    has_sleeper: bool
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AnalyticsResponse(BaseModel):
    total_users: int
    total_operators: int
    total_bookings: int
    total_revenue: float
    total_cancellations: int
    total_cities: int
    total_bus_types: int
    pending_refunds: int
    active_trips: int


class PlatformSettingItem(BaseModel):
    key: str
    label: str
    value: str
    category: str
    description: Optional[str] = None


class PlatformSettingsResponse(BaseModel):
    settings: List[PlatformSettingItem]


class PlatformSettingUpdate(BaseModel):
    value: str


class CancellationPolicyResponse(BaseModel):
    id: int
    policy_name: str
    cutoff_hours: int
    refund_percent: float
    processing_fee: float
    applies_after_departure: bool
    description: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True


class CancellationPolicyUpdate(BaseModel):
    policy_name: str = Field(..., max_length=120)
    cutoff_hours: int = Field(..., ge=0, le=240)
    refund_percent: float = Field(..., ge=0, le=100)
    processing_fee: float = Field(..., ge=0)
    applies_after_departure: bool = False
    description: Optional[str] = None


class RevenueConfigResponse(BaseModel):
    id: int
    commission_percent: float
    gateway_fee_percent: float
    gst_percent: float
    flat_platform_fee: float
    refund_processing_fee: float
    is_active: bool

    class Config:
        from_attributes = True


class RevenueConfigUpdate(BaseModel):
    commission_percent: float = Field(..., ge=0, le=100)
    gateway_fee_percent: float = Field(..., ge=0, le=100)
    gst_percent: float = Field(..., ge=0, le=100)
    flat_platform_fee: float = Field(..., ge=0)
    refund_processing_fee: float = Field(..., ge=0)


class AdminPassengerResponse(BaseModel):
    id: int
    name: Optional[str] = None
    phone: str
    email: Optional[str] = None
    is_active: bool
    total_bookings: int
    total_spend: float
    created_at: Optional[datetime] = None


class AdminBookingResponse(BaseModel):
    id: int
    booking_ref: str
    ticket_number: Optional[str] = None
    passenger_name: Optional[str] = None
    passenger_phone: Optional[str] = None
    operator_name: Optional[str] = None
    origin_city: Optional[str] = None
    destination_city: Optional[str] = None
    departure_time: Optional[datetime] = None
    booking_status: str
    payment_status: str
    ops_status: str
    total_passengers: int
    total_fare: float
    refunded_amount: float
    issue_flag: Optional[str] = None
    created_at: Optional[datetime] = None


class RefundRequest(BaseModel):
    refund_amount: float = Field(..., ge=0)
    reason: Optional[str] = None
    mark_as_refunded: bool = True


class RefundAuditResponse(BaseModel):
    id: int
    booking_id: int
    booking_ref: str
    operator_name: Optional[str] = None
    passenger_name: Optional[str] = None
    refund_amount: float
    reason: Optional[str] = None
    refund_mode: str
    processed_by_name: Optional[str] = None
    created_at: datetime


class PaymentLedgerEntry(BaseModel):
    booking_id: int
    booking_ref: str
    operator_name: Optional[str] = None
    total_fare: float
    refunded_amount: float
    commission_amount: float
    gateway_fee_amount: float
    platform_fee_amount: float
    gst_amount: float
    operator_payout: float
    booking_status: str
    payment_status: str
    created_at: Optional[datetime] = None


class OperatorAccountUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = Field(None, max_length=150)
    operator_access_level: str = Field(..., pattern="^(OWNER|MANAGER|BOOKING_STAFF|GROUND_STAFF)$")
    is_active: bool


class AdminAuditLogResponse(BaseModel):
    id: int
    actor_name: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    status: str
    details: Optional[str] = None
    created_at: datetime


class OnboardingRequestCreate(BaseModel):
    company_name: str = Field(..., max_length=150)
    contact_name: str = Field(..., max_length=120)
    phone: str = Field(..., max_length=20)
    email: Optional[str] = Field(None, max_length=150)
    requested_access_level: str = Field(default="OWNER", pattern="^(OWNER|MANAGER|BOOKING_STAFF|GROUND_STAFF)$")
    notes: Optional[str] = None


class OnboardingRequestReview(BaseModel):
    approval_status: str = Field(..., pattern="^(APPROVED|REJECTED)$")
    notes: Optional[str] = None
    create_operator_account: bool = True


class OperatorDocumentCreate(BaseModel):
    onboarding_request_id: Optional[int] = None
    operator_id: Optional[int] = None
    doc_type: str = Field(..., max_length=60)
    document_number: Optional[str] = Field(None, max_length=100)
    file_name: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None


class OperatorDocumentReview(BaseModel):
    verification_status: str = Field(..., pattern="^(VERIFIED|REJECTED|PENDING)$")
    notes: Optional[str] = None


class OperatorDocumentResponse(BaseModel):
    id: int
    onboarding_request_id: Optional[int] = None
    operator_id: Optional[int] = None
    doc_type: str
    document_number: Optional[str] = None
    file_name: Optional[str] = None
    verification_status: str
    notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OnboardingRequestResponse(BaseModel):
    id: int
    company_name: str
    contact_name: str
    phone: str
    email: Optional[str] = None
    requested_access_level: str
    approval_status: str
    document_status: str
    notes: Optional[str] = None
    created_operator_id: Optional[int] = None
    created_at: datetime
    documents: List[OperatorDocumentResponse] = []

    class Config:
        from_attributes = True


class InventoryRuleResponse(BaseModel):
    id: int
    rule_name: str
    seat_hold_minutes: int
    default_capacity_limit: int
    allow_manual_override: bool
    allow_overbooking: bool
    max_blocked_seats: int
    is_active: bool

    class Config:
        from_attributes = True


class InventoryRuleUpdate(BaseModel):
    rule_name: str
    seat_hold_minutes: int = Field(..., ge=1, le=240)
    default_capacity_limit: int = Field(..., ge=1, le=100)
    allow_manual_override: bool
    allow_overbooking: bool
    max_blocked_seats: int = Field(..., ge=0, le=20)


class FareTemplateResponse(BaseModel):
    id: int
    name: str
    base_fare: float
    tax_percent: float
    service_fee: float
    surcharge: float
    cancellation_fee: float
    is_active: bool

    class Config:
        from_attributes = True


class FareTemplateCreate(BaseModel):
    name: str = Field(..., max_length=120)
    base_fare: float = Field(..., ge=0)
    tax_percent: float = Field(..., ge=0, le=100)
    service_fee: float = Field(..., ge=0)
    surcharge: float = Field(..., ge=0)
    cancellation_fee: float = Field(..., ge=0)
    is_active: bool = True


class SupportTicketCreate(BaseModel):
    booking_id: Optional[int] = None
    operator_id: Optional[int] = None
    passenger_id: Optional[int] = None
    category: str = Field(default="BOOKING", max_length=60)
    priority: str = Field(default="MEDIUM", pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$")
    subject: str = Field(..., max_length=150)
    description: str


class SupportTicketUpdate(BaseModel):
    status: str = Field(..., pattern="^(OPEN|IN_PROGRESS|RESOLVED|CLOSED)$")
    resolution_notes: Optional[str] = None


class SupportTicketResponse(BaseModel):
    id: int
    booking_id: Optional[int] = None
    operator_id: Optional[int] = None
    passenger_id: Optional[int] = None
    category: str
    priority: str
    status: str
    subject: str
    description: str
    operator_name: Optional[str] = None
    passenger_name: Optional[str] = None
    booking_ref: Optional[str] = None
    resolution_notes: Optional[str] = None
    created_at: datetime


class AdminAlertResponse(BaseModel):
    type: str
    title: str
    message: str
    severity: str
    count: int


class OperatorCommercialProfileResponse(BaseModel):
    operator_id: int
    company_name: str
    legal_name: Optional[str] = None
    support_phone: Optional[str] = None
    support_email: Optional[str] = None
    service_areas: Optional[str] = None
    address: Optional[str] = None
    contract_status: str
    contract_notes: Optional[str] = None
    verification_status: str


class OperatorCommercialProfileUpdate(BaseModel):
    company_name: str = Field(..., max_length=150)
    legal_name: Optional[str] = Field(None, max_length=150)
    support_phone: Optional[str] = Field(None, max_length=20)
    support_email: Optional[str] = Field(None, max_length=150)
    service_areas: Optional[str] = None
    address: Optional[str] = None
    contract_status: str = Field(..., pattern="^(PENDING|ACTIVE|ON_HOLD|EXPIRED)$")
    contract_notes: Optional[str] = None
    verification_status: str = Field(..., pattern="^(PENDING|VERIFIED|REJECTED)$")
