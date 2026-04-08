# backend/app/modules/auth/schemas.py

from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, Literal
import re
from datetime import datetime


# ==================== USER REGISTRATION (PUBLIC) ====================

class UserRegister(BaseModel):
    """Schema for PUBLIC user registration - always creates USER role"""
    phone: str = Field(..., description="10-digit Indian mobile number")
    password: str = Field(..., min_length=6, description="Password minimum 6 characters")
    name: Optional[str] = Field(None, max_length=100, description="Full name")
    email: Optional[EmailStr] = None
    gender: Optional[Literal['M', 'F', 'OTHER']] = None
    date_of_birth: Optional[str] = None  # Format: DD-MM-YYYY
    
    @validator('phone')
    def validate_indian_phone(cls, v):
        """Validate Indian mobile number"""
        cleaned = v.replace('+91', '').replace(' ', '').replace('-', '')
        if cleaned.startswith('0'):
            cleaned = cleaned[1:]
        
        if not re.match(r'^[6-9]\d{9}$', cleaned):
            raise ValueError('Enter valid 10-digit Indian mobile number')
        
        return cleaned


# ==================== USER LOGIN ====================

class UserLogin(BaseModel):
    """Schema for user login"""
    phone: str = Field(..., description="10-digit mobile number")
    password: str = Field(..., description="Password")
    
    @validator('phone')
    def validate_indian_phone(cls, v):
        """Validate Indian mobile number"""
        cleaned = v.replace('+91', '').replace(' ', '').replace('-', '')
        if cleaned.startswith('0'):
            cleaned = cleaned[1:]
        
        if not re.match(r'^[6-9]\d{9}$', cleaned):
            raise ValueError('Enter valid 10-digit Indian mobile number')
        
        return cleaned


# ==================== USER RESPONSE ====================

class UserResponse(BaseModel):
    """Schema for sending user data in API response"""
    id: int
    phone: str
    name: Optional[str]
    email: Optional[str]
    role: str
    operator_access_level: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==================== TOKEN RESPONSE ====================

class TokenResponse(BaseModel):
    """Schema for login success response"""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ==================== OPERATOR CREATE (ADMIN ONLY) ====================

class OperatorCreate(BaseModel):
    """Schema for ADMIN to create operator"""
    phone: str = Field(..., description="10-digit Indian mobile number")
    password: str = Field(..., min_length=6, description="Temporary password")
    name: Optional[str] = Field(None, max_length=100)
    email: Optional[EmailStr] = None
    operator_access_level: Literal['OWNER', 'MANAGER', 'BOOKING_STAFF', 'GROUND_STAFF'] = 'OWNER'
    
    @validator('phone')
    def validate_indian_phone(cls, v):
        """Validate Indian mobile number"""
        cleaned = v.replace('+91', '').replace(' ', '').replace('-', '')
        if cleaned.startswith('0'):
            cleaned = cleaned[1:]
        
        if not re.match(r'^[6-9]\d{9}$', cleaned):
            raise ValueError('Enter valid 10-digit Indian mobile number')
        
        return cleaned
