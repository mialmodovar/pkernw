# Single service: the frontend is built here and served by Daphne alongside the
# API, so the client's relative /api calls and same-host websocket work with no
# CORS and no proxy. It also matches the constraint that the tournament engine
# keeps state in memory and must run as exactly one process.

FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential libpq-dev \
 && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend /frontend/dist ./frontend_dist

# Hosts that inject $PORT (Railway among them) expect us to bind it.
ENV PORT=8000
EXPOSE 8000

COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
CMD ["/entrypoint.sh"]
