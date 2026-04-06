import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, engine, Base
from app.modules.admin.models import City, BusType

Base.metadata.create_all(bind=engine)


def seed_database():
    db = SessionLocal()

    try:
        rajasthan_cities = [
            "Jaipur", "Jodhpur", "Udaipur", "Kota", "Bikaner",
            "Ajmer", "Beawar", "Bhilwara", "Alwar", "Sikar", "Pali",
            "Sri Ganganagar", "Bharatpur", "Barmer", "Jaisalmer", "Pushkar",
            "Mount Abu", "Chittorgarh", "Sawai Madhopur"
        ]

        print("Checking existing cities...")
        cities_added = 0
        for city_name in rajasthan_cities:
          exists = db.query(City).filter(City.name == city_name).first()
          if not exists:
            new_city = City(name=city_name, state="Rajasthan", is_active=True)
            db.add(new_city)
            cities_added += 1

        bus_types = [
            {"name": "Volvo A/C Multi-Axle Sleeper", "layout": "2+1", "has_ac": True, "has_sleeper": True},
            {"name": "Scania A/C Semi-Sleeper", "layout": "2+2", "has_ac": True, "has_sleeper": False},
            {"name": "BharatBenz Premium A/C Sleeper", "layout": "1+1", "has_ac": True, "has_sleeper": True},
            {"name": "Tata Non-A/C Seater", "layout": "3+2", "has_ac": False, "has_sleeper": False},
            {"name": "Ashok Leyland Non-A/C Sleeper", "layout": "2+1", "has_ac": False, "has_sleeper": True},
            {"name": "Eicher A/C Executive Seater", "layout": "2+2", "has_ac": True, "has_sleeper": False}
        ]

        print("Checking existing bus types...")
        buses_added = 0
        for bus_data in bus_types:
            exists = db.query(BusType).filter(BusType.name == bus_data["name"]).first()
            if not exists:
                new_bus = BusType(
                    name=bus_data["name"],
                    layout=bus_data["layout"],
                    has_ac=bus_data["has_ac"],
                    has_sleeper=bus_data["has_sleeper"],
                    is_active=True
                )
                db.add(new_bus)
                buses_added += 1

        if cities_added > 0 or buses_added > 0:
            db.commit()
            print(f"Successfully seeded {cities_added} Rajasthan cities")
            print(f"Successfully seeded {buses_added} master bus types")
        else:
            print("Database is already fully seeded. No new records added.")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {str(e)}")
    finally:
        db.close()


if __name__ == "__main__":
    print("Starting master data seeder...")
    seed_database()
