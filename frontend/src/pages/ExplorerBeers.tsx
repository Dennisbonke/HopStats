import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ExploreBeer,
  ExploreBeersResponse,
  fetchExploreBeers,
} from "../api/explore";

const DEFAULT_SORT = "last_tried_desc";
const SORTS = [
  "name_asc",
  "name_desc",
  "last_tried_desc",
  "last_tried_asc",
  "checkins_desc",
  "checkins_asc",
] as const;
type ExploreSort = (typeof SORTS)[number];

const SORT_LABELS: Record<ExploreSort, string> = {
  name_asc: "Beer name A–Z",
  name_desc: "Beer name Z–A",
  last_tried_desc: "Most recently tried",
  last_tried_asc: "Least recently tried",
  checkins_desc: "Most check-ins",
  checkins_asc: "Fewest check-ins",
};

function selectedSort(value: string | null): ExploreSort {
  return SORTS.includes(value as ExploreSort)
    ? (value as ExploreSort)
    : DEFAULT_SORT;
}

function selectedPage(value: string | null): number {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

function dateLabel(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleDateString();
}

function ratingLabel(beer: ExploreBeer): string {
  if (beer.personal_average_rating === null) return "Not rated";
  return `${beer.personal_average_rating.toFixed(2)} average (${beer.rated_checkin_count} rated)`;
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
    <article className="explorer-beer-card">
      <BeerArtwork beer={beer} />
      <div className="explorer-beer-card-content">
        <h4>{beer.name}</h4>
        <p>{beer.brewery?.name ?? "Brewery unavailable"}</p>
        <p>{beer.style?.name ?? "Style unavailable"}</p>
        <dl>
          <div>
            <dt>Personal rating</dt>
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
    </article>
  );
}

export default function ExplorerBeers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const querySearch = searchParams.get("search") ?? "";
  const sort = selectedSort(searchParams.get("sort"));
  const page = selectedPage(searchParams.get("page"));
  const urlStateKey = searchParams.toString();
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
      page_size: "25",
      sort,
    });
    if (querySearch.trim()) params.set("search", querySearch.trim());
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
  }, [page, querySearch, setSearchParams, sort, urlStateKey]);

  const currentData = dataKey === urlStateKey ? data : null;
  const currentError = errorKey === urlStateKey;
  const showLoading = loading || (!currentData && !currentError);

  function updateUrl(search: string, nextSort: ExploreSort, nextPage: number) {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (nextSort !== DEFAULT_SORT) params.set("sort", nextSort);
    if (nextPage > 1) params.set("page", String(nextPage));
    setSearchParams(params);
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
      <form className="explorer-controls" onSubmit={submitSearch}>
        <label className="explorer-search-control">
          Search beers or breweries
          <input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search your beers…"
            aria-label="Search beers or breweries"
          />
        </label>
        <label className="explorer-sort-control">
          Sort beers
          <select
            value={sort}
            aria-label="Sort beers"
            onChange={(event) =>
              updateUrl(querySearch, selectedSort(event.target.value), 1)
            }
          >
            {SORTS.map((option) => (
              <option key={option} value={option}>
                {SORT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Search</button>
      </form>

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
            <div className="explorer-beer-table-wrap">
              <table className="explorer-beer-table">
                <thead>
                  <tr>
                    <th>Beer</th>
                    <th>Brewery</th>
                    <th>Style</th>
                    <th>ABV</th>
                    <th>Personal rating</th>
                    <th>Check-ins</th>
                    <th>Last tried</th>
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
                      <td>{beer.checkin_count}</td>
                      <td>{dateLabel(beer.last_checked_in_at)}</td>
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
              <button
                type="button"
                className="secondary-button"
                disabled={page <= 1}
                onClick={() => updateUrl(querySearch, sort, page - 1)}
              >
                Previous
              </button>
              <span>
                Page {currentData.page} of {currentData.total_pages}
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={page >= currentData.total_pages}
                onClick={() => updateUrl(querySearch, sort, page + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
    </section>
  );
}
