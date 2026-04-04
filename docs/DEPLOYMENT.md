# Deployment (Docker + Nginx)

This repo ships a production Docker Compose that runs:

- API (Node/Express)
- Web (Next.js)
- Postgres, Redis, MinIO
- Nginx reverse proxy (serves Web + routes /api to API)

## 1) Prepare production env

Create `.env.prod` from `.env.prod.example` and set real values:

- `LMS_WEB_BASE_URL` (public URL, ex: https://lms.example.com)
- `LMS_API_BASE_URL_DOCKER` (same domain + /api)
- `POSTGRES_PASSWORD` / `LMS_DB_URL`
- `MINIO_ROOT_PASSWORD` / `LMS_MINIO_SECRET_KEY`

## 2) Build + run

```powershell
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## 3) Validate

```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke_docker.ps1 -EnvFile .env.prod
```

Expected: health/version OK and no forbidden errors for admin role.

## Notes

- API runs migrations on startup (`apps/api/migrations/001_init.sql`).
- Nginx reads `docker/nginx.conf.template` and injects ports from `.env.prod`.
- For HTTPS, put a TLS terminator (Caddy/Traefik/NGINX) in front or replace the template.
