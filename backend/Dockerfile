FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN groupadd -r app && useradd -r -g app app

COPY . .
RUN chown -R app:app /app

USER app

EXPOSE 8000

# Apply migrations, then start the API.
# Production-safe by default: no --reload (which enables arbitrary code execution
# if an attacker can write into the container) and multiple workers.
# docker-compose overrides this command with --reload for local development.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4"]
