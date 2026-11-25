"""SQLAlchemy database models for Users, Rooms, and Bookings."""

from __future__ import annotations

import secrets
import string
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from werkzeug.security import check_password_hash, generate_password_hash

from app import db

ROOM_TYPES = ("Standard", "Deluxe", "Suite")
ROOM_STATUSES = ("available", "occupied", "maintenance")
BOOKING_STATUSES = ("confirmed", "cancelled", "completed")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _round_money(value: float | Decimal) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def generate_confirmation_code() -> str:
    """Generate a readable, collision-resistant confirmation code like HLC-8K2M9P."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    token = "".join(secrets.choice(alphabet) for _ in range(6))
    return f"HLC-{token}"


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(160), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="guest")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=_utcnow)

    bookings = db.relationship(
        "Booking", back_populates="user", lazy="dynamic", cascade="all, delete-orphan"
    )

    def set_password(self, raw_password: str) -> None:
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return check_password_hash(self.password_hash, raw_password)

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "full_name": self.full_name,
            "email": self.email,
            "role": self.role,
        }


class Room(db.Model):
    __tablename__ = "rooms"

    id = db.Column(db.Integer, primary_key=True)
    room_number = db.Column(db.String(20), unique=True, nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    room_type = db.Column(db.String(30), nullable=False, index=True)
    price_per_night = db.Column(db.Float, nullable=False)
    capacity = db.Column(db.Integer, nullable=False, default=2)
    bed_config = db.Column(db.String(80), nullable=False, default="1 King Bed")
    size_sqft = db.Column(db.Integer, nullable=False, default=340)
    description = db.Column(db.Text, nullable=False)
    amenities = db.Column(db.Text, nullable=False, default="")
    image_url = db.Column(
        db.String(300), nullable=False, default="/static/images/room_standard.jpg"
    )
    status = db.Column(db.String(20), nullable=False, default="available")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=_utcnow)

    bookings = db.relationship(
        "Booking", back_populates="room", lazy="dynamic", cascade="all, delete-orphan"
    )

    @property
    def amenities_list(self) -> list[str]:
        return [item.strip() for item in (self.amenities or "").split(",") if item.strip()]

    def is_available_for_dates(
        self, check_in: date, check_out: date, exclude_booking_id: int | None = None
    ) -> bool:
        """Return True if the room is bookable and has zero overlapping confirmed stays."""
        if self.status == "maintenance":
            return False

        query = Booking.query.filter(
            Booking.room_id == self.id,
            Booking.status == "confirmed",
            Booking.check_in < check_out,
            Booking.check_out > check_in,
        )
        if exclude_booking_id is not None:
            query = query.filter(Booking.id != exclude_booking_id)

        return query.first() is None

    def to_dict(self, check_in: date | None = None, check_out: date | None = None) -> dict:
        available_for_range = (
            self.is_available_for_dates(check_in, check_out)
            if (check_in and check_out)
            else self.status == "available"
        )
        return {
            "id": self.id,
            "room_number": self.room_number,
            "name": self.name,
            "room_type": self.room_type,
            "price_per_night": _round_money(self.price_per_night),
            "capacity": self.capacity,
            "bed_config": self.bed_config,
            "size_sqft": self.size_sqft,
            "description": self.description,
            "amenities": self.amenities_list,
            "image_url": self.image_url,
            "status": self.status,
            "available_for_dates": available_for_range,
        }


class Booking(db.Model):
    __tablename__ = "bookings"

    id = db.Column(db.Integer, primary_key=True)
    confirmation_code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    room_id = db.Column(db.Integer, db.ForeignKey("rooms.id"), nullable=False, index=True)

    guest_name = db.Column(db.String(120), nullable=False)
    guest_email = db.Column(db.String(160), nullable=False)
    guest_count = db.Column(db.Integer, nullable=False, default=1)

    check_in = db.Column(db.Date, nullable=False, index=True)
    check_out = db.Column(db.Date, nullable=False, index=True)
    nights = db.Column(db.Integer, nullable=False)

    nightly_rate = db.Column(db.Float, nullable=False)
    subtotal = db.Column(db.Float, nullable=False)
    tax_amount = db.Column(db.Float, nullable=False)
    service_fee = db.Column(db.Float, nullable=False)
    total_price = db.Column(db.Float, nullable=False)

    special_requests = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String(20), nullable=False, default="confirmed", index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=_utcnow)

    user = db.relationship("User", back_populates="bookings")
    room = db.relationship("Room", back_populates="bookings")

    @staticmethod
    def calculate_pricing(
        nightly_rate: float, nights: int, tax_rate: float, service_fee: float
    ) -> dict[str, float]:
        subtotal = _round_money(nightly_rate * nights)
        tax_amount = _round_money(subtotal * tax_rate)
        fee = _round_money(service_fee)
        total = _round_money(subtotal + tax_amount + fee)
        return {
            "nights": nights,
            "nightly_rate": _round_money(nightly_rate),
            "subtotal": subtotal,
            "tax_amount": tax_amount,
            "service_fee": fee,
            "total_price": total,
        }

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "confirmation_code": self.confirmation_code,
            "user_id": self.user_id,
            "room_id": self.room_id,
            "room_number": self.room.room_number if self.room else "",
            "room_name": self.room.name if self.room else "",
            "room_type": self.room.room_type if self.room else "",
            "room_image": self.room.image_url if self.room else "",
            "guest_name": self.guest_name,
            "guest_email": self.guest_email,
            "guest_count": self.guest_count,
            "check_in": self.check_in.isoformat(),
            "check_out": self.check_out.isoformat(),
            "nights": self.nights,
            "nightly_rate": _round_money(self.nightly_rate),
            "subtotal": _round_money(self.subtotal),
            "tax_amount": _round_money(self.tax_amount),
            "service_fee": _round_money(self.service_fee),
            "total_price": _round_money(self.total_price),
            "special_requests": self.special_requests,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else "",
        }
