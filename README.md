# HopStats

HopStats is an open-source, self-hosted foundation for future Untappd analytics and beer inventory browsing.
M2 provides safe, repeatable imports for native Untappd check-in and stash CSV exports. Dashboard metrics and
inventory browsing remain deferred.

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

Vite proxies `/api` to FastAPI. The API health check is `GET /api/v1/health`.
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

## Docker Compose

```bash
cp .env.example .env
docker compose up -d --build
curl http://127.0.0.1:8000/api/v1/health
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

## Security limitations

This PoC has no authentication or authorization. Keep it bound to loopback or a trusted LAN and **never expose
it directly to the public internet**. Do not place real Untappd exports or personal inventory data in this repo.

## License

MIT. See [LICENSE](LICENSE).
