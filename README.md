# The Halcyon Hotel — Room Booking System

A complete, deploy-ready Hotel Room Booking & Reception Management web application built with **Python (Flask + SQLAlchemy)**, **SQLite** (with seamless **PostgreSQL** support via `DATABASE_URL`), **Tailwind CSS**, and **Vanilla JavaScript**.

---

## Project Structure

```text
.
├── app/
│   ├── __init__.py          # Flask app factory, CSRF, rate limiter, error handlers
│   ├── models.py            # User, Room, Booking SQLAlchemy models & overlap checks
│   ├── seed.py              # Idempotent sample rooms, guest/admin accounts & stays
│   ├── validators.py        # Input validation, date range checks, safe redirect checks
│   ├── routes/
│   │   ├── auth.py          # /login, /register, /logout & role decorators
│   │   ├── main.py          # Catalog (/), /api/rooms/availability, /book, /my-bookings
│   │   └── admin.py         # /admin KPIs, Room CRUD, all-booking management
│   ├── static/
│   │   ├── images/          # Curated room & lobby photography
│   │   └── js/app.js        # Live availability fetch, pricing modal, toasts
│   └── templates/           # Jinja2 templates (base, catalog, auth, bookings, admin, errors)
├── config.py                # Dev/Prod configuration & DATABASE_URL normalization
├── run.py                   # Local Flask runner & `init-db` CLI command
├── wsgi.py                  # Gunicorn WSGI entry point
├── requirements.txt         # Python dependencies
├── Procfile                 # Gunicorn start command for Render / Railway
├── render.yaml              # Render blueprint (Web Service + PostgreSQL)
└── .env.example             # Environment variable template
```

---

## Local Setup (Python Virtual Environment)

1. **Create and activate a virtual environment**

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate        # macOS / Linux
   # .venv\Scripts\activate         # Windows PowerShell
   ```

2. **Install Python dependencies**

   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Update `SECRET_KEY` and `ADMIN_PASSWORD` in `.env` (for local development, safe defaults are provided automatically).

4. **Initialize & seed the SQLite database**

   ```bash
   flask --app run.py init-db
   ```

5. **Run the Flask application**

   ```bash
   python run.py
   ```

   Open `http://127.0.0.1:5000` in your browser.

---

## Demo Accounts (Local Development)

- **Guest Account**: `guest@halcyonhotel.com` / `GuestPass2026!`
- **Admin / Receptionist Account**: `admin@halcyonhotel.com` / `AdminPass2026!`

One-click **Demo Guest** and **Demo Admin** fill buttons are available on `/login` in development mode.

---

## Security Highlights

- **Password Hashing**: All passwords are hashed via Werkzeug (`scrypt`/`pbkdf2`) — never stored in plain text.
- **Role-Based Access Control**: Protected guest & admin routes enforce `@login_required`, `@admin_required`, and booking ownership checks.
- **SQL Injection Protection**: All database queries use parameterized SQLAlchemy ORM bindings.
- **Session & CSRF Protection**: `HttpOnly`, `SameSite=Lax`, and production `Secure` session cookies, plus `Flask-WTF` CSRF tokens on every state-changing form.
- **Rate Limiting & Safe Errors**: Auth and booking endpoints are rate-limited (`Flask-Limiter`), and 400/403/404/429/500 pages hide raw stack traces.

---

## Deploying to Render or Railway

1. Push this repository to GitHub.
2. On **Render**, connect the repository (the included `render.yaml` provisions a Python Web Service + PostgreSQL database automatically), or configure manually:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn "wsgi:app" --bind 0.0.0.0:$PORT --workers 2 --threads 4`
3. Set environment variables in your host dashboard:
   - `FLASK_ENV=production`
   - `SECRET_KEY=<random-64-char-hex-string>`
   - `DATABASE_URL=<your-postgresql-connection-string>`
   - `ADMIN_EMAIL=admin@halcyonhotel.com`
   - `ADMIN_PASSWORD=<strong-production-password>`
