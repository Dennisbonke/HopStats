from collections.abc import Generator

from sqlalchemy import Engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import get_settings


class Base(DeclarativeBase):
    pass


def _compare_rating_fractions(left: str, right: str) -> int:
    """Exact ORDER BY for sum-of-hundredths/count, without division or float ties.

    SQLite calls this during sorting, before LIMIT/OFFSET. Python integers avoid
    cross-product overflow; no per-beer queries or materialization in the service.
    Only SQL-generated integer pairs reach this collation.
    """
    left_sum, left_count = map(int, left.split("/"))
    right_sum, right_count = map(int, right.split("/"))
    a, b = left_sum * right_count, right_sum * left_count
    return (a > b) - (a < b)


def make_engine(url: str | None = None) -> Engine:
    url = url or get_settings().database_url
    kwargs = {"connect_args": {"check_same_thread": False}}
    if url.startswith("sqlite:///:memory:"):
        kwargs["poolclass"] = StaticPool
    engine = __import__("sqlalchemy").create_engine(url, **kwargs)

    @event.listens_for(engine, "connect")
    def configure_sqlite(dbapi_connection, _connection_record):
        dbapi_connection.create_collation("rating_fraction", _compare_rating_fractions)
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

    return engine


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session


def check_database(session: Session) -> None:
    session.execute(text("SELECT 1"))
