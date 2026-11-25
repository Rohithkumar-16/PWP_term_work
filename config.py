"""Application configuration for local development and production deployment."""

import os
import secrets
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _normalize_database_url(raw_url: str | None) -> str:
    """Normalize PostgreSQL URLs for SQLAlchemy 2.0 and default to SQLite."""
    if not raw_url:
        return f"sqlite:///{BASE_DIR / 'hotel.db'}"
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+psycopg2://", 1)
    if raw_url.startswith("postgresql://") and "+psycopg2" not in raw_url:
        return raw_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return raw_url


class Config:
    """Base configuration shared across environments."""

    FLASK_ENV = os.environ.get("FLASK_ENV", "development").lower()
    IS_PRODUCTION = FLASK_ENV == "production"

    # Security & Session Cookies
    SECRET_KEY = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = IS_PRODUCTION
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)

    # CSRF Protection
    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = 3600

    # Database
    SQLALCHEMY_DATABASE_URI = _normalize_database_url(os.environ.get("DATABASE_URL"))
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
    }

    # Hospitality Pricing Constants
    TAX_RATE = 0.12
    SERVICE_FEE = 25.00

    # Rate Limiting
    RATELIMIT_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_DEFAULT = "200 per day;50 per hour"
