# Authentication (M5)

## Architecture

HopStats authenticates the existing provisioned user with Argon2id password hashes and opaque, random,
server-side sessions. The browser receives only an HttpOnly session cookie; the database stores its SHA-256 hash,
expiry, and revocation timestamp. Password changes revoke all sessions. Login failures are rate-limited per username
and client address and recorded in an audit table without passwords or tokens.

There are no roles in M5: an authenticated user can access only their own existing user-owned records.

## API contract

- `GET /api/v1/auth/csrf` — sets the non-HttpOnly CSRF cookie; the response does not contain the token.
- `POST /api/v1/auth/login` — JSON `{ "username": "local", "password": "..." }`; returns the user profile and sets
  the session cookie. Invalid credentials return a generic `401`.
- `POST /api/v1/auth/logout` — revokes the current session and clears its cookie.
- `GET /api/v1/auth/me` — returns the authenticated user profile; unauthenticated requests return `401`.
- Existing dashboard, import, inventory, and location endpoints return `401` without a valid session.

Login, logout, and all authenticated write requests require `X-CSRF-Token` matching the CSRF cookie. Browser origins
must be same-origin or listed in `HOPSTATS_ALLOWED_ORIGINS`.

## Provisioning and reset

Run commands inside Docker without putting a password in shell history:

```bash
docker compose exec hopstats python -m backend.app.cli set-password --username local
docker compose exec hopstats python -m backend.app.cli change-password --username local
docker compose exec hopstats python -m backend.app.cli reset-password --username local
docker compose exec hopstats python -m backend.app.cli list-accounts
docker compose exec hopstats python -m backend.app.cli revoke-sessions --username local
```

All password commands prompt twice using hidden terminal input and require at least 12 characters. They preserve the
existing user ID and data. `list-accounts` never exposes a hash. A password change/reset immediately invalidates all
sessions.

## Deployment

`alembic upgrade head` is run by application startup. The new migration is safe for populated M4 databases because
it only adds nullable user columns and new tables; it does not rewrite or relocate historical data.

To apply it explicitly inside the container (for example before starting a new release), run:

```bash
docker compose exec hopstats alembic -c backend/alembic.ini upgrade head
```

Use `HOPSTATS_COOKIE_SECURE=true` for HTTPS, including HTTPS terminated by Cloudflare Tunnel, and set the public
origin in `HOPSTATS_ALLOWED_ORIGINS`. For trusted local HTTP development set `HOPSTATS_COOKIE_SECURE=false`; never
use that setting for an internet-facing deployment. Sessions remain valid across process/container restarts until
expiry, logout, revocation, or password change.

Security-sensitive settings are validated at startup: SameSite must be `lax`, `strict`, or `none`; `none` requires
secure cookies; session lifetime and rate-limit attempts/window must be positive and bounded.

## Limitations

M5 intentionally has one provisioned owner, no registration, no roles, no recovery email, and no external identity
provider. Login rate limiting is database-backed per username/client address and is intentionally conservative for a
single Raspberry Pi deployment.
