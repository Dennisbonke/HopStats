# Personal milestones (M9.1)

Milestones are authenticated, owner-scoped definitions; derived progress is recomputed from imported check-ins and is not stored as a counter. `unique_beers` counts canonical `beer_id` values, `checkins` counts all qualifying events, and `discoveries` counts each beer's first-ever check-in. Discovery uses the same ordering as analytics: `occurred_at_utc`, then check-in row ID. For lifetime absolute goals `unique_beers` and `discoveries` consequently have the same value. Brewery and style counts are not enabled: brewery IDs can be absent and style identity is name-based.

Goal types: `absolute` is lifetime cumulative; `calendar_year` selects local dates January 1 through December 31 of `calendar_year` and freezes when that year ends (`period_ended` if incomplete); `incremental` starts on inclusive `start_date` with no implicit end. Discovery always ranks against complete imported history before applying the date window. Dates use the configured IANA timezone (default `Europe/Amsterdam`); event timestamps are UTC; local date windows are half-open UTC intervals. A deadline includes its complete local day and does not stop accumulation. `status` and `deadline_outcome` are separate, so late completion is retained.

`GET /api/v1/milestones?archived=false` and `/summary` return `{ "milestones": [...] }`; `GET /{id}` returns a milestone definition plus `current`, `remaining`, `progress_percent`, status, completion, deadline outcome and available linear pace values. Create example:

```json
{"name":"New beers in 2027","metric":"discoveries","goal_type":"calendar_year","calendar_year":2027,"target":100,"timezone":"Europe/Amsterdam","deadline_date":"2027-12-31"}
```

Use `POST /api/v1/milestones`, `PATCH /{id}`, and `DELETE /{id}`. PATCH supports `archived: true|false` to archive or unarchive. DELETE permanently removes the definition. All mutation endpoints follow existing CSRF and authenticated session requirements.

Imported history is the source of truth: older imports, deletions, and timestamp/identity corrections can change both progress and historical completion. If a source export is incomplete, historic discoveries may be misclassified until earlier records are imported. Pace is descriptive only; scheduled, completed, or lifetime goals without meaningful boundaries omit relevant values. Forecasts, management UI, dashboard insights, user administration, and audit/version history are deferred.
