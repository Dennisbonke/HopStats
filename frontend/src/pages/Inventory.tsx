import "./Inventory.css";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchInventory,
  fetchInventoryItem,
  fetchInventoryStyles,
  InventoryItem,
  InventoryResponse,
} from "../api/inventory";
import { fetchLocations, LocationData, LocationNode } from "../api/locations";
import { Button, Card, FormField, StatusBadge } from "../components/ui";

const numberFormatter = new Intl.NumberFormat();

function dateValue(value: string | null): string {
  if (!value) return "Missing";
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function value(value: string | number | null): string {
  return value === null || value === "" ? "Missing" : String(value);
}

function matchLabel(status: string): string {
  return (
    {
      external_id: "Confirmed by external ID",
      exact: "Confirmed by exact name and brewery",
      ambiguous: "Ambiguous check-in match",
      unmatched: "Not confirmed checked in",
    }[status] ?? status
  );
}

function matchVariant(
  status: string,
): "success" | "warning" | "error" | "info" | "neutral" {
  if (status === "external_id" || status === "exact" || status === "resolved")
    return "success";
  if (status === "ambiguous") return "warning";
  if (status === "unmatched" || status === "unresolved") return "neutral";
  return "info";
}

function flattenLocations(
  nodes: LocationNode[],
  depth = 0,
): Array<LocationNode & { depth: number }> {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...flattenLocations(node.children, depth + 1),
  ]);
}

function LocationSelect({
  data,
  value: selected,
  onChange,
}: {
  data: LocationData | null;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = useMemo(
    () => flattenLocations(data?.locations ?? []),
    [data],
  );
  return (
    <FormField
      id="inventory-location-filter"
      label="Storage location"
      className="inventory-filter-control"
    >
      <select
        value={selected}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">All locations</option>
        {options.map((location) => (
          <option key={location.id} value={location.id}>
            {"　".repeat(location.depth)}
            {location.name}
          </option>
        ))}
        <option value="__unresolved__">Unresolved or ambiguous</option>
      </select>
    </FormField>
  );
}

function Summary({ item }: { item: InventoryItem }) {
  return (
    <>
      <div className="inventory-card-title">
        <div>
          <h3>{item.beer_name}</h3>
          <p>
            {value(item.brewery_name)} · {value(item.style_name)}
          </p>
        </div>
        <strong>{numberFormatter.format(item.quantity)} units</strong>
      </div>
      <div className="inventory-card-meta">
        <span>{item.abv === null ? "ABV missing" : `${item.abv}% ABV`}</span>
        <span>{item.container ?? "Container missing"}</span>
        <span>Best before: {dateValue(item.best_before)}</span>
      </div>
      {item.best_before_suspicious && (
        <p className="warning-text">
          Suspicious best-before date; review manually.
        </p>
      )}
      <p className="location-line">
        {item.location ? item.location.path : "No resolved storage location"}
      </p>
      <StatusBadge
        className={`inventory-status status-pill ${item.match_status}`}
        variant={matchVariant(item.match_status)}
      >
        {matchLabel(item.match_status)}
      </StatusBadge>
      {item.match_status === "unmatched" && (
        <p className="hint-text">
          This does not prove the beer was never checked in.
        </p>
      )}
    </>
  );
}

function DetailPanel({
  item,
  onClose,
}: {
  item: InventoryItem;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    dialog.showModal();

    return () => {
      if (dialog.open) {
        dialog.close();
      }
      previousFocus.current?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="inventory-dialog"
      aria-labelledby="inventory-detail-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      tabIndex={-1}
    >
      <section className="inventory-dialog-content">
        <div className="section-heading">
          <h2 id="inventory-detail-title">{item.beer_name}</h2>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        {item.photo_url ? (
          <img
            className="beer-image"
            src={item.photo_url}
            alt={`${item.beer_name} label`}
          />
        ) : (
          <div className="beer-image-fallback">🍺</div>
        )}
        <dl className="detail-list">
          <div>
            <dt>Brewery</dt>
            <dd>{value(item.brewery_name)}</dd>
          </div>
          <div>
            <dt>Style</dt>
            <dd>{value(item.style_name)}</dd>
          </div>
          <div>
            <dt>ABV / IBU</dt>
            <dd>
              {value(item.abv)} / {value(item.ibu)}
            </dd>
          </div>
          <div>
            <dt>Quantity / container</dt>
            <dd>
              {numberFormatter.format(item.quantity)} / {value(item.container)}
            </dd>
          </div>
          <div>
            <dt>Purchase date</dt>
            <dd>{dateValue(item.purchase_date)}</dd>
          </div>
          <div>
            <dt>Bottled date</dt>
            <dd>{dateValue(item.bottled_date)}</dd>
          </div>
          <div>
            <dt>Best before</dt>
            <dd>
              {dateValue(item.best_before)}
              {item.raw_best_before ? ` (raw: ${item.raw_best_before})` : ""}
            </dd>
          </div>
          <div>
            <dt>Purchase location / price</dt>
            <dd>
              {value(item.purchase_location)} /{" "}
              {item.purchase_price === null ? "Missing" : item.purchase_price}
            </dd>
          </div>
          <div>
            <dt>Storage location</dt>
            <dd>{item.location?.path ?? "Unresolved"}</dd>
          </div>
          <div>
            <dt>Location resolution</dt>
            <dd>
              {item.location_resolution_status} —{" "}
              {value(item.location_resolution_detail)}
            </dd>
          </div>
          <div>
            <dt>Check-in match</dt>
            <dd>{matchLabel(item.match_status)}</dd>
          </div>
          <div>
            <dt>Source item ID</dt>
            <dd>{item.source_item_id}</dd>
          </div>
        </dl>
        {item.notes && (
          <div className="notes-block">
            <strong>Original notes</strong>
            <p>{item.notes}</p>
          </div>
        )}
        {item.source_metadata && (
          <div className="notes-block">
            <strong>Source metadata</strong>
            <pre>{JSON.stringify(item.source_metadata, null, 2)}</pre>
          </div>
        )}
      </section>
    </dialog>
  );
}

function InventoryRows({
  data,
  onSelect,
}: {
  data: InventoryResponse;
  onSelect: (item: InventoryItem) => void;
}) {
  return (
    <>
      <div
        className="inventory-table-wrap"
        role="region"
        aria-label="Inventory records table"
        tabIndex={0}
      >
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Beer</th>
              <th>Style</th>
              <th>Units</th>
              <th>ABV</th>
              <th>Best before</th>
              <th>Location</th>
              <th>Match</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.beer_name}</strong>
                  <br />
                  <span className="muted">{value(item.brewery_name)}</span>
                </td>
                <td>{value(item.style_name)}</td>
                <td>{numberFormatter.format(item.quantity)}</td>
                <td>{item.abv === null ? "Missing" : `${item.abv}%`}</td>
                <td>
                  {dateValue(item.best_before)}
                  {item.best_before_suspicious && " ⚠"}
                </td>
                <td>{item.location?.path ?? "Unresolved"}</td>
                <td>
                  <StatusBadge
                    className={`inventory-status status-pill ${item.match_status}`}
                    variant={matchVariant(item.match_status)}
                  >
                    {matchLabel(item.match_status)}
                  </StatusBadge>
                </td>
                <td>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onSelect(item)}
                  >
                    Details
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="inventory-cards">
        {data.items.map((item) => (
          <Card as="article" className="inventory-card" key={item.id}>
            <Summary item={item} />
            <Button
              type="button"
              variant="secondary"
              onClick={() => onSelect(item)}
            >
              View record details
            </Button>
          </Card>
        ))}
      </div>
    </>
  );
}

function GroupedInventoryRows({
  data,
  onSelect,
}: {
  data: InventoryResponse;
  onSelect: (item: InventoryItem) => void;
}) {
  const groups = new Map<
    string,
    { name: string; styleId: number | null; items: InventoryItem[] }
  >();
  for (const item of data.items) {
    const key =
      item.style_id === null ? "missing-style" : `style-${item.style_id}`;
    const existing = groups.get(key) ?? {
      name: item.style_name ?? "Unknown style",
      styleId: item.style_id,
      items: [],
    };
    existing.items.push(item);
    groups.set(key, existing);
  }
  const orderedGroups = [...groups.entries()].sort(([, left], [, right]) => {
    if (left.styleId === null) return 1;
    if (right.styleId === null) return -1;
    return left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
    });
  });
  return (
    <div className="inventory-style-groups">
      {orderedGroups.map(([key, group]) => {
        const total =
          (data.style_groups ?? []).find(
            (entry) => entry.style_id === group.styleId,
          )?.total ?? group.items.length;
        return (
          <Card
            as="section"
            variant="muted"
            className="inventory-style-group"
            key={key}
          >
            <h3>
              {group.name} <span>({numberFormatter.format(total)} total)</span>
            </h3>
            <p className="inventory-group-page-count">
              Showing {numberFormatter.format(group.items.length)} of{" "}
              {numberFormatter.format(total)} matching entries on this page.
            </p>
            <div
              className="inventory-table-wrap"
              role="region"
              aria-label="Inventory records table"
              tabIndex={0}
            >
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Beer</th>
                    <th>Style</th>
                    <th>Units</th>
                    <th>ABV</th>
                    <th>Best before</th>
                    <th>Location</th>
                    <th>Match</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.beer_name}</strong>
                        <br />
                        <span className="muted">
                          {value(item.brewery_name)}
                        </span>
                      </td>
                      <td>{value(item.style_name)}</td>
                      <td>{numberFormatter.format(item.quantity)}</td>
                      <td>{item.abv === null ? "Missing" : `${item.abv}%`}</td>
                      <td>
                        {dateValue(item.best_before)}
                        {item.best_before_suspicious && " ⚠"}
                      </td>
                      <td>{item.location?.path ?? "Unresolved"}</td>
                      <td>
                        <StatusBadge
                          className={`inventory-status status-pill ${item.match_status}`}
                          variant={matchVariant(item.match_status)}
                        >
                          {matchLabel(item.match_status)}
                        </StatusBadge>
                      </td>
                      <td>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => onSelect(item)}
                        >
                          Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="inventory-cards">
              {group.items.map((item) => (
                <Card as="article" className="inventory-card" key={item.id}>
                  <Summary item={item} />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onSelect(item)}
                  >
                    View record details
                  </Button>
                </Card>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default function Inventory() {
  const [searchParams] = useSearchParams();
  const initialLocation =
    searchParams.get("location_id") ??
    (searchParams.get("unresolved") === "true" ? "__unresolved__" : "");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [location, setLocation] = useState(initialLocation);
  const [style, setStyle] = useState("");
  const [match, setMatch] = useState("");
  const [sort, setSort] = useState("beer_name_asc");
  const [groupByStyle, setGroupByStyle] = useState(false);
  const [groupSort, setGroupSort] = useState("beer_name_asc");
  const [includeDescendants, setIncludeDescendants] = useState(true);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [locations, setLocations] = useState<LocationData | null>(null);
  const [styles, setStyles] = useState<Array<{ id: number; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<InventoryItem | null>(null);
  const inventoryRequestGeneration = useRef(0);

  useEffect(() => {
    Promise.all([fetchLocations(), fetchInventoryStyles()])
      .then(([locationData, styleData]) => {
        setLocations(locationData);
        setStyles(styleData);
      })
      .catch(() => setError("Inventory filters are temporarily unavailable."));
  }, []);

  useEffect(() => {
    const generation = ++inventoryRequestGeneration.current;
    const params = new URLSearchParams({
      page: String(page),
      page_size: "25",
      sort: groupByStyle ? groupSort : sort,
    });
    if (groupByStyle) params.set("group_by", "style");
    if (appliedSearch) params.set("search", appliedSearch);
    if (style) params.set("style_id", style);
    if (match) params.set("match_status", match);
    if (location === "__unresolved__") params.set("unresolved", "true");
    else if (location) {
      params.set("location_id", location);
      params.set("include_descendants", String(includeDescendants));
    }
    setLoading(true);
    setError(null);
    fetchInventory(params)
      .then((result) => {
        if (generation === inventoryRequestGeneration.current) setData(result);
      })
      .catch(() => {
        if (generation === inventoryRequestGeneration.current) {
          setError("Inventory data is temporarily unavailable.");
        }
      })
      .finally(() => {
        if (generation === inventoryRequestGeneration.current)
          setLoading(false);
      });
  }, [
    appliedSearch,
    groupByStyle,
    groupSort,
    includeDescendants,
    location,
    match,
    page,
    sort,
    style,
  ]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  }

  function changeFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  async function selectDetail(item: InventoryItem) {
    try {
      setDetail(await fetchInventoryItem(item.id));
    } catch {
      setError("This inventory record is temporarily unavailable.");
    }
  }

  return (
    <div className="inventory-page">
      <div className="page-heading">
        <h2>Inventory</h2>
        <p>
          Browse individual stash records. Unmatched beers are not proof of
          never having been checked in.
        </p>
      </div>
      <form className="inventory-filters" onSubmit={submit}>
        <FormField
          id="inventory-search"
          label="Search beer, brewery, or original notes"
          className="inventory-filter-control search-control"
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search inventory…"
          />
        </FormField>
        <LocationSelect
          data={locations}
          value={location}
          onChange={(value) => changeFilter(setLocation, value)}
        />
        <FormField
          id="inventory-style"
          label="Beer style"
          className="inventory-filter-control"
        >
          <select
            value={style}
            onChange={(event) => changeFilter(setStyle, event.target.value)}
          >
            <option value="">All styles</option>
            {styles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          id="inventory-match-status"
          label="Check-in status"
          className="inventory-filter-control"
        >
          <select
            value={match}
            onChange={(event) => changeFilter(setMatch, event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="external_id">Confirmed by external ID</option>
            <option value="exact">Exact name and brewery</option>
            <option value="ambiguous">Ambiguous</option>
            <option value="unmatched">Not confirmed checked in</option>
          </select>
        </FormField>
        {!groupByStyle && (
          <FormField
            id="inventory-sort"
            label="Sort order"
            className="inventory-filter-control"
          >
            <select
              value={sort}
              onChange={(event) => changeFilter(setSort, event.target.value)}
            >
              <option value="beer_name_asc">Beer name A–Z</option>
              <option value="beer_name_desc">Beer name Z–A</option>
              <option value="brewery_asc">Brewery A–Z</option>
              <option value="brewery_desc">Brewery Z–A</option>
              <option value="abv_asc">ABV low to high</option>
              <option value="abv_desc">ABV high to low</option>
              <option value="quantity_desc">Quantity high–low</option>
              <option value="best_before_asc">Best-before soonest</option>
              <option value="best_before_desc">Best-before furthest</option>
              <option value="style_asc">Style A–Z</option>
              <option value="style_desc">Style Z–A</option>
              <option value="location_asc">Location A–Z</option>
              <option value="location_desc">Location Z–A</option>
            </select>
          </FormField>
        )}
        <label className="checkbox-filter">
          <input
            type="checkbox"
            checked={groupByStyle}
            onChange={(event) => {
              setGroupByStyle(event.target.checked);
              setPage(1);
            }}
          />
          Group by beer style
        </label>
        {groupByStyle && (
          <FormField
            id="inventory-group-sort"
            label="Sort within styles"
            className="inventory-filter-control"
          >
            <select
              value={groupSort}
              onChange={(event) => {
                setGroupSort(event.target.value);
                setPage(1);
              }}
            >
              <option value="beer_name_asc">Beer name A–Z</option>
              <option value="beer_name_desc">Beer name Z–A</option>
              <option value="brewery_asc">Brewery A–Z</option>
              <option value="brewery_desc">Brewery Z–A</option>
              <option value="abv_asc">ABV low to high</option>
              <option value="abv_desc">ABV high to low</option>
              <option value="best_before_asc">Best-by soonest first</option>
              <option value="best_before_desc">Best-by furthest first</option>
            </select>
          </FormField>
        )}
        {location && location !== "__unresolved__" && (
          <label className="checkbox-filter">
            <input
              type="checkbox"
              checked={includeDescendants}
              onChange={(event) => {
                setIncludeDescendants(event.target.checked);
                setPage(1);
              }}
            />{" "}
            Include child locations
          </label>
        )}
        <Button type="submit">Search</Button>
      </form>
      {location && location !== "__unresolved__" && includeDescendants && (
        <p className="filter-note">
          Including inventory assigned to this location and all child locations.
        </p>
      )}
      {loading && (
        <section className="inventory-state" role="status" aria-busy="true">
          Loading inventory…
        </section>
      )}
      {error && !loading && (
        <section className="inventory-state error-state" role="alert">
          <strong>{error}</strong>
          <p>Check the backend connection and try again.</p>
        </section>
      )}
      {!loading && !error && data && data.total === 0 && (
        <section className="inventory-state" role="status">
          <strong>No inventory records match these filters.</strong>
          <p>Try clearing the search or choosing a broader location.</p>
        </section>
      )}
      {!loading && !error && data && data.total > 0 && (
        <Card as="section" className="inventory-results">
          <div className="section-heading">
            <p>{numberFormatter.format(data.total)} inventory records</p>
            <span>
              Page {data.page} of {data.total_pages}
            </span>
          </div>
          {groupByStyle ? (
            <GroupedInventoryRows
              data={data}
              onSelect={(item) => void selectDetail(item)}
            />
          ) : (
            <InventoryRows
              data={data}
              onSelect={(item) => void selectDetail(item)}
            />
          )}
          <div className="pagination">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= data.total_pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </Card>
      )}
      {detail && <DetailPanel item={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
