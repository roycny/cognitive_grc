FROM python:3.11-slim

WORKDIR /app

# Install Google OSV-Scanner (used by the AI Tools SCA Agent). TARGETARCH is
# provided automatically by BuildKit (amd64 / arm64), matching the release asset
# naming so the image builds correctly on both Intel and Apple Silicon hosts.
ARG TARGETARCH
ARG OSV_SCANNER_VERSION=v2.3.5
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl ca-certificates; \
    curl -fsSL -o /usr/local/bin/osv-scanner \
        "https://github.com/google/osv-scanner/releases/download/${OSV_SCANNER_VERSION}/osv-scanner_linux_${TARGETARCH}"; \
    chmod +x /usr/local/bin/osv-scanner; \
    osv-scanner --version; \
    apt-get purge -y --auto-remove curl; \
    rm -rf /var/lib/apt/lists/*

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
