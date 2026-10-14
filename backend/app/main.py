from pathlib import Path
from typing import Annotated

from alembic import command
from alembic.config import Config
from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
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
from .services.locations import load_location_config, seed_location_config


def initialize_database() -> None:
    settings = get_settings()
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    command.upgrade(config, "head")
    from .db import SessionLocal

    with SessionLocal() as session:
        if session.query(User).filter_by(username="local").one_or_none() is None:
            session.add(User(username="local"))
            session.commit()
        config = load_location_config(settings.location_config)
        if config:
            user = session.query(User).filter_by(username="local").one()
            seed_location_config(session, user.id, config)
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
