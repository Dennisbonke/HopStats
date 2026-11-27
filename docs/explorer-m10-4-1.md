# Breweries Explorer (M10.4.1)

Adds `/explore/breweries` and `/explore/breweries/:breweryId` using existing
Explorer layouts, controls, themes and history-entry restoration. Styles remains
upcoming. No migration, dependency, importer or production configuration changes.

## API and calculations

All routes require the existing authenticated session. Membership and aggregates
come exclusively from that user's check-ins, joined through beer to brewery.
Inventory-only, global-only and other-user-only breweries are absent. Missing and
inaccessible details both return 404.

- `GET /api/v1/explore/breweries`: paginated summaries with location, distinct beer
  count, total and rated check-in counts, weighted personal average, first/last UTC
  timestamps. Default `page_size=25` (maximum 100), `sort=unique_beers_desc`.
  Out-of-range pages clamp to the last page; empty results return page 1, zero pages.
- `GET /api/v1/explore/breweries/{brewery_id}`: adds known style count, min/max
  individual ratings, ten half-point distribution buckets, at most five known
  styles and five rated beers, and a validated Untappd brewery link.
- `GET /api/v1/explore/brewery-countries`: user-scoped searchable country options,
  `offset`/`limit` pagination, `has_more`, and a separate `unknown_available` flag.

Catalogue parameters: `search`, `sort`, `page`, `page_size`, repeated `country`,
`unknown_country=true`, `min_unique_beers`, `min_checkins`, `rating_min`,
`rating_max`, `first_tried_from/to`, `last_tried_from/to`. Country selections
(including unknown) use OR; filter groups use AND. Unknown means null or empty
imported country. Countries are not normalized. Search treats `%`, `_` and `\`
literally and matches name/city/region/country case-insensitively.

Sort fields: `name`, `location`, `unique_beers`, `checkins`, `rating`, `first_tried`,
`last_tried`, each with `_asc`/`_desc`. Location compares country, region, city,
case-insensitively, with missing components last in either direction. Every sort
ends with ascending internal brewery ID; unrated averages sort last both ways.

SQL performs aggregation, filtering, sorting and pagination. Ratings recover the
existing integer hundredths, compare thresholds by cross multiplication, and use
the existing SQLite rational collation for sorting. Averages are check-in weighted;
nulls are excluded and explicit zero retained. Rounded two-decimal display values
never drive ordering or filtering. Dates filter lifetime aggregate timestamps,
using inclusive Amsterdam days converted to half-open UTC boundaries across DST.

Distribution counts personal rated check-ins in `[0,.5)`, `[.5,1)`, …, `[4.5,5]`;
all ten buckets remain present, including empty buckets. Known styles rank by
distinct explored beers, then lowercase name and style ID. Missing styles are not
assigned to another style. Top beers rank by exact average then beer ID, without
a minimum rated count. Both detail lists are bounded to five; additional styles
are omitted rather than aggregated into Other.

## Interaction and navigation

The desktop table and responsive cards use semantic links. A shared filter-sheet
shell and existing rating controls preserve draft/apply, focus, safe areas and
compact landscape behavior. Committed state lives in the URL; equivalent filter
changes keep pagination and avoid requests. Request generations discard stale
catalogue responses; detail loaders discard obsolete responses. Both provide
loading, empty, error and retry states.

The distribution reuses Recharts and the existing tooltip/bucket interaction,
including touch pinning, keyboard interaction and a textual data disclosure.
Brewery artwork is always the same local placeholder icon. Highest-rated beers
retain their own artwork. Numeric Untappd source IDs produce
`https://untappd.com/brewery/<id>`; invalid IDs omit the link. The identifier
route was verified against [Untappd brewery 765](https://untappd.com/brewery/765),
which redirects to its canonical brewery profile.
No metadata is fetched at runtime.

Scroll storage now accepts the relevant catalogue path and retains the existing
opaque history-entry key. Fresh visits do not reuse unrelated entries. Return
URLs are validated against allowed local Explorer routes. Brewery details can
return to their originating beer while keeping a catalogue link. Top beer detail
links carry a return path back to the brewery. Explore all beers uses the existing
repeated `brewery_id` parameter. The semantic HopStats brand link returns to `/`
and closes the mobile menu.

## Verification and physical acceptance

Focused backend tests cover scope, counts, weighted/exact ratings, null/zero,
search escaping, country/count/date filters, DST, deterministic pagination,
distribution, style/top-beer ranking, invalid queries and external identifiers.
Frontend tests cover catalogue URL state, filters, stale requests, empty/error
states, detail statistics/links, return validation/restoration and brand navigation.
Existing Beer Explorer and detail regression coverage remains intact.

The existing single responsive CI invocation adds four representative viewports:
1440×900 light, 390×844 dark, 320×740 light and 844×390 dark, on all three browser
projects. It covers layout/overflow/control alignment, sidebar/sheet, details,
chart interaction, entity navigation, history restoration and brand navigation.
Four ordinary Chromium screenshots (desktop/portrait catalogue and detail) go to
the existing consolidated artifact. Local browser, build and Docker checks are
deferred to GitHub Actions to protect the production Raspberry Pi.

Physical-device acceptance remains manual:

- [ ] iPhone portrait: search, country selection, draft/apply, chips and pagination.
- [ ] Compact landscape: aligned controls, usable sheet and safe-area spacing.
- [ ] Brewery cards/details: long names, sparse metadata, unrated and zero ratings.
- [ ] Touch distribution: select/dismiss buckets, inspect textual counts.
- [ ] Brewery ↔ beer links; filtered beer catalogue; browser back/forward and scroll.
- [ ] Fresh/direct/reloaded routes; active tabs; brand-to-Dashboard with menu closure.
- [ ] Light/dark appearance and narrow 320px layout.
