from app.db import SessionLocal
from app.models.user import User
from sqlalchemy.orm import Session

def seed_users(db: Session):
    admin = User(email="admin@shiftsync.com", hashed_password="hashed_pwd", role="admin")
    db.add(admin)
    db.commit()

def run_seed():
    db = SessionLocal()
    try:
        seed_users(db)
    finally:
        db.close()

if __name__ == "__main__":
    run_seed()
