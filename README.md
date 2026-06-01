# Cognitive GRC

A barebones starter for building a Governance, Risk, and Compliance (GRC)
application. It ships with authentication, user management, and audit logging
already wired up.

## Tech Stack

### Backend
- **Framework:** FastAPI (Python 3.11+)
- **Database:** PostgreSQL with SQLAlchemy ORM
- **Migrations:** Alembic
- **Cache & Sessions:** Redis (rate-limiting, refresh-token store, token revocation)
- **Authentication:** JWT with BCrypt, Role-Based Access Control (Admin, Editor, Auditor, Viewer)
- **Security:** Rotating refresh tokens, account lockout, rate limiting via SlowAPI, and security headers
- **Audit Logging:** Non-blocking asynchronous audit logs

### Frontend
- **Framework:** React 18 with TypeScript
- **Bundler:** Vite

> The frontend is the stock Vite + React starter — no application modules are
> built yet. Add your own as you develop.

---

## What's included

### Authentication (`/auth`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/token` | Log in (OAuth2 password flow); sets httpOnly cookies and returns tokens |
| POST | `/auth/refresh` | Exchange a refresh token for a new access token (rotating) |
| POST | `/auth/logout` | Revoke the current tokens and clear cookies |
| POST | `/auth/change-password` | Change the signed-in user's password |

### Users (`/users`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/me` | Get the signed-in user |
| POST | `/users/` | Create a user (Admin only) |
| GET | `/users/` | List users (Admin only) |
| PUT | `/users/{user_id}` | Update a user (Admin only) |
| DELETE | `/users/{user_id}` | Delete a user (Admin only) |

### Data models
- `User` — credentials, role, active flag, and lockout tracking. Roles: `ADMIN`, `EDITOR`, `AUDITOR`, `VIEWER`.
- `AuditLog` — append-only activity log written from a background task.

The `users` table is created by the Alembic migration; the `audit_logs` table is
auto-created at application startup.

---

## Project structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, middleware, router wiring
│   │   ├── database.py             # SQLAlchemy engine/session + Base
│   │   ├── auth.py                 # JWT, password hashing, current-user deps
│   │   ├── rate_limit.py           # SlowAPI limiter (Redis-backed)
│   │   ├── models/                 # SQLAlchemy models (user, audit_log)
│   │   ├── schemas/                # Pydantic schemas (user, token)
│   │   ├── routers/                # API routers (auth, users)
│   │   └── services/               # audit_log_service
│   ├── alembic/                    # Migrations (versions/0001_initial_users.py)
│   ├── create_initial_user.py      # Bootstrap an admin user
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                       # Stock Vite + React + TypeScript starter
└── docker-compose.yml              # db, redis, backend, frontend
```

### Adding a new module
1. Add a model in `app/models/` (and import it in `app/models/__init__.py`).
2. Add Pydantic schemas in `app/schemas/`.
3. Add a router in `app/routers/` and register it in `app/main.py`.
4. Generate a migration: `alembic revision --autogenerate -m "add <thing>"`, then `alembic upgrade head`.

---

## Getting Started

### Prerequisites
- **Docker & Docker Compose** (recommended)
- **Node.js** (v18+) & **npm** (for local frontend development)
- **Python 3.11+** & **pip** (for local backend development)

### Configuration

Copy the environment templates before starting:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

**Backend (`backend/.env`):**
- `SECRET_KEY`: Secret for signing JWTs. Generate with `python -c "import secrets; print(secrets.token_hex(32))"`.
- `DATABASE_URL`: PostgreSQL connection string (host `db` under Docker, `localhost` for native dev).
- `REDIS_URL`: Redis connection string (host `redis` under Docker, `localhost` for native dev).
- `ALLOWED_ORIGINS`: Comma-separated CORS origins (defaults to the local Vite dev server).
- `ENABLE_DOCS`: Set to `true` to expose `/docs`, `/redoc`, and `/openapi.json` (development only).
- `ADMIN_PASSWORD`: Used by `create_initial_user.py` to bootstrap the first admin.

**Frontend (`frontend/.env`):**
- `VITE_API_URL`: Backend base URL (default `http://localhost:8000`).

---

## Running with Docker Compose (Recommended)

Stand up PostgreSQL, Redis, the backend API, and the Vite frontend:

```bash
docker compose up --build
```

- **Backend API:** http://localhost:8000 — Swagger at http://localhost:8000/docs (when `ENABLE_DOCS=true`)
- **Frontend App:** http://localhost:5173

The backend runs `alembic upgrade head` automatically on start.

Create an initial admin user:
```bash
docker compose exec -e ADMIN_PASSWORD='YourStrongPass1' backend python create_initial_user.py
```

---

## Local Development (Without Docker)

### 1. External services
Run **PostgreSQL** and **Redis** matching your `backend/.env`.

### 2. Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
Navigate to http://localhost:5173.
