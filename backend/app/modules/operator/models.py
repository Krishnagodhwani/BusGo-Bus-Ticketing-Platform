from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Text
from sqlalchemy.orm import relationship
import datetime

from app.database import Base


class Bus(Base):
    __tablename__ = "buses"

    id = Column(Integer, primary_key=True, index=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    bus_type_id = Column(Integer, ForeignKey("bus_types.id"), nullable=False)

    name = Column(String(100), nullable=False)
    reg_number = Column(String(50), unique=True, index=True, nullable=False)
    internal_code = Column(String(50), nullable=True)
    operational_status = Column(String(20), default="ACTIVE")
    amenities = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    operator = relationship("User", backref="buses")
    bus_type = relationship("BusType", backref="buses")


class Route(Base):
    __tablename__ = "routes"

    id = Column(Integer, primary_key=True, index=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(200), nullable=False)
    route_code = Column(String(50), nullable=True)
    estimated_distance_km = Column(Float, nullable=True)
    estimated_duration_mins = Column(Integer, nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    operator = relationship("User", backref="routes")
    stops = relationship("RouteStop", backref="route", cascade="all, delete-orphan", order_by="RouteStop.stop_sequence")
    pricing = relationship("RoutePricing", backref="route", cascade="all, delete-orphan")


class RouteStop(Base):
    __tablename__ = "route_stops"

    id = Column(Integer, primary_key=True, index=True)
    route_id = Column(Integer, ForeignKey("routes.id"), nullable=False)
    city_id = Column(Integer, ForeignKey("cities.id"), nullable=False)

    stop_sequence = Column(Integer, nullable=False)
    time_offset_mins = Column(Integer, nullable=False)
    allows_boarding = Column(Boolean, default=True)
    allows_dropping = Column(Boolean, default=True)

    city = relationship("City")


class RoutePricing(Base):
    __tablename__ = "route_pricing"

    id = Column(Integer, primary_key=True, index=True)
    route_id = Column(Integer, ForeignKey("routes.id"), nullable=False)
    origin_city_id = Column(Integer, ForeignKey("cities.id"), nullable=False)
    destination_city_id = Column(Integer, ForeignKey("cities.id"), nullable=False)

    price = Column(Float, nullable=False)

    origin = relationship("City", foreign_keys=[origin_city_id])
    destination = relationship("City", foreign_keys=[destination_city_id])


class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    bus_id = Column(Integer, ForeignKey("buses.id"), nullable=False)
    route_id = Column(Integer, ForeignKey("routes.id"), nullable=False)

    departure_time = Column(DateTime, nullable=False, index=True)
    series_code = Column(String(50), nullable=True, index=True)
    recurrence_label = Column(String(100), nullable=True)
    delay_mins = Column(Integer, default=0)
    ops_notes = Column(Text, nullable=True)
    actual_start_time = Column(DateTime, nullable=True)
    actual_end_time = Column(DateTime, nullable=True)

    status = Column(String(20), default="SCHEDULED")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    operator = relationship("User", backref="trips")
    bus = relationship("Bus", backref="trips")
    route = relationship("Route", back_populates="trips")


class OperatorNotificationLog(Base):
    __tablename__ = "operator_notification_logs"

    id = Column(Integer, primary_key=True, index=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category = Column(String(30), nullable=False)
    title = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    severity = Column(String(20), default="info")
    channel = Column(String(20), nullable=True)
    recipient = Column(String(120), nullable=True)
    delivery_status = Column(String(20), default="IN_APP")
    provider_name = Column(String(50), nullable=True)
    provider_reference = Column(String(100), nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    failed_reason = Column(Text, nullable=True)
    entity_type = Column(String(30), nullable=True)
    entity_id = Column(Integer, nullable=True)
    href = Column(String(255), nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    operator = relationship("User", backref="operator_notification_logs")


class OperatorCompanyProfile(Base):
    __tablename__ = "operator_company_profiles"

    id = Column(Integer, primary_key=True, index=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    company_name = Column(String(150), nullable=False)
    legal_name = Column(String(150), nullable=True)
    support_phone = Column(String(20), nullable=True)
    support_email = Column(String(150), nullable=True)
    service_areas = Column(Text, nullable=True)
    address = Column(Text, nullable=True)
    contract_status = Column(String(30), default="PENDING")
    contract_notes = Column(Text, nullable=True)
    verification_status = Column(String(30), default="PENDING")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    operator = relationship("User", backref="company_profile")


class OperatorCrewMember(Base):
    __tablename__ = "operator_crew_members"

    id = Column(Integer, primary_key=True, index=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    assigned_bus_id = Column(Integer, ForeignKey("buses.id"), nullable=True)
    name = Column(String(120), nullable=False)
    role = Column(String(40), nullable=False, default="DRIVER")
    phone = Column(String(20), nullable=True)
    license_number = Column(String(80), nullable=True)
    credential_status = Column(String(30), default="PENDING")
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    operator = relationship("User", backref="crew_members")
    assigned_bus = relationship("Bus", backref="assigned_crew")


class BlockedSeatRule(Base):
    __tablename__ = "blocked_seat_rules"

    id = Column(Integer, primary_key=True, index=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    bus_id = Column(Integer, ForeignKey("buses.id"), nullable=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=True)
    seat_label = Column(String(20), nullable=False)
    reason = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    operator = relationship("User", backref="blocked_seat_rules")
    bus = relationship("Bus", backref="blocked_seat_rules")
    trip = relationship("Trip", backref="blocked_seat_rules")


Route.trips = relationship("Trip", back_populates="route", cascade="all, delete-orphan")
