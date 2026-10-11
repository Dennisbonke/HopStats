from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "HopStats"
    host: str = "127.0.0.1"
    port: int = 8000
    database_url: str = "sqlite:////data/hopstats.sqlite3"
    log_level: str = "info"
    frontend_dist: str = "frontend/dist"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="HOPSTATS_", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
