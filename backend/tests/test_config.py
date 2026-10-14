import pytest
from pydantic import ValidationError

from backend.app.config import Settings


@pytest.mark.parametrize(
    "field, value",
    [
        ("cookie_samesite", "invalid"),
        ("session_max_age_seconds", 0),
        ("session_max_age_seconds", -1),
        ("login_rate_limit_attempts", 0),
        ("login_rate_limit_window_seconds", 0),
    ],
)
def test_security_settings_reject_invalid_values(field, value):
    with pytest.raises(ValidationError):
        Settings(**{field: value})


def test_samesite_none_requires_secure_cookie():
    with pytest.raises(ValidationError, match="cookie_secure"):
        Settings(cookie_samesite="none", cookie_secure=False)


def test_secure_cookie_configuration_is_valid():
    settings = Settings(cookie_samesite="none", cookie_secure=True)
    assert settings.cookie_samesite == "none"


def test_location_config_owner_identifiers_are_mutually_exclusive():
    with pytest.raises(ValidationError, match="only one"):
        Settings(location_config_user_id=1, location_config_username="owner")


def test_location_config_username_cannot_be_blank():
    with pytest.raises(ValidationError, match="cannot be blank"):
        Settings(location_config_username="  ")
