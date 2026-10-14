# Authentication (M5)

## Architecture

HopStats authenticates the existing provisioned user with Argon2id password hashes and opaque, random,
server-side sessions. The browser receives only an HttpOnly session cookie; the database stores its SHA-256 hash,
expiry, and revocation timestamp. Password changes revoke all sessions. Login failures are rate-limited per username
and client address and recorded in an audit table without passwords or tokens.

There are no roles in M5: an authenticated user can access only their own existing user-owned records. Account
identity is the immutable numeric `users.id`; usernames are normalized login labels and may be changed.

## API contract

- `GET /api/v1/auth/csrf` — sets the non-HttpOnly CSRF cookie; the response does not contain the token.
- `POST /api/v1/auth/login` — JSON `{ "username": "owner", "password": "..." }`; returns the user profile and sets
  the session cookie. Invalid credentials return a generic `401`.
- `POST /api/v1/auth/logout` — revokes the current session and clears its cookie.
- `GET /api/v1/auth/me` — returns the authenticated user profile; unauthenticated requests return `401`.
- Existing dashboard, import, inventory, and location endpoints return `401` without a valid session.

Login, logout, and all authenticated write requests require `X-CSRF-Token` matching the CSRF cookie. Browser origins
must be same-origin or listed in `HOPSTATS_ALLOWED_ORIGINS`.

## Provisioning and reset

Startup only applies migrations and never creates an account. For a completely empty database, bootstrap the first
account explicitly. Existing databases retain their original numeric user ID and all data:

```bash
docker compose exec hopstats python -m backend.app.cli bootstrap --username owner
docker compose exec hopstats python -m backend.app.cli list-accounts
docker compose exec hopstats python -m backend.app.cli set-password --user-id 1
docker compose exec hopstats python -m backend.app.cli rename-user --user-id 1 --username owner
docker compose exec hopstats python -m backend.app.cli create-user --username second
docker compose exec hopstats python -m backend.app.cli revoke-sessions --user-id 1
```

`change-password` and `reset-password` are aliases for `set-password`. Password commands prompt twice using hidden
terminal input and require at least 12 characters; passwords are never command-line arguments. `rename-user` requires
an immutable numeric ID, normalizes the username to lowercase, permits only `[a-z0-9._-]` (with a letter or number
first), and preserves the password hash, sessions, and all foreign-key references. `list-accounts` never exposes a
hash. A password change/reset immediately invalidates all sessions. There is no public registration endpoint or
account-management UI.

## Deployment

`alembic upgrade head` is run by application startup. The authentication migration is safe for populated M4 databases
because it only adds nullable user columns and new tables; it does not rewrite or relocate historical data. No
additional implicit account is created during upgrade.

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

M5 has no registration, roles, recovery email, or external identity provider. Additional accounts are provisioned
privately with the CLI. Login rate limiting is database-backed per username/client address and is intentionally
conservative for a single Raspberry Pi deployment.
