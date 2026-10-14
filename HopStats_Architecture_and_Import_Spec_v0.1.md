# HopStats: Architecture, Data Model & Import Specification

**Status:** Draft v0.1, 11 October 2026  
**Audience:** Maintainers and implementation agents (Codex)  
**Target:** Open-source, single-user PoC on Raspberry Pi 4 (including 2 GB RAM), ARM64 Docker Compose  
**Input evidence:** `untappd-29-09-2026-export(1).csv` and `untappd-stash-export-06-10-2026.csv`.

## 1. Scope and non-goals

**PoC must provide:** (a) eight dashboard numbers: total check-ins, unique checked-in beers, breweries, styles, average personal rating, total inventory units, distinct inventory beers, and inventory beers not confirmed previously checked in; (b) upload/import Untappd check-in CSV and Untappd stash CSV; (c) a format-neutral importer interface, with Untappd check-in JSON adapter added after a sample arrives; (d) idempotent check-in imports and authoritative full-snapshot stash imports; (e) searchable, read-only inventory with location, quantity, ABV, best-before date, and checked-in status; (f) hierarchical locations and global aliases; (g) responsive UI; (h) Docker Compose, SQLite persistence, automated tests, documented local deployment.

**Deferred:** generic/custom stash importer, active inventory edits, inventory movement/transactions, user registration/login, charts and deeper analytics, style catalog, goals, recommendations, barcode scanning, offline PWA. Retain extension points, but do not build deferred features prematurely.

**Security boundary:** no authentication in PoC; bind to loopback by default and document LAN-only trusted-network access. Do not publish unauthenticated instance to the public internet. Do not log check-in comments or uploaded files. No actual user data in the public repository.

## 2. Confirmed export observations

| Source | Rows | Columns | Identifiers | Other observations |
|---|---:|---:|---|---|
| Check-in CSV, 2026-09-29 | 2,924 | 34 | `checkin_id`, `bid`, `brewery_id`, `venue_id` | 2,325 distinct `bid`; 640 brewery IDs; 209 distinct `beer_type` strings; timestamps include timezone offsets |
| Stash CSV, 2026-10-06 | 172 | 23 | `item_id` | 183 total units, 10 rows with quantity >1; no `bid`; all 172 `container` fields empty; 7 empty notes; 22 `best_by_date_iso=0000-00-00`, 8 `2100-01-01` |

Check-in headers (verbatim): The actual check-in headers are: `beer_name`, `brewery_name`, `beer_type`, `beer_abv`, `beer_ibu`, `comment`, `venue_name`, `venue_city`, `venue_state`, `venue_country`, `venue_lat`, `venue_lng`, `venue_id`, `rating_score`, `created_at`, `timezone_offset`, `checkin_url`, `beer_url`, `brewery_url`, `brewery_country`, `brewery_city`, `brewery_state`, `flavor_profiles`, `purchase_venue`, `serving_type`, `checkin_id`, `bid`, `brewery_id`, `photo_url`, `global_rating_score`, `global_weighted_rating_score`, `tagged_friends`, `total_toasts`, `total_comments`.

Stash headers (verbatim): `item_id`, `beer_name`, `brewery_name`, `beer_type`, `beer_abv`, `beer_ibu`, `venue_name`, `venue_city`, `venue_state`, `venue_country`, `venue_lat`, `venue_lng`, `created_at`, `notes`, `quantity`, `container`, `purchase_date`, `bottled_date`, `best_by_date`, `best_by_date_iso`, `purchase_location`, `purchase_price`, `photo`.

**Interpretation caution:** `purchase_location` is acquisition location, not storage location. Storage clues occur in free-form `notes`, which may contain other text. Inventory unmatched by name is **not proof of never being checked in**. Treat `2100-01-01` as a suspicious literal date, not automatically as “no expiration.”

## 3. Stack and runtime

- Python 3.12+ / FastAPI / Pydantic v2; SQLAlchemy 2.x + Alembic; SQLite with `PRAGMA foreign_keys=ON`, `busy_timeout`, and WAL mode.
- React + TypeScript + Vite + Tailwind. Reserve ECharts for future analytics. Generate typed frontend API client from OpenAPI.
- pytest backend, Vitest frontend; Docker multi-stage build (Node build stage, Python runtime stage); single application container in production, named persistent data volume.
- Backend serves `/api/v1/*` and compiled SPA static assets. Vite development server proxies `/api` to FastAPI.
- Limit upload sizes, parse CSV as a stream where practical, and avoid memory-heavy dataframe imports. Background jobs/queues are not needed for PoC.
- SQLite backup should use its backup API or `VACUUM INTO`, not blindly copy a live WAL-mode database file.

## 4. Relational schema proposal

**General conventions:** integer internal PKs, UTC-aware timestamp storage, unique external IDs scoped to `source_system`, nullable fields for missing data, constraints for nonnegative quantities. Use migrations from day one. Include `user_id` in user-owned entities and scope every query to the seeded user even though authentication is deferred.

### Core catalog

**users**: `id PK`, `username UNIQUE`, `created_at`. Accounts are provisioned privately; credentials and sessions are
handled by the M5 authentication layer, with no public registration.

**breweries**: `id PK`, `source_system`, `external_id NULL`, `name`, `country NULL`, `city NULL`, `state NULL`, `UNIQUE(source_system, external_id)` for non-null IDs. Prefer Untappd brewery ID over name.

**beer_styles**: `id PK`, `name UNIQUE`, `parent_id NULL FK beer_styles.id` (parent unused in PoC). Style labels are not yet a complete Untappd style taxonomy.

**beers**: `id PK`, `source_system NULL`, `external_id NULL`, `brewery_id FK`, `style_id NULL FK`, `name`, `abv NULL`, `ibu NULL`, `photo_url NULL`, `created_at`, `updated_at`; unique `(source_system, external_id)` for non-null IDs. Permit provisional beers without external ID. Do not globally unique-constrain name/brewery: releases/vintages may differ.

**venues**: `id PK`, `source_system`, `external_id NULL`, `name`, `city NULL`, `state NULL`, `country NULL`, `latitude NULL`, `longitude NULL`; optional for check-ins. Do not conflate with storage locations.

### Check-ins

**checkins**: `id PK`, `user_id FK`, `source_system`, `external_id`, `beer_id FK`, `venue_id NULL FK`, `occurred_at_utc`, `original_offset_minutes NULL`, `rating NULL`, `comment NULL`, `serving_type NULL`, `purchase_venue NULL`, `photo_url NULL`, `source_payload_json NULL`, `created_at`, `updated_at`; `UNIQUE(user_id, source_system, external_id)`. Preserve timestamp offset separately for hour-of-day analytics. Store numeric ratings as fixed precision decimal. `source_payload_json` may include unknown fields but should be size-limited and considered private.

### Storage locations

**locations**: `id PK`, `user_id FK`, `parent_id NULL FK locations.id`, `name`, `description NULL`, `UNIQUE(user_id, parent_id, name)` conceptually (SQLite NULL uniqueness needs special treatment). Validate no parent cycles in service layer. Top-level locations can contain child storage areas.

**location_aliases**: `id PK`, `user_id FK`, `location_id FK`, `alias`, `normalized_alias`, `UNIQUE(user_id, normalized_alias)`. Aliases are global for a user, not tied to a parser. Canonical location names should also be resolvable.

**location_resolution_rules** (optional PoC table, alternatively config-backed): `id`, `user_id`, `pattern`, `match_kind` (`exact`, `line`, `prefix`), `location_id`, `priority`. Prefer exact/line matching; avoid uncontrolled substring matching. Keep the source notes intact and mark unresolved/ambiguous rather than guessing.

### Inventory

**inventory_sources**: `id PK`, `user_id FK`, `source_system` (e.g. `untappd_stash`), `name`, `is_authoritative`, `created_at`, `UNIQUE(user_id, source_system, name)`. Only one active authoritative source per user in PoC; design for more later.

**inventory_items**: `id PK`, `user_id FK`, `inventory_source_id FK`, `source_item_id`, `beer_id FK`, `location_id NULL FK`, `quantity INTEGER NOT NULL CHECK(quantity>=0)`, `container NULL`, `notes NULL`, `purchase_date NULL`, `bottled_date NULL`, `best_before NULL`, `raw_best_before NULL`, `purchase_location NULL`, `purchase_price NULL`, `created_at_source NULL`, `source_payload_json NULL`, `imported_at`, `UNIQUE(inventory_source_id, source_item_id)`. A row represents a stash record/batch, not a single bottle. Different dates/locations of the same beer can coexist. `source_item_id` must not be mistaken for a beer ID.

**inventory_beer_links**: optional if direct `inventory_items.beer_id` can point to provisional beers. For richer future matching, prefer `inventory_items.match_status` (`external_id`, `exact`, `ambiguous`, `unmatched`) and `matched_checkin_beer_id NULL FK`; never overwrite original imported identity when linking. A simpler alternative is a separate `beer_identity_matches` table. Choose one during implementation and document invariants.

### Import audit

**import_runs**: `id PK`, `user_id FK`, `source_type`, `filename`, `sha256`, `source_exported_at NULL`, `started_at`, `completed_at NULL`, `status` (`processing`, `completed`, `failed`), `inserted_count`, `updated_count`, `unchanged_count`, `rejected_count`, `error_summary NULL`. File hash is an optimization, not the only idempotency guarantee. Preserve concise row-level validation errors (row number, field, reason) in **import_errors**. Raw upload retention should be configurable and default to no long-term retention.

## 5. Importer contracts

Implement a protocol such as:

```python
class Importer(Protocol):
    kind: str
    def detect(self, filename: str, headers_or_snippet: object) -> bool: ...
    def parse(self, stream: BinaryIO) -> Iterable[NormalizedRecord]: ...
```

Use distinct typed normalized records for `NormalizedCheckin` and `NormalizedInventoryItem`; share catalog normalization, location resolution, validation, and persistence services. Avoid coupling the core schema to a particular CSV layout. JSON parser follows this contract once real sample data is available. Reject unknown schemas clearly; no guessing based solely on extension.

### Check-in CSV mapping

- `checkin_id` -> `checkins.external_id`, `bid` -> `beers.external_id`, `brewery_id` -> `breweries.external_id`, `venue_id` -> `venues.external_id`.
- `beer_name`, `brewery_name`, `beer_type`, `beer_abv`, `beer_ibu` -> catalog fields.
- `rating_score`, `comment`, `serving_type`, `purchase_venue`, `photo_url` -> check-in fields.
- `created_at` is offset-aware ISO-8601 -> UTC plus original offset.
- Venue and brewery geographic fields -> their corresponding catalog rows.
- Retain other fields in optional source metadata; never treat `global_rating_score` as the user's rating.

### Stash CSV mapping

- `item_id` -> `inventory_items.source_item_id`; `quantity` -> integer units.
- `beer_name`, `brewery_name`, `beer_type`, `beer_abv`, `beer_ibu` -> provisional beer/catalog metadata if no reliable match exists.
- `notes` -> original notes, and input to storage location resolution.
- `best_by_date_iso` -> `best_before` when a valid ISO date, otherwise NULL; retain raw string. `0000-00-00` is missing. Keep `2100-01-01` as date but flag it as possible sentinel for future review.
- `purchase_date`, `bottled_date`: normalize `0000-00-00 00:00:00` to NULL; avoid timezone assumptions for date-only data.
- `purchase_location` and `purchase_price` remain separate; do not infer storage location from purchase location.
- Empty `container` -> NULL. Do not invent package volume from beer name.

### Identity and matching

1. Strong automatic check-in matching by external `bid` when available.
2. For stash records without `bid`, use **unique exact normalized beer name + brewery name** as an automatic match, after Unicode normalization, whitespace collapsing, and casefolding. Never erase vintage markers or aggressively strip punctuation.
3. Multiple plausible matches -> `ambiguous`; no exact match -> `unmatched`. Optional fuzzy suggestions must never silently merge records.
4. Unmatched inventory records remain fully browsable as provisional beers. Matching can be recomputed after later check-in imports without reimporting inventory.
5. Dashboard label should be **“not confirmed checked in”**, not “never tried”, until identity coverage is good enough to distinguish them.

### Atomicity and snapshots

- Parse and validate into a staging representation, then apply the import in one database transaction. A malformed file must not partially replace the current inventory.
- Check-in reimport: upsert on `(user_id, source_system, external_id)`; preserve existing check-ins not present in a newer export unless explicit deletion semantics are added later.
- Stash reimport: after successful validation, upsert current `item_id`s and delete/mark inactive source items absent from the **new complete snapshot** in the same transaction. Never apply destructive snapshot semantics to partial uploads.
- Repeat identical imports must leave metrics unchanged. Same source `item_id` with changed quantity must update, not duplicate.
- If validation errors occur, default to reject the full snapshot; report row-level errors. Optionally permit check-in partial acceptance later, but not as implicit PoC behavior.
- Serialise imports per user/source to avoid competing snapshots. Record import-run result even when the data transaction rolls back.

## 6. Dashboard semantics

| Metric | Definition |
|---|---|
| Total check-ins | Count of imported `checkins` for current user |
| Unique beers | Count of distinct `beer_id` across user's check-ins |
| Unique breweries | Count of distinct brewery IDs among checked-in beers |
| Unique styles | Count of distinct non-null styles among checked-in beers |
| Average personal rating | Arithmetic mean of non-null user `checkins.rating` (not global beer ratings); show number of rated check-ins |
| Inventory units | `SUM(inventory_items.quantity)` from current authoritative inventory source |
| Unique inventory beers | Distinct inventory beer identities; provisional identities must be normalized conservatively |
| Not confirmed checked in | Distinct inventory beer identities without a confirmed match to user's check-ins; display as provisional/uncertain |

A beer counted multiple times in inventory contributes multiple units but only one distinct beer. API should return `data_as_of` timestamps separately for check-ins and inventory to avoid suggesting simultaneous snapshots.

## 7. HTTP API v1 (initial contract)

- `GET /api/v1/health` -> health status.
- `GET /api/v1/dashboard` -> eight metric values, match coverage, and dataset freshness.
- `GET /api/v1/inventory?search=&location_id=&page=&page_size=` -> paginated records including canonical location path, match status, quantity, ABV, best-before.
- `GET /api/v1/locations` -> nested location tree and optional unresolved count.
- `POST /api/v1/imports/checkins` -> multipart CSV; return import summary (sync for PoC).
- `POST /api/v1/imports/inventory` -> multipart stash CSV; return import summary.
- `GET /api/v1/imports` and `GET /api/v1/imports/{id}` -> history and validation errors.

Version all endpoints, validate pagination limits, and return consistent error JSON. Importing is a write operation and should be inaccessible to untrusted clients; loopback default is important without auth.

## 8. UI views

1. **Dashboard:** eight stat cards; clear empty states; dataset freshness badges; explain provisional “untried” metric.
2. **Imports:** check-in and stash upload areas; file format labels; confirmation before replacing inventory snapshot; outcome counts and errors.
3. **Inventory:** mobile-friendly search/filter, quantity, brewery, ABV, best-before, location breadcrumb, match indicator; read-only.
4. **Locations:** authenticated hierarchy and alias management; JSON remains a private provisioning
   mechanism for explicitly configuration-managed entries, while resolution rules stay read-only.

## 9. Suggested repository layout

```text
hopstats/
  backend/app/{api,models,schemas,importers,services,analytics}/
  backend/alembic/
  backend/tests/{fixtures,unit,integration}/
  frontend/src/{api,components,pages}/
  frontend/tests/
  docs/{architecture,import-formats,data-model}.md
  Dockerfile
  compose.yaml
  .env.example
  README.md
  LICENSE
```

Prefer reproducible dependency lockfiles, `.dockerignore`, multi-arch-compatible dependencies, and a minimal runtime image. Persist `/data/hopstats.sqlite3` in a named volume; expose `127.0.0.1:8000:8000` by default.

## 10. Milestones and acceptance criteria

**M1 Foundation:** ARM64 image builds, `docker compose up -d` starts service, SQLite migrations run, frontend loads, health endpoint passes, data survives container recreation.

**M2 Imports:** both provided CSV formats parse; 2,924 check-ins and 172 stash records import from these source files; 183 inventory units; reimport does not duplicate; a changed stash quantity updates; an invalid snapshot leaves prior inventory intact; source identifiers and unknown fields are retained safely. No real export checked into public repo.

**M3 Dashboard:** all eight numbers are calculated from imported data; counts remain stable after repeat imports; average uses user ratings; freshness is visible; missing matches are labeled honestly.

**M4 Inventory browser:** search and location filters work, nested locations aggregate correctly, aliases resolve to canonical locations, unknown locations remain visible/unresolved, mobile layout is usable.

**Tests:** unit tests for date sentinels, name normalization, alias precedence, match ambiguity, timestamp offsets; integration tests for rollback, idempotence, source snapshot deletion, unknown columns, invalid quantities, missing identifiers, and CSV formula-like content (escape on any future CSV export). Run CI on each PR. ARM64 image smoke-test when feasible.

## 11. Open decisions, not implementation blockers

1. **Licensing:** choose an OSI-approved license (MIT or Apache-2.0 are straightforward candidates).
2. **Location rules:** inspect actual `notes` variants to prepare a private mapping config; ship generic examples only.
3. **Data ownership:** keep provisional beer identity separate from Untappd identity and allow later reconciliation.
4. **JSON check-ins:** wait for representative export before implementing parser or claiming schema compatibility.
5. **Multi-user security:** when adding accounts, introduce authentication, authorization checks, source isolation, and migrations as one coherent feature.
6. **Future generic stash CSV:** add another adapter producing the same normalized inventory records, with explicit snapshot/source semantics.

## 12. Recommended first Codex task

Implement **M1 Foundation only** from this specification. Do not implement importers or dashboard metrics in M1. Set up Python/FastAPI, React/Vite/TypeScript, SQLite/SQLAlchemy/Alembic, pytest/Vitest, a multi-stage Dockerfile, Compose, `/api/v1/health`, and a minimal responsive app shell. Verify it builds for Linux ARM64 and documents local-only deployment. Keep PR small and testable.
