# backend/app/modules/admin/models.py

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class City(Base):
    """Master list of cities for boarding and dropping points"""
    __tablename__ = "cities"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    state = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class BusType(Base):
    """Master list of bus types (e.g. A/C Sleeper, Non-A/C Seater)"""
    __tablename__ = "bus_types"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)  # e.g., "Volvo A/C Semi-Sleeper"
    layout = Column(String(50), nullable=False)             # e.g., "2+2", "2+1"
    has_ac = Column(Boolean, default=True, nullable=False)
    has_sleeper = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class PlatformSetting(Base):
    __tablename__ = "platform_settings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    setting_key = Column(String(100), unique=True, nullable=False, index=True)
    setting_value = Column(String(255), nullable=False)
    label = Column(String(120), nullable=False)
    category = Column(String(50), nullable=False, default="GENERAL")
    description = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class CancellationPolicy(Base):
    __tablename__ = "cancellation_policies"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    policy_name = Column(String(120), nullable=False)
    cutoff_hours = Column(Integer, nullable=False, default=6)
    refund_percent = Column(Float, nullable=False, default=80.0)
    processing_fee = Column(Float, nullable=False, default=0.0)
    applies_after_departure = Column(Boolean, default=False, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RevenueConfig(Base):
    __tablename__ = "revenue_configs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    commission_percent = Column(Float, nullable=False, default=12.0)
    gateway_fee_percent = Column(Float, nullable=False, default=2.0)
    gst_percent = Column(Float, nullable=False, default=18.0)
    flat_platform_fee = Column(Float, nullable=False, default=0.0)
    refund_processing_fee = Column(Float, nullable=False, default=25.0)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RefundAudit(Base):
    __tablename__ = "refund_audits"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False, index=True)
    processed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    refund_amount = Column(Float, nullable=False, default=0.0)
    reason = Column(Text, nullable=True)
    refund_mode = Column(String(30), nullable=False, default="MANUAL")

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    booking = relationship("Booking", backref="refund_audits")
    processor = relationship("User")


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    action = Column(String(120), nullable=False)
    entity_type = Column(String(60), nullable=False)
    entity_id = Column(Integer, nullable=True)
    status = Column(String(30), nullable=False, default="SUCCESS")
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    actor = relationship("User")


class OperatorOnboardingRequest(Base):
    __tablename__ = "operator_onboarding_requests"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    company_name = Column(String(150), nullable=False)
    contact_name = Column(String(120), nullable=False)
    phone = Column(String(20), nullable=False)
    email = Column(String(150), nullable=True)
    requested_access_level = Column(String(30), nullable=False, default="OWNER")
    approval_status = Column(String(30), nullable=False, default="PENDING")
    document_status = Column(String(30), nullable=False, default="PENDING")
    notes = Column(Text, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_operator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    reviewer = relationship("User", foreign_keys=[reviewed_by])
    created_operator = relationship("User", foreign_keys=[created_operator_id])


class OperatorDocument(Base):
    __tablename__ = "operator_documents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    onboarding_request_id = Column(Integer, ForeignKey("operator_onboarding_requests.id"), nullable=True, index=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    doc_type = Column(String(60), nullable=False)
    document_number = Column(String(100), nullable=True)
    file_name = Column(String(200), nullable=True)
    verification_status = Column(String(30), nullable=False, default="PENDING")
    notes = Column(Text, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    onboarding_request = relationship("OperatorOnboardingRequest", backref="documents")
    operator = relationship("User", foreign_keys=[operator_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by])


class InventoryRule(Base):
    __tablename__ = "inventory_rules"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    rule_name = Column(String(120), nullable=False, default="Default Inventory Policy")
    seat_hold_minutes = Column(Integer, nullable=False, default=15)
    default_capacity_limit = Column(Integer, nullable=False, default=40)
    allow_manual_override = Column(Boolean, nullable=False, default=True)
    allow_overbooking = Column(Boolean, nullable=False, default=False)
    max_blocked_seats = Column(Integer, nullable=False, default=4)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class FareTemplate(Base):
    __tablename__ = "fare_templates"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    base_fare = Column(Float, nullable=False, default=0.0)
    tax_percent = Column(Float, nullable=False, default=5.0)
    service_fee = Column(Float, nullable=False, default=0.0)
    surcharge = Column(Float, nullable=False, default=0.0)
    cancellation_fee = Column(Float, nullable=False, default=0.0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=True, index=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    passenger_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    category = Column(String(60), nullable=False, default="BOOKING")
    priority = Column(String(30), nullable=False, default="MEDIUM")
    status = Column(String(30), nullable=False, default="OPEN")
    subject = Column(String(150), nullable=False)
    description = Column(Text, nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    booking = relationship("Booking")
    operator = relationship("User", foreign_keys=[operator_id])
    passenger = relationship("User", foreign_keys=[passenger_id])
    assignee = relationship("User", foreign_keys=[assigned_to])
