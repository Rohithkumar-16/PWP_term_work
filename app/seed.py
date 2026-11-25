"""Idempotent database seed data for demo accounts, curated rooms, and sample stays."""

from __future__ import annotations

import os
from datetime import date, timedelta

from flask import current_app

from app import db
from app.models import Booking, Room, User


def seed_database() -> None:
    """Populate initial demo users, rooms, and bookings if the database is empty."""
    is_prod = current_app.config.get("IS_PRODUCTION", False)

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@halcyonhotel.com").strip().lower()
    admin_password = os.environ.get("ADMIN_PASSWORD") or (
        None if is_prod else "AdminPass2026!"
    )

    guest_email = os.environ.get("GUEST_EMAIL", "guest@halcyonhotel.com").strip().lower()
    guest_password = os.environ.get("GUEST_PASSWORD") or (
        None if is_prod else "GuestPass2026!"
    )

    if User.query.count() == 0:
        if admin_password:
            admin_user = User(
                full_name="Clara Vance (Reception Admin)",
                email=admin_email,
                role="admin",
            )
            admin_user.set_password(admin_password)
            db.session.add(admin_user)

        if guest_password:
            guest_user = User(
                full_name="Maya Lin",
                email=guest_email,
                role="guest",
            )
            guest_user.set_password(guest_password)
            db.session.add(guest_user)

        db.session.flush()

    if Room.query.count() == 0:
        sample_rooms = [
            Room(
                room_number="101",
                name="Courtyard Standard King",
                room_type="Standard",
                price_per_night=159.00,
                capacity=2,
                bed_config="1 King Bed",
                size_sqft=320,
                description="Quiet garden-level sanctuary featuring bespoke oak millwork, organic cotton linens, rain shower, and morning light through linen drapes.",
                amenities="High-Speed Wi-Fi, Espresso Bar, Rain Shower, Smart TV, Workspace Desk",
                image_url="/static/images/room_standard.jpg",
                status="available",
            ),
            Room(
                room_number="104",
                name="Sunlit Standard Twin",
                room_type="Standard",
                price_per_night=145.00,
                capacity=2,
                bed_config="2 Twin Beds",
                size_sqft=310,
                description="Warm minimalist twin room ideal for companions or business travelers, complete with acoustic glazing and ceramic bedside lighting.",
                amenities="High-Speed Wi-Fi, Walk-in Shower, Tea Kettle, Climate Control, Safe",
                image_url="/static/images/room_standard.jpg",
                status="available",
            ),
            Room(
                room_number="202",
                name="Terrace Deluxe King",
                room_type="Deluxe",
                price_per_night=235.00,
                capacity=3,
                bed_config="1 King Bed + Lounge Sofa",
                size_sqft=460,
                description="Expansive glass doors open onto a private furnished terrace overlooking the coastal rooftops with woven lounge seating and bespoke bath amenities.",
                amenities="Private Terrace, High-Speed Wi-Fi, Espresso Bar, Robes & Slippers, Mini Bar",
                image_url="/static/images/room_deluxe.jpg",
                status="available",
            ),
            Room(
                room_number="208",
                name="Botanical Deluxe Queen",
                room_type="Deluxe",
                price_per_night=219.00,
                capacity=4,
                bed_config="2 Queen Beds",
                size_sqft=490,
                description="Generously proportioned corner room designed for families or small groups, blending sunlit oak floors with terracotta textiles and dual vanities.",
                amenities="Private Balcony, Dual Vanity, High-Speed Wi-Fi, Smart TV, Lounge Seating",
                image_url="/static/images/room_deluxe.jpg",
                status="available",
            ),
            Room(
                room_number="305",
                name="Walnut Salon Executive Suite",
                room_type="Suite",
                price_per_night=365.00,
                capacity=4,
                bed_config="1 King Bed + Sofa Bed",
                size_sqft=680,
                description="Separate living salon framed by warm walnut archways, curved boucle sofa, travertine entertaining table, and deep soaking tub.",
                amenities="Separate Salon, Soaking Tub, Complimentary Breakfast, Late Checkout, Espresso Bar",
                image_url="/static/images/room_executive.jpg",
                status="available",
            ),
            Room(
                room_number="401",
                name="Skyline Penthouse Loft",
                room_type="Suite",
                price_per_night=520.00,
                capacity=4,
                bed_config="1 California King Bed",
                size_sqft=920,
                description="Top-floor architectural showcase with wraparound skyline windows, sculptural timber ceiling, private dining nook, and concierge service.",
                amenities="Panoramic Skyline View, Private Dining Nook, Concierge Service, Soaking Tub, Welcome Champagne",
                image_url="/static/images/room_penthouse.jpg",
                status="available",
            ),
        ]
        db.session.add_all(sample_rooms)
        db.session.flush()

    if Booking.query.count() == 0:
        guest = User.query.filter_by(role="guest").first()
        rooms = {r.room_number: r for r in Room.query.all()}
        if guest and "202" in rooms and "305" in rooms and "101" in rooms:
            today = date.today()
            tax_rate = current_app.config["TAX_RATE"]
            service_fee = current_app.config["SERVICE_FEE"]

            samples = [
                (
                    "HLC-48291A",
                    rooms["202"],
                    today + timedelta(days=5),
                    today + timedelta(days=8),
                    2,
                    "confirmed",
                    "High floor quiet corner if available.",
                ),
                (
                    "HLC-91042B",
                    rooms["305"],
                    today,
                    today + timedelta(days=2),
                    2,
                    "confirmed",
                    "Celebrating an anniversary.",
                ),
                (
                    "HLC-30517C",
                    rooms["101"],
                    today - timedelta(days=12),
                    today - timedelta(days=10),
                    1,
                    "completed",
                    "Early check-in requested.",
                ),
            ]
            for code, room, ci, co, guests, status, notes in samples:
                nights = (co - ci).days
                pricing = Booking.calculate_pricing(
                    room.price_per_night, nights, tax_rate, service_fee
                )
                db.session.add(
                    Booking(
                        confirmation_code=code,
                        user_id=guest.id,
                        room_id=room.id,
                        guest_name=guest.full_name,
                        guest_email=guest.email,
                        guest_count=guests,
                        check_in=ci,
                        check_out=co,
                        nights=nights,
                        nightly_rate=pricing["nightly_rate"],
                        subtotal=pricing["subtotal"],
                        tax_amount=pricing["tax_amount"],
                        service_fee=pricing["service_fee"],
                        total_price=pricing["total_price"],
                        special_requests=notes,
                        status=status,
                    )
                )

    db.session.commit()
