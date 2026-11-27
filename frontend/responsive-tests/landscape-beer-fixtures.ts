import { optionResponse } from "./explorer-option-fixtures";
import type { Page } from "@playwright/test";
export const beer = {
  id: 1,
  name: "A Very Long Beer Name With An ExtraordinarilyLongUnbrokenReleaseNameToExerciseWrapping",
  brewery: {
    id: 2,
    name: "A Brewery With A Very Long Name",
    city: "Amsterdam",
    state: "Noord-Holland",
    country: "Netherlands",
  },
  style: {
    id: 3,
    name: "Stout - Imperial / Double Pastry With A Long Style Name",
  },
  abv: 12.5,
  ibu: 0,
  photo_url: "https://images.example.test/broken.jpg",
  checkin_count: 26,
  rated_checkin_count: 4,
  personal_average_rating: 3.125,
  highest_rating: 5,
  lowest_rating: 0,
  first_checked_in_at: "2025-01-01T12:00:00Z",
  last_checked_in_at: "2026-11-20T23:30:00Z",
  rating_history: [
    { id: 1, occurred_at_utc: "2025-01-01T12:00:00Z", rating: 0 },
    { id: 2, occurred_at_utc: "2026-08-01T12:00:00Z", rating: 3.5 },
    { id: 3, occurred_at_utc: "2026-11-20T18:00:00Z", rating: 4 },
    { id: 4, occurred_at_utc: "2026-11-20T23:30:00Z", rating: 5 },
  ],
  untappd_url: "https://untappd.com/beer/4509",
};
const photo = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#293d49"/><rect x="236" y="75" width="168" height="300" rx="18" fill="#daa520"/><rect x="255" y="150" width="130" height="110" fill="#faf3dc"/><text x="320" y="210" text-anchor="middle" font-family="sans-serif" font-size="20">Synthetic beer</text></svg>`;
export async function stubBeer(
  page: Page,
  state: "multi" | "single" | "unrated" | "coincident" = "multi",
) {
  const detail = {
    ...beer,
    ...(state === "coincident"
      ? {
          rating_history: beer.rating_history.map((p) => ({
            ...p,
            occurred_at_utc: beer.rating_history[0].occurred_at_utc,
          })),
        }
      : {}),
    ...(state === "single"
      ? {
          rated_checkin_count: 1,
          personal_average_rating: 0,
          highest_rating: 0,
          lowest_rating: 0,
          rating_history: [beer.rating_history[0]],
        }
      : state === "unrated"
        ? {
            rated_checkin_count: 0,
            personal_average_rating: null,
            highest_rating: null,
            lowest_rating: null,
            rating_history: [],
          }
        : {}),
  };
  const counts = { detail: 0 };
  await page
    .context()
    .route("https://images.example.test/**", async (route) => {
      if (route.request().url().endsWith("photo.svg"))
        await route.fulfill({ contentType: "image/svg+xml", body: photo });
      else await route.abort();
    });
  await page.context().route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const pageNumber = Number(url.searchParams.get("page") ?? 1);
    const sort = url.searchParams.get("sort") ?? "newest";
    const responses: Record<string, unknown> = {
      "/api/v1/auth/me": {
        id: 1,
        username: "synthetic",
        created_at: "2026-01-01T00:00:00Z",
      },
      "/api/v1/health": { status: "ok" },
      "/api/v1/explore/filter-bounds": { abv_max: 20 },
      "/api/v1/explore/filter-options/breweries": {
        items: [beer.brewery],
        has_more: false,
      },
      "/api/v1/explore/filter-options/styles": {
        items: [beer.style],
        has_more: false,
      },
      "/api/v1/explore/beers": {
        items: [beer],
        page: 1,
        page_size: 25,
        total: 1,
        total_pages: 1,
      },
      "/api/v1/explore/beers/1": detail,
      "/api/v1/explore/beers/1/checkins": {
        page: pageNumber,
        page_size: 25,
        total: 26,
        total_pages: 2,
        items:
          pageNumber === 2
            ? [
                {
                  id: 1,
                  occurred_at_utc: "2025-01-01T12:00:00Z",
                  rating: state === "single" ? 0 : null,
                  comment: "Sparse metadata entry",
                  serving_type: null,
                  purchase_venue: null,
                  venue: null,
                  photo_url: "https://images.example.test/broken-photo.jpg",
                  untappd_url: null,
                },
              ]
            : [
                {
                  id: 4,
                  occurred_at_utc:
                    sort === "oldest"
                      ? "2025-01-01T12:00:00Z"
                      : "2026-11-20T23:30:00Z",
                  rating:
                    state === "unrated" || state === "single"
                      ? null
                      : sort === "oldest"
                        ? 0
                        : 5,
                  comment: `${sort === "oldest" ? "Oldest first" : "Newest first"}\nA long imported comment with meaningful line breaks.\n${"VeryLongUnbrokenComment".repeat(8)}\n<script>Plain text, never HTML</script>`,
                  serving_type: "Bottle",
                  purchase_venue: "A Bottle Shop Somewhere Else",
                  venue: {
                    id: 5,
                    name: "The Check-in Taproom With A Long Name",
                    city: "Haarlem",
                    state: "Noord-Holland",
                    country: "Netherlands",
                  },
                  photo_url: "https://images.example.test/photo.svg",
                  untappd_url: "https://untappd.com/c/976151023",
                },
              ],
      },
    };
    if (path === "/api/v1/explore/beers/1") counts.detail++;
    const optionData = {
      breweries: (
        responses["/api/v1/explore/filter-options/breweries"] as {
          items: { id: number; name: string }[];
        }
      ).items,
      styles: (
        responses["/api/v1/explore/filter-options/styles"] as {
          items: { id: number; name: string }[];
        }
      ).items,
    };
    const options = optionResponse(new URL(route.request().url()), optionData);
    if (options) {
      await route.fulfill({ json: options });
      return;
    }
    await route.fulfill({
      status: path in responses ? 200 : 404,
      json: responses[path] ?? { detail: "Not found" },
    });
  });
  return counts;
}
