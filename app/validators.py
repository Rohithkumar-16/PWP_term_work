"""Input validation and URL safety helpers."""

from __future__ import annotations

import re
from datetime import date
from urllib.parse import urljoin, urlparse

from flask import request

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def sanitize_text(value: str | None, max_length: int = 200) -> str:
    """Trim whitespace and enforce maximum string length."""
    if not value:
        return ""
    return " ".join(value.strip().split())[:max_length]


def is_valid_email(email: str) -> bool:
    return bool(email) and len(email) <= 160 and bool(EMAIL_REGEX.match(email))


def parse_iso_date(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        return date.fromisoformat(raw.strip())
    except ValueError:
        return None


def validate_date_range(
    check_in_str: str | None,
    check_out_str: str | None,
    require_future_or_today: bool = True,
) -> tuple[date | None, date | None, str | None]:
    """Validate check-in and check-out ISO dates."""
    check_in = parse_iso_date(check_in_str)
    check_out = parse_iso_date(check_out_str)

    if not check_in or not check_out:
        return None, None, "Please select both check-in and check-out dates."

    if require_future_or_today and check_in < date.today():
        return None, None, "Check-in date cannot be in the past."

    if check_out <= check_in:
        return None, None, "Check-out date must be at least one night after check-in."

    if (check_out - check_in).days > 60:
        return None, None, "Online reservations are limited to 60 nights per booking."

    return check_in, check_out, None


def parse_positive_int(
    raw: str | int | None, min_val: int = 1, max_val: int = 100
) -> int | None:
    try:
        value = int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if value < min_val or value > max_val:
        return None
    return value


def parse_positive_float(
    raw: str | float | None, min_val: float = 1.0, max_val: float = 50000.0
) -> float | None:
    try:
        value = float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if value < min_val or value > max_val:
        return None
    return round(value, 2)


def is_safe_redirect_url(target: str | None) -> bool:
    """Prevent open-redirect attacks on login/action redirects."""
    if not target:
        return False
    ref_url = urlparse(request.host_url)
    test_url = urlparse(urljoin(request.host_url, target))
    return test_url.scheme in ("http", "https") and ref_url.netloc == test_url.netloc
