FROM node:22-bookworm-slim AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml ./
COPY backend ./backend
RUN pip install --no-cache-dir .
COPY --from=frontend-build /src/frontend/dist ./frontend/dist
RUN useradd --create-home --uid 10001 hopstats && mkdir -p /data && chown -R hopstats:hopstats /app /data
USER hopstats
EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
