# Inventory and locations API

The read-only API is scoped to the authenticated user's existing records. M5 has private CLI provisioning and no
public registration. Use HTTPS for internet-facing deployments.

## Inventory

`GET /api/v1/inventory` returns individual stash records, never a beer-level
collapse. Supported query parameters are:

| Parameter | Meaning |
|---|---|
| `search` | Literal case-insensitive search across beer name, brewery, and original notes |
| `location_id` | Canonical location to filter |
| `include_descendants` | Include child locations for `location_id` (default `true`) |
| `unresolved` | Return records without a resolved location |
| `match_status` | `external_id`, `exact`, `ambiguous`, or `unmatched` |
| `style_id` | Beer style identifier |
| `page` | One-based page number (default `1`) |
| `page_size` | Number of records, capped at `100` (default `25`) |
| `sort` | Whitelisted values such as `beer_name_asc`, `quantity_desc`, and `best_before_asc` |

Results include `items`, `page`, `page_size`, `total`, and `total_pages`.
Every sort has the inventory record ID as a stable tiebreaker. `GET
/api/v1/inventory/{id}` returns the complete read-only record, including original
notes, purchase location, raw best-before value, source item ID, canonical
location path, and resolution explanation.

`match_status=unmatched` means that HopStats has not confirmed an identity in
the imported check-ins. It does not mean the beer was never tried.

## Locations

`GET /api/v1/locations` returns the nested canonical tree. Each node has its
full path, aliases, record count, and total units. Parent counts include all
descendants. The response also has an `unresolved` count and unit total.

`GET /api/v1/locations/{id}` returns one canonical node with its descendants.
Unknown or inaccessible IDs return `404`. There are no public mutation
endpoints; configure locations privately through `HOPSTATS_LOCATION_CONFIG` as
described in [the import guide](imports.md).
