# backend/app/modules/auth/models.py

from sqlalchemy import Column, Integer, String, Enum, DateTime, Date, Boolean
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"
    
    # Primary key - auto increments
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Phone is main login identifier (required, unique)
    phone = Column(String(15), unique=True, nullable=False, index=True)
    
    # Profile info (optional except password)
    name = Column(String(100), nullable=True)
    email = Column(String(150), unique=True, nullable=True)
    gender = Column(Enum('M', 'F', 'OTHER', name='gender_enum'), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    password_hash = Column(String(255), nullable=False)  # Hashed password
    
    # Role-based access control
    role = Column(
        Enum('ADMIN', 'OPERATOR', 'USER', name='role_enum'), 
        nullable=False, 
        default='USER'
    )
    operator_access_level = Column(
        Enum('OWNER', 'MANAGER', 'BOOKING_STAFF', 'GROUND_STAFF', name='operator_access_level_enum'),
        nullable=True,
        default='OWNER'
    )
    
    # Account status
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Timestamps - auto managed by database
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
