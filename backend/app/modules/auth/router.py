# backend/app/modules/auth/router.py

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.modules.auth import models, schemas, service

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=schemas.UserResponse)
def register(user_data: schemas.UserRegister, db: Session = Depends(get_db)):
    """PUBLIC registration - always creates USER role (passengers only)"""
    
    # Check if phone already exists
    existing_user = db.query(models.User).filter(models.User.phone == user_data.phone).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Phone number already registered")
    
    # Check if email already exists (if provided)
    if user_data.email:
        existing_email = db.query(models.User).filter(models.User.email == user_data.email).first()
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user - FORCE role to USER (security!)
    hashed_password = service.hash_password(user_data.password)
    
    new_user = models.User(
        phone=user_data.phone,
        password_hash=hashed_password,
        name=user_data.name,
        email=user_data.email,
        gender=user_data.gender,
        date_of_birth=user_data.date_of_birth,
        role="USER"  # HARD CODED - no public user can be admin/operator
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user


@router.post("/login", response_model=schemas.TokenResponse)
def login(login_data: schemas.UserLogin, db: Session = Depends(get_db)):
    """Login with phone and password, returns JWT token"""
    
    # Find user by phone
    user = db.query(models.User).filter(models.User.phone == login_data.phone).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid phone or password")
    
    # Check password
    if not service.verify_password(login_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid phone or password")
    
    # Check if account is active
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    
    # Create JWT token
    token_data = {
        "user_id": user.id,
        "phone": user.phone,
        "role": user.role
    }
    access_token = service.create_access_token(token_data)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@router.post("/create-operator", response_model=schemas.UserResponse)
def create_operator(
    operator_data: schemas.OperatorCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(service.require_admin)
):
    """ADMIN ONLY - Create operator account.
    
    Requires Authorization header with Bearer token:
    Authorization: Bearer <your_jwt_token_here>
    """
    
    # Check if phone already exists
    existing_user = db.query(models.User).filter(models.User.phone == operator_data.phone).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Phone number already registered")
    
    # Check if email already exists (if provided)
    if operator_data.email:
        existing_email = db.query(models.User).filter(models.User.email == operator_data.email).first()
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create operator - FORCE role to OPERATOR
    hashed_password = service.hash_password(operator_data.password)
    
    new_operator = models.User(
        phone=operator_data.phone,
        password_hash=hashed_password,
        name=operator_data.name,
        email=operator_data.email,
        role="OPERATOR",  # HARD CODED as OPERATOR
        operator_access_level=operator_data.operator_access_level,
    )
    
    db.add(new_operator)
    db.commit()
    db.refresh(new_operator)
    
    return new_operator


@router.get("/me", response_model=schemas.UserResponse)
def get_current_user_info(
    current_user: models.User = Depends(service.get_current_user)
):
    """Get current logged-in user info.
    
    Requires Authorization header with Bearer token:
    Authorization: Bearer <your_jwt_token_here>
    """
    return current_user
