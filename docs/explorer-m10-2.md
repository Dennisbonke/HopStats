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
| `abv_min`, `abv_max` | Optional non-negative decimal, inclusive |
| `rating_min`, `rating_max` | Optional 0–5 decimal, inclusive, UI thresholds to 0.01 |
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

`AVG(Checkin.rating)` includes genuine zero ratings and excludes null ratings.
Every rated check-in for the current user and beer contributes. SQL filtering
and ordering use the full aggregate precision; only the UI formats to two
places. For 4.00, 4.20 and 4.50, the displayed value is 4.23, but an upper filter
of 4.23 excludes that beer. Individual ratings retain the existing decimal schema.

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
Visual viewport updates keep the sheet above the on-screen keyboard; safe-area
padding protects its footer. Native date controls retain the iOS appearance fix.

Numeric edits commit on blur and slider edits on release/keyboard interaction.
Desktop category and date changes apply immediately. Applied changes reset page
one while preserving search, sort and unrelated URL parameters. Browser history,
reloads, stale response checks and page normalization retain M10.1 behavior.

Playwright runs only in GitHub Actions on this development Pi. The existing
Chromium, Firefox and WebKit projects cover widths 320, 375, 390, 428, 768 and
1280 in both themes, plus landscape sheet geometry. Screenshots of desktop,
mobile cards and mobile sheets are attached to the responsive CI artifact.
All browser data is synthetic; no production data or services are used.

## Physical iPhone Safari smoke test (pending)

These checks require a real device; automated WebKit coverage is not physical verification.

- Open Filters; dismiss using Cancel, Close, backdrop and Escape with a hardware keyboard.
- Reopen and confirm only applied selections remain; use Clear all, Cancel, then Clear all and Apply.
- Scroll through every collapsed and expanded section without scrolling the background.
- Drag each ABV and rating handle with touch, including handles near each other; confirm sheet scrolling still works.
- Edit minimum and maximum numeric inputs, including 0, 3.70, 3.75, 4.10, 5.00 and a high ABV; confirm synchronization and invalid-range feedback.
- Open both native date pickers, select inclusive boundaries and clear a date. Check input widths and keyboard editing.
- Apply multiple categories; check chips, counts, pagination, reload and browser back/forward.
- Open the software keyboard near the bottom; verify the focused field and footer remain reachable.
- Check bottom home-indicator and landscape notch safe areas, portrait and landscape, and both system themes.
- Confirm returning from the sheet restores focus and the original page scroll position.
