# backend/app/modules/booking/seat_service.py
#
# ============================================================
# SEAT AVAILABILITY SERVICE — The Core Algorithm
# ============================================================
#
# PROBLEM WE ARE SOLVING:
# A bus runs Jaipur(seq=1) → Ajmer(seq=2) → Beawar(seq=3) → Pali(seq=4) → Jodhpur(seq=5)
# The bus has 40 seats.
#
# Person A books seat 5A from Jaipur→Ajmer  (seq 1 to 2)
# Person B wants to book seat 5A from Beawar→Jodhpur (seq 3 to 5)
# → This is VALID! Seat 5A is free from Beawar onward.
#
# Person C wants to book seat 5A from Ajmer→Pali (seq 2 to 4)
# → This CONFLICTS with Person A (Ajmer is Person A's drop point).
# → But wait — seq 2 is Person A's drop. The interval is [1, 2).
#   Person A occupies seat UNTIL they get off at Ajmer.
#   Person C boards AT Ajmer, so they are fine!
#
# INTERVAL OVERLAP FORMULA:
# Two segments [a_board, a_drop] and [b_board, b_drop] OVERLAP if:
#     a_board < b_drop  AND  b_board < a_drop
# (strict inequalities because the seat is free exactly at the drop point)

from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.modules.booking.models import BookingSeat, Booking
from app.modules.operator.models import RouteStop, Trip
from typing import List


def get_occupied_seats_for_segment(
    db: Session,
    trip_id: int,
    boarding_seq: int,
    dropping_seq: int
) -> List[str]:
    """
    Returns a list of seat labels that are OCCUPIED (conflict) 
    for the given trip and journey segment [boarding_seq → dropping_seq].

    Uses the interval overlap formula:
        existing.boarding_seq < dropping_seq   (existing boards before new passenger drops)
        AND
        existing.dropping_seq > boarding_seq   (existing drops after new passenger boards)

    Only counts LOCKED or CONFIRMED seats (not cancelled).
    """
    occupied = (
        db.query(BookingSeat.seat_label)
        .join(Booking, BookingSeat.booking_id == Booking.id)
        .filter(
            BookingSeat.trip_id == trip_id,
            BookingSeat.status.in_(["LOCKED", "CONFIRMED"]),
            # Interval overlap: existing segment overlaps with requested segment
            BookingSeat.boarding_seq < dropping_seq,
            BookingSeat.dropping_seq > boarding_seq,
        )
        .all()
    )
    return [row.seat_label for row in occupied]


def count_available_seats(
    db: Session,
    trip_id: int,
    boarding_seq: int,
    dropping_seq: int,
    total_bus_capacity: int
) -> int:
    """
    Returns the number of available seats for a given segment.
    
    Formula: total_capacity - count(occupied seats for this segment)
    """
    occupied_count = (
        db.query(BookingSeat)
        .join(Booking, BookingSeat.booking_id == Booking.id)
        .filter(
            BookingSeat.trip_id == trip_id,
            BookingSeat.status.in_(["LOCKED", "CONFIRMED"]),
            BookingSeat.boarding_seq < dropping_seq,
            BookingSeat.dropping_seq > boarding_seq,
        )
        .count()
    )
    return max(0, total_bus_capacity - occupied_count)


def get_seat_map(
    db: Session,
    trip_id: int,
    boarding_seq: int,
    dropping_seq: int,
    all_seat_labels: List[str]
) -> List[dict]:
    """
    Returns the full seat map with availability status for a segment.
    
    Returns a list like:
    [
      {"label": "1A", "status": "available"},
      {"label": "1B", "status": "occupied"},
      {"label": "2A", "status": "available"},
      ...
    ]
    
    Used by the frontend to render the seat selection UI.
    """
    occupied_labels = set(
        get_occupied_seats_for_segment(db, trip_id, boarding_seq, dropping_seq)
    )
    
    seat_map = []
    for label in all_seat_labels:
        seat_map.append({
            "label": label,
            "status": "occupied" if label in occupied_labels else "available"
        })
    return seat_map


def validate_seats_available(
    db: Session,
    trip_id: int,
    boarding_seq: int,
    dropping_seq: int,
    requested_seats: List[str]
) -> List[str]:
    """
    Validates that specific requested seats are still free.
    Returns a list of conflicting seats (empty list = all good).
    
    Used right before confirming a booking to prevent double-booking
    (the Redis lock is the first line of defense, this is the DB fallback).
    """
    occupied = set(
        get_occupied_seats_for_segment(db, trip_id, boarding_seq, dropping_seq)
    )
    return [s for s in requested_seats if s in occupied]


def generate_seat_labels_from_layout(layout: str, capacity: int = 40) -> List[str]:
    """
    Generates seat labels from a bus layout string.
    
    Layout "2+2" means: 2 seats on left, 2 on right
    Layout "2+1" means: 2 seats on left, 1 on right (Volvo-style)
    
    Returns labels like: ["1A","1B","1C","1D","2A","2B","2C","2D", ...]
    """
    labels = []
    
    if layout == "2+2":
        cols = ["A", "B", "C", "D"]
    elif layout == "2+1":
        cols = ["A", "B", "C"]
    elif layout == "1+1":
        cols = ["A", "B"]
    else:
        # Fallback: numbered seats
        return [str(i) for i in range(1, capacity + 1)]
    
    seats_per_row = len(cols)
    num_rows = (capacity + seats_per_row - 1) // seats_per_row
    
    for row in range(1, num_rows + 1):
        for col in cols:
            if len(labels) < capacity:
                labels.append(f"{row}{col}")
    return labels
