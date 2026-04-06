"""add booking tables with segment overlap support

Revision ID: 002_booking_tables
Revises: 001_initial
Create Date: 2026-04-03

This migration creates:
  - bookings          : one row per booking transaction
  - booking_seats     : one row per seat, with boarding/dropping seq for overlap queries
  - passengers        : passenger details per seat
"""

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    # ── bookings ──────────────────────────────────────────────────────
    op.create_table(
        'bookings',
        sa.Column('id',               sa.Integer(),    primary_key=True),
        sa.Column('booking_ref',      sa.String(20),   nullable=False, unique=True, index=True),
        sa.Column('user_id',          sa.Integer(),    sa.ForeignKey('users.id'),        nullable=False),
        sa.Column('trip_id',          sa.Integer(),    sa.ForeignKey('trips.id'),        nullable=False),
        sa.Column('boarding_stop_id', sa.Integer(),    sa.ForeignKey('route_stops.id'), nullable=False),
        sa.Column('dropping_stop_id', sa.Integer(),    sa.ForeignKey('route_stops.id'), nullable=False),
        sa.Column('boarding_city_id', sa.Integer(),    sa.ForeignKey('cities.id'),      nullable=False),
        sa.Column('dropping_city_id', sa.Integer(),    sa.ForeignKey('cities.id'),      nullable=False),
        sa.Column('total_passengers', sa.Integer(),    nullable=False, default=1),
        sa.Column('total_fare',       sa.Float(),      nullable=False),
        sa.Column('status',           sa.Enum(
            'INITIATED', 'SEAT_LOCKED', 'CONFIRMED', 'CANCELLED',
            'REFUND_INITIATED', 'REFUNDED',
            name='booking_status_enum'
        ), nullable=False, default='INITIATED'),
        sa.Column('payment_status',   sa.Enum(
            'PENDING', 'SUCCESS', 'FAILED',
            name='payment_status_enum'
        ), nullable=False, default='PENDING'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # ── booking_seats ─────────────────────────────────────────────────
    # boarding_seq and dropping_seq are DENORMALIZED here on purpose.
    # They allow the overlap query to run with a single index scan:
    #   WHERE boarding_seq < :drop AND dropping_seq > :board
    # without joining route_stops every time.
    op.create_table(
        'booking_seats',
        sa.Column('id',           sa.Integer(), primary_key=True),
        sa.Column('booking_id',   sa.Integer(), sa.ForeignKey('bookings.id'), nullable=False),
        sa.Column('trip_id',      sa.Integer(), sa.ForeignKey('trips.id'),    nullable=False),
        sa.Column('seat_label',   sa.String(10), nullable=False),
        sa.Column('boarding_seq', sa.Integer(), nullable=False),
        sa.Column('dropping_seq', sa.Integer(), nullable=False),
        sa.Column('status',       sa.Enum(
            'LOCKED', 'CONFIRMED', 'CANCELLED',
            name='seat_status_enum'
        ), nullable=False, default='LOCKED'),
        sa.Column('created_at',   sa.DateTime(), nullable=False),
    )

    # Composite index on (trip_id, boarding_seq, dropping_seq) —
    # this is the exact pattern the overlap query uses.
    op.create_index(
        'ix_booking_seats_trip_overlap',
        'booking_seats',
        ['trip_id', 'boarding_seq', 'dropping_seq']
    )

    # ── passengers ───────────────────────────────────────────────────
    op.create_table(
        'passengers',
        sa.Column('id',         sa.Integer(),  primary_key=True),
        sa.Column('booking_id', sa.Integer(),  sa.ForeignKey('bookings.id'), nullable=False),
        sa.Column('seat_label', sa.String(10), nullable=False),
        sa.Column('name',       sa.String(100), nullable=False),
        sa.Column('age',        sa.Integer(),   nullable=False),
        sa.Column('gender',     sa.Enum('M', 'F', 'OTHER', name='passenger_gender_enum'), nullable=False),
        sa.Column('created_at', sa.DateTime(),  nullable=False),
    )


def downgrade() -> None:
    op.drop_index('ix_booking_seats_trip_overlap', table_name='booking_seats')
    op.drop_table('passengers')
    op.drop_table('booking_seats')
    op.drop_table('bookings')
    # Drop enums (required for PostgreSQL; MySQL ignores this)
    sa.Enum(name='booking_status_enum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='payment_status_enum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='seat_status_enum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='passenger_gender_enum').drop(op.get_bind(), checkfirst=True)
