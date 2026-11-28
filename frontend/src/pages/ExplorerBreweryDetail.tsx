import { isExplorerDetail } from "../utils/explorer";
import { detailLink, detailReturn, detailBackState } from "../utils/explorer";
import { useEffect } from "react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ApiError } from "../api/client";
import { fetchBreweryDetail } from "../api/explore";
import BeerArtwork from "../components/BeerArtwork";
import BreweryArtwork from "../components/BreweryArtwork";
import BreweryRatingChart from "../components/BreweryRatingChart";
import { Button } from "../components/ui";
import {
  breweryLocation,
  personalRating,
  checkinDate,
} from "../utils/explorer";
import { useBeerResource } from "./ExplorerBeerDetail";

export default function ExplorerBreweryDetail() {
  const { breweryId = "" } = useParams();
  const location = useLocation();
  const [params] = useSearchParams();
  const valid =
    /^[1-9][0-9]*$/.test(breweryId) &&
    BigInt(breweryId) <= 9223372036854775807n;
  const profile = useBeerResource(breweryId, fetchBreweryDetail, valid);
  const brewery = profile.data;
  const returnTo = detailReturn(params, location.state, "/explore/breweries");
  const error = !valid ? new ApiError(404) : profile.error;
  const status = error instanceof ApiError ? error.status : null;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [breweryId]);
  return (
    <section className="beer-detail" aria-label="Brewery details">
      <Link
        className="beer-detail-back"
        to={returnTo}
        state={detailBackState(location.state)}
      >
        {returnTo.startsWith("/explore/styles/")
          ? "← Back to style"
          : returnTo.startsWith("/explore/beers/")
            ? "← Back to beer"
            : "← Back to breweries"}
      </Link>
      {isExplorerDetail(returnTo) && (
        <Link className="beer-detail-back" to="/explore/breweries">
          Brewery catalogue
        </Link>
      )}
      {error ? (
        <div className="explorer-state error-state" role="alert">
          <p>
            {status === 404
              ? "Brewery not found in your check-in history."
              : status === 401
                ? "Your session has expired. Sign in again."
                : "Brewery details are temporarily unavailable."}
          </p>
          {status !== 404 && status !== 401 && (
            <Button type="button" onClick={profile.retry}>
              Try again
            </Button>
          )}
        </div>
      ) : !brewery ? (
        <p role="status">Loading brewery details…</p>
      ) : (
        <>
          <header className="beer-profile">
            <BreweryArtwork />
            <div>
              <h1>{brewery.name}</h1>
              <p>{breweryLocation(brewery)}</p>
              {brewery.untappd_url &&
                /^https:\/\/untappd\.com\/brewery\/[1-9][0-9]*$/.test(
                  brewery.untappd_url,
                ) && (
                  <a
                    href={brewery.untappd_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View brewery on Untappd ↗
                  </a>
                )}
            </div>
          </header>
          <section aria-label="Personal statistics">
            <dl className="beer-personal-stats">
              {[
                ["Unique beers", brewery.unique_beer_count],
                ["Total check-ins", brewery.checkin_count],
                ["Rated check-ins", brewery.rated_checkin_count],
                [
                  "My average rating",
                  personalRating(brewery.personal_average_rating),
                ],
                ["Styles tried", brewery.style_count],
                ["Highest rating", personalRating(brewery.highest_rating)],
                ["Lowest rating", personalRating(brewery.lowest_rating)],
                ["First tried", checkinDate(brewery.first_checked_in_at)],
                ["Last tried", checkinDate(brewery.last_checked_in_at)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <Link
            className="ui-button ui-button--primary"
            to={`/explore/beers?brewery_id=${brewery.id}`}
          >
            Explore all {brewery.unique_beer_count} beers
          </Link>
          <div className="beer-detail-columns brewery-detail-sections">
            <BreweryRatingChart buckets={brewery.rating_distribution} />
            <section>
              <h2>Most explored styles</h2>
              {!brewery.most_explored_styles.length ? (
                <p>No known styles yet.</p>
              ) : (
                <ul className="brewery-style-list">
                  {brewery.most_explored_styles.map((style) => (
                    <li key={style.id}>
                      <Link {...detailLink("styles", style.id, location)}>
                        {style.name}: {style.unique_beer_count} unique beers
                      </Link>
                      <meter
                        min={0}
                        max={brewery.most_explored_styles[0].unique_beer_count}
                        value={style.unique_beer_count}
                        aria-label={`${style.name} unique beers`}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <p>
                Ranked by distinct personally tried beers with known styles.
              </p>
            </section>
            <section>
              <h2>Highest-rated beers</h2>
              {!brewery.highest_rated_beers.length ? (
                <p>No rated beers yet.</p>
              ) : (
                <ul className="brewery-top-beers">
                  {brewery.highest_rated_beers.map((beer) => (
                    <li key={beer.id}>
                      <BeerArtwork beer={beer} />
                      <Link {...detailLink("beers", beer.id, location)}>
                        {beer.name}
                      </Link>
                      <strong>
                        {personalRating(beer.personal_average_rating)}
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
