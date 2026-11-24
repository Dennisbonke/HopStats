# Beer Explorer M10.2

The authenticated catalogue is derived only from the current user's check-ins.
Filtering and sorting run in SQL before counting and pagination. There is no schema migration.

## Query parameters

`GET /api/v1/explore/beers` and the Explorer page share these parameters:

| Parameter | Format / default |
| --- | --- |
| `search` | Beer or brewery substring, literal case-insensitive match, at most 200 characters |
| `sort` | `<field>_<direction>`; default `last_tried_desc` |
| `page` | Positive integer, default 1, maximum 2147483647 |
| `page_size` | 1–100, default 25 (restored from shared URLs; no size selector) |
| `brewery_id`, `style_id` | Repeated positive IDs, at most 100 per category |
| `abv_min`, `abv_max` | Optional non-negative multiple of 0.01, inclusive; no upper limit |
| `rating_min`, `rating_max` | Optional 0–5 multiple of 0.01, inclusive |
| `first_tried_from`, `first_tried_to` | Optional ISO calendar dates `YYYY-MM-DD`, inclusive |
| `last_tried_from`, `last_tried_to` | Optional ISO calendar dates `YYYY-MM-DD`, inclusive |

Sort fields: `name`, `brewery`, `style`, `abv`, `rating`, `first_tried`,
`last_tried`, `checkins`. Each accepts `asc` and `desc`. Existing identifiers
remain valid. Names sort case-insensitively; nulls always sort last; beer ID
ascending breaks ties. Unknown API sort values and invalid ranges return 422.
Malformed page URL filters are ignored safely rather than sent to the API.

Example: `?brewery_id=12&brewery_id=34&style_id=56&rating_min=3.70&sort=rating_desc`.
Values within a category combine with OR; categories combine with AND. The active
count measures categories, not selections. A slider at its complete range does
not activate a filter. Missing values remain visible until their category is filtered.

`GET /api/v1/explore/filter-options/{breweries|styles}` accepts `search`, `offset`
(default 0), `limit` (1–100, default 25), or repeated `selected_id` for resolving
URL selections. It returns `{items: [{id, name}], has_more}`. Search uses literal
case-insensitive matching. Selected-ID resolution takes precedence over search.
Options are user-scoped, including selected-ID lookups. The UI retains selected
items across searches and offers bounded incremental loading.

`GET /api/v1/explore/filter-bounds` returns `{abv_max}` from the user's beers,
with a display baseline of 20. Numeric ABV entry has no hard-coded upper limit;
the slider expands to include entered and URL-restored bounds. None of these
endpoints expose entities from another user's history.

## Rating and dates

The importer validates individual ratings against `Numeric(3, 2)` (at most two
fractional digits), including standard 0.25 and Insider 0.10 increments. SQLite
stores these decimals numerically, so `AVG` can fall below exact boundaries.
The existing user/beer statistics query now recovers each rating's integer
hundredths with `CAST(ROUND(rating * 100) AS INTEGER)` and aggregates their sum
and non-null count. This rounding only recovers an individual stored hundredth;
it never rounds an average. Zero contributes to both sum and count; null does
not. An unrated beer has a null sum and remains visible without a rating filter.

Inclusive SQL comparisons use `sum >= threshold_hundredths * count` (or `<=`),
without division. SQL rating ordering uses the connection-local `rating_fraction`
collation on `sum/count` integer pairs. Its comparator cross-multiplies using
Python's arbitrary-precision integers, so equal fractions with different counts
compare equally and beer ID breaks ties in both directions. Nulls stay last.
SQLite sorts before LIMIT/OFFSET; there is no browser aggregation, additional
query per beer, schema migration or quadratic ranking query. The collation is
registered on every application/test SQLite connection. Its comparisons add
small per-comparison Python overhead only when sorting by rating.

Only response serialization divides the exact sum by `100 * count`; the UI
formats that result to two decimal places. For 4.00, 4.20 and 4.50, the displayed
value is 4.23, but an upper filter of 4.23 excludes that beer. For 3.60, 3.70 and
3.80, both inclusive thresholds of 3.70 include it exactly.

As in Analytics, dates use **Europe/Amsterdam**. First/last tried mean the minimum
and maximum timestamps of the entire user/beer history, not check-ins inside a
selected interval. Each selected local midnight converts separately to UTC.
Inclusive end dates become an exclusive next-day midnight; DST days therefore
correctly contain 23 or 25 hours. Results use the same timezone for date display.
Presets resolve to explicit dates in the URL, so shared links remain reproducible.
“Last N days” includes today and the previous N−1 calendar days.

## Responsive behavior and validation

Desktop uses an independently scrolling sticky filter sidebar (the existing
application header is in normal flow), sortable table headers and a synchronized
sort menu. Brewery appears only in its own column. Mobile at 700px and below
uses dedicated cards and a native modal bottom sheet with separate draft state.
Cancel, Escape, Close and backdrop dismissal discard edits. Apply updates all
filters together. Sheet Clear all affects only the draft. Native dialog modality
contains keyboard focus; focus and background scrolling restore on dismissal.
Only the visible filter interface mounts: the desktop sidebar above 700px, or
the mobile panel while its sheet is open. Resizing to desktop discards unapplied
drafts, releases body scroll locking and focuses catalogue search. Selected-ID
name resolution is shared metadata for chips. Brewery/style option lists load
only when their section is expanded and cancel obsolete updates on unmount.
Mobile initially expands Brewery and ABV, plus sections with applied filters;
other sections start collapsed. Headers summarize active values. Expansion
persists through ordinary edits and option loading; reopening uses applied state.

Visual viewport updates keep the sheet above the on-screen keyboard; safe-area
padding protects its footer. Native date controls retain the iOS appearance fix.

ABV and rating thresholds have the same contract in API validation, URL parsing,
numeric inputs and sliders: finite, non-negative multiples of 0.01; ratings also
must be at most 5. Equivalent forms such as `3.7`, `3.70`, `3.700` and `37e-1`
mean the same threshold. Unsupported precision (`3.755`), non-finite values,
negative values and inverted ranges return HTTP 422. Empty bounds are omitted;
one-sided ranges are supported. Invalid URL bounds are ignored, never silently
rounded; reversed URL pairs are both ignored. Applying the restored filters
writes only valid bounds. Calculated averages are not restricted to hundredths.
Invalid numeric edits show an associated accessible error and never alter
applied desktop filters; mobile Apply is blocked until corrected or cleared.
Correcting a value clears its error immediately; Clear all resets local errors.

Numeric edits commit on blur and slider edits on release/keyboard interaction.
The accent track updates throughout dragging. Overlapping handles separate in
the drag direction (left moves the minimum, right moves the maximum); native
range inputs retain independent keyboard focus and value announcements.
Pointer capture and touch-action on the track isolate slider gestures from
sheet scrolling. Dragging makes no catalogue request until release.
Enter/Search in any filter input cannot submit the sheet; keyboard activation
of the Apply button remains supported. Native constraint validation is retained.
Desktop category and date changes apply immediately. Applied changes reset page
one while preserving search, sort and unrelated URL parameters. Browser history,
reloads, stale response checks and page normalization retain M10.1 behavior.

Playwright runs only in GitHub Actions on this development Pi. The existing
Chromium, Firefox and WebKit projects cover widths 320, 375, 390, 428, 768 and
1280, 1440, 1920 and 2560 in both themes, plus exact 700/701px transitions and
short landscape sheet geometry. Actual browser Enter/Apply, native validation,
mouse dragging, coincident/end-point handles and request counts are covered.
Touch-capable Chromium uses real CDP touch drags; WebKit uses real touch taps
and keyboard separation because Playwright has no WebKit touch-drag API.
Firefox does not support Playwright hasTouch contexts; mouse/keyboard coverage
still runs in all three browsers. Screenshots of desktop,
mobile cards and mobile sheets are attached to the responsive CI artifact.
All browser data is synthetic; no production data or services are used.

## Physical iPhone Safari smoke test (pending)

These checks require a real device; automated WebKit coverage is not physical verification.

- Open Filters; dismiss using Cancel, Close, backdrop and Escape with a hardware keyboard.
- Reopen and confirm only applied selections remain; use Clear all, Cancel, then Clear all and Apply.
- Scroll through every collapsed and expanded section without scrolling the background.
- Drag both handles of each ABV and rating slider with touch, including close and identical values at the middle and both boundaries. Separate overlapping handles in both directions without numeric entry. Verify the accent interval follows dragging, numeric edits, restored URLs and resets; confirm sheet scrolling still works outside the track.
- Edit minimum and maximum numeric inputs, including 0, 3.70, 3.75, 4.10, 5.00 and ABV above the default maximum. Reject 3.755, negative/out-of-range and inverted values; confirm accessible feedback, correction and draft-only Clear all reset both values and errors.
- Use the software keyboard Search action in both brewery and style searches after changing a draft; confirm the sheet stays open and applied results/URL stay unchanged until explicit Apply. Verify Cancel discards edits.
- Expand and collapse every section independently; confirm the initial compact defaults, collapsed active summaries and draft selections survive edits and option loading.
- Open both native date pickers, select inclusive boundaries and clear a date. Check input widths and keyboard editing.
- Immediately tap Apply and Cancel after dragging each handle; verify the first tap works and draft/apply semantics remain correct.
- Apply multiple categories; check chips, counts, pagination, reload and browser back/forward.
- Open and dismiss the software keyboard near the bottom; verify the focused field, header and footer remain reachable with safe-area padding.
- Rotate between portrait and short landscape while open. Confirm compact layout without horizontal overflow, independently scrolling content, background scroll locking, and restoration after Cancel, Close, backdrop and Apply.
- Check bottom home-indicator and landscape notch safe areas, portrait and landscape, and both system themes.
- Confirm returning from the sheet restores focus and the original page scroll position.
