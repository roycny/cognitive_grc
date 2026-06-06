# Cognitive GRC

An AI-driven Governance, Risk, and Compliance (GRC) platform. It provides
secure authentication, user management, audit & issue tracking, a metrics
dashboard, activity logging, and configurable AI model settings.

## Tech Stack

### Backend
- **Framework:** FastAPI (Python 3.11+)
- **Database:** PostgreSQL with SQLAlchemy ORM
- **Migrations:** Alembic
- **Cache & Sessions:** Redis (rate-limiting, refresh-token store, token revocation)
- **Authentication:** JWT with BCrypt, Role-Based Access Control (Admin, Editor, Auditor, Viewer)
- **Security:** Rotating refresh tokens, account lockout, rate limiting via SlowAPI, and security headers
- **Audit Logging:** Non-blocking asynchronous activity logs

### Frontend
- **Framework:** React 18 with TypeScript
- **Bundler:** Vite
- **UI:** Material UI (MUI)
- **Icons:** Lucide React & MUI Icons
- **Routing & Data:** React Router, Axios
- **Reporting:** jsPDF & jspdf-autotable

---

## Features

### Authentication & secure sessions
- JWT **access tokens (30 min)** and **refresh tokens (7 days)** stored exclusively in
  `httpOnly; SameSite=Lax` cookies — never in `localStorage` or JavaScript-accessible memory.
- The frontend sends cookies automatically (`withCredentials: true`); no token is read or
  written client-side.
- **Transparent silent refresh** via a 401 response interceptor.
- **Server-side revocation** on logout (Redis), with **rotating refresh tokens** invalidated on every use.
- Account lockout after repeated failed logins; per-route rate limiting.

### Role-based access control
Four roles — **Admin, Editor, Auditor, Viewer**. Viewers get read-only access; admin-only
actions (user management, log access) are enforced on the API.

### Dashboard
A metrics overview summarizing audit and issue health — active engagements, closed cycles,
open/past-due findings, total/open issues, high-risk open issues, and overdue items.

### Audit & Exam Tracker
Create, edit, and delete audits with inline editing, grouped by status. Tracks audit type,
schedule, request counts, walkthroughs, findings (total / open / past-due), key risks, and
auditor concerns.

### Issue Tracker
Create, edit, and delete issues with inline editing, grouping by type, and full-text search.
Tracks issue type, status, risk rating, owner, identified/target dates, description, and
remediation plan.

### User Management
Admin interface to create, update, deactivate, and delete users and assign roles.

### Activity Logging
An admin log viewer over all recorded actions, with filtering (search, action, user,
resource type, date range), pagination, and **CSV export**.

### AI Settings
Choose the AI model used by the platform — a cloud model or a locally hosted model
auto-discovered from a local LLM runtime — with graceful fallback when none is available.

---

## API Overview

### Authentication — `/auth`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/token` | Log in (OAuth2 password flow); sets httpOnly cookies |
| POST | `/auth/refresh` | Exchange a refresh token for a new access token (rotating) |
| POST | `/auth/logout` | Revoke the current tokens and clear cookies |
| POST | `/auth/change-password` | Change the signed-in user's password |

### Users — `/users`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/me` | Get the signed-in user |
| GET | `/users/` | List users (Admin only) |
| POST | `/users/` | Create a user (Admin only) |
| PUT | `/users/{user_id}` | Update a user (Admin only) |
| DELETE | `/users/{user_id}` | Delete a user (Admin only) |

### Audits — `/audits`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/audits/` | List audits |
| POST | `/audits/` | Create an audit |
| PUT | `/audits/{audit_id}` | Update an audit |
| DELETE | `/audits/{audit_id}` | Delete an audit |

### Issues — `/issues`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/issues/` | List issues |
| POST | `/issues/` | Create an issue |
| PUT | `/issues/{issue_id}` | Update an issue |
| DELETE | `/issues/{issue_id}` | Delete an issue |

### Activity Logs — `/audit-logs`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/audit-logs/` | List logs with filters & pagination (Admin only) |
| GET | `/audit-logs/export/csv` | Export filtered logs as CSV (Admin only) |

### AI — `/ai`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/ai/ollama-models` | List locally available AI models (empty if none) |

### Data models
- `User` — credentials, role, active flag, and lockout tracking. Roles: `ADMIN`, `EDITOR`, `AUDITOR`, `VIEWER`.
- `Audit` — audit/exam records: type, schedule, request/finding counts, key risks, concerns.
- `Issue` — issue records: type, status, risk rating, owner, dates, description, remediation plan.
- `AuditLog` — append-only activity log written from a background task.

The `users`, `audits`, and `issues` tables are created by Alembic migrations; the
`audit_logs` table is auto-created at application startup.

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
│   │   ├── models/                 # user, audit, issue, audit_log
│   │   ├── schemas/                # Pydantic schemas
│   │   ├── routers/                # auth, users, audits, issues, audit_logs, ai
│   │   └── services/               # audit_log_service
│   ├── alembic/                    # Migrations
│   ├── create_initial_user.py      # Bootstrap an admin user
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   └── src/
│       ├── api/                    # axios client (silent refresh) + helpers
│       ├── auth/                   # AuthContext (cookie-based session)
│       ├── components/             # Layout, ProtectedRoute, shared inputs
│       ├── pages/                  # Login, Dashboard, Audits, Issues,
│       │                           #   UserManagement, Logging, Settings
│       ├── theme.ts                # MUI theme
│       └── types.ts                # shared TypeScript types
└── docker-compose.yml              # db, redis, backend, frontend
```

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
