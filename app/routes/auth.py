"""Authentication blueprint and role-based access decorators."""

from __future__ import annotations

from functools import wraps

from flask import (
    Blueprint,
    current_app,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from app import db, limiter
from app.models import User
from app.validators import is_safe_redirect_url, is_valid_email, sanitize_text

auth_bp = Blueprint("auth", __name__)


def get_current_user() -> User | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    return db.session.get(User, user_id)


def login_required(view):
    """Require an authenticated session for protected routes."""

    @wraps(view)
    def wrapped(*args, **kwargs):
        user = get_current_user()
        if user is None:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required."}), 401
            flash("Please sign in to continue.", "warning")
            return redirect(url_for("auth.login", next=request.full_path.rstrip("?")))
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    """Require an authenticated receptionist/admin user."""

    @wraps(view)
    def wrapped(*args, **kwargs):
        user = get_current_user()
        if user is None:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required."}), 401
            flash("Please sign in with an admin account.", "warning")
            return redirect(url_for("auth.login", next=request.full_path.rstrip("?")))
        if not user.is_admin:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Admin privileges required."}), 403
            flash("Admin access is required for this section.", "error")
            return redirect(url_for("main.index"))
        return view(*args, **kwargs)

    return wrapped


@auth_bp.route("/login", methods=["GET", "POST"])
@limiter.limit("20 per minute", methods=["POST"])
def login():
    if get_current_user():
        return redirect(url_for("main.index"))

    if request.method == "POST":
        email = sanitize_text(request.form.get("email"), 160).lower()
        password = request.form.get("password") or ""
        next_url = request.form.get("next") or request.args.get("next")

        if not is_valid_email(email) or not password:
            flash("Please enter both a valid email address and password.", "error")
            return render_template("auth/login.html", next_url=next_url), 400

        user = User.query.filter_by(email=email).first()
        if not user or not user.check_password(password):
            flash("Invalid email or password. Please try again.", "error")
            return render_template("auth/login.html", next_url=next_url), 401

        session.clear()
        session["user_id"] = user.id
        session["user_role"] = user.role
        session.permanent = True

        flash(f"Welcome back, {user.full_name}.", "success")
        if next_url and is_safe_redirect_url(next_url):
            return redirect(next_url)
        if user.is_admin:
            return redirect(url_for("admin.dashboard"))
        return redirect(url_for("main.index"))

    return render_template(
        "auth/login.html",
        next_url=request.args.get("next", ""),
        show_demo_hint=not current_app.config.get("IS_PRODUCTION", False),
    )


@auth_bp.route("/register", methods=["GET", "POST"])
@limiter.limit("10 per minute", methods=["POST"])
def register():
    if get_current_user():
        return redirect(url_for("main.index"))

    if request.method == "POST":
        full_name = sanitize_text(request.form.get("full_name"), 120)
        email = sanitize_text(request.form.get("email"), 160).lower()
        password = request.form.get("password") or ""
        confirm_password = request.form.get("confirm_password") or ""

        if len(full_name) < 2:
            flash("Please enter your full name (at least 2 characters).", "error")
            return render_template("auth/register.html"), 400

        if not is_valid_email(email):
            flash("Please provide a valid email address.", "error")
            return render_template("auth/register.html"), 400

        if len(password) < 8:
            flash("Password must be at least 8 characters long.", "error")
            return render_template("auth/register.html"), 400

        if password != confirm_password:
            flash("Passwords do not match.", "error")
            return render_template("auth/register.html"), 400

        if User.query.filter_by(email=email).first():
            flash("An account with this email already exists. Please sign in.", "warning")
            return redirect(url_for("auth.login"))

        new_user = User(full_name=full_name, email=email, role="guest")
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()

        session.clear()
        session["user_id"] = new_user.id
        session["user_role"] = new_user.role
        session.permanent = True

        flash("Account created! You are now signed in.", "success")
        return redirect(url_for("main.index"))

    return render_template("auth/register.html")


@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    flash("You have been signed out.", "success")
    return redirect(url_for("main.index"))
