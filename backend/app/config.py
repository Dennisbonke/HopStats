from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
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
    location_config_user_id: int | None = Field(default=None, gt=0)
    location_config_username: str | None = None
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
        if self.location_config_user_id is not None and self.location_config_username:
            raise ValueError("set only one of location_config_user_id or location_config_username")
        if self.location_config_username is not None and not self.location_config_username.strip():
            raise ValueError("location_config_username cannot be blank")
        return self

    @field_validator("location_config_user_id", "location_config_username", mode="before")
    @classmethod
    def empty_location_owner_setting_is_unset(cls, value):
        return None if value == "" else value


@lru_cache
def get_settings() -> Settings:
    return Settings()
