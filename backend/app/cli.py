"""Account provisioning commands for use on the host or inside the container.

Examples:
    python -m backend.app.cli set-password --username local
    python -m backend.app.cli list-accounts
    python -m backend.app.cli revoke-sessions --username local
"""

import argparse
import getpass
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import func, select

from .config import get_settings
from .db import SessionLocal
from .models import AuthSession, User
from .services.auth import add_audit_event, revoke_all_sessions, set_user_password, utc_now


def initialize_database() -> None:
    settings = get_settings()
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    command.upgrade(config, "head")
    with SessionLocal() as session:
        if session.scalar(select(User.id).where(User.username == "local")) is None:
            session.add(User(username="local"))
            session.commit()


def password_prompt() -> str:
    password = getpass.getpass("New password: ")
    confirmation = getpass.getpass("Confirm new password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")
    if len(password) < 12:
        raise SystemExit("Password must be at least 12 characters.")
    return password


def find_user(session, username: str) -> User:
    user = session.scalar(select(User).where(User.username == username))
    if user is None:
        raise SystemExit("Account not found.")
    return user


def set_password_command(username: str) -> None:
    password = password_prompt()
    with SessionLocal() as session:
        user = find_user(session, username)
        revoked = set_user_password(session, user, password)
        session.commit()
    print(f"Password updated for {username}; revoked {revoked} active session(s).")


def list_accounts() -> None:
    with SessionLocal() as session:
        users = session.scalars(select(User).order_by(User.id)).all()
        for user in users:
            active = session.scalar(
                select(func.count(AuthSession.id)).where(
                    AuthSession.user_id == user.id,
                    AuthSession.revoked_at.is_(None),
                    AuthSession.expires_at > utc_now(),
                )
            )
            status = "active" if user.password_hash else "password not set"
            print(f"{user.id}\t{user.username}\t{status}\t{active} active session(s)")


def revoke_sessions(username: str | None) -> None:
    with SessionLocal() as session:
        users = (
            [find_user(session, username)]
            if username
            else session.scalars(select(User).order_by(User.id)).all()
        )
        revoked = 0
        for user in users:
            count = revoke_all_sessions(session, user.id)
            revoked += count
            add_audit_event(session, "sessions_revoked", username=user.username, user_id=user.id)
        session.commit()
    print(f"Revoked {revoked} active session(s).")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="hopstats-account")
    commands = root.add_subparsers(dest="command", required=True)
    for name in ("set-password", "change-password", "reset-password"):
        command_parser = commands.add_parser(name, help="set or replace an account password")
        command_parser.add_argument("--username", default="local")
    commands.add_parser("list-accounts", help="list account status without secrets")
    revoke = commands.add_parser("revoke-sessions", help="invalidate active sessions")
    revoke.add_argument("--username")
    return root


def main() -> int:
    args = parser().parse_args()
    initialize_database()
    if args.command in {"set-password", "change-password", "reset-password"}:
        set_password_command(args.username)
    elif args.command == "list-accounts":
        list_accounts()
    elif args.command == "revoke-sessions":
        revoke_sessions(args.username)
    return 0


if __name__ == "__main__":
    sys.exit(main())
