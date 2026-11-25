"""Flask application factory and core extensions."""

from __future__ import annotations

from flask import Flask, jsonify, render_template, request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_sqlalchemy import SQLAlchemy
from flask_wtf.csrf import CSRFError, CSRFProtect

from config import Config

db = SQLAlchemy()
csrf = CSRFProtect()
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[Config.RATELIMIT_DEFAULT],
    storage_uri=Config.RATELIMIT_STORAGE_URI,
)


def create_app(config_class: type[Config] = Config) -> Flask:
    """Create and configure the Flask application instance."""
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    csrf.init_app(app)
    limiter.init_app(app)

    from app.routes.auth import auth_bp, get_current_user
    from app.routes.main import main_bp
    from app.routes.admin import admin_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(admin_bp)

    @app.context_processor
    def inject_globals() -> dict:
        return {"current_user": get_current_user()}

    @app.after_request
    def apply_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        if app.config.get("IS_PRODUCTION"):
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response

    _register_error_handlers(app)

    with app.app_context():
        from app import models  # noqa: F401

        db.create_all()
        from app.seed import seed_database

        seed_database()

    return app


def _wants_json_response() -> bool:
    return request.path.startswith("/api/") or (
        request.accept_mimetypes.best == "application/json"
    )


def _register_error_handlers(app: Flask) -> None:
    def render_error(status_code: int, title: str, message: str):
        if _wants_json_response():
            return jsonify({"error": title, "message": message}), status_code
        return (
            render_template(
                "errors/error.html",
                status_code=status_code,
                title=title,
                message=message,
            ),
            status_code,
        )

    @app.errorhandler(400)
    def bad_request(error):
        return render_error(
            400, "Invalid Request", "Please check your submitted inputs and try again."
        )

    @app.errorhandler(403)
    def forbidden(error):
        return render_error(
            403,
            "Access Restricted",
            "You do not have permission to view or modify this resource.",
        )

    @app.errorhandler(404)
    def not_found(error):
        return render_error(
            404,
            "Page Not Found",
            "The room or reservation page you requested could not be found.",
        )

    @app.errorhandler(429)
    def rate_limited(error):
        return render_error(
            429,
            "Too Many Requests",
            "You have made too many requests in a short period. Please wait a moment and try again.",
        )

    @app.errorhandler(CSRFError)
    def csrf_error(error):
        return render_error(
            400,
            "Session Security Check Failed",
            "Your form session expired. Please refresh the page and submit again.",
        )

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        return render_error(
            500,
            "Unexpected Server Error",
            "Something went wrong on our end. Please try again in a moment.",
        )
