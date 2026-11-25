"""Local development server and database CLI entry point."""

import os
import click

from app import create_app, db
from app.seed import seed_database

app = create_app()


@app.cli.command("init-db")
def init_db_command() -> None:
    """Create database tables and seed initial demo data."""
    with app.app_context():
        db.create_all()
        seed_database()
    click.echo("Database initialized and seeded.")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV", "development").lower() != "production"
    app.run(host="0.0.0.0", port=port, debug=debug)
