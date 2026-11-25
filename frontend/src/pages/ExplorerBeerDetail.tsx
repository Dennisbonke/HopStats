import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { fetchBeerDetail, fetchBeerHistory } from "../api/explore";
import type { BeerCheckin, ExploreLocation } from "../api/explore";
import BeerArtwork from "../components/BeerArtwork";
import BeerRatingChart from "../components/BeerRatingChart";
import { Button } from "../components/ui";
import {
  checkinDate,
  explorerReturnUrl,
  personalRating,
  safeImageUrl,
} from "../utils/explorer";

function useBeerResource<T>(
  key: string,
  load: (key: string) => Promise<T>,
  enabled: boolean,
) {
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: unknown;
  }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setResult(undefined);
    load(key)
      .then((data) => {
        if (current) setResult({ key, data });
      })
      .catch((error: unknown) => {
        if (current) setResult({ key, error });
      });
    return () => {
      current = false;
    };
  }, [key, load, enabled, attempt]);
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    retry: () => setAttempt((v) => v + 1),
  };
}
const loadHistory = (key: string) => {
  const [id, query] = key.split("?");
  return fetchBeerHistory(id, new URLSearchParams(query));
};
function positivePage(value: string | null, fallback: number, max: number) {
  if (!value || !/^[1-9]\d*$/.test(value)) return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) && number <= max ? number : fallback;
}
function locationLabel(location: ExploreLocation) {
  return [location.city, location.state, location.country]
    .filter(Boolean)
    .join(", ");
}
function ExternalLink({
  url,
  children,
}: {
  url: string | null;
  children: string;
}) {
  // Server-generated canonical links only; imported text is never a link target.
  if (!url || !/^https:\/\/untappd\.com\/(beer|c)\/[1-9][0-9]*$/.test(url))
    return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
function HistoryPhoto({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const safe = safeImageUrl(url);
  return !safe || failed ? (
    <p className="beer-photo-unavailable">Check-in photo unavailable</p>
  ) : (
    <img
      className="beer-checkin-photo"
      src={safe}
      alt="Imported check-in photo"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
function HistoryEntry({ item }: { item: BeerCheckin }) {
  return (
    <li className="beer-checkin-entry">
      <article>
        <header>
          <time dateTime={item.occurred_at_utc}>
            {checkinDate(item.occurred_at_utc, true)}
          </time>
          <strong>{personalRating(item.rating)}</strong>
        </header>
        {item.comment && <p className="beer-checkin-comment">{item.comment}</p>}
        {(item.serving_type || item.venue || item.purchase_venue) && (
          <dl className="beer-checkin-metadata">
            {item.serving_type && (
              <div>
                <dt>Serving</dt>
                <dd>{item.serving_type}</dd>
              </div>
            )}
            {item.venue && (
              <div>
                <dt>Check-in venue</dt>
                <dd>
                  {item.venue.name}
                  {locationLabel(item.venue) && (
                    <span>{locationLabel(item.venue)}</span>
                  )}
                </dd>
              </div>
            )}
            {item.purchase_venue && (
              <div>
                <dt>Purchased at</dt>
                <dd>{item.purchase_venue}</dd>
              </div>
            )}
          </dl>
        )}
        {item.photo_url && (
          <HistoryPhoto key={item.photo_url} url={item.photo_url} />
        )}
        <ExternalLink url={item.untappd_url}>
          View original check-in on Untappd ↗
        </ExternalLink>
      </article>
    </li>
  );
}
function ResourceError({
  error,
  retry,
  history = false,
}: {
  error: unknown;
  retry: () => void;
  history?: boolean;
}) {
  const status = error instanceof ApiError ? error.status : null;
  return (
    <div role="alert" className="explorer-state error-state">
      <p>
        {status === 404
          ? "Beer not found in your check-in history."
          : status === 401
            ? "Your session has expired. Sign in again."
            : history
              ? "Check-in history is temporarily unavailable."
              : "Beer details are temporarily unavailable."}
      </p>
      {status !== 404 && status !== 401 && (
        <Button type="button" variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export default function ExplorerBeerDetail() {
  const { beerId = "" } = useParams();
  const validId =
    /^[1-9][0-9]*$/.test(beerId) && BigInt(beerId) <= 9223372036854775807n;
  const [params, setParams] = useSearchParams();
  const page = positivePage(params.get("page"), 1, 2147483647);
  const pageSize = positivePage(params.get("page_size"), 25, 100);
  const sort = params.get("sort") === "oldest" ? "oldest" : "newest";
  const profile = useBeerResource(beerId, fetchBeerDetail, validId);
  const historyKey = `${beerId}?${new URLSearchParams({ page: String(page), page_size: String(pageSize), sort })}`;
  const history = useBeerResource(historyKey, loadHistory, validId);
  const beer = profile.data;
  const items = history.data;
  const returnTo = explorerReturnUrl(params.get("returnTo"));
  useEffect(() => {
    const changes: Record<string, string> = {};
    if (
      params.has("page") &&
      params.get("page") !== String(items?.page ?? page)
    )
      changes.page = String(items?.page ?? page);
    if (params.has("page_size") && params.get("page_size") !== String(pageSize))
      changes.page_size = String(pageSize);
    if (params.has("sort") && params.get("sort") !== sort) changes.sort = sort;
    if (Object.keys(changes).length)
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes))
            next.set(key, value);
          return next;
        },
        { replace: true },
      );
  }, [items, page, pageSize, sort, params, setParams]);
  function updateHistory(nextPage: number, nextSort = sort) {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    next.set("sort", nextSort);
    setParams(next);
  }
  return (
    <section className="beer-detail" aria-label="Beer details">
      <Link className="beer-detail-back" to={returnTo}>
        ← Back to Beer Explorer
      </Link>
      {!validId ? (
        <ResourceError error={new ApiError(404)} retry={profile.retry} />
      ) : profile.error ? (
        <ResourceError error={profile.error} retry={profile.retry} />
      ) : !beer ? (
        <p role="status">Loading beer details…</p>
      ) : (
        <>
          <header className="beer-profile">
            <BeerArtwork key={`${beer.id}:${beer.photo_url}`} beer={beer} />
            <div>
              <h1>{beer.name}</h1>
              <p>{beer.brewery?.name ?? "Brewery unavailable"}</p>
              <p>{beer.style?.name ?? "Style unavailable"}</p>
              <dl className="beer-profile-metadata">
                {beer.abv !== null && (
                  <div>
                    <dt>ABV</dt>
                    <dd>{beer.abv}%</dd>
                  </div>
                )}
                {beer.ibu !== null && (
                  <div>
                    <dt>IBU</dt>
                    <dd>{beer.ibu}</dd>
                  </div>
                )}
                {beer.brewery && locationLabel(beer.brewery) && (
                  <div>
                    <dt>Brewery location</dt>
                    <dd>{locationLabel(beer.brewery)}</dd>
                  </div>
                )}
              </dl>
              <ExternalLink url={beer.untappd_url}>
                View beer on Untappd ↗
              </ExternalLink>
            </div>
          </header>
          <section aria-label="Personal statistics">
            <dl className="beer-personal-stats">
              {[
                ["Total check-ins", beer.checkin_count],
                [
                  "My average rating",
                  personalRating(beer.personal_average_rating),
                ],
                ["Highest rating", personalRating(beer.highest_rating)],
                ["Lowest rating", personalRating(beer.lowest_rating)],
                ["First tried", checkinDate(beer.first_checked_in_at)],
                ["Last tried", checkinDate(beer.last_checked_in_at)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                  {label === "My average rating" && (
                    <small>{beer.rated_checkin_count} rated check-ins</small>
                  )}
                </div>
              ))}
            </dl>
          </section>
          <div className="beer-detail-columns">
            <BeerRatingChart points={beer.rating_history} />
            <section
              className="beer-history"
              aria-labelledby="beer-history-title"
            >
              <div className="beer-history-heading">
                <h2 id="beer-history-title">Check-in history</h2>
                <label>
                  History order
                  <select
                    value={sort}
                    onChange={(event) => updateHistory(1, event.target.value)}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </label>
              </div>
              <p>
                Imported from Untappd. Make changes to your check-ins in
                Untappd.
              </p>
              {history.error ? (
                <ResourceError
                  error={history.error}
                  retry={history.retry}
                  history
                />
              ) : !items ? (
                <p role="status">Loading check-in history…</p>
              ) : (
                <>
                  <ol
                    className="beer-checkin-list"
                    aria-label="Imported check-ins"
                  >
                    {items.items.map((item) => (
                      <HistoryEntry key={item.id} item={item} />
                    ))}
                  </ol>
                  <nav
                    className="pagination explorer-pagination"
                    aria-label="Check-in history pagination"
                  >
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={items.page <= 1}
                      onClick={() => updateHistory(items.page - 1)}
                    >
                      Previous
                    </Button>
                    <span>
                      Page {items.page} of {items.total_pages} · {items.total}{" "}
                      check-ins
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={items.page >= items.total_pages}
                      onClick={() => updateHistory(items.page + 1)}
                    >
                      Next
                    </Button>
                  </nav>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
