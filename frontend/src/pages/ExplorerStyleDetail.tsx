import { detailLink, detailReturn, detailBackState } from "../utils/explorer";
import { useEffect } from "react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ApiError } from "../api/client";
import { fetchStyleDetail } from "../api/explore";
import BeerArtwork from "../components/BeerArtwork";
import BreweryArtwork from "../components/BreweryArtwork";
import BreweryRatingChart from "../components/BreweryRatingChart";
import { Button } from "../components/ui";
import { personalRating, checkinDate } from "../utils/explorer";
import { useBeerResource } from "./ExplorerBeerDetail";

export default function ExplorerStyleDetail() {
  const { styleId = "" } = useParams();
  const location = useLocation();
  const [params] = useSearchParams();
  const valid =
    /^[1-9][0-9]*$/.test(styleId) && BigInt(styleId) <= 9223372036854775807n;
  const profile = useBeerResource(styleId, fetchStyleDetail, valid);
  const style = profile.data;
  const returnTo = detailReturn(params, location.state, "/explore/styles");
  const error = !valid ? new ApiError(404) : profile.error;
  const status = error instanceof ApiError ? error.status : null;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [styleId]);
  return (
    <section className="beer-detail" aria-label="Style details">
      <Link
        className="beer-detail-back"
        to={returnTo}
        state={detailBackState(location.state)}
      >
        {returnTo.startsWith("/explore/styles/")
          ? "← Back to style"
          : returnTo.startsWith("/explore/beers/")
            ? "← Back to beer"
            : returnTo.startsWith("/explore/breweries/")
              ? "← Back to brewery"
              : "← Back to styles"}
      </Link>
      {returnTo.startsWith("/explore/beers/") && (
        <Link className="beer-detail-back" to="/explore/styles">
          Style catalogue
        </Link>
      )}
      {error ? (
        <div className="explorer-state error-state" role="alert">
          <p>
            {status === 404
              ? "Style not found in your check-in history."
              : status === 401
                ? "Your session has expired. Sign in again."
                : "Style details are temporarily unavailable."}
          </p>
          {status !== 404 && status !== 401 && (
            <Button type="button" onClick={profile.retry}>
              Try again
            </Button>
          )}
        </div>
      ) : !style ? (
        <p role="status">Loading style details…</p>
      ) : (
        <>
          <header className="beer-profile">
            <div>
              <h1>{style.name}</h1>
              <p>
                First tried {checkinDate(style.first_checked_in_at)} · Last
                tried {checkinDate(style.last_checked_in_at)}
              </p>
            </div>
          </header>
          <section aria-label="Personal statistics">
            <dl className="beer-personal-stats">
              {[
                ["Unique beers", style.unique_beer_count],
                ["Total check-ins", style.checkin_count],
                ["Rated check-ins", style.rated_checkin_count],
                [
                  "My average rating",
                  personalRating(style.personal_average_rating),
                ],
                ["Distinct breweries", style.brewery_count],
                [
                  "Average ABV",
                  style.average_abv === null
                    ? "Not available"
                    : `${style.average_abv.toFixed(2)}%`,
                ],
                ["Highest rating", personalRating(style.highest_rating)],
                ["Lowest rating", personalRating(style.lowest_rating)],
                ["First tried", checkinDate(style.first_checked_in_at)],
                ["Last tried", checkinDate(style.last_checked_in_at)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <p>
            Average ABV is based on {style.known_abv_beer_count} distinct beers
            with known ABV.
          </p>
          <Link
            className="ui-button ui-button--primary"
            to={`/explore/beers?style_id=${style.id}`}
          >
            Explore all {style.unique_beer_count} beers
          </Link>
          <div className="beer-detail-columns brewery-detail-sections">
            <BreweryRatingChart buckets={style.rating_distribution} />
            <section>
              <h2>Most explored breweries</h2>
              {!style.most_explored_breweries.length ? (
                <p>No known breweries yet.</p>
              ) : (
                <ul className="brewery-style-list">
                  {style.most_explored_breweries.map((brewery) => (
                    <li key={brewery.id}>
                      <BreweryArtwork />
                      <Link {...detailLink("breweries", brewery.id, location)}>
                        {brewery.name}: {brewery.unique_beer_count} unique beers
                      </Link>
                      <meter
                        min={0}
                        max={style.most_explored_breweries[0].unique_beer_count}
                        value={brewery.unique_beer_count}
                        aria-label={`${brewery.name} unique beers`}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <p>
                Ranked by distinct personally tried beers with known breweries.
              </p>
            </section>
            <section>
              <h2>Highest-rated beers</h2>
              {!style.highest_rated_beers.length ? (
                <p>No rated beers yet.</p>
              ) : (
                <ul className="brewery-top-beers">
                  {style.highest_rated_beers.map((beer) => (
                    <li key={beer.id}>
                      <BeerArtwork beer={beer} />
                      <div className="style-top-beer-name">
                        <Link {...detailLink("beers", beer.id, location)}>
                          {beer.name}
                        </Link>
                        {beer.brewery && <small>{beer.brewery.name}</small>}
                      </div>
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
