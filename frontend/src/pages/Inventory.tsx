import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchInventory,
  fetchInventoryItem,
  fetchInventoryStyles,
  InventoryItem,
  InventoryResponse,
} from "../api/inventory";
import { fetchLocations, LocationData, LocationNode } from "../api/locations";

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
    <label className="filter-control">
      Storage location
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
    </label>
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
      <span className={`status-pill ${item.match_status}`}>
        {matchLabel(item.match_status)}
      </span>
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
  return (
    <div className="detail-overlay" role="presentation" onClick={onClose}>
      <section
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2>{item.beer_name}</h2>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
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
    </div>
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
      <div className="inventory-table-wrap">
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
                  <span className={`status-pill ${item.match_status}`}>
                    {matchLabel(item.match_status)}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => onSelect(item)}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="inventory-cards">
        {data.items.map((item) => (
          <article className="inventory-card" key={item.id}>
            <Summary item={item} />
            <button
              type="button"
              className="secondary-button"
              onClick={() => onSelect(item)}
            >
              View record details
            </button>
          </article>
        ))}
      </div>
    </>
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
  const [includeDescendants, setIncludeDescendants] = useState(true);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [locations, setLocations] = useState<LocationData | null>(null);
  const [styles, setStyles] = useState<Array<{ id: number; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<InventoryItem | null>(null);

  useEffect(() => {
    Promise.all([fetchLocations(), fetchInventoryStyles()])
      .then(([locationData, styleData]) => {
        setLocations(locationData);
        setStyles(styleData);
      })
      .catch(() => setError("Inventory filters are temporarily unavailable."));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: "25",
      sort,
    });
    if (appliedSearch) params.set("search", appliedSearch);
    if (style) params.set("style_id", style);
    if (match) params.set("match_status", match);
    if (location === "__unresolved__") params.set("unresolved", "true");
    else if (location) {
      params.set("location_id", location);
      params.set("include_descendants", String(includeDescendants));
    }
    setLoading(true);
    fetchInventory(params)
      .then(setData)
      .then(() => setError(null))
      .catch(() => setError("Inventory data is temporarily unavailable."))
      .finally(() => setLoading(false));
  }, [appliedSearch, includeDescendants, location, match, page, sort, style]);

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
        <label className="filter-control search-control">
          Search beer, brewery, or original notes
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search inventory…"
          />
        </label>
        <LocationSelect
          data={locations}
          value={location}
          onChange={(value) => changeFilter(setLocation, value)}
        />
        <label className="filter-control">
          Beer style
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
        </label>
        <label className="filter-control">
          Check-in status
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
        </label>
        <label className="filter-control">
          Sort order
          <select
            value={sort}
            onChange={(event) => changeFilter(setSort, event.target.value)}
          >
            <option value="beer_name_asc">Beer name A–Z</option>
            <option value="beer_name_desc">Beer name Z–A</option>
            <option value="brewery_asc">Brewery A–Z</option>
            <option value="quantity_desc">Quantity high–low</option>
            <option value="best_before_asc">Best-before soonest</option>
            <option value="location_asc">Location A–Z</option>
          </select>
        </label>
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
        <button type="submit">Search</button>
      </form>
      {location && location !== "__unresolved__" && includeDescendants && (
        <p className="filter-note">
          Including inventory assigned to this location and all child locations.
        </p>
      )}
      {loading && (
        <section className="inventory-state">Loading inventory…</section>
      )}
      {error && !loading && (
        <section className="inventory-state error-state">
          <strong>{error}</strong>
          <p>Check the backend connection and try again.</p>
        </section>
      )}
      {!loading && !error && data && data.total === 0 && (
        <section className="inventory-state">
          <strong>No inventory records match these filters.</strong>
          <p>Try clearing the search or choosing a broader location.</p>
        </section>
      )}
      {!loading && !error && data && data.total > 0 && (
        <section className="inventory-results">
          <div className="section-heading">
            <p>{numberFormatter.format(data.total)} inventory records</p>
            <span>
              Page {data.page} of {data.total_pages}
            </span>
          </div>
          <InventoryRows
            data={data}
            onSelect={(item) => void selectDetail(item)}
          />
          <div className="pagination">
            <button
              type="button"
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={page >= data.total_pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}
      {detail && <DetailPanel item={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
