# Contributing

Use Python 3.12, install `pip install -e '.[dev]'`, and run `cd frontend && npm install` for frontend work.
Use Ruff for Python and the frontend npm scripts for ESLint, Prettier, TypeScript, and Vitest.

Run migrations with `alembic -c backend/alembic.ini upgrade head`. Schema changes require a reviewed migration;
do not use `create_all` in application code. Keep M1 focused, avoid personal data, and add tests for changes.

Use commit subjects in the format `<thing we touch>: <one line description>`. Add an
`Assisted-by` commit trailer identifying the actual harness, model, and version used,
for example: `Assisted-by: <harness> (<model> <version>)`.

## Dependency maintenance

Dependabot checks npm, Python, GitHub Actions, and Docker base images weekly. Minor and patch
updates are grouped per ecosystem; major updates remain separate for deliberate review. Keep
`frontend/package-lock.json` committed and review lockfile changes with npm's normal install/update
workflow. CI validates `.github/dependabot.yml`. Automatic merging is intentionally disabled.
