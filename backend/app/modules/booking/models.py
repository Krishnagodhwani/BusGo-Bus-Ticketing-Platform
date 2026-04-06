# backend/app/modules/booking/models.py
#
# BOOKING MODEL — The heart of the ticketing system
# Handles intermediate-stop bookings and seat overlap detection
#
# KEY INSIGHT:
# A bus on Jaipur→Ajmer→Beawar→Pali→Jodhpur has SEATS that are "occupied"
# only for a SEGMENT of the journey, not the full route.
# A seat booked Jaipur→Ajmer is FREE again from Ajmer onwards.
# So seat availability must be checked per SEGMENT (stop_sequence overlap).

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Enum
from sqlalchemy.orm import relationship
import datetime
from app.database import Base


class Booking(Base):
    """
    Represents one booking made by a user.

    Critical fields:
    - trip_id         : which scheduled trip
    - boarding_stop_id: which RouteStop the user boards at
    - dropping_stop_id: which RouteStop the user drops at
    - total_passengers: how many seats booked in this transaction
    - status          : lifecycle status

    Why we store boarding/dropping as RouteStop references (not just city IDs)?
    → Because the same city can theoretically appear on different routes.
      Referencing the actual RouteStop gives us the stop_sequence directly,
      which is the KEY for the overlap query.
    """
    __tablename__ = "bookings"

    id              = Column(Integer, primary_key=True, index=True)
    booking_ref     = Column(String(20), unique=True, nullable=False, index=True)  # e.g. "BK-20240401-0001"

    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    trip_id         = Column(Integer, ForeignKey("trips.id"), nullable=False)

    # The SEGMENT booked — stored as RouteStop IDs for sequence lookup
    boarding_stop_id = Column(Integer, ForeignKey("route_stops.id"), nullable=False)
    dropping_stop_id = Column(Integer, ForeignKey("route_stops.id"), nullable=False)

    # Denormalized for fast display (no joins needed for e-ticket)
    boarding_city_id = Column(Integer, ForeignKey("cities.id"), nullable=False)
    dropping_city_id = Column(Integer, ForeignKey("cities.id"), nullable=False)

    total_passengers = Column(Integer, nullable=False, default=1)
    total_fare       = Column(Float, nullable=False)
    ticket_number    = Column(String(30), nullable=True, unique=True, index=True)
    booking_source   = Column(String(20), nullable=False, default="WEB")
    ops_status       = Column(String(20), nullable=False, default="CONFIRMED")
    refunded_amount  = Column(Float, nullable=False, default=0.0)
    operator_notes   = Column(String(500), nullable=True)
    issue_flag       = Column(String(50), nullable=True)
    last_ticket_sent_at = Column(DateTime, nullable=True)
    last_ticket_sent_channel = Column(String(20), nullable=True)

    # Booking lifecycle
    status = Column(
        Enum(
            "INITIATED",         # User started booking, seats not yet locked
            "SEAT_LOCKED",       # Seats locked via Redis (15 min window)
            "CONFIRMED",         # Payment success
            "CANCELLED",         # User or operator cancelled
            "REFUND_INITIATED",  # Refund triggered
            "REFUNDED",          # Refund completed
            name="booking_status_enum"
        ),
        default="INITIATED",
        nullable=False
    )

    payment_status = Column(
        Enum("PENDING", "SUCCESS", "FAILED", name="payment_status_enum"),
        default="PENDING",
        nullable=False
    )

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    user          = relationship("User", backref="bookings")
    trip          = relationship("Trip", backref="bookings")
    boarding_stop = relationship("RouteStop", foreign_keys=[boarding_stop_id])
    dropping_stop = relationship("RouteStop", foreign_keys=[dropping_stop_id])
    boarding_city = relationship("City", foreign_keys=[boarding_city_id])
    dropping_city = relationship("City", foreign_keys=[dropping_city_id])
    seats         = relationship("BookingSeat", backref="booking", cascade="all, delete-orphan")
    passengers    = relationship("Passenger", backref="booking", cascade="all, delete-orphan")


class BookingSeat(Base):
    """
    Maps a specific physical seat number to a booking.

    Why a separate table?
    → A booking can have MULTIPLE seats (family of 3).
      Each seat needs to be tracked individually for:
        - seat map display (which seat is taken)
        - overlap detection (is seat X free for this segment?)
    
    OVERLAP RULE (the core algorithm):
    Seat X on trip T is OCCUPIED for a new booking [new_board_seq → new_drop_seq] if:
        existing_booking.boarding_seq < new_drop_seq
        AND
        existing_booking.dropping_seq > new_board_seq
    This is the classic "interval overlap" formula.
    """
    __tablename__ = "booking_seats"

    id         = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    trip_id    = Column(Integer, ForeignKey("trips.id"), nullable=False)
    seat_label = Column(String(10), nullable=False)   # e.g. "1A", "2B", "10"

    # Denormalized sequence numbers for fast overlap query (no join needed)
    boarding_seq = Column(Integer, nullable=False)  # stop_sequence of boarding stop
    dropping_seq = Column(Integer, nullable=False)  # stop_sequence of dropping stop

    status = Column(
        Enum("LOCKED", "CONFIRMED", "CANCELLED", name="seat_status_enum"),
        default="LOCKED",
        nullable=False
    )

    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Passenger(Base):
    """Passenger details for each ticket in a booking"""
    __tablename__ = "passengers"

    id         = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    seat_label = Column(String(10), nullable=False)

    name   = Column(String(100), nullable=False)
    age    = Column(Integer, nullable=False)
    gender = Column(Enum("M", "F", "OTHER", name="passenger_gender_enum"), nullable=False)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
