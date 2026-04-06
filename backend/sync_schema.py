import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
db_url = os.getenv("DATABASE_URL")

if not db_url:
    print("Error: DATABASE_URL not found in .env")
    sys.exit(1)

engine = create_engine(
    db_url,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 10}
)

changes_made = []


def log_change(msg):
    print(f"  OK {msg}")
    changes_made.append(msg)


def log_skip(msg):
    print(f"  SKIP {msg}")


def get_columns(table_name):
    insp = inspect(engine)
    return [c["name"] for c in insp.get_columns(table_name)]


def table_exists(table_name):
    insp = inspect(engine)
    return table_name in insp.get_table_names()


def add_column_if_missing(conn, table, column, definition):
    cols = get_columns(table)
    if column not in cols:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
        conn.commit()
        log_change(f"Added '{column}' to '{table}'")
    else:
        log_skip(f"'{column}' already exists in '{table}'")


def drop_column_if_exists(conn, table, column):
    cols = get_columns(table)
    if column in cols:
        conn.execute(text(f"ALTER TABLE {table} DROP COLUMN {column}"))
        conn.commit()
        log_change(f"Dropped old column '{column}' from '{table}'")


def drop_foreign_key_if_exists(conn, table, constraint_name):
    insp = inspect(engine)
    existing_fks = [fk["name"] for fk in insp.get_foreign_keys(table)]
    if constraint_name in existing_fks:
        conn.execute(text(f"ALTER TABLE {table} DROP FOREIGN KEY {constraint_name}"))
        conn.commit()
        log_change(f"Dropped foreign key '{constraint_name}' from '{table}'")


def create_tables_via_orm():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    from app.database import Base
    from app.modules.auth import models as auth_models  # noqa: F401
    from app.modules.admin import models as admin_models  # noqa: F401
    from app.modules.operator import models as operator_models  # noqa: F401
    from app.modules.booking import models as booking_models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    log_change("Ran Base.metadata.create_all() - all missing tables created")


def sync_routes_table(conn):
    print("\nSyncing 'routes' table...")

    if not table_exists("routes"):
        log_skip("'routes' table does not exist yet (will be created by ORM)")
        return

    add_column_if_missing(conn, "routes", "name", "VARCHAR(200) NOT NULL DEFAULT 'Unnamed Route'")
    add_column_if_missing(conn, "routes", "route_code", "VARCHAR(50) NULL")
    add_column_if_missing(conn, "routes", "estimated_distance_km", "FLOAT NULL")
    add_column_if_missing(conn, "routes", "estimated_duration_mins", "INT NULL")
    add_column_if_missing(conn, "routes", "is_active", "BOOLEAN DEFAULT TRUE")
    add_column_if_missing(conn, "routes", "created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP")
    add_column_if_missing(conn, "routes", "updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")

    drop_foreign_key_if_exists(conn, "routes", "routes_ibfk_2")
    drop_foreign_key_if_exists(conn, "routes", "routes_ibfk_3")
    drop_column_if_exists(conn, "routes", "source_city_id")
    drop_column_if_exists(conn, "routes", "origin_id")
    drop_column_if_exists(conn, "routes", "destination_id")
    drop_column_if_exists(conn, "routes", "destination_city_id")
    drop_column_if_exists(conn, "routes", "distance_km")
    drop_column_if_exists(conn, "routes", "duration_hours")
    drop_column_if_exists(conn, "routes", "base_price")


def sync_users_table(conn):
    print("\nSyncing 'users' table...")

    if not table_exists("users"):
        log_skip("'users' table does not exist yet (created elsewhere)")
        return

    add_column_if_missing(conn, "users", "operator_access_level", "VARCHAR(20) NULL DEFAULT 'OWNER'")


def sync_trips_table(conn):
    print("\nSyncing 'trips' table...")

    if not table_exists("trips"):
        log_skip("'trips' table does not exist yet (will be created by ORM)")
        return

    add_column_if_missing(conn, "trips", "status", "VARCHAR(20) DEFAULT 'SCHEDULED'")
    add_column_if_missing(conn, "trips", "series_code", "VARCHAR(50) NULL")
    add_column_if_missing(conn, "trips", "recurrence_label", "VARCHAR(100) NULL")
    add_column_if_missing(conn, "trips", "delay_mins", "INT NOT NULL DEFAULT 0")
    add_column_if_missing(conn, "trips", "ops_notes", "TEXT NULL")
    add_column_if_missing(conn, "trips", "actual_start_time", "DATETIME NULL")
    add_column_if_missing(conn, "trips", "actual_end_time", "DATETIME NULL")
    add_column_if_missing(conn, "trips", "is_active", "BOOLEAN DEFAULT TRUE")
    add_column_if_missing(conn, "trips", "created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP")
    add_column_if_missing(conn, "trips", "updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")

    drop_column_if_exists(conn, "trips", "arrival_time")
    drop_column_if_exists(conn, "trips", "base_price")
    drop_column_if_exists(conn, "trips", "available_seats")
    drop_column_if_exists(conn, "trips", "source_city_id")
    drop_column_if_exists(conn, "trips", "destination_city_id")


def sync_buses_table(conn):
    print("\nSyncing 'buses' table...")

    if not table_exists("buses"):
        log_skip("'buses' table does not exist yet (will be created by ORM)")
        return

    add_column_if_missing(conn, "buses", "is_active", "BOOLEAN DEFAULT TRUE")
    add_column_if_missing(conn, "buses", "internal_code", "VARCHAR(50) NULL")
    add_column_if_missing(conn, "buses", "operational_status", "VARCHAR(20) DEFAULT 'ACTIVE'")
    add_column_if_missing(conn, "buses", "amenities", "TEXT NULL")
    add_column_if_missing(conn, "buses", "notes", "TEXT NULL")
    add_column_if_missing(conn, "buses", "created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP")
    add_column_if_missing(conn, "buses", "updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")


def sync_route_stops_table(conn):
    print("\nSyncing 'route_stops' table...")

    if not table_exists("route_stops"):
        log_skip("'route_stops' table does not exist yet (will be created by ORM)")
        return

    add_column_if_missing(conn, "route_stops", "allows_boarding", "BOOLEAN DEFAULT TRUE")
    add_column_if_missing(conn, "route_stops", "allows_dropping", "BOOLEAN DEFAULT TRUE")


def sync_bookings_table(conn):
    print("\nSyncing 'bookings' table...")

    if not table_exists("bookings"):
        log_skip("'bookings' table does not exist yet (will be created by ORM)")
        return

    add_column_if_missing(conn, "bookings", "ticket_number", "VARCHAR(30) NULL")
    add_column_if_missing(conn, "bookings", "booking_source", "VARCHAR(20) NOT NULL DEFAULT 'WEB'")
    add_column_if_missing(conn, "bookings", "ops_status", "VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED'")
    add_column_if_missing(conn, "bookings", "refunded_amount", "FLOAT NOT NULL DEFAULT 0")
    add_column_if_missing(conn, "bookings", "operator_notes", "VARCHAR(500) NULL")
    add_column_if_missing(conn, "bookings", "issue_flag", "VARCHAR(50) NULL")
    add_column_if_missing(conn, "bookings", "last_ticket_sent_at", "DATETIME NULL")
    add_column_if_missing(conn, "bookings", "last_ticket_sent_channel", "VARCHAR(20) NULL")


def sync_operator_notifications_table(conn):
    print("\nSyncing 'operator_notification_logs' table...")

    if not table_exists("operator_notification_logs"):
        log_skip("'operator_notification_logs' table does not exist yet (will be created by ORM)")
        return

    add_column_if_missing(conn, "operator_notification_logs", "channel", "VARCHAR(20) NULL")
    add_column_if_missing(conn, "operator_notification_logs", "recipient", "VARCHAR(120) NULL")
    add_column_if_missing(conn, "operator_notification_logs", "delivery_status", "VARCHAR(20) DEFAULT 'IN_APP'")
    add_column_if_missing(conn, "operator_notification_logs", "provider_name", "VARCHAR(50) NULL")
    add_column_if_missing(conn, "operator_notification_logs", "provider_reference", "VARCHAR(100) NULL")
    add_column_if_missing(conn, "operator_notification_logs", "delivered_at", "DATETIME NULL")
    add_column_if_missing(conn, "operator_notification_logs", "failed_reason", "TEXT NULL")


def verify_tables():
    print("\nVerifying all required tables...")
    required = [
        "users", "cities", "bus_types",
        "buses", "routes", "route_stops", "route_pricing",
        "trips", "bookings", "booking_seats", "passengers", "operator_notification_logs"
    ]

    insp = inspect(engine)
    existing = insp.get_table_names()

    all_good = True
    for table in required:
        if table in existing:
            cols = [c["name"] for c in insp.get_columns(table)]
            print(f"  OK {table} ({len(cols)} columns)")
        else:
            print(f"  MISSING {table}")
            all_good = False

    return all_good


if __name__ == "__main__":
    print("Connecting to database...")
    print(f"URL: {db_url[:40]}...")

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("Database connection successful\n")
    except Exception as e:
        print(f"Cannot connect to database: {e}")
        print("Make sure MySQL is running and DATABASE_URL is correct.")
        sys.exit(1)

    try:
        with engine.connect() as conn:
            sync_routes_table(conn)
            sync_users_table(conn)
            sync_trips_table(conn)
            sync_buses_table(conn)
            sync_route_stops_table(conn)
            sync_bookings_table(conn)
            sync_operator_notifications_table(conn)

        print("\nCreating missing tables via ORM...")
        create_tables_via_orm()

        all_good = verify_tables()

        print("\n" + "=" * 50)
        if changes_made:
            print(f"Sync complete. {len(changes_made)} changes made:")
            for change in changes_made:
                print(f" - {change}")
        else:
            print("Database already up to date")

        if all_good:
            print("\nAll required tables verified. Backend is ready to start.")
        else:
            print("\nSome tables are still missing. Check errors above.")

    except Exception as e:
        print(f"\nError during sync: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
