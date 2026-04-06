from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class BusBase(BaseModel):
    bus_type_id: int
    name: str
    reg_number: str
    internal_code: Optional[str] = None
    operational_status: str = "ACTIVE"
    amenities: list[str] = []
    notes: Optional[str] = None
    is_active: bool = True


class BusCreate(BusBase):
    pass


class BusUpdate(BaseModel):
    bus_type_id: Optional[int] = None
    name: Optional[str] = None
    reg_number: Optional[str] = None
    internal_code: Optional[str] = None
    operational_status: Optional[str] = None
    amenities: Optional[list[str]] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class BusStatusUpdate(BaseModel):
    operational_status: str
    is_active: Optional[bool] = None


class BusResponse(BaseModel):
    id: int
    operator_id: int
    bus_type_id: int
    name: str
    reg_number: str
    internal_code: Optional[str] = None
    operational_status: str
    status_tag: str
    amenities: list[str] = []
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime
    bus_type_name: Optional[str] = None
    bus_layout: Optional[str] = None
    has_ac: bool = False
    has_sleeper: bool = False
    assigned_trip_count: int = 0
    upcoming_trip_count: int = 0
    next_trip_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class RouteStopCreate(BaseModel):
    city_id: int
    stop_sequence: int
    time_offset_mins: int
    allows_boarding: bool = True
    allows_dropping: bool = True


class RouteStopResponse(RouteStopCreate):
    id: int
    route_id: int
    city_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class RoutePricingCreate(BaseModel):
    origin_city_id: int
    destination_city_id: int
    price: float


class RoutePricingResponse(RoutePricingCreate):
    id: int
    route_id: int
    origin_city_name: Optional[str] = None
    destination_city_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class RouteCreate(BaseModel):
    name: str
    route_code: Optional[str] = None
    estimated_distance_km: Optional[float] = None
    estimated_duration_mins: Optional[int] = None
    is_active: bool = True
    stops: list[RouteStopCreate]
    pricing: list[RoutePricingCreate]


class RouteUpdate(BaseModel):
    name: Optional[str] = None
    route_code: Optional[str] = None
    estimated_distance_km: Optional[float] = None
    estimated_duration_mins: Optional[int] = None
    is_active: Optional[bool] = None
    stops: Optional[list[RouteStopCreate]] = None
    pricing: Optional[list[RoutePricingCreate]] = None


class RouteResponse(BaseModel):
    id: int
    operator_id: int
    name: str
    route_code: Optional[str] = None
    estimated_distance_km: Optional[float] = None
    estimated_duration_mins: Optional[int] = None
    is_active: bool
    created_at: datetime
    stop_count: int = 0
    trip_count: int = 0
    upcoming_trip_count: int = 0
    stops: list[RouteStopResponse] = []
    pricing: list[RoutePricingResponse] = []

    model_config = ConfigDict(from_attributes=True)


class TripBase(BaseModel):
    bus_id: int
    route_id: int
    departure_time: datetime


class TripCreate(TripBase):
    status: str = "SCHEDULED"


class TripUpdate(BaseModel):
    bus_id: Optional[int] = None
    route_id: Optional[int] = None
    departure_time: Optional[datetime] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None


class TripStatusUpdate(BaseModel):
    status: str
    is_active: Optional[bool] = None
    delay_mins: Optional[int] = None
    ops_notes: Optional[str] = None


class TripCloneRequest(BaseModel):
    days_offset: int = 1


class RecurringTripCreate(BaseModel):
    bus_id: int
    route_id: int
    schedule_type: str = Field(default="ONE_TIME")
    departure_time: Optional[datetime] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    departure_clock: Optional[time] = None
    weekdays: list[int] = []
    every_x_days: int = 1
    status: str = "SCHEDULED"


class TripResponse(BaseModel):
    id: int
    operator_id: int
    bus_id: int
    route_id: int
    departure_time: datetime
    arrival_time: Optional[datetime] = None
    status: str
    is_active: bool
    created_at: datetime
    series_code: Optional[str] = None
    recurrence_label: Optional[str] = None
    delay_mins: int = 0
    ops_notes: Optional[str] = None
    actual_start_time: Optional[datetime] = None
    actual_end_time: Optional[datetime] = None
    bus_name: Optional[str] = None
    bus_reg_number: Optional[str] = None
    bus_status_tag: Optional[str] = None
    route_name: Optional[str] = None
    route_code: Optional[str] = None
    total_stops: int = 0

    model_config = ConfigDict(from_attributes=True)


class RecurringTripResponse(BaseModel):
    series_code: Optional[str] = None
    created_count: int
    trips: list[TripResponse]


class OperatorDashboardSummary(BaseModel):
    total_buses: int
    active_buses: int
    maintenance_buses: int
    total_routes: int
    active_routes: int
    upcoming_trips: int
    recurring_series: int
    todays_departures: int
    delayed_trips: int
    pending_payment_bookings: int
    open_issue_bookings: int
    ready_to_schedule: bool
    next_trip: Optional[TripResponse] = None


class BookingOperatorUpdate(BaseModel):
    ops_status: Optional[str] = None
    operator_notes: Optional[str] = None
    issue_flag: Optional[str] = None
    refunded_amount: Optional[float] = None


class OperatorPassengerResponse(BaseModel):
    id: int
    name: str
    age: int
    gender: str
    seat_label: str

    model_config = ConfigDict(from_attributes=True)


class OperatorBookingListItem(BaseModel):
    id: int
    booking_ref: str
    ticket_number: Optional[str] = None
    trip_id: int
    trip_departure_time: datetime
    booking_time: datetime
    passenger_name: str
    passenger_phone: Optional[str] = None
    route_name: Optional[str] = None
    route_code: Optional[str] = None
    bus_name: Optional[str] = None
    bus_reg_number: Optional[str] = None
    boarding_point: Optional[str] = None
    dropping_point: Optional[str] = None
    seat_numbers: list[str] = []
    total_passengers: int
    total_fare: float
    booking_status: str
    ops_status: str
    payment_status: str
    booking_source: str
    issue_flag: Optional[str] = None


class OperatorBookingDetail(OperatorBookingListItem):
    arrival_time: Optional[datetime] = None
    route_stops: list[RouteStopResponse] = []
    passengers: list[OperatorPassengerResponse] = []
    fare_breakup: dict = {}
    refunded_amount: float = 0
    operator_notes: Optional[str] = None
    last_ticket_sent_at: Optional[datetime] = None
    last_ticket_sent_channel: Optional[str] = None
    user_id: Optional[int] = None
    user_name: Optional[str] = None


class BookingManifestPassenger(BaseModel):
    booking_id: int
    booking_ref: str
    passenger_name: str
    passenger_phone: Optional[str] = None
    seat_label: str
    boarding_point: str
    dropping_point: str
    payment_status: str
    booking_status: str
    ops_status: str
    issue_flag: Optional[str] = None


class BookingManifestResponse(BaseModel):
    trip: TripResponse
    route_name: Optional[str] = None
    bus_name: Optional[str] = None
    total_capacity: int
    booked_seats: int
    available_seats: int
    total_passengers: int
    collected_amount: float
    refunded_amount: float
    occupancy_percent: float
    boarded_count: int
    pending_count: int
    no_show_count: int
    boarding_groups: dict[str, int]
    dropping_groups: dict[str, int]
    passengers: list[BookingManifestPassenger]


class BookingSummaryResponse(BaseModel):
    total_bookings: int
    confirmed_bookings: int
    cancelled_bookings: int
    refunded_bookings: int
    pending_payment_bookings: int
    total_revenue: float
    refunded_amount: float
    todays_departures: int


class FinancialSummaryResponse(BaseModel):
    gross_collections: float
    net_collections: float
    today_earnings: float
    week_earnings: float
    month_earnings: float
    refunded_amount: float
    cancelled_loss: float
    average_ticket_value: float
    occupancy_percent: float
    paid_bookings: int
    pending_settlement_amount: float
    platform_commission_amount: float
    tax_amount: float
    operator_payout_amount: float
    online_collections: float
    manual_collections: float


class FinancialTransactionItem(BaseModel):
    booking_id: int
    booking_ref: str
    ticket_number: Optional[str] = None
    transaction_date: datetime
    passenger_name: str
    passenger_phone: Optional[str] = None
    route_name: Optional[str] = None
    trip_id: int
    bus_name: Optional[str] = None
    amount_collected: float
    amount_refunded: float
    commission_amount: float
    tax_amount: float
    net_amount: float
    payment_status: str
    booking_status: str
    booking_source: str
    payment_mode: str
    settlement_status: str


class FinancialTrendPoint(BaseModel):
    label: str
    revenue: float
    bookings: int


class PerformanceBreakdownItem(BaseModel):
    name: str
    bookings: int
    revenue: float
    passengers: int
    occupancy_percent: float


class BookingCancelRequest(BaseModel):
    refund_amount: Optional[float] = None
    note: Optional[str] = None


class BookingRescheduleOption(BaseModel):
    trip_id: int
    departure_time: datetime
    arrival_time: Optional[datetime] = None
    route_name: Optional[str] = None
    bus_name: Optional[str] = None
    available_seats: int


class BookingRescheduleRequest(BaseModel):
    new_trip_id: int
    seat_labels: list[str]
    note: Optional[str] = None


class TripOperationsSummary(BaseModel):
    trip: TripResponse
    booked_passengers: int
    booked_seats: int
    available_seats: int
    occupancy_percent: float
    boarding_pending: int
    no_show_count: int
    collected_amount: float
    refunded_amount: float


class OperatorAlertItem(BaseModel):
    type: str
    severity: str
    title: str
    message: str
    href: Optional[str] = None
    count: Optional[int] = None


class TicketSendResponse(BaseModel):
    booking_id: int
    booking_ref: str
    channel: str
    sent_at: datetime
    message: str


class OperatorNotificationItem(BaseModel):
    id: int
    category: str
    title: str
    message: str
    severity: str
    channel: Optional[str] = None
    recipient: Optional[str] = None
    delivery_status: Optional[str] = None
    provider_name: Optional[str] = None
    provider_reference: Optional[str] = None
    delivered_at: Optional[datetime] = None
    failed_reason: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    href: Optional[str] = None
    is_read: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationReadResponse(BaseModel):
    updated_count: int
    message: str


class OperatorNotificationStatusUpdate(BaseModel):
    delivery_status: str
    provider_name: Optional[str] = None
    provider_reference: Optional[str] = None
    failed_reason: Optional[str] = None


class NotificationDeliverySummary(BaseModel):
    total_notifications: int
    unread_notifications: int
    prepared_notifications: int
    delivered_notifications: int
    failed_notifications: int
