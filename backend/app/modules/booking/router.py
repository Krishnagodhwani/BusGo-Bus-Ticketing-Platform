# backend/app/modules/booking/router.py
#
# PUBLIC BOOKING ENDPOINTS
# - /search         : Find buses for any valid sub-segment of a route
# - /trip/{id}/stops: Get all stops of a trip (for UI display)
# - /trip/{id}/seats: Get seat map for a specific segment
# - /book           : Create a booking (requires auth)
# - /my-bookings    : User's booking history (requires auth)
#
# The search logic correctly handles intermediate-stop searches.

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_
from app.database import get_db
from app.modules.operator.models import Trip, Bus, Route, RouteStop, RoutePricing
from app.modules.admin.models import City, BusType
from app.modules.auth.models import User
from app.modules.auth.service import get_current_user
from app.modules.booking import schemas
from app.modules.booking.models import Booking, BookingSeat, Passenger
from app.modules.booking.seat_service import (
    count_available_seats,
    get_seat_map,
    validate_seats_available,
    generate_seat_labels_from_layout
)
from typing import List, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import aliased
import random
import string
import traceback

router = APIRouter(prefix="/booking", tags=["Public Booking & Search"])


# ============================================================
# HELPER: Generate booking reference
# ============================================================

def generate_booking_ref() -> str:
    """Generates a unique booking reference like BK-20240401-AB3X"""
    date_part = datetime.utcnow().strftime("%Y%m%d")
    random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"BK-{date_part}-{random_part}"


# ============================================================
# HELPER: Get bus capacity from BusType
# ============================================================

LAYOUT_CAPACITIES = {
    "2+2": 40,
    "2+1": 30,
    "1+1": 20,
}

def get_bus_capacity(bus_type: BusType) -> int:
    return LAYOUT_CAPACITIES.get(bus_type.layout, 40)


def serialize_booking_response(db: Session, booking: Booking) -> schemas.BookingResponse | None:
    trip = db.query(Trip).filter(Trip.id == booking.trip_id).first()
    boarding_stop = db.query(RouteStop).filter(RouteStop.id == booking.boarding_stop_id).first()
    dropping_stop = db.query(RouteStop).filter(RouteStop.id == booking.dropping_stop_id).first()
    boarding_city = db.query(City).filter(City.id == booking.boarding_city_id).first()
    dropping_city = db.query(City).filter(City.id == booking.dropping_city_id).first()

    if not trip or not boarding_stop or not dropping_stop:
        return None

    boarding_time = trip.departure_time + timedelta(minutes=boarding_stop.time_offset_mins)
    dropoff_time = trip.departure_time + timedelta(minutes=dropping_stop.time_offset_mins)
    effective_status = booking.status
    ops_status = (booking.ops_status or "").upper()
    if ops_status == "CANCELLED" and effective_status not in {"CANCELLED", "REFUNDED", "REFUND_INITIATED"}:
        effective_status = "REFUNDED" if (booking.refunded_amount or 0) > 0 else "CANCELLED"
    elif ops_status == "RESCHEDULED" and effective_status == "CONFIRMED":
        effective_status = "RESCHEDULED"
    return schemas.BookingResponse(
        id=booking.id,
        booking_ref=booking.booking_ref,
        ticket_number=booking.ticket_number or booking.booking_ref,
        trip_id=booking.trip_id,
        boarding_city=boarding_city.name if boarding_city else "Unknown",
        dropping_city=dropping_city.name if dropping_city else "Unknown",
        departure_time=boarding_time,
        arrival_time=dropoff_time,
        total_passengers=booking.total_passengers,
        total_fare=booking.total_fare,
        status=effective_status,
        ops_status=booking.ops_status,
        payment_status=booking.payment_status,
        refunded_amount=booking.refunded_amount or 0,
        booking_source=booking.booking_source,
        created_at=booking.created_at,
    )


# ============================================================
# 1. PUBLIC BUS SEARCH
# ============================================================

@router.get("/search", response_model=List[schemas.SearchResultItem])
def search_buses(
    origin_id: int = Query(..., description="Origin city ID"),
    destination_id: int = Query(..., description="Destination city ID"),
    date: str = Query(..., description="Travel date YYYY-MM-DD"),
    db: Session = Depends(get_db)
):
    """
    Search buses for ANY valid segment of a multi-stop route.

    Algorithm:
    1. Find all trips where the route has BOTH origin_id AND destination_id as stops
    2. Ensure origin stop_sequence < destination stop_sequence (correct direction)
    3. Filter trips where boarding time at origin falls on the requested date
    4. Compute real available seats using the segment-overlap formula
    5. Return only trips with seats > 0 and explicit pricing defined

    Example:
    Route: Jaipur(seq=1) → Ajmer(seq=2) → Beawar(seq=3) → Pali(seq=4) → Jodhpur(seq=5)
    Search: Beawar → Pali → returns this bus (seq 3 < seq 4 ✓)
    Search: Pali → Ajmer → does NOT return (seq 4 > seq 2 ✗)
    """
    try:
        travel_date = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    if origin_id == destination_id:
        raise HTTPException(status_code=400, detail="Origin and destination cannot be the same")

    # Aliases for the two different stop joins on the same table
    OriginStop = aliased(RouteStop)
    DestStop   = aliased(RouteStop)

    # We search within a wider window (trips can depart a day before and still
    # serve passengers at an intermediate stop on the requested date)
    day_start    = travel_date.replace(hour=0,  minute=0,  second=0)
    day_end      = travel_date.replace(hour=23, minute=59, second=59)
    window_start = day_start - timedelta(days=2)
    window_end   = day_end   + timedelta(days=1)

    try:
        results = (
            db.query(Trip, Bus, BusType, User, OriginStop, DestStop, RoutePricing)
            .join(Bus,     Trip.bus_id     == Bus.id)
            .join(BusType, Bus.bus_type_id == BusType.id)
            .join(User,    Trip.operator_id == User.id)
            # Join origin stop: must be on this route AND be the origin city
            .join(OriginStop, and_(
                OriginStop.route_id == Trip.route_id,
                OriginStop.city_id  == origin_id
            ))
            # Join destination stop: must be on this route AND be the dest city
            .join(DestStop, and_(
                DestStop.route_id == Trip.route_id,
                DestStop.city_id  == destination_id
            ))
            # Price lookup for this exact origin→destination pair
            .outerjoin(RoutePricing, and_(
                RoutePricing.route_id          == Trip.route_id,
                RoutePricing.origin_city_id    == origin_id,
                RoutePricing.destination_city_id == destination_id
            ))
            .filter(
                # THE KEY RULE: origin must come BEFORE destination on the route
                OriginStop.stop_sequence < DestStop.stop_sequence,
                # Trip must be active and scheduled
                Trip.status    == "SCHEDULED",
                Trip.is_active == True,
                # Broad date window
                Trip.departure_time >= window_start,
                Trip.departure_time <= window_end,
            )
            .all()
        )
    except Exception as e:
        print(f"❌ Search query error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Search query failed: {str(e)}")

    # Get city names for display
    origin_city = db.query(City).filter(City.id == origin_id).first()
    dest_city   = db.query(City).filter(City.id == destination_id).first()
    origin_name = origin_city.name if origin_city else "Unknown"
    dest_name   = dest_city.name   if dest_city   else "Unknown"

    search_results = []

    for trip, bus, bus_type, operator, orig_stop, dest_stop, pricing in results:
        # Calculate the actual boarding/dropping times for this segment
        boarding_time = trip.departure_time + timedelta(minutes=orig_stop.time_offset_mins)
        dropoff_time  = trip.departure_time + timedelta(minutes=dest_stop.time_offset_mins)

        # Only include if the passenger's boarding time falls on the requested date
        if not (day_start <= boarding_time <= day_end):
            continue

        # Skip if no explicit pricing is set for this segment
        if not pricing or pricing.price is None or pricing.price <= 0:
            continue

        # Calculate real seat availability using segment-overlap formula
        capacity = get_bus_capacity(bus_type)
        available = count_available_seats(
            db=db,
            trip_id=trip.id,
            boarding_seq=orig_stop.stop_sequence,
            dropping_seq=dest_stop.stop_sequence,
            total_bus_capacity=capacity
        )

        if available <= 0:
            continue

        duration = (dest_stop.time_offset_mins - orig_stop.time_offset_mins) / 60.0

        search_results.append(schemas.SearchResultItem(
            trip_id          = trip.id,
            route_id         = trip.route_id,
            operator_name    = operator.name or "Unknown Operator",
            bus_name         = bus.name,
            bus_reg_number   = bus.reg_number,
            bus_type_name    = bus_type.name,
            bus_layout       = bus_type.layout,
            total_capacity   = capacity,
            has_ac           = bus_type.has_ac,
            has_sleeper      = bus_type.has_sleeper,
            origin_city      = origin_name,
            destination_city = dest_name,
            boarding_stop_id = orig_stop.id,
            dropping_stop_id = dest_stop.id,
            boarding_seq     = orig_stop.stop_sequence,
            dropping_seq     = dest_stop.stop_sequence,
            departure_time   = boarding_time,
            arrival_time     = dropoff_time,
            duration_hours   = round(duration, 1),
            base_price       = pricing.price,
            available_seats  = available,
        ))

    return search_results


# ============================================================
# 2. GET ALL STOPS OF A TRIP (for route display on detail page)
# ============================================================

@router.get("/trip/{trip_id}/stops", response_model=List[schemas.StopInfo])
def get_trip_stops(trip_id: int, db: Session = Depends(get_db)):
    """
    Returns all stops of a trip with computed arrival times.
    Used on the bus detail page to show the full route timeline.
    """
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    stops = (
        db.query(RouteStop, City)
        .join(City, RouteStop.city_id == City.id)
        .filter(RouteStop.route_id == trip.route_id)
        .order_by(RouteStop.stop_sequence)
        .all()
    )

    result = []
    for stop, city in stops:
        arrival_time = trip.departure_time + timedelta(minutes=stop.time_offset_mins)
        result.append(schemas.StopInfo(
            stop_id          = stop.id,
            city_id          = city.id,
            city_name        = city.name,
            stop_sequence    = stop.stop_sequence,
            time_offset_mins = stop.time_offset_mins,
            arrival_time     = arrival_time,
        ))
    return result


# ============================================================
# 3. GET SEAT MAP FOR A SPECIFIC SEGMENT
# ============================================================

@router.get("/trip/{trip_id}/seats", response_model=schemas.SeatMapResponse)
def get_seat_map_for_segment(
    trip_id: int,
    boarding_stop_id: int = Query(...),
    dropping_stop_id: int = Query(...),
    db: Session = Depends(get_db)
):
    """
    Returns the seat availability map for a specific trip and segment.
    """
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    boarding_stop = db.query(RouteStop).filter(RouteStop.id == boarding_stop_id).first()
    dropping_stop = db.query(RouteStop).filter(RouteStop.id == dropping_stop_id).first()

    if not boarding_stop or not dropping_stop:
        raise HTTPException(status_code=404, detail="Stop not found")

    if boarding_stop.stop_sequence >= dropping_stop.stop_sequence:
        raise HTTPException(status_code=400, detail="Boarding stop must come before dropping stop")

    # Get bus capacity and layout
    bus      = db.query(Bus).filter(Bus.id == trip.bus_id).first()
    bus_type = db.query(BusType).filter(BusType.id == bus.bus_type_id).first()
    capacity = get_bus_capacity(bus_type)

    # Generate seat labels from bus layout
    all_labels = generate_seat_labels_from_layout(bus_type.layout, capacity)

    # Get seat map with occupied/available status for this segment
    seat_map = get_seat_map(
        db           = db,
        trip_id      = trip_id,
        boarding_seq = boarding_stop.stop_sequence,
        dropping_seq = dropping_stop.stop_sequence,
        all_seat_labels = all_labels
    )

    available_count = sum(1 for s in seat_map if s["status"] == "available")

    return schemas.SeatMapResponse(
        trip_id          = trip_id,
        boarding_stop_id = boarding_stop_id,
        dropping_stop_id = dropping_stop_id,
        boarding_seq     = boarding_stop.stop_sequence,
        dropping_seq     = dropping_stop.stop_sequence,
        total_capacity   = capacity,
        available_count  = available_count,
        seats            = [schemas.SeatInfo(**s) for s in seat_map]
    )


# ============================================================
# 4. CREATE BOOKING (requires authentication)
# ============================================================

@router.post("/book", response_model=schemas.BookingResponse)
def create_booking(
    booking_data: schemas.BookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Creates a booking for a specific trip and segment.
    """
    # 1. Validate trip
    trip = db.query(Trip).filter(
        Trip.id == booking_data.trip_id,
        Trip.status == "SCHEDULED",
        Trip.is_active == True
    ).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found or not available")

    # 2. Validate stops
    boarding_stop = db.query(RouteStop).filter(RouteStop.id == booking_data.boarding_stop_id).first()
    dropping_stop = db.query(RouteStop).filter(RouteStop.id == booking_data.dropping_stop_id).first()

    if not boarding_stop or not dropping_stop:
        raise HTTPException(status_code=404, detail="Invalid stop IDs")

    if boarding_stop.route_id != trip.route_id or dropping_stop.route_id != trip.route_id:
        raise HTTPException(status_code=400, detail="Stops do not belong to this trip's route")

    if boarding_stop.stop_sequence >= dropping_stop.stop_sequence:
        raise HTTPException(status_code=400, detail="Boarding stop must come before dropping stop")

    # 3. Validate seats are available (guard against race conditions)
    conflicts = validate_seats_available(
        db           = db,
        trip_id      = booking_data.trip_id,
        boarding_seq = boarding_stop.stop_sequence,
        dropping_seq = dropping_stop.stop_sequence,
        requested_seats = booking_data.seats
    )
    if conflicts:
        raise HTTPException(
            status_code=409,
            detail=f"Seats {conflicts} are no longer available. Please reselect."
        )

    # 4. Validate passenger count matches seats
    if len(booking_data.passengers) != len(booking_data.seats):
        raise HTTPException(status_code=400, detail="Passenger count must match seat count")

    # 5. Create booking
    booking_ref = generate_booking_ref()

    booking = Booking(
        booking_ref      = booking_ref,
        user_id          = current_user.id,
        trip_id          = booking_data.trip_id,
        boarding_stop_id = booking_data.boarding_stop_id,
        dropping_stop_id = booking_data.dropping_stop_id,
        boarding_city_id = boarding_stop.city_id,
        dropping_city_id = dropping_stop.city_id,
        total_passengers = len(booking_data.seats),
        total_fare       = booking_data.total_fare,
        ticket_number    = booking_ref,
        booking_source   = "WEB",
        ops_status       = "CONFIRMED",
        status           = "CONFIRMED",
        payment_status   = "SUCCESS",
    )
    db.add(booking)
    db.flush()

    # 6. Create seat records
    for seat_label in booking_data.seats:
        seat = BookingSeat(
            booking_id   = booking.id,
            trip_id      = booking_data.trip_id,
            seat_label   = seat_label,
            boarding_seq = boarding_stop.stop_sequence,
            dropping_seq = dropping_stop.stop_sequence,
            status       = "CONFIRMED",
        )
        db.add(seat)

    # 7. Create passenger records
    for pax in booking_data.passengers:
        passenger = Passenger(
            booking_id = booking.id,
            seat_label = pax.seat_label,
            name       = pax.name,
            age        = pax.age,
            gender     = pax.gender,
        )
        db.add(passenger)

    db.commit()
    db.refresh(booking)

    return serialize_booking_response(db, booking)


# ============================================================
# 5. PUBLIC CITIES LIST
# ============================================================

@router.get("/cities")
def get_public_cities(db: Session = Depends(get_db)):
    """Public endpoint to fetch all active cities for search dropdowns"""
    try:
        cities = (
            db.query(City)
            .filter(City.is_active == True)
            .order_by(City.name)
            .all()
        )
        return [{"id": c.id, "name": c.name, "state": c.state} for c in cities]
    except Exception as e:
        print(f"❌ Error fetching cities: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load cities: {str(e)}")


# ============================================================
# 6. MY BOOKINGS (authenticated)
# ============================================================

@router.get("/my-bookings", response_model=List[schemas.BookingResponse])
def get_my_bookings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns all bookings for the logged-in user"""
    bookings = (
        db.query(Booking)
        .filter(Booking.user_id == current_user.id)
        .order_by(Booking.created_at.desc())
        .all()
    )

    results = []
    for booking in bookings:
        serialized = serialize_booking_response(db, booking)
        if serialized:
            results.append(serialized)

    return results


@router.post("/my-bookings/{booking_id}/cancel", response_model=schemas.BookingResponse)
def cancel_my_booking(
    booking_id: int,
    payload: schemas.BookingCancelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.user_id == current_user.id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    trip = db.query(Trip).filter(Trip.id == booking.trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.departure_time <= datetime.utcnow():
        raise HTTPException(status_code=409, detail="Past or running trips cannot be cancelled online")
    if booking.status in {"CANCELLED", "REFUNDED"}:
        serialized = serialize_booking_response(db, booking)
        if serialized:
            return serialized
        raise HTTPException(status_code=500, detail="Booking serialization failed")
    refund_value = booking.total_fare if payload.refund_amount is None else max(0, min(payload.refund_amount, booking.total_fare))
    booking.status = "REFUNDED" if refund_value >= booking.total_fare and booking.payment_status == "SUCCESS" else "CANCELLED"
    booking.ops_status = "CANCELLED"
    booking.refunded_amount = refund_value
    if payload.note:
        booking.operator_notes = (booking.operator_notes or "") + f"\nPassenger cancellation: {payload.note}"
    for seat in booking.seats:
        seat.status = "CANCELLED"
    db.commit()
    db.refresh(booking)
    serialized = serialize_booking_response(db, booking)
    if serialized:
        return serialized
    raise HTTPException(status_code=500, detail="Booking serialization failed")


@router.get("/my-bookings/{booking_id}/reschedule-options", response_model=List[schemas.BookingRescheduleOption])
def get_my_booking_reschedule_options(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.user_id == current_user.id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    current_trip = db.query(Trip).filter(Trip.id == booking.trip_id).first()
    if not current_trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    options = []
    future_trips = (
        db.query(Trip)
        .join(Route, Trip.route_id == Route.id)
        .join(Bus, Trip.bus_id == Bus.id)
        .join(BusType, Bus.bus_type_id == BusType.id)
        .filter(
            Trip.route_id == current_trip.route_id,
            Trip.id != current_trip.id,
            Trip.departure_time >= datetime.utcnow(),
            Trip.status == "SCHEDULED",
            Trip.is_active == True,
        )
        .order_by(Trip.departure_time.asc())
        .limit(10)
        .all()
    )
    for trip in future_trips:
        boarding_stop = db.query(RouteStop).filter(RouteStop.route_id == trip.route_id, RouteStop.city_id == booking.boarding_city_id).first()
        dropping_stop = db.query(RouteStop).filter(RouteStop.route_id == trip.route_id, RouteStop.city_id == booking.dropping_city_id).first()
        if not boarding_stop or not dropping_stop or boarding_stop.stop_sequence >= dropping_stop.stop_sequence:
            continue
        capacity = get_bus_capacity(db.query(BusType).filter(BusType.id == trip.bus.bus_type_id).first())
        available = count_available_seats(db, trip.id, boarding_stop.stop_sequence, dropping_stop.stop_sequence, capacity)
        if available < booking.total_passengers:
            continue
        options.append(
            schemas.BookingRescheduleOption(
                trip_id=trip.id,
                departure_time=trip.departure_time + timedelta(minutes=boarding_stop.time_offset_mins),
                arrival_time=trip.departure_time + timedelta(minutes=dropping_stop.time_offset_mins),
                available_seats=available,
                bus_name=trip.bus.name,
                route_name=trip.route.name,
            )
        )
    return options


@router.post("/my-bookings/{booking_id}/reschedule", response_model=schemas.BookingResponse)
def reschedule_my_booking(
    booking_id: int,
    payload: schemas.BookingRescheduleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.user_id == current_user.id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    new_trip = db.query(Trip).filter(Trip.id == payload.new_trip_id, Trip.is_active == True).first()
    if not new_trip:
        raise HTTPException(status_code=404, detail="New trip not found")
    boarding_stop = db.query(RouteStop).filter(RouteStop.route_id == new_trip.route_id, RouteStop.city_id == booking.boarding_city_id).first()
    dropping_stop = db.query(RouteStop).filter(RouteStop.route_id == new_trip.route_id, RouteStop.city_id == booking.dropping_city_id).first()
    if not boarding_stop or not dropping_stop or boarding_stop.stop_sequence >= dropping_stop.stop_sequence:
        raise HTTPException(status_code=400, detail="Selected trip does not support the same route segment")
    if len(payload.seat_labels) != booking.total_passengers:
        raise HTTPException(status_code=400, detail="Seat count must match passenger count")
    conflicts = validate_seats_available(db, new_trip.id, boarding_stop.stop_sequence, dropping_stop.stop_sequence, payload.seat_labels)
    if conflicts:
        raise HTTPException(status_code=409, detail=f"Seats {conflicts} are no longer available")
    booking.trip_id = new_trip.id
    booking.boarding_stop_id = boarding_stop.id
    booking.dropping_stop_id = dropping_stop.id
    booking.ops_status = "RESCHEDULED"
    booking.status = "CONFIRMED"
    for seat_record, new_label, passenger in zip(sorted(booking.seats, key=lambda item: item.id), payload.seat_labels, sorted(booking.passengers, key=lambda item: item.id)):
        seat_record.trip_id = new_trip.id
        seat_record.seat_label = new_label
        seat_record.boarding_seq = boarding_stop.stop_sequence
        seat_record.dropping_seq = dropping_stop.stop_sequence
        seat_record.status = "CONFIRMED"
        passenger.seat_label = new_label
    db.commit()
    db.refresh(booking)
    serialized = serialize_booking_response(db, booking)
    if serialized:
        return serialized
    raise HTTPException(status_code=500, detail="Booking serialization failed")
