import type {
  ExploreStyle,
  StyleDetail,
  BeerDetail,
  ExploreBrewery,
  BreweryDetail,
} from "../src/api/explore";
import { type Page } from "@playwright/test";
import { beer, stubBeer } from "./landscape-beer-fixtures";
import { stubExplorerOptions } from "./explorer-option-fixtures";
export const style = {
  ...beer.style,
  name: "IPA - Imperial / Double New England / Hazy With An ExtraordinarilyLongUnbrokenImportedStyleName",
  unique_beer_count: 2,
  checkin_count: 27,
  rated_checkin_count: 4,
  personal_average_rating: 3.125,
  brewery_count: 1,
  average_abv: 10,
  known_abv_beer_count: 2,
  first_checked_in_at: beer.first_checked_in_at,
  last_checked_in_at: beer.last_checked_in_at,
} satisfies ExploreStyle;
export const buckets = Array.from({ length: 10 }, (_, i) => ({
  lower: i / 2,
  upper: (i + 1) / 2,
  count: [0, 7, 8, 9].includes(i) ? 1 : 0,
}));
export const styledBeer = {
  ...beer,
  style: { id: style.id, name: style.name },
} satisfies BeerDetail;
export const companionBeer = {
  ...styledBeer,
  id: 2,
  name: "Unrated companion beer",
  abv: 7.5,
  checkin_count: 1,
  rated_checkin_count: 0,
  personal_average_rating: null,
  highest_rating: null,
  lowest_rating: null,
  rating_history: [],
  first_checked_in_at: styledBeer.last_checked_in_at,
} satisfies BeerDetail;
export const styleDetail = {
  ...style,
  highest_rating: 5,
  lowest_rating: 0,
  rating_distribution: buckets,
  most_explored_breweries: [{ ...beer.brewery, unique_beer_count: 2 }],
  highest_rated_beers: [styledBeer],
} satisfies StyleDetail;
export const brewery = {
  ...beer.brewery,
  unique_beer_count: 2,
  checkin_count: 27,
  rated_checkin_count: 4,
  personal_average_rating: 3.125,
  first_checked_in_at: beer.first_checked_in_at,
  last_checked_in_at: beer.last_checked_in_at,
} satisfies ExploreBrewery;
export const breweryDetail = {
  ...brewery,
  style_count: 1,
  highest_rating: 5,
  lowest_rating: 0,
  untappd_url: null,
  rating_distribution: buckets,
  most_explored_styles: [
    { ...beer.style, name: style.name, unique_beer_count: 2 },
  ],
  highest_rated_beers: [styledBeer],
} satisfies BreweryDetail;
// Bounded, schema-complete mocks; search and pagination match the API contract.
export async function stubStyles(page: Page) {
  await stubBeer(page);
  await stubExplorerOptions(page, {
    breweries: [beer.brewery],
    styles: [style],
    countries: ["Netherlands"],
    unknown: false,
  });
  await page.route("**/api/v1/explore/style-bounds", (route) =>
    route.fulfill({ json: { abv_max: 10 } }),
  );
  await page.route("**/api/v1/explore/beers/1", (route) =>
    route.fulfill({ json: styledBeer }),
  );
  await page.route("**/api/v1/explore/beers/2", (route) =>
    route.fulfill({ json: companionBeer }),
  );
  await page.route(/\/api\/v1\/explore\/beers\?/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const search = (params.get("search") || "").toLowerCase();
    const items = [styledBeer, companionBeer].filter(
      (beer) =>
        [beer.name, beer.style.name, beer.brewery.name].some((name) =>
          name.toLowerCase().includes(search),
        ) &&
        (!params.has("style_id") ||
          params.getAll("style_id").includes(String(beer.style.id))) &&
        (!params.has("brewery_id") ||
          params.getAll("brewery_id").includes(String(beer.brewery.id))),
    );
    return route.fulfill({
      json: {
        items,
        page: 1,
        page_size: 25,
        total: items.length,
        total_pages: items.length ? 1 : 0,
      },
    });
  });
  await page.route(
    /\/api\/v1\/explore\/(styles|breweries)(?:\/[0-9]+)?(?:\?.*)?$/,
    (route) => {
      const url = new URL(route.request().url());
      const styles = url.pathname.includes("/styles");
      const entity = styles ? style : brewery;
      if (/\/[0-9]+$/.test(url.pathname))
        return route.fulfill({
          status: url.pathname.endsWith(`/${entity.id}`) ? 200 : 404,
          json: url.pathname.endsWith(`/${entity.id}`)
            ? styles
              ? styleDetail
              : breweryDetail
            : { detail: "Not found" },
        });
      let rows = [entity];
      const search = (url.searchParams.get("search") || "").toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(search));
      const sort = url.searchParams.get("sort");
      if (sort === "name_asc" || sort === "name_desc")
        rows.sort(
          (a, b) =>
            (sort === "name_desc" ? -1 : 1) * a.name.localeCompare(b.name) ||
            a.id - b.id,
        );
      const size = Number(url.searchParams.get("page_size") || 25);
      const pages = Math.ceil(rows.length / size);
      const pageNumber = Math.max(
        1,
        Math.min(Number(url.searchParams.get("page") || 1), pages),
      );
      return route.fulfill({
        json: {
          items: rows.slice((pageNumber - 1) * size, pageNumber * size),
          total: rows.length,
          total_pages: pages,
          page: pageNumber,
          page_size: size,
        },
      });
    },
  );
}
