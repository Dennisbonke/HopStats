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

## Analytics navigation (M8.2)

`/analytics` remains the Overview by default. `view=trends` selects Drinking
Trends; Overview is canonicalized without a `view` parameter. The `metric`
parameter selects `total`, `discoveries`, or `repeats` and defaults to `total`.
Reporting controls remain shared above both views, and Overview granularity
remains in the URL when switching views.

The frontend only requests M8.1 data while Drinking Trends is active and always
sends explicit dates and timezone. For All time, it first reuses M7's undated
response metadata to resolve the earliest and latest local reporting dates; an
empty M7 result becomes an empty state without an M8 request. Drinking Trends
requests the selected calendar year's intersection with those full bounds for
the calendar. A separate `daily=false` drinking-trends request aggregates the
complete reporting range for the distributions, independent of the selected
calendar year. Changing `year` therefore only reloads calendar data.

## Calendar activity heatmap (M8.3)

Drinking Trends displays one Monday-first calendar year at a time. The `year`
query parameter selects the displayed year; it is omitted for the default year
and retained for other selections. Eligible years are those intersecting the
shared inclusive reporting period. Changing the displayed year does not change
that period. The metric selector supports all check-ins, new discoveries, and
repeat check-ins through the shared `metric` URL state.

Each request to M8.1 is limited to the intersection of the selected calendar
year and reporting period, including for All time. The year grid still shows
the complete calendar year: dates outside the reporting period are unavailable
(hatched), while included inactive dates have zero activity. Alignment cells
before January 1 and after December 31 are not dates. Dates after today's local
date in Europe/Amsterdam are marked as future; any imported future-dated
check-ins returned by the API remain visible and contribute normally.
The date-grid utility accepts Sunday-first alignment for future configuration,
but M8.3 uses Monday-first only.

## Weekday and hourly distributions (M8.4)

Below the calendar, Check-ins by Weekday shows Monday through Sunday and
Check-ins by Hour of Day shows all local clock hours. Both use the full selected
inclusive reporting period, not the displayed calendar year. The shared activity
metric selects all check-ins, discoveries, or repeats. The separate distribution
mode selects totals or averages: weekday average = weekday count divided by the
number of occurrences of that weekday in the inclusive range; hourly average =
hour count divided by the number of calendar dates in the range. Thus hourly
normalization is explicitly per calendar day, not per occurrence of a local hour.
Tooltips and screen-reader tables expose the selected count, denominator, and
calculated average. A weekday absent from the range has no defined average; it is
shown as unavailable, not as a measured zero.

The API keeps the M8.1 response unchanged by default. `daily=false` opts into
aggregate-only output: daily rows are omitted while weekday/hour and weekday
denominators still span the complete range. This avoids materializing dense daily
buckets and bypasses the 366-day cap for All time without changing discovery
ranking. Timestamp groups use the requested timezone; repeated autumn DST local hours combine into
one clock-hour bucket and missing spring hours have zero activity. Imports require
a complete `created_at` timestamp; date-only or missing-time records are not
supported, and these charts describe imported check-in time, not when the beer
was actually consumed.

## Weekday × hour heatmap (M8.5)

The **Check-in Activity by Weekday and Hour** matrix reuses the M8.4 aggregate
response: rows run Monday–Sunday, columns run local clock hours 00 through 23,
and every one of the 168 combinations is present. It uses the full reporting
period, independently of the calendar year displayed above. Amsterdam local
time and the backend DST grouping apply: repeated autumn clock hours are grouped
together; a missing spring clock hour has zero activity. These are imported
check-in timestamps, not necessarily the times the beer was consumed.

The existing metric selector applies to every cell. In total mode, a cell is
the raw count for its weekday/hour combination. In average mode, it is
`cell count / days_in_period for that weekday`; it is not divided by all dates
or by occurrences of the clock hour. Weekdays absent from the period have no
defined average and display as unavailable, never as zero. Cell details retain
the raw count, denominator, average, metric, and reporting period in both modes.

The adaptive intensity legend uses zero as a neutral level and up to four
non-zero quantile-based bands, computed from the positive values in this one
heatmap. The same bands cover all 168 cells; they are not normalized by row or
column and update with the reporting period, metric, and mode. Legend ranges
show the observed values assigned to each band, so ties may result in fewer
than four non-zero bands. Values remain available by focus/selection and in an
expandable 168-row data table, independently of color. The grid has one tab stop;
left/right moves within an hour row, up/down within the same hour column, and
Home/End moves to that weekday's first/last hour. Navigation does not wrap.
Enter/Space selects; the persistent details panel supports touch/mobile use.
On narrow screens the matrix scrolls inside its own container.

Intensity uses a fixed, cross-year scale for the selected metric: 0, 1–2, 3–5,
6–9, and 10 or more. Years are not independently normalized, so colors remain
comparable when navigating between them. For the initial year, the UI uses the
latest active year when a matching M7 response provides bucket activity; if not,
it deterministically chooses the latest year overlapping the period. Empty
years remain selectable. Daily counts are available by pointer, focus, or
activation in the details panel. The calendar scrolls internally on narrow
screens.
