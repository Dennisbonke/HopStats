"""Account provisioning commands for use on the host or inside the container.

Examples:
    python -m backend.app.cli bootstrap --username owner
    python -m backend.app.cli set-password --user-id 1
    python -m backend.app.cli rename-user --user-id 1 --username owner
    python -m backend.app.cli create-user --username second
    python -m backend.app.cli list-accounts
    python -m backend.app.cli revoke-sessions --user-id 1
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
from .services.auth import (
    add_audit_event,
    find_user,
    normalize_username,
    revoke_all_sessions,
    set_user_password,
    utc_now,
)


def initialize_database() -> None:
    settings = get_settings()
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    command.upgrade(config, "head")


def password_prompt() -> str:
    password = getpass.getpass("New password: ")
    confirmation = getpass.getpass("Confirm new password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")
    if len(password) < 12:
        raise SystemExit("Password must be at least 12 characters.")
    return password


def require_user(session, *, user_id: int | None = None, username: str | None = None) -> User:
    user = find_user(session, user_id=user_id, username=username)
    if user is None:
        raise SystemExit("Account not found.")
    return user


def user_selector(parser: argparse.ArgumentParser) -> None:
    selector = parser.add_mutually_exclusive_group(required=True)
    selector.add_argument("--user-id", type=int)
    selector.add_argument("--username")


def set_password_command(*, user_id: int | None, username: str | None) -> None:
    with SessionLocal() as session:
        user = require_user(session, user_id=user_id, username=username)
        password = password_prompt()
        revoked = set_user_password(session, user, password)
        session.commit()
    print(f"Password updated for user {user.id}; revoked {revoked} active session(s).")


def rename_user_command(user_id: int, username: str) -> None:
    try:
        normalized = normalize_username(username)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    with SessionLocal() as session:
        user = require_user(session, user_id=user_id)
        conflict = find_user(session, username=normalized)
        if conflict is not None and conflict.id != user.id:
            raise SystemExit("Username is already in use.")
        user.username = normalized
        add_audit_event(session, "username_changed", username=normalized, user_id=user.id)
        session.commit()
    print(f"Username updated for user {user_id}.")


def create_user_command(username: str, *, require_empty: bool = False) -> None:
    try:
        normalized = normalize_username(username)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    with SessionLocal() as session:
        if require_empty and session.scalar(select(User.id).limit(1)) is not None:
            raise SystemExit("Bootstrap is only available when no accounts exist.")
        if find_user(session, username=normalized) is not None:
            raise SystemExit("Username is already in use.")
        password = password_prompt()
        user = User(username=normalized)
        session.add(user)
        session.flush()
        set_user_password(session, user, password)
        add_audit_event(session, "user_created", username=user.username, user_id=user.id)
        session.commit()
    print(f"Created user {user.id} ({normalized}).")


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


def revoke_sessions(*, user_id: int | None, username: str | None) -> None:
    with SessionLocal() as session:
        user = require_user(session, user_id=user_id, username=username)
        revoked = revoke_all_sessions(session, user.id)
        add_audit_event(session, "sessions_revoked", username=user.username, user_id=user.id)
        session.commit()
    print(f"Revoked {revoked} active session(s) for user {user.id}.")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="hopstats-account")
    commands = root.add_subparsers(dest="command", required=True)
    for name in ("set-password", "change-password", "reset-password"):
        command_parser = commands.add_parser(name, help="set or replace an account password")
        user_selector(command_parser)
    bootstrap = commands.add_parser(
        "bootstrap", help="create the first account in an empty database"
    )
    bootstrap.add_argument("--username", required=True)
    create = commands.add_parser("create-user", help="create an additional private account")
    create.add_argument("--username", required=True)
    rename = commands.add_parser(
        "rename-user", help="rename an account without changing its ID or data"
    )
    rename.add_argument("--user-id", type=int, required=True)
    rename.add_argument("--username", required=True)
    commands.add_parser("list-accounts", help="list account status without secrets")
    revoke = commands.add_parser("revoke-sessions", help="invalidate active sessions")
    user_selector(revoke)
    return root


def main() -> int:
    args = parser().parse_args()
    initialize_database()
    if args.command in {"set-password", "change-password", "reset-password"}:
        set_password_command(user_id=args.user_id, username=args.username)
    elif args.command == "bootstrap":
        create_user_command(args.username, require_empty=True)
    elif args.command == "create-user":
        create_user_command(args.username)
    elif args.command == "rename-user":
        rename_user_command(args.user_id, args.username)
    elif args.command == "list-accounts":
        list_accounts()
    elif args.command == "revoke-sessions":
        revoke_sessions(user_id=args.user_id, username=args.username)
    return 0


if __name__ == "__main__":
    sys.exit(main())
