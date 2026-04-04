# Performance Notes

## Current baseline

- Postgres tables use indexes on foreign keys and timestamps (see `apps/api/migrations/001_init.sql`).
- API responses are paginated on list endpoints via `limit`/`offset`.
- Basic rate limiting is enabled with `LMS_RATE_LIMIT_WINDOW_MS` and `LMS_RATE_LIMIT_MAX`.

## Quick load check

Use the built-in script to verify latency and failure rate:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/load_test.ps1 -Mode local -Requests 50
```

Expected: `ok=<count>` equals total requests, `avgMs` under a few hundred ms on a dev laptop.

## Next tuning targets (later)

- Add Redis caching for read-heavy endpoints (courses/content).
- Move file uploads to MinIO and store signed URLs.
- Add API tracing and slow-query logging.
