# Check-in analytics (M7)

The **Analytics** page presents a stacked discovery/repeat breakdown and a
separate activity/cumulative trend line. Both charts and the three summary
metrics consume one response for the same reporting range and bucket set.
Filters and the fixed initial reporting timezone (`Europe/Amsterdam`) are saved
in URL query parameters. Presets are resolved in the browser to inclusive
calendar dates; `all` is sent without dates and resolved by the API. The default
is the current calendar year. “Last 30/90 days” includes today and the preceding
29/89 local dates. Daily ranges over 45 days default to weekly; ranges over 180
days default to monthly. Granularity can be overridden. Very long daily ranges
are horizontally scrollable and bounded to 2,400 buckets.

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

Invalid ranges, timezones, and unsupported bucket counts return HTTP 422.
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
long daily displays scroll horizontally rather than dropping observations.

M7 does not analyze inventory, venues, ratings, or beer attributes. Results
depend on the check-in rows currently stored; importing older history or
correcting event timestamps can legitimately move discovery classifications.
Very large datasets still require a complete per-user SQL window pass, so the
indexes and bounded output address initial Raspberry Pi deployment needs but
do not promise constant-time aggregation.
