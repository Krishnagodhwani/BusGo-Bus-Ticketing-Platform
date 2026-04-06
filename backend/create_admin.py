import bcrypt

from app.database import SessionLocal, engine, Base
from app.modules.auth.models import User

Base.metadata.create_all(bind=engine)


def create_admin():
    db = SessionLocal()

    existing_admin = db.query(User).filter(User.role == "ADMIN").first()
    if existing_admin:
        print("Admin already exists")
        print(f"Phone: {existing_admin.phone}")
        db.close()
        return

    password = "admin123"
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)

    admin = User(
        phone="9999999999",
        password_hash=hashed.decode("utf-8"),
        name="System Admin",
        role="ADMIN",
        is_active=True
    )

    db.add(admin)
    db.commit()
    db.refresh(admin)

    print("Admin created successfully")
    print("Phone: 9999999999")
    print("Password: admin123")
    print("Role: ADMIN")

    db.close()


if __name__ == "__main__":
    create_admin()
