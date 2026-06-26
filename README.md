# Cognitive GRC

An AI-driven Governance, Risk, and Compliance (GRC) platform. It provides
secure authentication, user management, audit & issue tracking, key risk
indicator (KRI) monitoring, GLBA information security program assessments, a
metrics dashboard, activity logging, and configurable AI model settings.

It also ships a suite of **AI Tools** — a SIEM/SOC detection-script agent, a
Software Composition Analysis (SCA) agent backed by OSV-Scanner, a quantified
project risk assessment module, a policy gap analyst that assesses policy
documents against ten control frameworks, and an audit dispute agent that helps
respond to audit requests and dispute audit observations with OCC CSW and NIST
CSF 2.0 control references — all driven by either a locally hosted Ollama model
or a cloud model, with graceful fallback when no provider is configured.

## Tech Stack

### Backend
- **Framework:** FastAPI (Python 3.11+)
- **Database:** PostgreSQL with SQLAlchemy ORM
- **Migrations:** Alembic
- **Cache & Sessions:** Redis (rate-limiting, refresh-token store, token revocation)
- **Authentication:** JWT with BCrypt, Role-Based Access Control (Admin, Editor, Auditor, Viewer)
- **Security:** Rotating refresh tokens, account lockout, rate limiting via SlowAPI, security headers, and a hardened AI tooling layer (prompt-injection defenses, model-output escaping)
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

> **Tenancy model (accepted design):** Cognitive GRC is **single-tenant**. All
> authenticated users belong to one trusted organization and can see every
> audit, issue, KRI, and GLBA assessment — access is governed by *role*
> (Viewer/Editor/Auditor/Admin), not by record ownership. There is deliberately
> no per-record or per-org scoping. **Do not deploy a shared instance across
> mutually-untrusting tenants** without first adding an `organization_id` column
> to the data models and scoping every query to the caller's org.

### Dashboard
A metrics overview summarizing audit, issue, and risk health — active engagements, closed
cycles, open/past-due findings, total/open issues, high-risk open issues, overdue items, and
a Key Risk Indicator panel that surfaces RAG status by risk area.

### Audit & Exam Tracker
Create, edit, and delete audits with inline editing, grouped by status. Tracks audit type,
schedule, request counts, walkthroughs, findings (total / open / past-due), key risks, and
auditor concerns.

### Issue Tracker
Create, edit, and delete issues with inline editing, grouping by type, and full-text search.
Tracks issue type, status, risk rating, owner, identified/target dates, description, and
remediation plan.

### KRI Tracker
Maintain a register of Key Risk Indicators grouped by risk area, with inline editing and
search. Each indicator tracks owner, measurement frequency, current value, risk-appetite
threshold, RAG status, trend, and measurement date. Breach and warning counts roll up to the
dashboard.

### GLBA Assessment
Conduct GLBA Information Security Program assessments against the Interagency Guidelines
(§501(b) Safeguards) and Regulation P. A dashboard lists assessments with progress and
RAG-style outcome counts; each assessment walks 27 controls across 6 domains with separate
control-owner and assessor sections. Every field **auto-saves** to the database as you edit,
and scoring rules are enforced (e.g. an *Effective* rating requires Inspection; high-risk
controls also require Reperformance).

### User Management
Admin interface to create, update, deactivate, and delete users and assign roles.

### Activity Logging
An admin log viewer over all recorded actions, with filtering (search, action, user,
resource type, date range), pagination, and **CSV export**.

### AI Settings
Choose the AI model used by the platform — a cloud model or a locally hosted model
auto-discovered from a local LLM runtime — with graceful fallback when none is available.

### AI Tools — SIEM Script Agent
Generate production-ready SIEM/SOC detection content from a natural-language goal:
**IBM QRadar AQL queries**, **Python API scripts**, **YARA rules**, or **Sigma rules**.
Supply the investigation goal, timeframe, log sources, and optional IOCs, and the agent
returns the raw artifact with inline comments. A chat assistant then **refines** the
generated script conversationally while keeping it syntactically valid. Available to
Editors and Admins; rate-limited per route.

### AI Tools — SCA Agent (Software Composition Analysis)
Upload dependency manifests / lockfiles (`pom.xml`, `requirements.txt`, `yarn.lock`,
`poetry.lock`, `package-lock.json`, `composer.lock`) or a GitHub SPDX SBOM (`.json`) and
scan them with **Google OSV-Scanner**. The AI then triages the findings — filtering noise
and dev-only dependencies, flagging known-exploited CVEs, and analyzing exploit
conditions — producing an executive summary, an overall risk level, prioritized
recommendations, and a per-CVE triage table (*Must Fix* / *Verify Reachability* /
*Ignore-Accept Risk*). Results can be **exported as a styled PDF** or **saved to an
inventory** of reports for later review.

### AI Tools — Project Risk Assessment
Run a quantified, AI-driven risk assessment over project documentation. Upload project
docs (PDF / TXT / MD) or paste text; the AI identifies discrete risks across categories
(Security, Operational, Compliance, Financial, Schedule, Third-Party, Data Privacy) and
scores each on a **5×5 Likelihood × Impact matrix** for both inherent and residual risk,
proposing existing controls, recommended mitigations, owners, and action items. The
register is fully editable, ratings are recomputed server-side from the numeric scores so
they always match the matrix, and the assessment can be **exported as a PDF report**.

### AI Tools — Policy Gap Analyst
Assess a policy document against a control framework and surface where it falls short.
Upload a policy (PDF / TXT / MD) or paste text, pick a framework, and the AI identifies
each gap — a control omitted entirely, addressed only partially, worded inconsistently, or
lacking specificity — with a **severity** (High / Medium / Low), the exact framework
requirement it maps to, and an actionable remediation recommendation. Selected gaps can be
**saved to a register** and reviewed later. Ten frameworks are supported out of the box:
**NIST CSF 2.0**, **NIST SP 800-53 Rev. 5**, **ISO/IEC 27001:2022**, **SOC 2 (Trust
Services Criteria)**, **PCI DSS v4.0**, **CIS Controls v8**, **HIPAA Security Rule**,
**GLBA Safeguards Rule**, **GDPR**, and **OCC Cybersecurity Supervision (CSW)**.

### AI Tools — Audit Dispute Agent
Analyze an audit request or audit observation and receive AI-generated guidance
grounded in **OCC Cybersecurity Supervision Work Program (CSW)** domains and
**NIST CSF 2.0** controls. Paste the audit text or upload a document (PDF / TXT / MD)
and select the type:

- **Audit Request mode** — maps the information request to CSW / NIST controls, lists
  the exact procedures, evidence artifacts, and documents to gather, and flags areas
  that need special attention to avoid follow-up findings.
- **Audit Observation mode** — builds a dispute / mitigation response explaining why
  the residual risk is lower than assessed, citing compensating and mitigating controls
  with framework references.

Results are organized into three collapsible sections — **Guidance & Recommendations**
(priority-sorted), **Evidence & Procedures** (with attention points), and **Framework
Control References** (OCC CSW + NIST CSF 2.0). Responses can be **saved** and reviewed
later from the Saved Responses tab.

### AI Tools — security & prompt-injection hardening
Every AI Tool feeds **untrusted** user content (uploaded policy/audit/project documents,
OSV-Scanner output driven by an uploaded manifest, free-text goals, threat-intel IOCs, and
chat history) into the model. The tooling layer applies defense-in-depth so a hostile
document cannot hijack the model or the report pipeline:

- **System / data separation** — trusted instructions are delivered out-of-band from user
  content (Ollama `system` field / Gemini `system_instruction`), telling the model that all
  delimited blocks are inert *data to analyze*, never commands to obey.
- **Delimiter-breakout neutralization** — every untrusted field is length-capped and has its
  delimiter and role markers (`</DOCUMENT>`, `<SYSTEM>`, `<USER>`, …) defanged, so embedded
  text cannot close a block or forge a fake system/instruction section.
- **SIEM output guardrails** — generated detections are constrained to defensive, read-only
  content; destructive, offensive, or data-exfiltrating code is refused even if requested.
- **Model-name validation** — the user-selected model id is constrained to a safe charset
  before it reaches the provider SDK.
- **Report-pipeline escaping** — all AI- and scan-derived strings are escaped before being
  rendered into PDF report markup, preventing markup injection from crafted package names or
  model output.
- **Output treated as untrusted** — model responses are schema-validated and coerced before
  use; generated SIEM scripts are still intended for analyst review before execution.

These measures reduce — but do not fully eliminate — prompt-injection risk, which is inherent
to LLM-backed features.

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

### KRIs — `/kris`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/kris/` | List key risk indicators |
| POST | `/kris/` | Create a KRI |
| PUT | `/kris/{kri_id}` | Update a KRI |
| DELETE | `/kris/{kri_id}` | Delete a KRI |

### GLBA Assessments — `/glba`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/glba/assessments` | List assessments with progress & outcome counts |
| POST | `/glba/assessments` | Create an assessment (seeds a response row per control) |
| GET | `/glba/assessments/{id}` | Get an assessment with all control responses |
| PUT | `/glba/assessments/{id}` | Update assessment header / status |
| PATCH | `/glba/assessments/{id}/responses/{control_id}` | Auto-save one control's fields |
| DELETE | `/glba/assessments/{id}` | Delete an assessment |

### Activity Logs — `/audit-logs`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/audit-logs/` | List logs with filters & pagination (Admin only) |
| GET | `/audit-logs/export/csv` | Export filtered logs as CSV (Admin only) |

### AI — `/ai`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/ai/ollama-models` | List locally available AI models (empty if none) |

### AI Tools — `/ai-tools` (SIEM & SCA agents)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/ai-tools/siem-agent/generate` | Generate a SIEM detection script from a goal |
| POST | `/ai-tools/siem-agent/refine` | Refine a generated script via the chat assistant |
| POST | `/ai-tools/sca-agent/scan` | Scan uploaded manifests/lockfiles with OSV-Scanner |
| POST | `/ai-tools/sca-agent/analyze` | AI triage of scan findings (summary, risk, findings) |
| POST | `/ai-tools/sca-agent/report` | Generate and download a PDF SCA report |
| POST | `/ai-tools/sca-agent/save` | Save an SCA report to the inventory |
| GET | `/ai-tools/sca-agent/history` | List saved SCA reports |
| GET | `/ai-tools/sca-agent/history/{report_id}` | Get a saved SCA report |
| DELETE | `/ai-tools/sca-agent/history/{report_id}` | Delete a saved SCA report |
| GET | `/ai-tools/policy-gap/frameworks` | List the control frameworks the analyst supports |
| POST | `/ai-tools/policy-gap/assess` | Assess an uploaded/pasted policy against a framework |
| POST | `/ai-tools/policy-gap/gaps` | Save a batch of identified gaps to the register |
| GET | `/ai-tools/policy-gap/gaps` | List saved policy gaps |
| DELETE | `/ai-tools/policy-gap/gaps/{gap_id}` | Delete a saved policy gap |
| POST | `/ai-tools/audit-dispute/analyze` | Analyze an audit request or observation with AI |
| POST | `/ai-tools/audit-dispute/save` | Save an analysis response |
| GET | `/ai-tools/audit-dispute/history` | List saved audit dispute responses |
| GET | `/ai-tools/audit-dispute/history/{id}` | Get a saved response |
| DELETE | `/ai-tools/audit-dispute/history/{id}` | Delete a saved response |

### Project Risk Assessments — `/project-risk`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/project-risk/assessments` | List assessments with overall ratings & open-action counts |
| POST | `/project-risk/assessments` | Create an assessment |
| GET | `/project-risk/assessments/{id}` | Get an assessment with its full risk register |
| PUT | `/project-risk/assessments/{id}` | Update the header and/or replace the register |
| DELETE | `/project-risk/assessments/{id}` | Delete an assessment (Admin only) |
| POST | `/project-risk/assessments/{id}/ai-assess` | Run an AI assessment over docs/pasted text |
| POST | `/project-risk/assessments/{id}/report` | Generate and download a PDF risk report |

### Data models
- `User` — credentials, role, active flag, and lockout tracking. Roles: `ADMIN`, `EDITOR`, `AUDITOR`, `VIEWER`.
- `Audit` — audit/exam records: type, schedule, request/finding counts, key risks, concerns.
- `Issue` — issue records: type, status, risk rating, owner, dates, description, remediation plan.
- `KRI` — key risk indicator: risk area, owner, frequency, current value, threshold, RAG status, trend.
- `GLBAAssessment` / `GLBAControlResponse` — assessment header plus one editable response row per control.
- `SCAReport` — saved Software Composition Analysis report: app name, risk level, AI summary, raw scan results, recommendations, and per-CVE findings.
- `ProjectRiskAssessment` / `ProjectRisk` — risk assessment header plus one row per identified risk (inherent/residual likelihood & impact, ratings, controls, mitigation, owner, action items).
- `PolicyAssessmentGap` — one saved policy gap: policy name, framework, requirement, gap description, recommendation, severity, and author.
- `AuditDisputeResponse` — saved audit dispute response: title, input type, risk rating, executive summary, guidance items, evidence suggestions, and OCC CSW / NIST CSF 2.0 control references.
- `AuditLog` — append-only activity log written from a background task.

The `users`, `audits`, `issues`, `kris`, GLBA assessment, SCA report, project risk,
policy gap, and audit dispute tables are created by Alembic migrations; the `audit_logs`
table is auto-created at application startup.

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
│   │   ├── models/                 # user, audit, issue, kri, glba, sca, project_risk,
│   │   │                           #   policy_gap, audit_dispute, audit_log
│   │   ├── schemas/                # Pydantic schemas
│   │   ├── routers/                # auth, users, audits, issues, kri, glba, audit_logs,
│   │   │                           #   ai, ai_tools (SIEM/SCA), project_risk, policy_gap,
│   │   │                           #   audit_dispute
│   │   └── services/               # audit_log_service, ai_service, project_risk_report
│   ├── alembic/                    # Migrations
│   ├── create_initial_user.py      # Bootstrap an admin user
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   └── src/
│       ├── api/                    # axios client (silent refresh) + helpers
│       ├── auth/                   # AuthContext (cookie-based session)
│       ├── components/             # Layout, ProtectedRoute, shared inputs
│       ├── data/                   # static reference data (GLBA control template)
│       ├── pages/                  # Login, Dashboard, Audits, Issues, KRIs,
│       │                           #   GLBA Assessments, SIEM Script Agent, SCA Agent,
│       │                           #   Policy Gap Analyst, Audit Dispute Agent,
│       │                           #   Project Risk Assessments, UserManagement,
│       │                           #   Logging, Settings
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
- **Google OSV-Scanner** on the `PATH` (required by the SCA Agent for native dev; already bundled in the backend Docker image)
- **Ollama** (optional) for the AI Tools when running a local model; alternatively configure `GEMINI_API_KEY` for the cloud provider

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
- `OLLAMA_BASE_URL`: Base URL of the local Ollama runtime used by the AI Tools (default `http://localhost:11434`).
- `GEMINI_API_KEY`: Optional. Enables the cloud AI provider for the AI Tools. Under Docker Compose it is supplied as a secret (`./secrets/gemini_api_key.txt`, git-ignored) rather than an env var. When unset, the tools use a local Ollama model and degrade gracefully.

**Frontend (`frontend/.env`):**
- `VITE_API_URL`: Backend base URL (default `http://localhost:8080` under Docker Compose, or `http://localhost:8000` for native dev).

---

## Running with Docker Compose (Recommended)

Stand up PostgreSQL, Redis, the backend API, and the Vite frontend:

```bash
docker compose up --build
```

- **Backend API:** http://localhost:8080 — Swagger at http://localhost:8080/docs (when `ENABLE_DOCS=true`)
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
