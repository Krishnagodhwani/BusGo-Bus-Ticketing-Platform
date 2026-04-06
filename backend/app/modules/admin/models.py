# backend/app/modules/admin/models.py

from sqlalchemy import Column, Integer, String, Boolean, DateTime
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
