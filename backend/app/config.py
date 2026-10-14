from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
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
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    session_max_age_seconds: int = Field(default=60 * 60 * 24 * 30, gt=0, le=365 * 24 * 60 * 60)
    login_rate_limit_attempts: int = Field(default=5, gt=0, le=1000)
    login_rate_limit_window_seconds: int = Field(default=300, gt=0, le=7 * 24 * 60 * 60)
    allowed_origins: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="HOPSTATS_", extra="ignore")

    @model_validator(mode="after")
    def validate_security_settings(self) -> "Settings":
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError("cookie_samesite='none' requires cookie_secure=true")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
