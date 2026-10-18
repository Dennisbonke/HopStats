"""Reproducible local benchmark for M8.1 aggregation on synthetic history.

Run from the repository root:
    python backend/scripts/benchmark_drinking_trends.py --checkins 100000 --runs 5
"""

from __future__ import annotations

import argparse
import statistics
import sys
import tempfile
import time
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.app.db import Base  # noqa: E402
from backend.app.models import Beer, Checkin, User  # noqa: E402, F401 (register ORM tables)
from backend.app.services.analytics import AnalyticsService  # noqa: E402


def run(checkin_count: int, run_count: int) -> None:
    with tempfile.TemporaryDirectory(prefix="hopstats-trends-bench-") as directory:
        engine = create_engine(f"sqlite:///{Path(directory) / 'benchmark.sqlite3'}")
        Base.metadata.create_all(engine)
        with engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE INDEX ix_checkins_user_occurred ON checkins (user_id, occurred_at_utc)"
                )
            )
            connection.execute(
                text(
                    "CREATE INDEX ix_checkins_user_beer_occurred_id "
                    "ON checkins (user_id, beer_id, occurred_at_utc, id)"
                )
            )

        with Session(engine) as session:
            user = User(username="benchmark")
            session.add(user)
            session.flush()
            beer_count = max(1, checkin_count // 10)
            session.execute(
                Beer.__table__.insert(),
                [
                    {
                        "source_system": "synthetic",
                        "external_id": f"beer-{beer_id}",
                        "name": f"Synthetic beer {beer_id}",
                    }
                    for beer_id in range(beer_count)
                ],
            )
            epoch_start = datetime(2010, 1, 1, tzinfo=UTC).replace(tzinfo=None)
            cadence = timedelta(hours=1.5)
            session.execute(
                Checkin.__table__.insert(),
                [
                    {
                        "user_id": user.id,
                        "source_system": "synthetic",
                        "external_id": f"checkin-{index}",
                        "beer_id": (index % beer_count) + 1,
                        "occurred_at_utc": epoch_start + index * cadence,
                    }
                    for index in range(checkin_count)
                ],
            )
            session.commit()

            service = AnalyticsService(session)
            # Warm the SQLite page cache and UDF registration before measurements.
            response = service.drinking_trends(
                user.id, date(2025, 1, 1), date(2025, 12, 31), "Europe/Amsterdam"
            )
            samples = []
            for _ in range(run_count):
                started = time.perf_counter()
                response = service.drinking_trends(
                    user.id, date(2025, 1, 1), date(2025, 12, 31), "Europe/Amsterdam"
                )
                samples.append(time.perf_counter() - started)

        print(f"checkins: {checkin_count:,}")
        print("requested period: 2025-01-01..2025-12-31 Europe/Amsterdam")
        print(f"period check-ins: {sum(day.total for day in response.daily):,}")
        print(f"runs: {run_count} (after one warm-up)")
        print(f"seconds: {[round(sample, 3) for sample in samples]}")
        print(f"median seconds: {statistics.median(samples):.3f}")
        engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkins", type=int, default=100_000)
    parser.add_argument("--runs", type=int, default=5)
    arguments = parser.parse_args()
    if arguments.checkins < 1 or arguments.runs < 1:
        parser.error("--checkins and --runs must be positive")
    run(arguments.checkins, arguments.runs)


if __name__ == "__main__":
    main()
