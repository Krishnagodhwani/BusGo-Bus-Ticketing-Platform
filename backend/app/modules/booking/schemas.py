# backend/app/modules/booking/schemas.py

from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List


# ==================== SEARCH SCHEMAS ====================

class SearchQuery(BaseModel):
    origin_id: int
    destination_id: int
    date: str  # YYYY-MM-DD


class SearchResultItem(BaseModel):
    trip_id: int
    route_id: int
    operator_name: str
    bus_name: str
    bus_reg_number: str
    bus_type_name: str
    bus_layout: str
    total_capacity: int
    has_ac: bool
    has_sleeper: bool
    origin_city: str
    destination_city: str
    # Boarding/dropping stop info for the searched segment
    boarding_stop_id: int
    dropping_stop_id: int
    boarding_seq: int
    dropping_seq: int
    departure_time: datetime   # Actual boarding time at origin stop
    arrival_time: datetime     # Actual drop time at destination stop
    duration_hours: float
    base_price: float
    available_seats: int

    model_config = ConfigDict(from_attributes=True)


# ==================== SEAT MAP SCHEMAS ====================

class SeatInfo(BaseModel):
    label: str
    status: str  # "available" | "occupied"


class SeatMapResponse(BaseModel):
    trip_id: int
    boarding_stop_id: int
    dropping_stop_id: int
    boarding_seq: int
    dropping_seq: int
    total_capacity: int
    available_count: int
    seats: List[SeatInfo]


# ==================== BOOKING CREATION SCHEMAS ====================

class PassengerCreate(BaseModel):
    seat_label: str
    name: str
    age: int
    gender: str  # "M" | "F" | "OTHER"


class BookingCreate(BaseModel):
    trip_id: int
    boarding_stop_id: int
    dropping_stop_id: int
    seats: List[str]          # ["1A", "2B"]
    passengers: List[PassengerCreate]
    total_fare: float


class BookingResponse(BaseModel):
    id: int
    booking_ref: str
    ticket_number: Optional[str] = None
    trip_id: int
    boarding_city: str
    dropping_city: str
    departure_time: datetime
    arrival_time: datetime
    total_passengers: int
    total_fare: float
    status: str
    ops_status: Optional[str] = None
    payment_status: str
    refunded_amount: float = 0
    booking_source: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==================== TRIP STOP INFO (for booking detail page) ====================

class StopInfo(BaseModel):
    stop_id: int
    city_id: int
    city_name: str
    stop_sequence: int
    time_offset_mins: int
    arrival_time: datetime   # Computed from trip departure_time + offset


class BookingCancelRequest(BaseModel):
    refund_amount: Optional[float] = None
    note: Optional[str] = None


class BookingRescheduleOption(BaseModel):
    trip_id: int
    departure_time: datetime
    arrival_time: datetime
    available_seats: int
    bus_name: str
    route_name: str


class BookingRescheduleRequest(BaseModel):
    new_trip_id: int
    seat_labels: List[str]
