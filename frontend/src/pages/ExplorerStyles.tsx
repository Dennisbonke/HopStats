import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigationType,
  useSearchParams,
} from "react-router-dom";
import {
  ExploreStyle,
  ExploreStylesResponse,
  fetchExploreStyles,
} from "../api/explore";
import { Button, FormField } from "../components/ui";

import {
  styleDetailUrl,
  saveExplorerScroll,
  readExplorerScroll,
  explorerEntryKey,
} from "../utils/explorer";

import {
  StyleFilterPanel as FilterPanel,
  StyleFilterSheet as FilterSheet,
} from "./StyleFilters";
import {
  activeGroups,
  FILTER_KEYS,
  DEFAULT_SORT,
  emptyFilters,
  ExploreSort,
  Filters,
  readFilters,
  sameFilters,
  selectedSort,
  SORT_LABELS,
  writeFilters,
} from "./styleState";

// Keep aligned with Explorer.css: narrow screens OR short phone landscape.
const MOBILE_QUERY =
  "(max-width: 700px), (max-width: 960px) and (orientation: landscape) and (max-height: 500px)";
function useMobileExplorer() {
  const [mobile, setMobile] = useState(
    () => window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const changed = () => setMobile(media.matches);
    media.addEventListener("change", changed);
    changed();
    return () => media.removeEventListener("change", changed);
  }, []);
  return mobile;
}

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

function ratingLabel(beer: ExploreStyle): string {
  if (beer.personal_average_rating === null) return "Not rated";
  return beer.personal_average_rating.toFixed(2);
}

function StyleCard({ beer }: { beer: ExploreStyle }) {
  const location = useLocation();
  return (
    <Link
      className="ui-card ui-card--standard explorer-beer-card"
      to={styleDetailUrl(beer.id, location.search)}
      state={{ explorerEntryKey: explorerEntryKey(location.key) }}
      onClick={() =>
        saveExplorerScroll(
          explorerEntryKey(location.key),
          location.search,
          "/explore/styles",
        )
      }
    >
      <div className="explorer-beer-card-content">
        <h4>{beer.name}</h4>
        <dl>
          <div>
            <dt>Unique beers</dt>
            <dd>{beer.unique_beer_count}</dd>
          </div>
          <div>
            <dt>Breweries</dt>
            <dd>{beer.brewery_count}</dd>
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
            <dt>First tried</dt>
            <dd>{dateLabel(beer.first_checked_in_at)}</dd>
          </div>
          <div>
            <dt>Last tried</dt>
            <dd>{dateLabel(beer.last_checked_in_at)}</dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}

export default function ExplorerStyles() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const restoredEntry = useRef<string | null>(null);
  const querySearch = (searchParams.get("search") ?? "").slice(0, 200);
  const sort = selectedSort(searchParams.get("sort"));
  const page = selectedPage(searchParams.get("page"));
  const urlStateKey = searchParams.toString();
  const filters = readFilters(searchParams);
  const pendingParams = useRef(searchParams);
  pendingParams.current = searchParams;
  const pageSize = Math.min(
    100,
    selectedPage(searchParams.get("page_size") ?? "25"),
  );
  const [filterResetKey, setFilterResetKey] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const mobile = useMobileExplorer();
  useEffect(() => {
    if (!mobile && sheetOpen) {
      setSheetOpen(false);
      document.getElementById("explorer-beer-search")?.focus();
    }
  }, [mobile, sheetOpen]);
  const [searchDraft, setSearchDraft] = useState(querySearch);
  const [data, setData] = useState<ExploreStylesResponse | null>(null);
  const [dataKey, setDataKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
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
    fetchExploreStyles(params)
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
  }, [
    page,
    pageSize,
    querySearch,
    setSearchParams,
    sort,
    urlStateKey,
    attempt,
  ]);

  const currentData = dataKey === urlStateKey ? data : null;
  useEffect(() => {
    if (dataKey !== urlStateKey || !data) return;
    if (restoredEntry.current === location.key) return;
    const saved = readExplorerScroll(
      navigationType === "POP"
        ? (window.history.state?.hopstatsExplorerSavedKey ??
            location.state?.explorerReturnKey)
        : location.state?.explorerReturnKey,
      location.search,
      "/explore/styles",
    );
    const frame = requestAnimationFrame(() => {
      restoredEntry.current = location.key;
      if (saved !== null) window.scrollTo(0, saved);
      else if (navigationType === "PUSH") window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    dataKey,
    urlStateKey,
    data,
    location.key,
    location.search,
    location.state,
    navigationType,
  ]);
  const currentError = errorKey === urlStateKey;
  const showLoading = loading || (!currentData && !currentError);

  function updateUrl(search: string, nextSort: ExploreSort, nextPage: number) {
    const params = new URLSearchParams(pendingParams.current);
    params.delete("search");
    params.delete("sort");
    params.delete("page");
    if (search.trim()) params.set("search", search.trim());
    if (nextSort !== DEFAULT_SORT) params.set("sort", nextSort);
    if (nextPage > 1) params.set("page", String(nextPage));
    pendingParams.current = params;
    setSearchParams(params);
  }

  function applyFilters(next: Filters, replace = false) {
    const params = new URLSearchParams(pendingParams.current);
    const latest = readFilters(params);
    const merged = { ...latest };
    for (const key of FILTER_KEYS) {
      if (replace || filters[key] !== next[key]) merged[key] = next[key];
    }
    if (sameFilters(latest, merged)) return;
    writeFilters(params, merged);
    params.delete("page");
    pendingParams.current = params;
    setSearchParams(params);
  }
  function clearFilters() {
    setFilterResetKey((key) => key + 1);
    applyFilters(emptyFilters(), true);
  }
  function sortHeader(field: string) {
    updateUrl(
      querySearch,
      `${field}_${sort === `${field}_asc` ? "desc" : "asc"}` as ExploreSort,
      1,
    );
  }
  const chips: { key: string; label: string; remove: () => void }[] = [];
  for (const [label, keys] of [
    ["Minimum unique beers", ["min_unique_beers"]],
    ["Minimum check-ins", ["min_checkins"]],
    ["Minimum distinct breweries", ["min_breweries"]],
    ["Average ABV", ["abv_min", "abv_max"]],
    ["My rating", ["rating_min", "rating_max"]],
    ["First tried", ["first_tried_from", "first_tried_to"]],
    ["Last tried", ["last_tried_from", "last_tried_to"]],
  ] as [string, (keyof Filters)[]][]) {
    if (keys.some((key) => filters[key]))
      chips.push({
        key: keys[0],
        label: `${label}: ${keys.map((key) => filters[key] || "Any").join("–")}`,
        remove: () =>
          applyFilters({
            ...filters,
            ...Object.fromEntries(keys.map((key) => [key, ""])),
          }),
      });
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (searchDraft.trim() === querySearch.trim()) return;
    updateUrl(searchDraft, sort, 1);
  }

  return (
    <section
      className="explorer-catalogue explorer-styles"
      aria-labelledby="explore-styles-title"
    >
      <div className="section-heading explorer-catalogue-heading">
        <div>
          <h3 id="explore-styles-title">Styles</h3>
          <p>Styles you have explored, with your personal history.</p>
        </div>
        {currentData && !showLoading && !currentError && (
          <span>{currentData.total.toLocaleString()} styles</span>
        )}
      </div>
      <div className="explorer-columns">
        {!mobile && (
          <aside className="explorer-filter-sidebar" aria-label="Style filters">
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
            />
          </aside>
        )}
        <div className="explorer-results">
          <form className="explorer-controls" onSubmit={submitSearch}>
            <FormField
              id="explorer-beer-search"
              label="Search styles"
              className="explorer-search-control"
            >
              <input
                type="search"
                maxLength={200}
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search your styles…"
              />
            </FormField>
            <FormField
              id="explorer-beer-sort"
              label="Sort styles"
              className="explorer-sort-control"
            >
              <select
                value={sort}
                onChange={(event) => {
                  const next = selectedSort(event.target.value);
                  if (next !== sort) updateUrl(querySearch, next, 1);
                }}
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
          {mobile && sheetOpen && (
            <FilterSheet
              applied={filters}
              onApply={(next) => {
                applyFilters(next);
                setSheetOpen(false);
              }}
              onClose={() => setSheetOpen(false)}
            />
          )}
          {showLoading && (
            <div className="explorer-state" role="status">
              Loading styles…
            </div>
          )}
          {currentError && !showLoading && (
            <div className="explorer-state error-state" role="alert">
              <strong>Style catalogue is temporarily unavailable.</strong>
              <p>Check the backend connection and try again.</p>
              <Button type="button" onClick={() => setAttempt((v) => v + 1)}>
                Try again
              </Button>
            </div>
          )}
          {!showLoading && !currentError && currentData?.total === 0 && (
            <div className="explorer-state">
              <strong>
                {querySearch.trim()
                  ? activeGroups(filters)
                    ? "No styles match your search and filters."
                    : "No styles match your search."
                  : activeGroups(filters)
                    ? "No styles match your filters."
                    : "No styles in your catalogue yet."}
              </strong>
              <p>
                {querySearch.trim()
                  ? activeGroups(filters)
                    ? "Try a different search or broaden your filters."
                    : "Try another style name."
                  : activeGroups(filters)
                    ? "Adjust or clear your filters to see more styles."
                    : "Import your Untappd check-ins to start exploring your beer history."}
              </p>
              <div className="explorer-empty-actions">
                {activeGroups(filters) > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </Button>
                )}
                {querySearch.trim() && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => updateUrl("", sort, 1)}
                  >
                    Clear search
                  </Button>
                )}
                {querySearch.trim() && activeGroups(filters) > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const params = new URLSearchParams(searchParams);
                      writeFilters(params, emptyFilters());
                      params.delete("search");
                      params.delete("page");
                      setFilterResetKey((key) => key + 1);
                      setSearchParams(params);
                    }}
                  >
                    Clear search and filters
                  </Button>
                )}
              </div>
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
                  aria-label="Style catalogue table"
                  tabIndex={0}
                >
                  <table className="explorer-beer-table">
                    <thead>
                      <tr>
                        {(
                          [
                            ["Style", "name"],
                            ["Unique beers", "unique_beers"],
                            ["Check-ins", "checkins"],
                            ["My avg. rating", "rating"],
                            ["Breweries", "breweries"],
                            ["First tried", "first_tried"],
                            ["Last tried", "last_tried"],
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
                        <tr key={beer.id} className="explorer-beer-row">
                          <td>
                            <div className="explorer-beer-name-cell">
                              <Link
                                className="explorer-beer-link"
                                to={styleDetailUrl(beer.id, location.search)}
                                state={{
                                  explorerEntryKey: explorerEntryKey(
                                    location.key,
                                  ),
                                }}
                                onClick={() =>
                                  saveExplorerScroll(
                                    explorerEntryKey(location.key),
                                    location.search,
                                    "/explore/styles",
                                  )
                                }
                              >
                                <strong>{beer.name}</strong>
                              </Link>
                            </div>
                          </td>
                          <td>{beer.unique_beer_count}</td>
                          <td>{beer.checkin_count}</td>
                          <td>{ratingLabel(beer)}</td>
                          <td>{beer.brewery_count}</td>
                          <td>{dateLabel(beer.first_checked_in_at)}</td>
                          <td>{dateLabel(beer.last_checked_in_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="explorer-beer-cards">
                  {currentData.items.map((beer) => (
                    <StyleCard key={beer.id} beer={beer} />
                  ))}
                </div>
                <div
                  className="pagination explorer-pagination"
                  aria-label="Style catalogue pagination"
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
