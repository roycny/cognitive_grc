# Cognitive GRC

A modern, comprehensive Governance, Risk, and Compliance (GRC) solution designed to streamline security assessments, audit management, and issue tracking. Powered by FastAPI, React, and integrated AI.

## Tech Stack

### Backend
- **Framework:** FastAPI (Python 3.11+)
- **Database:** PostgreSQL with SQLAlchemy ORM
- **Migrations:** Alembic
- **Caching & Session:** Redis (rate-limiting, token revocation)
- **Authentication:** JWT with BCrypt, Role-Based Access Control (Admin, Editor, Auditor, Viewer)
- **Security:** Rotating refresh tokens, lockout & rate limiting via SlowAPI
- **Audit Logging:** Non-blocking asynchronous audit logs
- **AI Integrations:** Google Generative AI (Gemini) & Ollama API

### Frontend
- **Framework:** React 18 with TypeScript
- **Bundler:** Vite
- **UI Library:** Material UI (MUI) & MUI Icons
- **Icons:** Lucide React
- **Reporting:** PDF compilation using jsPDF & jspdf-autotable

---

## Getting Started

### Prerequisites
Make sure you have the following installed locally:
- **Docker & Docker Compose** (Recommended)
- **Node.js** (v18 or v20) & **npm** (for local frontend development)
- **Python 3.11+** & **pip** (for local backend development)

---

## Configuration

Before starting, prepare the environment files by copying the templates:

### Backend Configuration
```bash
cp backend/.env.example backend/.env
```
Edit `backend/.env` and supply:
- `JWT_SECRET_KEY`: A secure random secret.
- `GEMINI_API_KEY`: Your Google Gemini API key.
- `OLLAMA_BASE_URL`: URL of your local Ollama server (defaults to `http://host.docker.internal:11434` for Docker).

### Frontend Configuration
```bash
cp frontend/.env.example frontend/.env
```
Ensure `VITE_API_URL` points to your backend instance (default: `http://localhost:8000`).

---

## Running with Docker Compose (Recommended)

To stand up the database, Redis cache, backend API, and Vite frontend automatically:

```bash
docker-compose up --build
```

- **Backend API:** [http://localhost:8000/docs](http://localhost:8000/docs) (Interactive Swagger Docs)
- **Frontend App:** [http://localhost:5173](http://localhost:5173)

---

## Local Development (Without Docker)

If you prefer to run services natively on your system:

### 1. External Services
Ensure you have running instances of **PostgreSQL** and **Redis** matching the configuration in your `backend/.env`.

### 2. Run the Backend
```bash
cd backend
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations (after database tables are defined)
# alembic upgrade head

# Start FastAPI dev server
uvicorn app.main:app --reload
```

### 3. Run the Frontend
```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```
Navigate to [http://localhost:5173](http://localhost:5173) in your browser.
