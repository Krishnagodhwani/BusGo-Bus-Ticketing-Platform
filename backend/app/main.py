# backend/app/main.py

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine

# Import ALL models so SQLAlchemy knows about them before create_all()
from app.modules.auth import models as auth_models  # noqa: F401
from app.modules.admin import models as admin_models  # noqa: F401
from app.modules.operator import models as operator_models  # noqa: F401
from app.modules.booking import models as booking_models  # noqa: F401

from app.modules.auth import router as auth_router
from app.modules.admin import router as admin_router
from app.modules.operator import router as operator_router
from app.modules.booking import router as booking_router


def sync_database_tables():
    """Sync SQLAlchemy models to the database when the app starts."""
    try:
        Base.metadata.create_all(bind=engine)
        print("Database tables synced successfully")
    except Exception as e:
        print(f"Database table creation failed: {e}")
        print("   The server will start but some endpoints may not work.")
        print("   Make sure MySQL is running and the database exists.")


@asynccontextmanager
async def lifespan(_: FastAPI):
    sync_database_tables()
    yield


app = FastAPI(
    title="Bus Ticketing Platform",
    description="India-based bus ticketing system with intermediate-stop support",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production: change to your Vercel frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(admin_router.router, prefix="/api/v1")
app.include_router(operator_router.router, prefix="/api/v1")
app.include_router(booking_router.router, prefix="/api/v1")


@app.get("/")
def root():
    return {"message": "Bus Ticketing API v2.0 - intermediate-stop booking enabled"}


@app.get("/health")
def health_check():
    """Health check endpoint for debugging connectivity"""
    try:
        from sqlalchemy import text

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": f"error: {str(e)}"}
