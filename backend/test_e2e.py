import requests
import unittest
from datetime import datetime, timedelta

BASE_URL = "http://127.0.0.1:8000/api/v1"


class TestBackendE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # We create fresh test users so the flow stays isolated.
        cls.timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        cls.admin_phone = f"90000{cls.timestamp[-5:]}"
        cls.operator_phone = f"80000{cls.timestamp[-5:]}"
        cls.password = "testpass123"

    def test_01_create_admin_in_db_directly(self):
        # Admin must be created directly because public register always creates USER.
        from app.database import SessionLocal
        from app.modules.auth.models import User
        from app.modules.auth.service import hash_password

        db = SessionLocal()
        admin = User(
            phone=self.admin_phone,
            password_hash=hash_password(self.password),
            name="Test QA Admin",
            role="ADMIN",
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        db.close()
        self.assertTrue(admin.id > 0)

    def test_02_admin_login(self):
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"phone": self.admin_phone, "password": self.password},
        )
        self.assertEqual(response.status_code, 200, f"Admin login failed: {response.text}")
        data = response.json()
        self.assertIn("access_token", data)
        self.__class__.admin_token = data["access_token"]

    def test_03_admin_create_operator(self):
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        response = requests.post(
            f"{BASE_URL}/auth/create-operator",
            json={
                "phone": self.operator_phone,
                "password": self.password,
                "name": "QA Test Operator",
            },
            headers=headers,
        )
        self.assertEqual(response.status_code, 200, f"Create operator failed: {response.text}")

    def test_04_operator_login(self):
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"phone": self.operator_phone, "password": self.password},
        )
        self.assertEqual(response.status_code, 200, f"Operator login failed: {response.text}")
        data = response.json()
        self.assertIn("access_token", data)
        self.__class__.operator_token = data["access_token"]

    def test_05_admin_list_cities_and_bus_types(self):
        headers = {"Authorization": f"Bearer {self.admin_token}"}

        res_cities = requests.get(f"{BASE_URL}/admin/cities", headers=headers)
        self.assertEqual(res_cities.status_code, 200, f"Cities fetch failed: {res_cities.text}")
        cities = res_cities.json()
        self.assertGreaterEqual(len(cities), 2, "At least two cities are required. Did seed_masters run?")
        self.__class__.city_id = cities[0]["id"]
        self.__class__.city_id_2 = cities[1]["id"]

        res_bus_types = requests.get(f"{BASE_URL}/admin/bus-types", headers=headers)
        self.assertEqual(res_bus_types.status_code, 200, f"Bus types fetch failed: {res_bus_types.text}")
        bus_types = res_bus_types.json()
        self.assertGreater(len(bus_types), 0, "No bus types found. Did seed_masters run?")
        self.__class__.bus_type_id = bus_types[0]["id"]

    def test_06_operator_create_bus(self):
        headers = {"Authorization": f"Bearer {self.operator_token}"}
        response = requests.post(
            f"{BASE_URL}/operator/buses",
            json={
                "bus_type_id": self.bus_type_id,
                "name": "QA Express",
                "reg_number": f"RJ14QA{self.timestamp[-4:]}",
                "is_active": True,
            },
            headers=headers,
        )
        self.assertEqual(response.status_code, 200, f"Operator create bus failed: {response.text}")
        self.__class__.bus_id = response.json()["id"]

    def test_07_operator_create_route(self):
        headers = {"Authorization": f"Bearer {self.operator_token}"}

        response = requests.post(
            f"{BASE_URL}/operator/routes",
            json={
                "name": "QA Route",
                "is_active": True,
                "stops": [
                    {
                        "city_id": self.city_id,
                        "stop_sequence": 1,
                        "time_offset_mins": 0,
                    },
                    {
                        "city_id": self.city_id_2,
                        "stop_sequence": 2,
                        "time_offset_mins": 330,
                    },
                ],
                "pricing": [
                    {
                        "origin_city_id": self.city_id,
                        "destination_city_id": self.city_id_2,
                        "price": 500.0,
                    }
                ],
            },
            headers=headers,
        )
        self.assertEqual(response.status_code, 200, f"Operator create route failed: {response.text}")
        route = response.json()
        self.__class__.route_id = route["id"]
        self.assertEqual(len(route.get("stops", [])), 2)
        self.assertEqual(len(route.get("pricing", [])), 1)

    def test_08_operator_create_trip(self):
        headers = {"Authorization": f"Bearer {self.operator_token}"}
        tomorrow = datetime.now() + timedelta(days=1)
        departure = tomorrow.replace(hour=10, minute=0, second=0, microsecond=0).isoformat()

        response = requests.post(
            f"{BASE_URL}/operator/trips",
            json={
                "bus_id": self.bus_id,
                "route_id": self.route_id,
                "departure_time": departure,
            },
            headers=headers,
        )
        self.assertEqual(response.status_code, 200, f"Operator create trip failed: {response.text}")
        self.__class__.trip_id = response.json()["id"]
        self.__class__.trip_date = tomorrow.strftime("%Y-%m-%d")

    def test_09_user_public_search(self):
        params = {
            "origin_id": self.city_id,
            "destination_id": self.city_id_2,
            "date": self.trip_date,
        }
        res = requests.get(f"{BASE_URL}/booking/search", params=params)
        self.assertEqual(res.status_code, 200, f"Public search failed: {res.text}")
        results = res.json()
        self.assertGreaterEqual(len(results), 1, "No search results returned for the created route")

        matching_trip = next((trip for trip in results if trip["trip_id"] == self.trip_id), None)
        self.assertIsNotNone(matching_trip, "Newly created trip was not found in public search results")
        self.assertEqual(matching_trip["boarding_seq"], 1)
        self.assertEqual(matching_trip["dropping_seq"], 2)
        self.assertEqual(matching_trip["base_price"], 500.0)


if __name__ == "__main__":
    unittest.main()
