"""Role-protected Admin / Receptionist Dashboard routes."""

from __future__ import annotations

from datetime import date

from flask import Blueprint, flash, redirect, render_template, request, url_for

from app import db
from app.models import Booking, ROOM_STATUSES, ROOM_TYPES, Room
from app.routes.auth import admin_required
from app.validators import parse_positive_float, parse_positive_int, sanitize_text

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")

DEFAULT_IMAGE_BY_TYPE = {
    "Standard": "/static/images/room_standard.jpg",
    "Deluxe": "/static/images/room_deluxe.jpg",
    "Suite": "/static/images/room_executive.jpg",
}


@admin_bp.route("/")
@admin_required
def dashboard():
    today = date.today()
    rooms = Room.query.order_by(Room.room_number.asc()).all()
    bookings = (
        Booking.query.order_by(Booking.created_at.desc(), Booking.check_in.desc()).all()
    )

    total_rooms = len(rooms)
    available_today = sum(
        1
        for r in rooms
        if r.status == "available"
        and Booking.query.filter(
            Booking.room_id == r.id,
            Booking.status == "confirmed",
            Booking.check_in <= today,
            Booking.check_out > today,
        ).first()
        is None
    )
    active_bookings = sum(
        1 for b in bookings if b.status == "confirmed" and b.check_out >= today
    )
    estimated_revenue = round(
        sum(b.total_price for b in bookings if b.status in ("confirmed", "completed")),
        2,
    )

    return render_template(
        "admin/dashboard.html",
        rooms=rooms,
        bookings=bookings,
        room_types=ROOM_TYPES,
        room_statuses=ROOM_STATUSES,
        metrics={
            "total_rooms": total_rooms,
            "available_today": available_today,
            "active_bookings": active_bookings,
            "estimated_revenue": estimated_revenue,
        },
        today=today,
    )


@admin_bp.route("/rooms/new", methods=["POST"])
@admin_required
def create_room():
    room_number = sanitize_text(request.form.get("room_number"), 20)
    name = sanitize_text(request.form.get("name"), 120)
    room_type = sanitize_text(request.form.get("room_type"), 30)
    price = parse_positive_float(
        request.form.get("price_per_night"), min_val=20.0, max_val=15000.0
    )
    capacity = parse_positive_int(request.form.get("capacity"), min_val=1, max_val=12)
    bed_config = sanitize_text(request.form.get("bed_config"), 80) or "1 King Bed"
    size_sqft = parse_positive_int(request.form.get("size_sqft"), min_val=100, max_val=5000) or 350
    description = sanitize_text(request.form.get("description"), 600)
    amenities = sanitize_text(request.form.get("amenities"), 300)
    status = sanitize_text(request.form.get("status", "available"), 20)

    if not room_number or not name or room_type not in ROOM_TYPES or price is None or capacity is None:
        flash("Please provide valid room number, name, type, price, and capacity.", "error")
        return redirect(url_for("admin.dashboard"))

    if status not in ROOM_STATUSES:
        status = "available"

    if Room.query.filter_by(room_number=room_number).first():
        flash(f"Room {room_number} already exists.", "warning")
        return redirect(url_for("admin.dashboard"))

    room = Room(
        room_number=room_number,
        name=name,
        room_type=room_type,
        price_per_night=price,
        capacity=capacity,
        bed_config=bed_config,
        size_sqft=size_sqft,
        description=description or "Thoughtfully appointed boutique guest room.",
        amenities=amenities or "High-Speed Wi-Fi, Rain Shower, Smart TV",
        image_url=DEFAULT_IMAGE_BY_TYPE.get(room_type, "/static/images/room_standard.jpg"),
        status=status,
    )
    db.session.add(room)
    db.session.commit()

    flash(f"Room {room.room_number} ({room.name}) added to inventory.", "success")
    return redirect(url_for("admin.dashboard"))


@admin_bp.route("/rooms/<int:room_id>/edit", methods=["POST"])
@admin_required
def edit_room(room_id: int):
    room = db.session.get(Room, room_id)
    if not room:
        flash("Room not found.", "error")
        return redirect(url_for("admin.dashboard"))

    name = sanitize_text(request.form.get("name"), 120)
    room_type = sanitize_text(request.form.get("room_type"), 30)
    price = parse_positive_float(
        request.form.get("price_per_night"), min_val=20.0, max_val=15000.0
    )
    capacity = parse_positive_int(request.form.get("capacity"), min_val=1, max_val=12)
    status = sanitize_text(request.form.get("status"), 20)
    description = sanitize_text(request.form.get("description"), 600)
    amenities = sanitize_text(request.form.get("amenities"), 300)

    if not name or room_type not in ROOM_TYPES or price is None or capacity is None or status not in ROOM_STATUSES:
        flash("Invalid room update details submitted.", "error")
        return redirect(url_for("admin.dashboard"))

    room.name = name
    room.room_type = room_type
    room.price_per_night = price
    room.capacity = capacity
    room.status = status
    if description:
        room.description = description
    if amenities:
        room.amenities = amenities

    db.session.commit()
    flash(f"Updated Room {room.room_number} ({room.name}).", "success")
    return redirect(url_for("admin.dashboard"))


@admin_bp.route("/rooms/<int:room_id>/status", methods=["POST"])
@admin_required
def quick_room_status(room_id: int):
    room = db.session.get(Room, room_id)
    if not room:
        flash("Room not found.", "error")
        return redirect(url_for("admin.dashboard"))

    status = sanitize_text(request.form.get("status"), 20)
    if status not in ROOM_STATUSES:
        flash("Invalid room status.", "error")
        return redirect(url_for("admin.dashboard"))

    room.status = status
    db.session.commit()
    flash(f"Room {room.room_number} marked {status}.", "success")
    return redirect(url_for("admin.dashboard"))


@admin_bp.route("/bookings/<int:booking_id>/cancel", methods=["POST"])
@admin_required
def admin_cancel_booking(booking_id: int):
    booking = db.session.get(Booking, booking_id)
    if not booking:
        flash("Booking not found.", "error")
        return redirect(url_for("admin.dashboard"))

    if booking.status != "confirmed":
        flash("Only confirmed reservations can be cancelled.", "warning")
        return redirect(url_for("admin.dashboard"))

    booking.status = "cancelled"
    db.session.commit()
    flash(f"Booking {booking.confirmation_code} cancelled by reception.", "success")
    return redirect(url_for("admin.dashboard"))


@admin_bp.route("/bookings/<int:booking_id>/complete", methods=["POST"])
@admin_required
def admin_complete_booking(booking_id: int):
    booking = db.session.get(Booking, booking_id)
    if not booking:
        flash("Booking not found.", "error")
        return redirect(url_for("admin.dashboard"))

    if booking.status != "confirmed":
        flash("Only confirmed reservations can be marked completed.", "warning")
        return redirect(url_for("admin.dashboard"))

    booking.status = "completed"
    db.session.commit()
    flash(f"Booking {booking.confirmation_code} marked as checked out.", "success")
    return redirect(url_for("admin.dashboard"))
