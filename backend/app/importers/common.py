import csv
import email.utils
import io
import json
import re
import unicodedata
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ..schemas.imports import ValidationIssue
from .base import ImportValidationError

MAX_METADATA_VALUE = 2_000
MAX_METADATA_BYTES = 16_000


def read_csv(stream) -> tuple[list[str], list[dict[str, str]], list[ValidationIssue]]:
    try:
        text = io.TextIOWrapper(stream, encoding="utf-8-sig", newline="")
        reader = csv.DictReader(text, strict=True)
        headers = [
            header.strip() if header is not None else "" for header in (reader.fieldnames or [])
        ]
        if not headers or not any(headers):
            raise ImportValidationError("CSV file is empty or has no header row")
        if len(set(headers)) != len(headers):
            raise ImportValidationError("CSV header contains duplicate column names")
        # DictReader uses its fieldnames as row-dictionary keys. Replace the
        # raw names so schema detection and row parsing use one contract.
        reader.fieldnames = headers
        rows: list[dict[str, str]] = []
        issues: list[ValidationIssue] = []
        for row_number, row in enumerate(reader, start=2):
            if None in row:
                issues.append(
                    ValidationIssue(row_number, None, "row has more fields than the header")
                )
                continue
            rows.append({key: value or "" for key, value in row.items()})
        return headers, rows, issues
    except UnicodeDecodeError as exc:
        raise ImportValidationError("CSV must be valid UTF-8") from exc
    except csv.Error as exc:
        raise ImportValidationError(f"malformed CSV: {exc}") from exc


def required_headers(headers: Sequence[str], required: set[str]) -> None:
    missing = sorted(required - set(headers))
    if missing:
        raise ImportValidationError(
            f"unsupported schema; missing required columns: {', '.join(missing)}"
        )


def value(row: dict[str, str], field: str) -> str | None:
    raw = row.get(field, "")
    stripped = raw.strip()
    return stripped or None


def required_value(row: dict[str, str], field: str, row_number: int) -> str:
    result = value(row, field)
    if result is None:
        raise ImportValidationError(
            f"row {row_number}: {field} is required",
            (ValidationIssue(row_number, field, "required value is missing"),),
        )
    return result


def decimal_value(
    row: dict[str, str],
    field: str,
    row_number: int,
    precision: int | None = None,
    scale: int | None = None,
) -> Decimal | None:
    raw = value(row, field)
    if raw is None:
        return None
    try:
        number = Decimal(raw)
    except InvalidOperation as exc:
        raise ImportValidationError(
            f"row {row_number}: {field} must be numeric",
            (ValidationIssue(row_number, field, "invalid decimal"),),
        ) from exc
    if not number.is_finite():
        raise ImportValidationError(
            f"row {row_number}: {field} must be finite",
            (ValidationIssue(row_number, field, "NaN and Infinity are not valid"),),
        )
    if precision is not None and scale is not None and not fits_numeric(number, precision, scale):
        raise ImportValidationError(
            f"row {row_number}: {field} exceeds database precision",
            (ValidationIssue(row_number, field, "numeric precision or scale is too large"),),
        )
    return number


def fits_numeric(number: Decimal, precision: int, scale: int) -> bool:
    _, _, exponent = number.as_tuple()
    fractional_digits = max(0, -exponent)
    integer_digits = max(0, number.adjusted() + 1) if number else 0
    return fractional_digits <= scale and integer_digits <= precision - scale


def bounded_metadata(row: dict[str, str], known: set[str]) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    size = 2
    for key, raw in row.items():
        if key in known or not raw:
            continue
        clipped = raw[:MAX_METADATA_VALUE]
        encoded_size = len(json.dumps({key: clipped}, ensure_ascii=False).encode("utf-8"))
        if size + encoded_size > MAX_METADATA_BYTES:
            continue
        metadata[key] = clipped
        size += encoded_size
    return metadata


def normalized_text(text: str | None) -> str:
    if not text:
        return ""
    return " ".join(unicodedata.normalize("NFKC", text).split()).casefold()


def provisional_identity(
    beer_name: str,
    brewery_name: str,
    style: str | None,
    abv: Decimal | None,
    ibu: Decimal | None,
    bottled_date: date | None,
    best_before: date | None,
) -> str:
    return json.dumps(
        [
            normalized_text(beer_name),
            normalized_text(brewery_name),
            normalized_text(style),
            str(abv) if abv is not None else None,
            str(ibu) if ibu is not None else None,
            bottled_date.isoformat() if bottled_date else None,
            best_before.isoformat() if best_before else None,
        ],
        ensure_ascii=False,
        separators=(",", ":"),
    )


def iso_timestamp(
    row: dict[str, str],
    field: str,
    row_number: int,
    offset_field: str | None = None,
    default_timezone: str = "UTC",
) -> tuple[datetime, int]:
    raw = required_value(row, field, row_number)
    parsed = raw.replace("Z", "+00:00")
    try:
        timestamp = datetime.fromisoformat(parsed)
    except ValueError as exc:
        raise ImportValidationError(
            f"row {row_number}: {field} must be an ISO-8601 timestamp",
            (ValidationIssue(row_number, field, "invalid timestamp"),),
        ) from exc

    explicit_offset = parse_offset(
        value(row, offset_field) if offset_field else None, row_number, offset_field
    )
    if timestamp.tzinfo is None:
        if explicit_offset is not None:
            timestamp = timestamp.replace(tzinfo=timezone(timedelta(minutes=explicit_offset)))
        else:
            try:
                timestamp = timestamp.replace(tzinfo=ZoneInfo(default_timezone))
            except ZoneInfoNotFoundError as exc:
                raise ImportValidationError(
                    f"row {row_number}: configured default timezone is invalid",
                    (ValidationIssue(row_number, field, "invalid default timezone"),),
                ) from exc
    actual_offset = timestamp.utcoffset()
    if actual_offset is None:
        raise ImportValidationError(f"row {row_number}: {field} has an invalid timezone")
    offset_minutes = int(actual_offset.total_seconds() // 60)
    return timestamp.astimezone(UTC).replace(tzinfo=None), offset_minutes


def parse_offset(raw: str | None, row_number: int, field: str | None) -> int | None:
    if not raw:
        return None
    try:
        if re.fullmatch(r"[+-]?\d+", raw):
            return int(raw)
        match = re.fullmatch(r"([+-])(\d{2}):?(\d{2})", raw)
        if match:
            minutes = int(match.group(2)) * 60 + int(match.group(3))
            return minutes if match.group(1) == "+" else -minutes
    except ValueError:
        pass
    raise ImportValidationError(
        f"row {row_number}: {field or 'timezone offset'} is invalid",
        (ValidationIssue(row_number, field, "invalid timezone offset"),),
    )


def iso_date(row: dict[str, str], field: str, row_number: int) -> date | None:
    raw = value(row, field)
    if raw is None or raw in {"0000-00-00", "0000-00-00 00:00:00"}:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        try:
            # Some Untappd date fields include a time component. Parse the
            # complete value, without timezone conversion or string slicing.
            return datetime.fromisoformat(raw).date()
        except ValueError:
            try:
                # The native stash export uses RFC 2822 dates for some fields.
                return email.utils.parsedate_to_datetime(raw).date()
            except (TypeError, ValueError) as exc:
                raise ImportValidationError(
                    f"row {row_number}: {field} must be an ISO date or RFC date",
                    (ValidationIssue(row_number, field, "invalid date"),),
                ) from exc


def quantity(row: dict[str, str], field: str, row_number: int) -> int:
    raw = required_value(row, field, row_number)
    if not re.fullmatch(r"\d+", raw):
        raise ImportValidationError(
            f"row {row_number}: {field} must be a nonnegative integer",
            (ValidationIssue(row_number, field, "invalid quantity"),),
        )
    parsed = int(raw)
    if parsed > 2**63 - 1:
        raise ImportValidationError(
            f"row {row_number}: {field} exceeds database integer range",
            (ValidationIssue(row_number, field, "quantity is too large"),),
        )
    return parsed


def ensure_range(
    number: Decimal | None, field: str, row_number: int, maximum: Decimal
) -> Decimal | None:
    if number is not None and not Decimal("0") <= number <= maximum:
        raise ImportValidationError(
            f"row {row_number}: {field} is outside the allowed range",
            (ValidationIssue(row_number, field, "value is out of range"),),
        )
    return number
