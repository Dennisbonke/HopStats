# Check-in analytics (M7)

The **Analytics** page presents a stacked discovery/repeat breakdown and a
separate activity/cumulative trend line. Both charts and the three summary
metrics consume one response for the same reporting range and bucket set.
Filters and the fixed initial reporting timezone (`Europe/Amsterdam`) are saved
in URL query parameters. Presets are resolved in the browser to inclusive
calendar dates; `all` is sent without dates and resolved by the API. The default
is the current calendar year. “Last 30/90 days” includes today and the preceding
29/89 local dates. Daily ranges over 45 days default to weekly; ranges over 180
days default to monthly. Granularity can be overridden. Daily ranges are
horizontally scrollable and capped at 366 buckets by default (one leap-year-
sized daily view); longer explicit daily requests return 422 rather than
dropping data. Operators can configure a higher bounded limit as described
below; choose a coarser granularity for longer periods.

## Definitions

- A check-in is one stored event in the authenticated user's check-in history.
- Beer identity is the canonical `beer_id` (normally resolved from Untappd's
  external beer ID).
- A discovery is the earliest check-in for that beer and user, ordered by
  `occurred_at_utc` and then stable numeric check-in ID. All of that user's
  history is ranked before selected-period filtering. Import order, database
  insertion time, ratings, and other optional metadata do not affect it.
- Every other check-in for that beer is a repeat, including a repeat in the
  same reporting bucket as its discovery.
- Distinct beers is the count of beer identities with check-ins in the selected
  period; it can exceed the period's new discoveries.
- Cumulative lines start with lifetime totals immediately before the selected
  range, so narrowing the range never resets progress.

The selected timezone groups imported event timestamps into local calendar
days, ISO weeks (Monday start, ISO week-year labels), and months. The API accepts
any valid IANA timezone; the initial UI uses Amsterdam only. Local midnight
boundaries are converted independently to UTC and queried as a half-open
interval. DST days therefore need not be 24 hours. This is a reporting
interpretation of imported timestamps, not an assumption that every event took
place in the Netherlands. Import time is never used as the event date.

## API

`GET /api/v1/analytics/checkins` requires the authenticated session and accepts:

| Parameter | Meaning |
| --- | --- |
| `start`, `end` | Optional inclusive ISO `YYYY-MM-DD` dates; provide both or neither |
| `granularity` | `auto`, `day`, `week`, or `month` (default `auto`) |
| `timezone` | IANA timezone (default `Europe/Amsterdam`) |

Invalid ranges, timezones, and requests exceeding the configured bucket cap
return HTTP 422.
All-time with no data returns zero summary metrics and no buckets. An explicit
empty range returns zero-filled chronological buckets. The response contains
the effective inclusive range, timezone, resolved granularity, summary
(`total_checkins`, `new_discoveries`, `repeat_checkins`, `distinct_beers`),
cumulative baseline counts, and ordered bucket records. Each bucket includes a
stable key/label, displayed start/end, new/repeat/total values, and cumulative
check-ins/discoveries at its end.

The server never accepts a user ID from the client. A SQL `ROW_NUMBER()` window
partitions the current user's entire history by canonical beer ID and orders by
event timestamp then check-in ID. SQL aggregation then applies the UTC range and
bucket boundaries; Python only builds the requested bucket definitions and
serializes the grouped results. Migration `010_checkin_analytics_indexes` adds
user/time and user/beer/time/ID indexes. The query is synchronous and uses the
existing SQLite database; no cache, job queue, or additional service is used.

## Frontend interaction and limitations

The filters refresh both charts and metrics with one shared request. The bar
tooltip reports exact totals, discoveries, repeats, bucket dates, and discovery
share. The trend chart supports activity/cumulative modes and independent
series visibility. Recharts provides responsive/keyboard chart interaction;
daily displays scroll horizontally within the configured point limit.

M7 does not analyze inventory, venues, ratings, or beer attributes. Results
depend on the check-in rows currently stored; importing older history or
correcting event timestamps can legitimately move discovery classifications.
The SQL bucket expression defaults to 366 branches and is configurable with
`HOPSTATS_ANALYTICS_MAX_BUCKETS` (valid range 1–730). The hard ceiling bounds
generated SQL for Raspberry Pi deployments; higher requests are rejected, not
truncated. Analytics still requires a complete per-user SQL window pass and
does not promise constant-time aggregation.

## Drinking trends (M8.1 backend)

`GET /api/v1/analytics/drinking-trends` uses the same authentication, inclusive
local-date boundaries, default timezone (`Europe/Amsterdam`), canonical beer
identity, discovery ranking, and stable check-in ID tie-breaker as M7. If dates
are omitted, it defaults to January 1 through today in the selected timezone;
provide both dates or neither. The daily result is subject to the same configured
bucket cap (`HOPSTATS_ANALYTICS_MAX_BUCKETS`).

This omitted-date default is intentionally **year-to-date**, unlike M7's
undated full-history request. M8 frontend consumers should resolve their shared
period control to inclusive `start` and `end` dates and always send both; do not
use omission to represent “all history.” The existing M7 `period=all` request
currently omits dates by design, so that request builder must not be reused
unchanged for this endpoint. M8.1 makes no frontend changes.

The response contains zero-filled daily rows and complete ISO weekday
(Monday=0), local-hour (0–23), and weekday/hour arrays. `days_in_period` counts calendar
occurrences of each weekday, including inactive dates. A SQL window ranks the
complete user history; only compact local-date/hour aggregates for the requested
period are expanded into response arrays. SQLite materializes the filtered local
date/hour key once per in-period check-in, preventing duplicate Python timezone
conversions from the grouping expressions. Local wall-time grouping naturally
combines both occurrences of an autumn DST hour and does not create observations
for a missing spring hour.

Both supported check-in imports require `created_at` and normalize it to a
complete UTC timestamp; the database column is non-null. Date-only check-ins are
not currently supported, so all stored check-ins participate in hourly
aggregates. Duplicate external check-in IDs are constrained per user/source and
imports are idempotent. The endpoint does not return raw check-in history.

### Reproducible performance measurement

Run `python backend/scripts/benchmark_drinking_trends.py --checkins 100000
--runs 5` from the repository root (preferably on the target Pi). It creates a
temporary SQLite database with the M7 analytics indexes, seeds 100,000 synthetic
events over roughly 17 years across 10,000 beer identities, warms the cache, and
reports each service aggregation time plus the median for a one-year Amsterdam
period. The benchmark has no timing assertion and does not alter application
data. It measures aggregation/service work, excluding HTTP authentication and
transport; report the device, storage, Python version, and output when comparing
deployments.

Reference run in the development container (Intel Core i7-8750H, x86_64,
Python 3.14.8; not a Raspberry Pi): 100,000 lifetime check-ins, 5,840 in the
requested year, five warmed service runs; median 0.138 s. This is a reproducible
reference point, not a Pi performance claim or a CI threshold.
