# backend/app/modules/auth/service.py

import bcrypt
from datetime import datetime, timedelta

from fastapi import Depends, Header, HTTPException
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.modules.auth import models

ALGORITHM = "HS256"
OPERATOR_ACCESS_LEVELS = {"OWNER", "MANAGER", "BOOKING_STAFF", "GROUND_STAFF"}


def hash_password(password: str) -> str:
    """Convert plain password to hashed password using bcrypt"""
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check if plain password matches hashed password"""
    try:
        # Some manual hash generators use $2y$ (PHP format), python's bcrypt strictly wants $2b$ or $2a$
        if hashed_password.startswith("$2y$"):
            hashed_password = hashed_password.replace("$2y$", "$2b$", 1)

        password_bytes = plain_password.encode("utf-8")
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except ValueError:
        # This handles cases where the manual hash in DB is invalid/not actual bcrypt
        return False


def create_access_token(data: dict) -> str:
    """Create JWT token with user data"""
    to_encode = data.copy()
    role = data.get("role", "USER")

    if role == "USER":
        # 72 hours for general passengers
        expire = datetime.utcnow() + timedelta(hours=72)
    else:
        # 30 minutes for operators and admins
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)

    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    """Verify JWT token and return user data"""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def get_current_user(authorization: str = Header(None), db: Session = Depends(get_db)) -> models.User:
    """Verify JWT token and return current user"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")

    # Extract token from "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header format. Use 'Bearer <token>'")

    token = parts[1]
    payload = verify_token(token)

    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    return user


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    """Dependency to check if user is admin"""
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_operator_or_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    """Dependency to check if user is operator or admin"""
    if current_user.role not in ["OPERATOR", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Operator or Admin access required")
    return current_user


def get_operator_access_level(current_user: models.User) -> str:
    if current_user.role == "ADMIN":
        return "OWNER"
    return (current_user.operator_access_level or "OWNER").upper()


def ensure_operator_access(current_user: models.User, allowed_levels: list[str]) -> str:
    level = get_operator_access_level(current_user)
    if current_user.role == "ADMIN":
        return level
    allowed = {item.upper() for item in allowed_levels}
    if level not in allowed:
        raise HTTPException(status_code=403, detail=f"This action requires one of: {', '.join(sorted(allowed))}")
    return level
