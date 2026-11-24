import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ExploreBeer,
  ExploreEntity,
  fetchExploreOptions,
  fetchExploreBounds,
  ExploreBeersResponse,
  fetchExploreBeers,
} from "../api/explore";
import { Button, Card, FormField } from "../components/ui";

import { FilterPanel, FilterSheet, OptionNames } from "./ExplorerFilters";
import {
  activeGroups,
  DEFAULT_SORT,
  emptyFilters,
  ExploreSort,
  Filters,
  readFilters,
  selectedSort,
  SORT_LABELS,
  writeFilters,
} from "./explorerState";

function selectedPage(value: string | null): number {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= 2147483647 ? page : 1;
}

function dateLabel(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleDateString(undefined, { timeZone: "Europe/Amsterdam" });
}

function ratingLabel(beer: ExploreBeer): string {
  if (beer.personal_average_rating === null) return "Not rated";
  return beer.personal_average_rating.toFixed(2);
}

function BeerArtwork({ beer }: { beer: ExploreBeer }) {
  const [failed, setFailed] = useState(false);
  if (!beer.photo_url || failed) {
    return (
      <span
        className="explorer-beer-artwork-fallback"
        role="img"
        aria-label={`${beer.name} artwork unavailable`}
      >
        Beer
      </span>
    );
  }
  return (
    <img
      className="explorer-beer-artwork"
      src={beer.photo_url}
      alt={`${beer.name} artwork`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function BeerCard({ beer }: { beer: ExploreBeer }) {
  return (
    <Card as="article" className="explorer-beer-card">
      <BeerArtwork beer={beer} />
      <div className="explorer-beer-card-content">
        <h4>{beer.name}</h4>
        <p>{beer.brewery?.name ?? "Brewery unavailable"}</p>
        <p>{beer.style?.name ?? "Style unavailable"}</p>
        <dl>
          <div>
            <dt>ABV</dt>
            <dd>{beer.abv === null ? "—" : `${beer.abv}%`}</dd>
          </div>
          <div>
            <dt>My rating</dt>
            <dd>{ratingLabel(beer)}</dd>
          </div>
          <div>
            <dt>Check-ins</dt>
            <dd>{beer.checkin_count}</dd>
          </div>
          <div>
            <dt>Last tried</dt>
            <dd>{dateLabel(beer.last_checked_in_at)}</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

export default function ExplorerBeers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const querySearch = (searchParams.get("search") ?? "").slice(0, 200);
  const sort = selectedSort(searchParams.get("sort"));
  const page = selectedPage(searchParams.get("page"));
  const urlStateKey = searchParams.toString();
  const filters = readFilters(searchParams);
  const pageSize = Math.min(
    100,
    selectedPage(searchParams.get("page_size") ?? "25"),
  );
  const [filterResetKey, setFilterResetKey] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [abvMax, setAbvMax] = useState(20);
  const [names, setNames] = useState<
    Record<"breweries" | "styles", OptionNames>
  >({ breweries: {}, styles: {} });
  const breweryNames = useCallback(
    (items: ExploreEntity[]) =>
      setNames((old) => ({
        ...old,
        breweries: {
          ...old.breweries,
          ...Object.fromEntries(items.map((i) => [String(i.id), i.name])),
        },
      })),
    [],
  );
  const styleNames = useCallback(
    (items: ExploreEntity[]) =>
      setNames((old) => ({
        ...old,
        styles: {
          ...old.styles,
          ...Object.fromEntries(items.map((i) => [String(i.id), i.name])),
        },
      })),
    [],
  );
  const onNames = { breweries: breweryNames, styles: styleNames };
  useEffect(() => {
    let cancelled = false;
    fetchExploreBounds()
      .then((result) => {
        if (!cancelled && Number.isFinite(result.abv_max))
          setAbvMax(result.abv_max);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const selectedBreweryIds = filters.brewery_id.join(",");
  const selectedStyleIds = filters.style_id.join(",");
  useEffect(() => {
    let cancelled = false;
    for (const [category, ids, receive] of [
      ["breweries", selectedBreweryIds, breweryNames],
      ["styles", selectedStyleIds, styleNames],
    ] as const) {
      if (!ids) continue;
      const params = new URLSearchParams({ limit: "100" });
      ids.split(",").forEach((id) => params.append("selected_id", id));
      fetchExploreOptions(category, params)
        .then((result) => {
          if (!cancelled) receive(result.items);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [selectedBreweryIds, selectedStyleIds, breweryNames, styleNames]);
  const [searchDraft, setSearchDraft] = useState(querySearch);
  const [data, setData] = useState<ExploreBeersResponse | null>(null);
  const [dataKey, setDataKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const latestUrlState = useRef(urlStateKey);
  latestUrlState.current = urlStateKey;

  useEffect(() => setSearchDraft(querySearch), [querySearch]);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    const requestedUrlState = urlStateKey;
    const isCurrentRequest = () =>
      generation === requestGeneration.current &&
      latestUrlState.current === requestedUrlState;
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      sort,
    });
    if (querySearch.trim()) params.set("search", querySearch.trim());
    writeFilters(params, readFilters(new URLSearchParams(requestedUrlState)));
    setLoading(true);
    setErrorKey(null);
    fetchExploreBeers(params)
      .then((result) => {
        if (!isCurrentRequest()) return;
        const normalizedPage =
          result.total_pages === 0
            ? page === 1
              ? null
              : 1
            : page > result.total_pages
              ? result.total_pages
              : null;
        if (normalizedPage !== null) {
          setSearchParams(
            (currentParams) => {
              if (!isCurrentRequest()) return currentParams;
              const nextParams = new URLSearchParams(currentParams);
              nextParams.set("page", String(normalizedPage));
              return nextParams;
            },
            { replace: true },
          );
          return;
        }
        setData(result);
        setDataKey(requestedUrlState);
      })
      .catch(() => {
        if (isCurrentRequest()) setErrorKey(requestedUrlState);
      })
      .finally(() => {
        if (isCurrentRequest()) setLoading(false);
      });
  }, [page, pageSize, querySearch, setSearchParams, sort, urlStateKey]);

  const currentData = dataKey === urlStateKey ? data : null;
  const currentError = errorKey === urlStateKey;
  const showLoading = loading || (!currentData && !currentError);

  function updateUrl(search: string, nextSort: ExploreSort, nextPage: number) {
    const params = new URLSearchParams(searchParams);
    params.delete("search");
    params.delete("sort");
    params.delete("page");
    if (search.trim()) params.set("search", search.trim());
    if (nextSort !== DEFAULT_SORT) params.set("sort", nextSort);
    if (nextPage > 1) params.set("page", String(nextPage));
    setSearchParams(params);
  }

  function applyFilters(next: Filters) {
    const params = new URLSearchParams(searchParams);
    writeFilters(params, next);
    params.delete("page");
    if (params.toString() !== searchParams.toString()) setSearchParams(params);
  }
  function clearFilters() {
    setFilterResetKey((key) => key + 1);
    applyFilters(emptyFilters());
  }
  function sortHeader(field: string) {
    updateUrl(
      querySearch,
      `${field}_${sort === `${field}_asc` ? "desc" : "asc"}` as ExploreSort,
      1,
    );
  }
  const chips = (["brewery_id", "style_id"] as const).flatMap((key) =>
    filters[key].map((id) => ({
      key: `${key}-${id}`,
      label:
        names[key === "brewery_id" ? "breweries" : "styles"][id] ??
        `${key === "brewery_id" ? "Brewery" : "Style"} #${id}`,
      remove: () =>
        applyFilters({
          ...filters,
          [key]: filters[key].filter((value) => value !== id),
        }),
    })),
  );
  for (const [label, low, high, unit] of [
    ["ABV", "abv_min", "abv_max", "%"],
    ["My rating", "rating_min", "rating_max", ""],
    ["First tried", "first_tried_from", "first_tried_to", ""],
    ["Last tried", "last_tried_from", "last_tried_to", ""],
  ] as const) {
    if (!filters[low] && !filters[high]) continue;
    chips.push({
      key: low,
      label: `${label}: ${filters[low] || "Any"}–${filters[high] || "Any"}${unit}`,
      remove: () => applyFilters({ ...filters, [low]: "", [high]: "" }),
    });
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    updateUrl(searchDraft, sort, 1);
  }

  return (
    <section
      className="explorer-catalogue"
      aria-labelledby="explore-beers-title"
    >
      <div className="section-heading explorer-catalogue-heading">
        <div>
          <h3 id="explore-beers-title">Beers</h3>
          <p>Beers you have checked in, with your personal history.</p>
        </div>
        {currentData && !showLoading && !currentError && (
          <span>{currentData.total.toLocaleString()} beers</span>
        )}
      </div>
      <div className="explorer-columns">
        <aside className="explorer-filter-sidebar" aria-label="Beer filters">
          <header>
            <h4>
              Filters <span>{activeGroups(filters)} active</span>
            </h4>
            <button type="button" onClick={clearFilters}>
              Clear all
            </button>
          </header>
          <FilterPanel
            key={filterResetKey}
            value={filters}
            onChange={applyFilters}
            abvMax={abvMax}
            names={names}
            onNames={onNames}
          />
        </aside>
        <div className="explorer-results">
          <form className="explorer-controls" onSubmit={submitSearch}>
            <FormField
              id="explorer-beer-search"
              label="Search beers or breweries"
              className="explorer-search-control"
            >
              <input
                type="search"
                maxLength={200}
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search your beers…"
              />
            </FormField>
            <FormField
              id="explorer-beer-sort"
              label="Sort beers"
              className="explorer-sort-control"
            >
              <select
                value={sort}
                onChange={(event) =>
                  updateUrl(querySearch, selectedSort(event.target.value), 1)
                }
              >
                {(Object.keys(SORT_LABELS) as ExploreSort[]).map((option) => (
                  <option key={option} value={option}>
                    {SORT_LABELS[option]}
                  </option>
                ))}
              </select>
            </FormField>
            <Button type="submit">Search</Button>
            <Button
              className="explorer-mobile-filters"
              type="button"
              variant="secondary"
              onClick={() => setSheetOpen(true)}
            >
              Filters ({activeGroups(filters)})
            </Button>
          </form>

          {chips.length > 0 && (
            <div
              className="explorer-active-filters"
              aria-label="Active filters"
            >
              <span>Active filters ({activeGroups(filters)})</span>
              {chips.map((chip) => (
                <button
                  className="explorer-chip"
                  type="button"
                  key={chip.key}
                  aria-label={`Remove ${chip.label}`}
                  onClick={chip.remove}
                >
                  {chip.label} ×
                </button>
              ))}
              <button type="button" onClick={clearFilters}>
                Clear all filters
              </button>
            </div>
          )}
          {sheetOpen && (
            <FilterSheet
              applied={filters}
              onApply={(next) => {
                applyFilters(next);
                setSheetOpen(false);
              }}
              onClose={() => setSheetOpen(false)}
              abvMax={abvMax}
              names={names}
              onNames={onNames}
            />
          )}
          {showLoading && (
            <div className="explorer-state" role="status">
              Loading beers…
            </div>
          )}
          {currentError && !showLoading && (
            <div className="explorer-state error-state" role="alert">
              <strong>Beer catalogue is temporarily unavailable.</strong>
              <p>Check the backend connection and try again.</p>
            </div>
          )}
          {!showLoading && !currentError && currentData?.total === 0 && (
            <div className="explorer-state">
              <strong>No checked-in beers match your search.</strong>
              <p>Try another name or brewery.</p>
            </div>
          )}
          {!showLoading &&
            !currentError &&
            currentData &&
            currentData.total > 0 && (
              <>
                <div
                  className="explorer-beer-table-wrap"
                  role="region"
                  aria-label="Beer catalogue table"
                  tabIndex={0}
                >
                  <table className="explorer-beer-table">
                    <thead>
                      <tr>
                        {(
                          [
                            ["Beer", "name"],
                            ["Brewery", "brewery"],
                            ["Style", "style"],
                            ["ABV", "abv"],
                            ["My rating", "rating"],
                            ["Last tried", "last_tried"],
                            ["Check-ins", "checkins"],
                          ] as const
                        ).map(([label, field]) => (
                          <th
                            key={field}
                            aria-sort={
                              sort === `${field}_asc`
                                ? "ascending"
                                : sort === `${field}_desc`
                                  ? "descending"
                                  : "none"
                            }
                          >
                            <button
                              type="button"
                              onClick={() => sortHeader(field)}
                            >
                              {label}{" "}
                              <span aria-hidden="true">
                                {sort === `${field}_asc`
                                  ? "↑"
                                  : sort === `${field}_desc`
                                    ? "↓"
                                    : "↕"}
                              </span>
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {currentData.items.map((beer) => (
                        <tr key={beer.id}>
                          <td>
                            <div className="explorer-beer-name-cell">
                              <BeerArtwork beer={beer} />
                              <strong>{beer.name}</strong>
                            </div>
                          </td>
                          <td>{beer.brewery?.name ?? "Unavailable"}</td>
                          <td>{beer.style?.name ?? "Unavailable"}</td>
                          <td>{beer.abv === null ? "—" : `${beer.abv}%`}</td>
                          <td>{ratingLabel(beer)}</td>
                          <td>{dateLabel(beer.last_checked_in_at)}</td>
                          <td>{beer.checkin_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="explorer-beer-cards">
                  {currentData.items.map((beer) => (
                    <BeerCard key={beer.id} beer={beer} />
                  ))}
                </div>
                <div
                  className="pagination explorer-pagination"
                  aria-label="Beer catalogue pagination"
                >
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={page <= 1}
                    onClick={() => updateUrl(querySearch, sort, page - 1)}
                  >
                    Previous
                  </Button>
                  <span>
                    Page {currentData.page} of {currentData.total_pages}
                  </span>
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={page >= currentData.total_pages}
                    onClick={() => updateUrl(querySearch, sort, page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}
        </div>
      </div>
    </section>
  );
}
