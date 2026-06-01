import os
import sys
from app.database import SessionLocal
from app.models.user import User, UserRole
from app.auth import get_password_hash

def create_admin():
    # Get password from environment variable or CLI argument
    password = os.getenv("ADMIN_PASSWORD")
    if not password and len(sys.argv) > 1:
        password = sys.argv[1]
    
    if not password:
        print("ERROR: No admin password provided.")
        print("Usage: python create_initial_user.py <password>")
        print("   or: set ADMIN_PASSWORD environment variable")
        sys.exit(1)

    if len(password) < 8:
        print("ERROR: Password must be at least 8 characters long.")
        sys.exit(1)

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == "admin").first()
        if not user:
            print("Creating admin user...")
            hashed_pw = get_password_hash(password)
            new_user = User(
                username="admin",
                email="admin@example.com",
                hashed_password=hashed_pw,
                role=UserRole.ADMIN,
                is_active=True
            )
            db.add(new_user)
            db.commit()
            print("Admin user created successfully.")
        else:
            print("Admin user already exists.")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    create_admin()
