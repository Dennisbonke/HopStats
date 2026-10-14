# CSV imports

M2 supports two native Untappd CSV exports. The importer selects a format from
the header set, not from the filename. Unknown columns are accepted and retained
in bounded private source metadata; missing required columns, malformed rows,
duplicate identifiers, invalid numbers, and invalid dates reject the complete
file.

## Supported formats

- **Check-ins:** the native export containing `checkin_id`, `bid`,
  `brewery_id`, `beer_name`, `brewery_name`, and `created_at`.
- **Stash:** the native export containing `item_id`, `beer_name`,
  `brewery_name`, and `quantity`.

The parser uses UTF-8 CSV rules, including quoted multiline comments. Check-in
timestamps must include an offset (or have a valid `timezone_offset` column),
are stored in UTC, and retain the original offset in minutes. Ratings are
decimal values and missing ratings remain NULL. Stash date sentinels such as
`0000-00-00` become NULL while `2100-01-01` remains a date and is marked
suspicious.

## Uploading

Use the **Imports** page, select the relevant export, and upload it. A stash
upload requires an explicit confirmation because it is an authoritative full
snapshot: current source items are upserted, unchanged items are retained, and
items absent from the valid new snapshot are removed. Check-in imports are
additive; records omitted from a later check-in export are not removed.

The HTTP endpoints are:

```text
POST /api/v1/imports/checkins   multipart field: file
POST /api/v1/imports/inventory  multipart fields: file, confirm_replacement=true
GET  /api/v1/imports
GET  /api/v1/imports/{id}
```

Successful responses contain counts such as:

```json
{
  "id": 12,
  "source_type": "inventory",
  "filename": "untappd-stash.csv",
  "status": "completed",
  "inserted_count": 4,
  "updated_count": 1,
  "unchanged_count": 167,
  "removed_count": 0,
  "rejected_count": 0,
  "error_code": null,
  "errors": []
}
```

Failed runs remain in import history and include a concise `error_code`,
`error_summary`, and row/field errors where available. Validation failures do
not modify catalog, check-in, or inventory data. Uploaded files are processed
in memory and are not retained by default. The default maximum upload size is
10 MiB and can be changed with `HOPSTATS_MAX_UPLOAD_BYTES`.

When a trusted export timestamp is available, clients may also send
`source_exported_at` as ISO-8601. A snapshot older than the latest dated
snapshot is rejected with `older_snapshot` unless the client explicitly sends
`allow_older=true`. Native stash exports do not contain a reliable export-level
timestamp, so this safeguard is opt-in for callers that have one.

For an existing inventory, an undated snapshot is rejected with
`undated_snapshot` unless the client explicitly sends `allow_undated=true`.
An identical reimport (same SHA-256) is safe without the override. The Imports
page performs this as a two-step flow: ordinary replacement confirmation first,
then a separate warning acknowledgement only when the server identifies an
undated or older replacement.

## Matching and reimports

Check-ins use `(user, source_system, checkin_id)` and beers use Untappd `bid`
when available. Stash rows use `(user, untappd_stash source, item_id)`. A stash
beer has a provisional `untappd_stash` identity that is reused on repeated
imports by exact normalized beer and brewery names plus release-relevant
metadata such as bottled/best-before dates and catalog numbers. It is never replaced by a
check-in beer merely because an exact match exists; instead, the inventory row
stores a separate match status and matched check-in beer reference.

Matching is conservative: exact external ID first, then a unique exact match
after Unicode normalization, whitespace collapsing, and casefolding. Punctuation,
vintage years, and barrel descriptors are not stripped. Multiple candidates are
`ambiguous`; no candidate is `unmatched`. New check-ins automatically reconcile
existing unresolved stash rows.

Catalog policy is source-aware and explicit: a later non-empty source value may
replace a conflicting non-empty value, but empty values never erase useful
metadata. Purchase location remains separate from storage notes, and M2 does
not infer canonical storage locations.

## Storage locations

Storage locations are resolved separately from beer matching. `purchase_location`
remains the place where a beer was acquired; it is never used as storage. Notes
are preserved unchanged.

Set `HOPSTATS_LOCATION_CONFIG` to a private JSON file based on
[`config/locations.example.json`](../config/locations.example.json). The
configuration is safe to apply repeatedly: locations, aliases, and rules are
upserted rather than duplicated. Do not commit real aliases, notes, exports, or
personal storage mappings.

After changing aliases or rules, reconcile existing records without re-uploading
the stash:

```bash
HOPSTATS_LOCATION_CONFIG=/path/to/private-locations.json \
  python -m backend.app.reconcile_locations
```

Only automatically resolved records are recalculated. Explicit assignments are
preserved. Resolution precedence is: explicit assignment, exact normalized
canonical name or alias, exact matching notes line, configured exact/line/prefix
rule by descending priority, then unresolved. Equal-priority rules for different
locations produce `ambiguous`; unrelated note text is not searched by substring.

## Adding an importer

Implement the `Importer` protocol in `backend/app/importers/base.py`:

1. Detect a unique header signature without relying only on a filename.
2. Parse a binary stream into a `ParsedImport` containing normalized records
   from `backend/app/schemas/imports.py`.
3. Validate the complete stream before persistence and return row/field errors
   through `ImportValidationError`.
4. Register the adapter in `backend/app/importers/registry.py`.

Persistence services consume normalized records and should not depend on the
source layout. JSON check-ins and generic inventory CSV are future adapters and
are intentionally not implemented until representative samples and semantics
are available.

## Limitations

There is no authentication in this PoC. Keep the service bound to loopback or
a trusted LAN. Do not upload personal exports to issue trackers or commit
them to the repository. There is no fuzzy matching, manual matching UI,
background worker, or JSON support.

Import serialization uses process-local locks. The supported deployment is one
Uvicorn process with one worker, as used by the Dockerfile and Compose setup;
running multiple workers requires a future cross-process lock or database
coordination change before it is safe for concurrent authoritative snapshots.
