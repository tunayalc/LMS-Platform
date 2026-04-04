# Integrations (dev + stub)

These endpoints are mostly stubs, but SMTP + Google OAuth + Jitsi are wired for local dev.

## Status

- GET `/integrations/status`
- Response: `{ "ok": true, "services": { ... } }`

## SMTP

- POST `/integrations/smtp/test`
- Body: `{ "to": "mail@example.com", "subject": "Hello", "message": "Test" }`
- Response: `{ "ok": true, "mode": "mock" }`

SMTP is used by `/auth/forgot-password` and welcome email on `/auth/register` when configured.

Required env:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM` (optional)

Gmail quick start (App Password):
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`
- `SMTP_USER=your@gmail.com`
- `SMTP_PASS=<app_password>`
- `SMTP_FROM="LMS <your@gmail.com>"`

## Mattermost (Real or Webhook)

- POST `/integrations/mattermost/test`
- Body: `{ "message": "Hello", "channelId": "optional", "courseId": "optional" }`
- Response: `{ "ok": true, "mode": "api|webhook", "channelId": "..." }`

Required env (Bot Token mode):
- `MATTERMOST_URL`
- `MATTERMOST_TOKEN`
- `MATTERMOST_TEAM_ID` (needed for course sync)

Webhook mode:
- `MATTERMOST_WEBHOOK_URL`

## Microsoft 365 (Mock)

Set mock mode (no Azure required):
- `MICROSOFT_MODE=mock`

Endpoints:
- GET `/integrations/microsoft/onedrive` -> `{ ok, items }`
- POST `/integrations/microsoft/teams/meeting` -> `{ ok, meeting }` (mock)

Real mode (optional later):
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_CALLBACK_URL`

## SCORM

- POST `/integrations/scorm/validate`
- Body: `{ "packageUrl": "https://example.com/scorm.zip" }` or `{ "manifest": "<xml>" }`
- Response: `{ "ok": true, "warnings": [] }`

## xAPI

- POST `/integrations/xapi/statement`
- Body: `{ "statement": { ... } }`
- Response: `{ "ok": true }`

## LTI

- POST `/integrations/lti/launch`
- Body: `{ "launchUrl": "https://lti.example.com/launch" }` or `{ "payload": { ... } }`
- Response: `{ "ok": true, "mode": "stub" }`

## QTI

- POST `/integrations/qti/validate`
- Body: `{ "packageUrl": "https://example.com/qti.zip" }` or `{ "manifest": "<xml>" }`
- Response: `{ "ok": true, "warnings": [] }`

## Google OAuth (Login)

Web redirects to `/auth/google`. API uses Passport Google OAuth.

Required env:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL` (e.g. `http://localhost:3001/auth/google/callback` or tunnel URL)

## Google Drive (Content Picker)

Web uses Google Drive Picker to attach PDF/Video links.

Required env:
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_GOOGLE_API_KEY`

## Jitsi (Live Class)

- POST `/api/jitsi/meeting` with `{ "roomName": "class-101" }`
- Response: `{ "meetingUrl": "https://..." }`

If `JITSI_APP_ID` and `JITSI_PRIVATE_KEY_PATH` are not set, it falls back to public `meet.jit.si`.
