# backend/app/database.py

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

# Create engine with proper timeout settings to prevent silent hangs
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,          # Test connections before using them
    pool_timeout=10,             # Max seconds to wait for a connection from pool
    pool_recycle=1800,           # Recycle connections every 30 minutes
    connect_args={
        "connect_timeout": 10    # MySQL connection timeout in seconds
    }
)

# Session factory - creates database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all models
Base = declarative_base()


# Function to get database session (used in API endpoints)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
