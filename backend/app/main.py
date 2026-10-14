from pathlib import Path
from typing import Annotated

from alembic import command
from alembic.config import Config
from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .api.auth import router as auth_router
from .api.dashboard import router as dashboard_router
from .api.imports import router as imports_router
from .api.inventory import router as inventory_router
from .api.locations import router as locations_router
from .config import get_settings
from .db import check_database, get_db
from .models import User
from .services.auth import find_user
from .services.locations import (
    LocationConfigurationError,
    LocationService,
    load_location_config,
    seed_location_config,
)


def _location_config_owner_id(session: Session, settings) -> int:
    if settings.location_config_user_id is not None:
        user = session.get(User, settings.location_config_user_id)
        if user is None:
            raise LocationConfigurationError(
                "configured location owner user ID does not exist: "
                f"{settings.location_config_user_id}"
            )
        return user.id

    if settings.location_config_username is not None:
        user = find_user(session, username=settings.location_config_username)
        if user is None:
            raise LocationConfigurationError(
                "configured location owner username does not exist: "
                f"{settings.location_config_username}"
            )
        return user.id

    users = session.scalars(select(User).order_by(User.id)).all()
    if len(users) == 1:
        return users[0].id
    if not users:
        raise LocationConfigurationError(
            "location configuration has no account owner; set HOPSTATS_LOCATION_CONFIG_USER_ID"
        )
    raise LocationConfigurationError(
        "location configuration owner is ambiguous; set HOPSTATS_LOCATION_CONFIG_USER_ID"
    )


def initialize_database() -> None:
    settings = get_settings()
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    command.upgrade(config, "head")
    from .db import SessionLocal

    with SessionLocal() as session:
        config = load_location_config(settings.location_config)
        if config is not None:
            user_id = _location_config_owner_id(session, settings)
            seed_location_config(session, user_id, config)
            session.flush()
            LocationService(session).reconcile(user_id)
            session.commit()


app = FastAPI(title="HopStats API", version="0.1.0")
app.include_router(auth_router)
app.include_router(imports_router)
app.include_router(dashboard_router)
app.include_router(inventory_router)
app.include_router(locations_router)


@app.on_event("startup")
def startup() -> None:
    initialize_database()


@app.get("/api/v1/health")
def health(session: Annotated[Session, Depends(get_db)]) -> dict[str, str]:
    try:
        check_database(session)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return {"status": "ok"}


frontend = Path(get_settings().frontend_dist)
if frontend.is_dir():
    app.mount("/assets", StaticFiles(directory=frontend / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        candidate = (frontend / path).resolve()
        try:
            candidate.relative_to(frontend.resolve())
        except ValueError:
            candidate = frontend / "index.html"
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(frontend / "index.html")
