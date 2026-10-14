"""Reconcile automatic inventory locations after configuration changes."""

from .db import SessionLocal
from .main import initialize_database
from .models import User
from .services.locations import LocationService


def main() -> None:
    initialize_database()
    with SessionLocal() as session:
        users = session.query(User).order_by(User.id).all()
        changed = sum(LocationService(session).reconcile(user.id) for user in users)
        session.commit()
    print(f"reconciled {changed} inventory location assignments")


if __name__ == "__main__":
    main()
