from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "HopStats"
    host: str = "127.0.0.1"
    port: int = 8000
    database_url: str = "sqlite:///./hopstats.sqlite3"
    log_level: str = "info"
    frontend_dist: str = "frontend/dist"
    max_upload_bytes: int = 10 * 1024 * 1024
    location_config: str | None = None
    import_default_timezone: str = "UTC"
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    session_max_age_seconds: int = 60 * 60 * 24 * 30
    login_rate_limit_attempts: int = 5
    login_rate_limit_window_seconds: int = 300
    allowed_origins: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="HOPSTATS_", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
