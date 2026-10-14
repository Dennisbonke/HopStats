# Dashboard analytics

`GET /api/v1/dashboard` reports aggregates for the local user from persisted
check-ins and the current authoritative Untappd stash snapshot. Check-in
aggregates only read `checkins`, so stash-only catalog rows cannot inflate
check-in totals.

The response contains the eight headline metrics, `rated_checkins`, a
`match_coverage` object, and independent `freshness` timestamps. Import
timestamps are taken only from successful (`completed`) `ImportRun` records.
They describe when HopStats imported the data. Source-export timestamps are
returned separately when the import supplied a reliable value.

Inventory units are summed from current inventory rows, while inventory beer
counts use distinct `beer_id` values. For match coverage, rows sharing one
inventory beer identity are collapsed before counting. If their persisted
match statuses disagree, the strongest status wins in this deterministic
order:

1. `external_id`
2. `exact`
3. `ambiguous`
4. `unmatched`

Thus every inventory identity contributes to exactly one mutually exclusive
coverage bucket. `not_confirmed_checked_in` is the sum of `ambiguous` and
`unmatched`; these beers may have been tried previously but cannot be reliably
linked to an imported check-in.
