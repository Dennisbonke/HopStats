# HopStats

HopStats is an open-source, self-hosted Untappd analytics and beer inventory browser.
M5 provides local username/password authentication, persistent SQLite sessions, safe repeatable imports, dashboard
metrics, read-only inventory browsing, and private-configured hierarchical storage locations.

> **Development note:** This project is vibecoded.

## Stack and requirements

Python 3.12+, FastAPI, SQLAlchemy 2, Alembic, SQLite, React, TypeScript, Vite, Tailwind, and Docker.
For local development install Python, Node.js 20+, and npm.

## Development

```bash
python3.12 -m venv .venv && . .venv/bin/activate
pip install -e '.[dev]'
cd frontend && npm install && cd ..
uvicorn backend.app.main:app --reload --port 8000
# in another terminal:
cd frontend && npm run dev
```

Vite proxies `/api` to FastAPI. The API health check is `GET /api/v1/health` and remains public.
Local development stores SQLite in `./hopstats.sqlite3` by default, so it does not require a `/data`
directory. Docker Compose explicitly uses `/data/hopstats.sqlite3` on its named persistent volume.

## CSV imports

Open **Imports** in the web app and choose either the native Untappd check-in
CSV or native Untappd stash CSV. Check-in imports are additive and idempotent.
Stash imports are authoritative full snapshots and require an explicit
confirmation; a valid snapshot removes source items absent from the new file.
Malformed or invalid files never partially change the database. Import history
shows counts and validation errors. The default upload limit is 10 MiB; set
`HOPSTATS_MAX_UPLOAD_BYTES` to change it. Uploaded files are not retained.
Existing replacements from undated exports require a second warning
acknowledgement; dated exports older than the latest trusted snapshot are also
blocked unless explicitly overridden. Imports are designed for the default
single-worker deployment.

See [docs/imports.md](docs/imports.md) for supported headers, matching rules,
the importer extension contract, privacy guidance, and known limitations.

Inventory is read-only and available from **Inventory**. **Locations** shows the configured hierarchy,
descendant-inclusive counts, and unresolved records. All application data APIs require the authenticated owner.

See [docs/inventory.md](docs/inventory.md) for the inventory and locations API contract.

## Docker Compose

```bash
cp .env.example .env
docker compose up -d --build
curl http://127.0.0.1:8000/api/v1/health

# Inspect accounts after startup. On an empty database, bootstrap the first account:
docker compose exec hopstats python -m backend.app.cli list-accounts
docker compose exec hopstats python -m backend.app.cli bootstrap --username owner
```

The compiled frontend and API are served by one container. SQLite is stored at `/data/hopstats.sqlite3`
in named volume `hopstats-data`, so container recreation does not erase it. Use `HOPSTATS_PORT` and
`HOPSTATS_BIND_ADDRESS` to change the published address/port. ARM64 builds are supported; CI performs a
cross-platform image build, while runtime execution on ARM64 must be verified on ARM hardware. CI also runs an
amd64 smoke container, checks the health endpoint and frontend, and verifies the SQLite file remains present
after container recreation; import persistence is covered by the backend integration tests.

## Tests and checks

```bash
pytest
ruff check backend && ruff format --check backend
cd frontend && npm run lint && npm run format && npm run typecheck && npm test && npm run build
```

The acceptance checks also validate the weekly Dependabot configuration in
`.github/dependabot.yml`.

## M5 authentication and deployment

The first migration adds nullable password credentials to existing users and separate `auth_sessions`,
`auth_login_attempts`, and `auth_audit_events` tables. Existing IDs and all user-owned data remain unchanged. Startup
applies migrations idempotently and never creates an implicit account; sessions persist in `/data/hopstats.sqlite3`
across restarts.

Provision the first password interactively (never as a command-line argument):

```bash
docker compose exec hopstats python -m backend.app.cli list-accounts
docker compose exec hopstats python -m backend.app.cli set-password --user-id 1
docker compose exec hopstats python -m backend.app.cli rename-user --user-id 1 --username owner
docker compose exec hopstats python -m backend.app.cli create-user --username second
docker compose exec hopstats python -m backend.app.cli revoke-sessions --user-id 1
```

`bootstrap --username NAME` is only for an empty database. `change-password` and `reset-password` are aliases for
`set-password`; changing a password revokes every active session. The CLI prints account status only and never prints
credentials or session tokens. User IDs remain stable when usernames change. There is no public registration or
default password.

The browser uses an HttpOnly opaque session cookie. Only a SHA-256 hash of each session token is stored in SQLite.
State-changing requests use a double-submit CSRF cookie/header pair plus Origin validation. Login, logout, and imports
are covered; future write APIs should use the same dependency.

For direct HTTPS or a Cloudflare Tunnel, set `HOPSTATS_COOKIE_SECURE=true` and configure
`HOPSTATS_ALLOWED_ORIGINS=https://your-public-hostname`. Cloudflare Access can add a boundary but does not replace
HopStats authentication. For trusted HTTP development only, set `HOPSTATS_COOKIE_SECURE=false` and keep the service
on loopback or a trusted LAN. Do not expose the database volume, `.env`, or location secret through a web server.

Do not place real Untappd exports or personal inventory data in this repo.

## License

MIT. See [LICENSE](LICENSE).
