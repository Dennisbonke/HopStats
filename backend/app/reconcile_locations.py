"""Reconcile automatic inventory locations after configuration changes."""

from .db import SessionLocal
from .main import initialize_database
from .models import User
from .services.locations import LocationService


def main() -> None:
    initialize_database()
    with SessionLocal() as session:
        user = session.query(User).filter_by(username="local").one()
        changed = LocationService(session).reconcile(user.id)
        session.commit()
    print(f"reconciled {changed} inventory location assignments")


if __name__ == "__main__":
    main()
