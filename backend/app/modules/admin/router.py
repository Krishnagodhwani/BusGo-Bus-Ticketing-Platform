# backend/app/modules/admin/router.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.modules.auth.models import User
from app.modules.auth.service import require_admin, require_operator_or_admin
from app.modules.admin import models, schemas
from app.modules.auth.schemas import UserResponse
from typing import List

router = APIRouter(prefix="/admin", tags=["Admin Management - Core"])

# ==================== PLATFORM ANALYTICS ====================

@router.get("/analytics", response_model=schemas.AnalyticsResponse)
def get_analytics(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin)
):
    """Get high-level statistics for Admin Dashboard"""
    total_users = db.query(User).filter(User.role == "USER").count()
    total_operators = db.query(User).filter(User.role == "OPERATOR").count()
    
    total_cities = db.query(models.City).count()
    total_bus_types = db.query(models.BusType).count()
    
    # Placeholder for future Bookings module
    total_bookings = 0
    total_revenue = 0.0
    
    return {
        "total_users": total_users,
        "total_operators": total_operators,
        "total_bookings": total_bookings,
        "total_revenue": total_revenue,
        "total_cities": total_cities,
        "total_bus_types": total_bus_types
    }


# ==================== OPERATOR MANAGEMENT ====================

@router.get("/operators", response_model=List[UserResponse])
def get_operators(
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin)
):
    """Get all registered bus operators"""
    operators = db.query(User).filter(User.role == "OPERATOR").offset(skip).limit(limit).all()
    return operators


@router.put("/operators/{operator_id}/status", response_model=UserResponse)
def toggle_operator_status(
    operator_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin)
):
    """Activate or Deactivate an Operator (Soft Delete)"""
    operator = db.query(User).filter(User.id == operator_id, User.role == "OPERATOR").first()
    
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")
        
    operator.is_active = not operator.is_active
    db.commit()
    db.refresh(operator)
    return operator


# ==================== MASTER MANAGEMENT: CITIES ====================

@router.post("/cities", response_model=schemas.CityResponse)
def create_city(
    city_data: schemas.CityCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin)
):
    """Add a new Master City (e.g. Bangalore)"""
    existing_city = db.query(models.City).filter(models.City.name == city_data.name).first()
    if existing_city:
        raise HTTPException(status_code=400, detail="City already exists in Master List")
    
    new_city = models.City(
        name=city_data.name,
        state=city_data.state,
        is_active=city_data.is_active
    )
    
    db.add(new_city)
    db.commit()
    db.refresh(new_city)
    return new_city


@router.get("/cities", response_model=List[schemas.CityResponse])
def get_cities(
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin)
):
    """Get all Master Cities"""
    return db.query(models.City).offset(skip).limit(limit).all()


# ==================== MASTER MANAGEMENT: BUS TYPES ====================

@router.post("/bus-types", response_model=schemas.BusTypeResponse)
def create_bus_type(
    type_data: schemas.BusTypeCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin)
):
    """Add a new Master Bus Type (e.g. Volvo A/C, 2+1 Layout)"""
    existing_type = db.query(models.BusType).filter(models.BusType.name == type_data.name).first()
    if existing_type:
        raise HTTPException(status_code=400, detail="Bus Type already exists in Master List")
    
    new_type = models.BusType(
        name=type_data.name,
        layout=type_data.layout,
        has_ac=type_data.has_ac,
        has_sleeper=type_data.has_sleeper,
        is_active=type_data.is_active
    )
    
    db.add(new_type)
    db.commit()
    db.refresh(new_type)
    return new_type


@router.get("/bus-types", response_model=List[schemas.BusTypeResponse])
def get_bus_types(
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_admin)
):
    """Get all Master Bus Types"""
    return db.query(models.BusType).offset(skip).limit(limit).all()
