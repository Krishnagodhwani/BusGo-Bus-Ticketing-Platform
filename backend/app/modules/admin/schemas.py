# backend/app/modules/admin/schemas.py

from pydantic import BaseModel, Field
from typing import Optional


# ==================== CITY SCHEMAS ====================

class CityCreate(BaseModel):
    name: str = Field(..., max_length=100, description="City name (e.g., Bangalore)")
    state: Optional[str] = Field(None, max_length=100, description="State (e.g., Karnataka)")
    is_active: bool = True

class CityResponse(BaseModel):
    id: int
    name: str
    state: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True


# ==================== BUS TYPE SCHEMAS ====================

class BusTypeCreate(BaseModel):
    name: str = Field(..., max_length=100, description="Type name (e.g., Volvo A/C Semi-Sleeper)")
    layout: str = Field(..., max_length=50, description="Seating layout (e.g., 2+2, 2+1)")
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

    class Config:
        from_attributes = True


# ==================== DASHBOARD ANALYTICS SCHEMAS ====================

class AnalyticsResponse(BaseModel):
    total_users: int
    total_operators: int
    total_bookings: int
    total_revenue: float
    total_cities: int
    total_bus_types: int
