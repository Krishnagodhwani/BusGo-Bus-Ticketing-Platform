#!/usr/bin/env python3

"""
End-to-end tests for the intermediate-stop booking system.

This script expects the FastAPI server to already be running at:
http://127.0.0.1:8000

It will:
1. Ensure the required cities exist
2. Create fresh admin, operator, and user accounts
3. Create a 5-stop route and a trip for tomorrow
4. Validate segment-aware search, seat maps, booking, and overlap logic
"""

from datetime import datetime, timedelta
import sys

import requests

from app.database import SessionLocal
from app.modules.auth.models import User
from app.modules.auth.service import hash_password

BASE = "http://127.0.0.1:8000/api/v1"
LINE = "-" * 60

RUN_ID = datetime.now().strftime("%Y%m%d%H%M%S")
PASSWORD = "testpass123"
ADMIN_PHONE = f"91000{RUN_ID[-5:]}"
OPERATOR_PHONE = f"81000{RUN_ID[-5:]}"
USER_PHONE = f"71000{RUN_ID[-5:]}"
TOMORROW_DATE = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")


def section(title):
    print(f"\n{LINE}")
    print(title)
    print(LINE)


def check(label, condition):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {label}")
    return condition


def ensure_admin():
    db = SessionLocal()
    admin = User(
        phone=ADMIN_PHONE,
        password_hash=hash_password(PASSWORD),
        name="Segment Test Admin",
        role="ADMIN",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.close()


def login(phone, password):
    response = requests.post(f"{BASE}/auth/login", json={"phone": phone, "password": password})
    response.raise_for_status()
    return response.json()["access_token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def build_full_pricing(stops, price_map):
    pricing = []
    for origin_name, dest_name, price in price_map:
        pricing.append(
            {
                "origin_city_id": stops[origin_name]["id"],
                "destination_city_id": stops[dest_name]["id"],
                "price": price,
            }
        )
    return pricing


def find_trip(results, trip_id):
    return next((item for item in results if item["trip_id"] == trip_id), None)


def main():
    section("SETUP: SERVER CHECK")
    health = requests.get("http://127.0.0.1:8000/health")
    check("Health endpoint returns 200", health.status_code == 200)
    if health.status_code != 200:
        print("Start the backend server before running this test.")
        sys.exit(1)

    section("SETUP: CREATE ADMIN")
    ensure_admin()
    admin_token = login(ADMIN_PHONE, PASSWORD)
    check("Admin login works", bool(admin_token))

    section("SETUP: CREATE OPERATOR")
    create_operator = requests.post(
        f"{BASE}/auth/create-operator",
        json={
            "phone": OPERATOR_PHONE,
            "password": PASSWORD,
            "name": "Segment Test Operator",
        },
        headers=auth_headers(admin_token),
    )
    check("Operator creation returns 200", create_operator.status_code == 200)
    if create_operator.status_code != 200:
        print(create_operator.text)
        sys.exit(1)

    operator_token = login(OPERATOR_PHONE, PASSWORD)
    check("Operator login works", bool(operator_token))

    section("SETUP: FETCH MASTER DATA")
    cities_res = requests.get(f"{BASE}/admin/cities", headers=auth_headers(admin_token))
    bus_types_res = requests.get(f"{BASE}/admin/bus-types", headers=auth_headers(admin_token))
    check("Cities fetch returns 200", cities_res.status_code == 200)
    check("Bus types fetch returns 200", bus_types_res.status_code == 200)
    if cities_res.status_code != 200 or bus_types_res.status_code != 200:
        sys.exit(1)

    city_lookup = {city["name"]: city for city in cities_res.json()}
    required_cities = ["Jaipur", "Ajmer", "Beawar", "Pali", "Jodhpur"]
    missing = [name for name in required_cities if name not in city_lookup]
    check("All required cities exist", not missing)
    if missing:
        print(f"Missing cities: {missing}")
        print("Run seed_masters.py first.")
        sys.exit(1)

    bus_type_id = bus_types_res.json()[0]["id"]
    route_stops = {
        "Jaipur": city_lookup["Jaipur"],
        "Ajmer": city_lookup["Ajmer"],
        "Beawar": city_lookup["Beawar"],
        "Pali": city_lookup["Pali"],
        "Jodhpur": city_lookup["Jodhpur"],
    }

    section("SETUP: CREATE BUS")
    bus_res = requests.post(
        f"{BASE}/operator/buses",
        json={
            "bus_type_id": bus_type_id,
            "name": "Segment Express",
            "reg_number": f"RJ14SG{RUN_ID[-4:]}",
            "is_active": True,
        },
        headers=auth_headers(operator_token),
    )
    check("Bus creation returns 200", bus_res.status_code == 200)
    if bus_res.status_code != 200:
        print(bus_res.text)
        sys.exit(1)
    bus_id = bus_res.json()["id"]

    section("SETUP: CREATE MULTI-STOP ROUTE")
    pricing_map = [
        ("Jaipur", "Ajmer", 300.0),
        ("Jaipur", "Beawar", 420.0),
        ("Jaipur", "Pali", 520.0),
        ("Jaipur", "Jodhpur", 650.0),
        ("Ajmer", "Beawar", 170.0),
        ("Ajmer", "Pali", 320.0),
        ("Ajmer", "Jodhpur", 470.0),
        ("Beawar", "Pali", 180.0),
        ("Beawar", "Jodhpur", 330.0),
        ("Pali", "Jodhpur", 150.0),
    ]

    route_res = requests.post(
        f"{BASE}/operator/routes",
        json={
            "name": "Jaipur to Jodhpur via Ajmer, Beawar, Pali",
            "is_active": True,
            "stops": [
                {"city_id": route_stops["Jaipur"]["id"], "stop_sequence": 1, "time_offset_mins": 0},
                {"city_id": route_stops["Ajmer"]["id"], "stop_sequence": 2, "time_offset_mins": 120},
                {"city_id": route_stops["Beawar"]["id"], "stop_sequence": 3, "time_offset_mins": 180},
                {"city_id": route_stops["Pali"]["id"], "stop_sequence": 4, "time_offset_mins": 300},
                {"city_id": route_stops["Jodhpur"]["id"], "stop_sequence": 5, "time_offset_mins": 420},
            ],
            "pricing": build_full_pricing(route_stops, pricing_map),
        },
        headers=auth_headers(operator_token),
    )
    check("Route creation returns 200", route_res.status_code == 200)
    if route_res.status_code != 200:
        print(route_res.text)
        sys.exit(1)
    route_id = route_res.json()["id"]

    section("SETUP: CREATE TRIP FOR TOMORROW")
    departure_time = (datetime.now() + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0).isoformat()
    trip_res = requests.post(
        f"{BASE}/operator/trips",
        json={
            "bus_id": bus_id,
            "route_id": route_id,
            "departure_time": departure_time,
        },
        headers=auth_headers(operator_token),
    )
    check("Trip creation returns 200", trip_res.status_code == 200)
    if trip_res.status_code != 200:
        print(trip_res.text)
        sys.exit(1)
    trip_id = trip_res.json()["id"]

    section("SETUP: REGISTER AND LOGIN USER")
    register_res = requests.post(
        f"{BASE}/auth/register",
        json={
            "phone": USER_PHONE,
            "password": PASSWORD,
            "name": "Segment Test User",
        },
    )
    check("User registration returns 200", register_res.status_code == 200)
    if register_res.status_code != 200:
        print(register_res.text)
        sys.exit(1)
    user_token = login(USER_PHONE, PASSWORD)
    check("User login works", bool(user_token))

    section("TEST 1: FULL ROUTE SEARCH")
    full_route_res = requests.get(
        f"{BASE}/booking/search",
        params={
            "origin_id": route_stops["Jaipur"]["id"],
            "destination_id": route_stops["Jodhpur"]["id"],
            "date": TOMORROW_DATE,
        },
    )
    full_route_results = full_route_res.json()
    full_trip = find_trip(full_route_results, trip_id)
    check("Full route search returns 200", full_route_res.status_code == 200)
    check("Created trip is visible in Jaipur -> Jodhpur search", full_trip is not None)
    if full_trip:
        check("Boarding sequence is 1", full_trip["boarding_seq"] == 1)
        check("Dropping sequence is 5", full_trip["dropping_seq"] == 5)

    section("TEST 2: SUB-SEGMENT SEARCH")
    sub_segment_res = requests.get(
        f"{BASE}/booking/search",
        params={
            "origin_id": route_stops["Ajmer"]["id"],
            "destination_id": route_stops["Pali"]["id"],
            "date": TOMORROW_DATE,
        },
    )
    sub_segment_results = sub_segment_res.json()
    sub_trip = find_trip(sub_segment_results, trip_id)
    check("Ajmer -> Pali search returns 200", sub_segment_res.status_code == 200)
    check("Created trip is visible in Ajmer -> Pali search", sub_trip is not None)
    if sub_trip:
        check("Boarding sequence is 2", sub_trip["boarding_seq"] == 2)
        check("Dropping sequence is 4", sub_trip["dropping_seq"] == 4)

    section("TEST 3: WRONG DIRECTION SEARCH")
    reverse_res = requests.get(
        f"{BASE}/booking/search",
        params={
            "origin_id": route_stops["Jodhpur"]["id"],
            "destination_id": route_stops["Jaipur"]["id"],
            "date": TOMORROW_DATE,
        },
    )
    check("Wrong direction search returns 200", reverse_res.status_code == 200)
    check("Wrong direction search returns 0 results", len(reverse_res.json()) == 0)

    section("TEST 4: STOPS TIMELINE")
    stops_res = requests.get(f"{BASE}/booking/trip/{trip_id}/stops")
    stops = stops_res.json()
    check("Trip stops returns 200", stops_res.status_code == 200)
    check("Trip has 5 stops", len(stops) == 5)
    if stops:
        check("First stop is Jaipur", stops[0]["city_name"] == "Jaipur")
        check("Last stop is Jodhpur", stops[-1]["city_name"] == "Jodhpur")

    section("TEST 5: SEGMENT SEAT MAP")
    seats_res = requests.get(
        f"{BASE}/booking/trip/{trip_id}/seats",
        params={
            "boarding_stop_id": full_trip["boarding_stop_id"],
            "dropping_stop_id": full_trip["dropping_stop_id"],
        },
    )
    seat_data = seats_res.json()
    check("Seat map returns 200", seats_res.status_code == 200)
    check("Seat map has seats", "seats" in seat_data)
    check("Seat map has available_count", "available_count" in seat_data)

    section("TEST 6: CREATE BOOKING Jaipur -> Ajmer")
    jaipur_ajmer_res = requests.get(
        f"{BASE}/booking/search",
        params={
            "origin_id": route_stops["Jaipur"]["id"],
            "destination_id": route_stops["Ajmer"]["id"],
            "date": TOMORROW_DATE,
        },
    )
    jaipur_ajmer_trip = find_trip(jaipur_ajmer_res.json(), trip_id)
    booking_res = requests.post(
        f"{BASE}/booking/book",
        json={
            "trip_id": trip_id,
            "boarding_stop_id": jaipur_ajmer_trip["boarding_stop_id"],
            "dropping_stop_id": jaipur_ajmer_trip["dropping_stop_id"],
            "seats": ["1A", "1B"],
            "passengers": [
                {"seat_label": "1A", "name": "Rahul Sharma", "age": 28, "gender": "M"},
                {"seat_label": "1B", "name": "Priya Sharma", "age": 26, "gender": "F"},
            ],
            "total_fare": jaipur_ajmer_trip["base_price"] * 2,
        },
        headers=auth_headers(user_token),
    )
    booking_data = booking_res.json()
    check("Booking creation returns 200", booking_res.status_code == 200)
    if booking_res.status_code == 200:
      check("Booking status is CONFIRMED", booking_data["status"] == "CONFIRMED")
      check("Payment status is SUCCESS", booking_data["payment_status"] == "SUCCESS")

    section("TEST 7: OVERLAP LOGIC - FREE ON NON-OVERLAPPING SEGMENT")
    beawar_jodhpur_res = requests.get(
        f"{BASE}/booking/search",
        params={
            "origin_id": route_stops["Beawar"]["id"],
            "destination_id": route_stops["Jodhpur"]["id"],
            "date": TOMORROW_DATE,
        },
    )
    beawar_jodhpur_trip = find_trip(beawar_jodhpur_res.json(), trip_id)
    beawar_seats_res = requests.get(
        f"{BASE}/booking/trip/{trip_id}/seats",
        params={
            "boarding_stop_id": beawar_jodhpur_trip["boarding_stop_id"],
            "dropping_stop_id": beawar_jodhpur_trip["dropping_stop_id"],
        },
    )
    beawar_seat_map = {seat["label"]: seat["status"] for seat in beawar_seats_res.json()["seats"]}
    check("Seat 1A is available for Beawar -> Jodhpur", beawar_seat_map.get("1A") == "available")
    check("Seat 1B is available for Beawar -> Jodhpur", beawar_seat_map.get("1B") == "available")

    section("TEST 8: OVERLAP LOGIC - OCCUPIED ON OVERLAPPING SEGMENT")
    jaipur_beawar_res = requests.get(
        f"{BASE}/booking/search",
        params={
            "origin_id": route_stops["Jaipur"]["id"],
            "destination_id": route_stops["Beawar"]["id"],
            "date": TOMORROW_DATE,
        },
    )
    jaipur_beawar_trip = find_trip(jaipur_beawar_res.json(), trip_id)
    overlap_seats_res = requests.get(
        f"{BASE}/booking/trip/{trip_id}/seats",
        params={
            "boarding_stop_id": jaipur_beawar_trip["boarding_stop_id"],
            "dropping_stop_id": jaipur_beawar_trip["dropping_stop_id"],
        },
    )
    overlap_seat_map = {seat["label"]: seat["status"] for seat in overlap_seats_res.json()["seats"]}
    check("Seat 1A is occupied for Jaipur -> Beawar", overlap_seat_map.get("1A") == "occupied")
    check("Seat 1B is occupied for Jaipur -> Beawar", overlap_seat_map.get("1B") == "occupied")

    section("TEST 9: DUPLICATE BOOKING IS REJECTED")
    duplicate_res = requests.post(
        f"{BASE}/booking/book",
        json={
            "trip_id": trip_id,
            "boarding_stop_id": jaipur_ajmer_trip["boarding_stop_id"],
            "dropping_stop_id": jaipur_ajmer_trip["dropping_stop_id"],
            "seats": ["1A"],
            "passengers": [
                {"seat_label": "1A", "name": "Duplicate User", "age": 25, "gender": "M"},
            ],
            "total_fare": jaipur_ajmer_trip["base_price"],
        },
        headers=auth_headers(user_token),
    )
    check("Duplicate booking returns 409", duplicate_res.status_code == 409)

    section("TEST 10: MY BOOKINGS")
    my_bookings_res = requests.get(f"{BASE}/booking/my-bookings", headers=auth_headers(user_token))
    my_bookings = my_bookings_res.json()
    check("My bookings returns 200", my_bookings_res.status_code == 200)
    check("My bookings contains at least one booking", len(my_bookings) >= 1)

    section("TEST RUN COMPLETE")
    print("Segment booking flow executed.")
    print("If every line above shows PASS, the intermediate-stop booking flow is working.")


if __name__ == "__main__":
    main()
