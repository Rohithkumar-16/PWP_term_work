"""Guest-facing catalog, real-time availability check, booking, and My Bookings routes."""

from __future__ import annotations

from datetime import date, timedelta

from flask import (
    Blueprint,
    current_app,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    url_for,
)

from app import db, limiter
from app.models import Booking, ROOM_TYPES, Room, generate_confirmation_code
from app.routes.auth import get_current_user, login_required
from app.validators import (
    is_valid_email,
    parse_positive_float,
    parse_positive_int,
    sanitize_text,
    validate_date_range,
)

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def index():
    today = date.today()
    default_ci = (today + timedelta(days=1)).isoformat()
    default_co = (today + timedelta(days=3)).isoformat()

    check_in_str = request.args.get("check_in", default_ci)
    check_out_str = request.args.get("check_out", default_co)
    room_type = sanitize_text(request.args.get("room_type", "All"), 30)
    guests = parse_positive_int(request.args.get("guests"), min_val=1, max_val=8) or 1
    max_price = parse_positive_float(
        request.args.get("max_price"), min_val=50.0, max_val=5000.0
    )

    check_in, check_out, date_error = validate_date_range(
        check_in_str, check_out_str, require_future_or_today=True
    )
    if date_error:
        flash(date_error, "warning")
        check_in = today + timedelta(days=1)
        check_out = today + timedelta(days=3)

    query = Room.query.filter(Room.capacity >= guests)
    if room_type in ROOM_TYPES:
        query = query.filter(Room.room_type == room_type)
    if max_price is not None:
        query = query.filter(Room.price_per_night <= max_price)

    rooms = query.order_by(Room.price_per_night.asc()).all()

    room_cards = []
    for room in rooms:
        is_free = room.is_available_for_dates(check_in, check_out)
        nights = (check_out - check_in).days
        pricing = Booking.calculate_pricing(
            room.price_per_night,
            nights,
            current_app.config["TAX_RATE"],
            current_app.config["SERVICE_FEE"],
        )
        room_cards.append(
            {
                "room": room,
                "available_for_dates": is_free,
                "pricing": pricing,
            }
        )

    return render_template(
        "index.html",
        room_cards=room_cards,
        check_in=check_in.isoformat(),
        check_out=check_out.isoformat(),
        guests=guests,
        room_type=room_type,
        max_price=int(max_price) if max_price else "",
        room_types=ROOM_TYPES,
        min_date=today.isoformat(),
        tax_rate_pct=int(current_app.config["TAX_RATE"] * 100),
        service_fee=current_app.config["SERVICE_FEE"],
    )


@main_bp.route("/api/rooms/availability", methods=["GET"])
def api_room_availability():
    """Real-time JSON endpoint checking room availability and itemized pricing."""
    room_id = parse_positive_int(request.args.get("room_id"), min_val=1, max_val=100000)
    guest_count = parse_positive_int(request.args.get("guests"), min_val=1, max_val=10) or 1
    check_in, check_out, date_error = validate_date_range(
        request.args.get("check_in"),
        request.args.get("check_out"),
        require_future_or_today=True,
    )

    if date_error or not check_in or not check_out:
        return jsonify({"available": False, "error": date_error}), 400

    if room_id is None:
        return jsonify({"available": False, "error": "Invalid room selected."}), 400

    room = db.session.get(Room, room_id)
    if not room:
        return jsonify({"available": False, "error": "Room not found."}), 404

    if guest_count > room.capacity:
        return (
            jsonify(
                {
                    "available": False,
                    "error": f"This room accommodates up to {room.capacity} guests.",
                }
            ),
            400,
        )

    available = room.is_available_for_dates(check_in, check_out)
    nights = (check_out - check_in).days
    pricing = Booking.calculate_pricing(
        room.price_per_night,
        nights,
        current_app.config["TAX_RATE"],
        current_app.config["SERVICE_FEE"],
    )

    return jsonify(
        {
            "available": available,
            "room_id": room.id,
            "room_name": room.name,
            "room_number": room.room_number,
            "status": room.status,
            "pricing": pricing,
            "message": (
                "Available for your selected dates."
                if available
                else "Not available for these dates (already booked or in maintenance)."
            ),
        }
    )


@main_bp.route("/book/<int:room_id>", methods=["POST"])
@login_required
@limiter.limit("15 per minute")
def create_booking(room_id: int):
    """Create a confirmed booking after atomic overlap verification."""
    user = get_current_user()
    assert user is not None

    room = db.session.get(Room, room_id)
    if not room:
        flash("Selected room was not found.", "error")
        return redirect(url_for("main.index"))

    check_in, check_out, date_error = validate_date_range(
        request.form.get("check_in"),
        request.form.get("check_out"),
        require_future_or_today=True,
    )
    if date_error or not check_in or not check_out:
        flash(date_error or "Invalid booking dates.", "error")
        return redirect(url_for("main.index"))

    guest_count = parse_positive_int(
        request.form.get("guest_count"), min_val=1, max_val=room.capacity
    )
    if guest_count is None:
        flash(f"Guest count must be between 1 and {room.capacity}.", "error")
        return redirect(url_for("main.index"))

    guest_name = sanitize_text(request.form.get("guest_name") or user.full_name, 120)
    guest_email = sanitize_text(request.form.get("guest_email") or user.email, 160).lower()
    special_requests = sanitize_text(request.form.get("special_requests"), 400)

    if len(guest_name) < 2 or not is_valid_email(guest_email):
        flash("Please provide a valid primary guest name and email.", "error")
        return redirect(url_for("main.index"))

    if not room.is_available_for_dates(check_in, check_out):
        flash(
            f"{room.name} is no longer available for {check_in} to {check_out}. Please choose different dates.",
            "error",
        )
        return redirect(
            url_for(
                "main.index",
                check_in=check_in.isoformat(),
                check_out=check_out.isoformat(),
                guests=guest_count,
            )
        )

    nights = (check_out - check_in).days
    pricing = Booking.calculate_pricing(
        room.price_per_night,
        nights,
        current_app.config["TAX_RATE"],
        current_app.config["SERVICE_FEE"],
    )

    code = generate_confirmation_code()
    while Booking.query.filter_by(confirmation_code=code).first() is not None:
        code = generate_confirmation_code()

    booking = Booking(
        confirmation_code=code,
        user_id=user.id,
        room_id=room.id,
        guest_name=guest_name,
        guest_email=guest_email,
        guest_count=guest_count,
        check_in=check_in,
        check_out=check_out,
        nights=nights,
        nightly_rate=pricing["nightly_rate"],
        subtotal=pricing["subtotal"],
        tax_amount=pricing["tax_amount"],
        service_fee=pricing["service_fee"],
        total_price=pricing["total_price"],
        special_requests=special_requests,
        status="confirmed",
    )
    db.session.add(booking)
    db.session.commit()

    flash(
        f"Reservation confirmed! Confirmation Code: {booking.confirmation_code}",
        "success",
    )
    return redirect(url_for("main.my_bookings", highlight=booking.confirmation_code))


@main_bp.route("/my-bookings")
@login_required
def my_bookings():
    user = get_current_user()
    assert user is not None

    today = date.today()
    bookings = (
        Booking.query.filter_by(user_id=user.id)
        .order_by(Booking.check_in.desc(), Booking.created_at.desc())
        .all()
    )

    upcoming = [
        b for b in bookings if b.status == "confirmed" and b.check_out >= today
    ]
    past_or_cancelled = [
        b for b in bookings if not (b.status == "confirmed" and b.check_out >= today)
    ]

    return render_template(
        "my_bookings.html",
        upcoming=upcoming,
        past_or_cancelled=past_or_cancelled,
        highlight=request.args.get("highlight", ""),
        today=today,
    )


@main_bp.route("/bookings/<int:booking_id>/cancel", methods=["POST"])
@login_required
def cancel_my_booking(booking_id: int):
    user = get_current_user()
    assert user is not None

    booking = db.session.get(Booking, booking_id)
    if not booking:
        flash("Booking not found.", "error")
        return redirect(url_for("main.my_bookings"))

    if booking.user_id != user.id and not user.is_admin:
        flash("You are not authorized to cancel this reservation.", "error")
        return redirect(url_for("main.my_bookings")), 403

    if booking.status != "confirmed":
        flash("Only confirmed reservations can be cancelled.", "warning")
        return redirect(url_for("main.my_bookings"))

    booking.status = "cancelled"
    db.session.commit()

    flash(
        f"Reservation {booking.confirmation_code} has been cancelled and room availability updated.",
        "success",
    )
    return redirect(url_for("main.my_bookings"))
