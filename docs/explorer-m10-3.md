# Beer Details & Check-in History (M10.3)

Implementation status: implemented; independent review and acceptance pending.
See PR #77 for CI results, screenshot artifacts and visual inspection notes.
No migration, new import format, chart dependency or styling framework is added.

## API contracts and authorization

All routes use the existing session authentication and `/api/v1/explore` prefix.
The catalogue and M10.2 filter contracts are unchanged.

`GET /beers/{beer_id}` extends the catalogue beer object with:

- `brewery`: nullable `{id, name, city, state, country}`; `style` remains nullable `{id, name}`.
- `highest_rating`, `lowest_rating`: nullable numbers.
- `rating_history`: complete ascending `{id, occurred_at_utc, rating}` observations.
- `untappd_url`: validated original-beer link or null.

Existing fields include `id`, `name`, `abv`, `ibu`, `photo_url`, `checkin_count`,
`rated_checkin_count`, `personal_average_rating`, `first_checked_in_at` and
`last_checked_in_at`. Optional metadata remains null, never fabricated as zero.

`GET /beers/{beer_id}/checkins?page=1&page_size=25&sort=newest` returns
`{items, page, page_size, total, total_pages}`. Items contain only:
`id`, `occurred_at_utc`, nullable `rating`, `comment`, `serving_type`,
`purchase_venue`, `photo_url`, `venue` and `untappd_url`. A venue is a nullable
`{id, name, city, state, country}` object. Check-in venue and purchase venue are
separate concepts and receive separate labels.

Positive signed 64-bit IDs are required. Page is 1–2147483647, page size is
1–100 (default 25), and sort is `newest` (default) or `oldest`. Invalid requests
return 422. Pages beyond the last page are clamped to the last page; the client
replaces its URL with the normalized page. Newest ordering is timestamp DESC,
ID DESC; oldest is timestamp ASC, ID ASC. Order changes reset page to 1.

Unauthenticated requests return 401. Both endpoints independently constrain all
check-in queries by authenticated user ID and beer ID. A missing beer, another
user's beer, or an inventory-only beer returns the same 404. Counts, comments,
ratings, photos and venue membership never derive from another user's history.
User IDs, raw source payloads and import bookkeeping are absent from responses.
Shared beer/brewery/style metadata follows the existing catalogue model.

## Statistics, time and chart semantics

Statistics cover all personal check-ins, independently of history pagination.
SQL computes counts, min/max timestamps, min/max ratings, and the sum of integer
hundredths (`sum(cast(round(rating * 100) as integer))`). The mean divides that
integer sum by `100 * rated_count` using Decimal before JSON presentation.
Null ratings are excluded; genuine zero is included. A single rated check-in
has identical mean, highest and lowest ratings. No ratings produces null rating
statistics and an explicit Not rated state. UI ratings have two decimal places.

API timestamps stay UTC with an explicit offset. Dates and times display in
Europe/Amsterdam, including first/last tried and chart tooltips. Original import
offsets remain stored but do not override this display convention.

The chart query selects only ID, UTC timestamp and rating, ascending by timestamp
then ID. It includes every rated check-in, including same-day observations and
zero ratings, without monthly grouping, filling gaps or synthetic observations.
Recharts uses a numeric time scale and a fixed 0–5 Y domain. Visible points are
connected with straight segments; these connect observations rather than adding
measurements. A single timestamp (one point or coincident observations) receives a one-day
domain either side to stay visible. Axis ticks show the actual first/last observation dates. No ratings produces a compact message. No legend is needed.

The existing tooltip portal and viewport positioning, keyboard accessibility
layer, and touch bucket-selection hook are reused. Touch hit regions use the
actual time-axis scale. Coincident timestamp/rating points can overlap visually;
the expandable chronological text list retains every distinct check-in for
assistive technology and inspection.

## Import audit and missing data

The supported check-in importer is `untappd_checkins_csv`; stash CSV imports
inventory and does not create check-ins. There is no JSON check-in importer.

| Data | Check-in CSV source |
| --- | --- |
| Beer/source IDs, beer/brewery names, time | Required `bid`, `checkin_id`, `brewery_id`, `beer_name`, `brewery_name`, `created_at` |
| Style, ABV, IBU | Optional `beer_type`, `beer_abv`, `beer_ibu` |
| Brewery location | Optional `brewery_city`, `brewery_state`, `brewery_country` |
| Personal rating/comment | Optional `rating_score`, `comment` |
| Serving/purchase venue | Optional `serving_type`, `purchase_venue` (purchase venue is text) |
| Check-in venue | Optional `venue_name`, `venue_id`, city/state/country and coordinates |
| Timezone offset | Optional `timezone_offset`; existing importer fallback timezone applies |
| Photos | Optional `photo_url`; see limitation below |

The importer currently assigns CSV `photo_url` to both BeerRecord and
NormalizedCheckin. Consequently existing artwork can be a check-in photo and
may be updated by later imports. This milestone deliberately does not redesign
that behavior. The API/UI use Beer.photo_url for artwork and Checkin.photo_url
for history; neither falls back to the other. Stash CSV can supply beer artwork
through its `photo` field. Missing location, style, serving, comment, venue or
photo is expected. The existing importer may create an “Unknown venue” record
when only a venue identifier exists; the detail view displays the stored name.
Coordinates are stored but omitted here because maps are out of scope.

Comments are React text with preserved line breaks and wrapping, never raw HTML.
History images use lazy loading, reserved proportions, safe HTTP(S) URLs without
credentials, no-referrer requests and failure messages. Artwork retains the
shared fallback. No proxy, scraping or external metadata request is introduced.

Original links require source `untappd` and an ASCII positive numeric identifier
(up to 20 digits), rejecting URL-like or nonnumeric imported identifiers.
`https://untappd.com/beer/4509` was verified on 2026-11-25 to return HTTP 301 to
`https://untappd.com/b/lagunitas-brewing-company-ipa/4509`, then HTTP 200.
Check-in links use the existing public `https://untappd.com/c/{checkin_id}` form.
Links open with `noopener noreferrer`; imported source URLs are never trusted.
They are optional and HopStats remains usable without them.

## Navigation and request behavior

`/explore/beers/:beerId` supports direct loads, reloads, bookmarks and new tabs.
Explorer and its Beers tab remain active and theme-aware. Desktop retains seven
columns with a semantic beer-name link stretched over the row. Mobile cards are
single semantic links. Neither contains nested controls or an actions column.

Catalogue links encode the entire catalogue path/query in `returnTo`. The visible
Back to Beer Explorer link accepts only the same-origin exact `/explore/beers`
pathname without a fragment, otherwise falling back to `/explore/beers`. All
search, filters, sort, page, page size and unrelated parameters survive. Browser
Back/Forward use ordinary router history; no arbitrary history delta is used by
the visible back link. Optional sessionStorage stores scrollY by catalogue query
on link activation and restores after results load. Storage failures are harmless.
Entering a detail route scrolls to its top; history pagination does not reset the page scroll.

History page, page size and order live in the detail URL; unrelated parameters
including returnTo survive changes. Profile/chart and history have independent
resources. History changes do not refetch profile/chart. Both resources discard
late responses after their key changes or unmounts and hide mismatched data
immediately. Missing, loading, expired-session, backend/network error and retry
states follow the existing application conventions.

## Performance and self-review

The existing migration 010 index `ix_checkins_user_beer_occurred_id` matches the
user/beer filter and deterministic ordering, in both directions. Query-plan
coverage uses temporary migrated SQLite databases. Detail uses three bounded-
purpose queries (SQL aggregate, joined profile, compact complete rated points).
History uses two queries (count and joined, offset/limited history), without N+1
venue lookups or fetching full detailed history. Chart response size grows with
the beer's rated history as required. No database or service changes are needed
on the Pi. Browser and Docker verification belongs in GitHub Actions.

Self-review should verify user scopes on both routes, complete aggregate/chart
semantics, explicit output schemas, stable ordering, safe return targets,
response-key protection, no profile refetch, responsive link semantics and image
failure handling. CI screenshot artifacts use synthetic fixtures only.

## Physical iPhone Safari acceptance (pending)

Automated WebKit coverage does not constitute physical-device verification.

- Open a catalogue card, return with the visible back link, and use Safari Back/Forward; confirm all filters, page size, pagination and approximate scroll position survive.
- Long-press a catalogue link and open in a new tab. Reload and bookmark a detail page; verify the safe direct-open return link.
- Check long names/styles, six statistics and long multiline comments at narrow portrait and short landscape widths. Verify no clipped content or horizontal page scrolling.
- Tap early, late, same-day and zero-valued chart observations. Confirm date/time/rating and tooltips within the visible viewport. Scroll through the chart without accidentally pinning a tooltip; tap outside to dismiss.
- Inspect a single rated observation and an unrated beer. Expand the text history and verify every observation is available.
- Change history ordering and pages; reload and use Back/Forward. Verify no profile/chart flicker or stale check-ins.
- Verify check-in venue versus purchase venue, full and sparse metadata, loaded photos, broken artwork/photo fallback, and lazy loading while scrolling.
- Repeat navigation, touch, scrolling, pagination and readable focus/contrast checks in both system light and dark themes, including Safari toolbars expanded/collapsed.
- Confirm there are no check-in creation/edit/delete controls. Untappd is the source of truth; modify imported check-ins in Untappd. This read-only rule does not restrict native inventory, goals or settings functionality.
