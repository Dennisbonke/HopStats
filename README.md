# HopStats

HopStats is an open-source, self-hosted foundation for future Untappd analytics and beer inventory browsing.
M1 provides the application shell, database schema/migrations, health API, and deployment foundation. Import,
dashboard metrics, and inventory browsing are intentionally not implemented yet.

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
after container recreation; logical data persistence will be tested once M2 adds write operations.

## Tests and checks

```bash
pytest
ruff check backend && ruff format --check backend
cd frontend && npm run lint && npm run format && npm run typecheck && npm test && npm run build
```

The M1 acceptance checks also validate the weekly Dependabot configuration in
`.github/dependabot.yml`.

## Security limitations

This PoC has no authentication or authorization. Keep it bound to loopback or a trusted LAN and **never expose
it directly to the public internet**. Do not place real Untappd exports or personal inventory data in this repo.

## License

MIT. See [LICENSE](LICENSE).
