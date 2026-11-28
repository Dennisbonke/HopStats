import type { Page, Route } from "@playwright/test";

type Entity = { id: number; name: string };
export type OptionData = {
  breweries?: Entity[];
  styles?: Entity[];
  countries?: string[];
  unknown?: boolean;
};
export function optionResponse(url: URL, data: OptionData = {}) {
  const category = url.pathname.split("/").at(-1);
  if (!(
    (url.pathname.startsWith("/api/v1/explore/filter-options/") &&
      (category === "breweries" || category === "styles")) ||
    url.pathname === "/api/v1/explore/brewery-countries"
  ))
    return undefined;
  const countries = category === "brewery-countries";
  const source = countries
    ? (data.countries ?? [])
    : (data[category as "breweries" | "styles"] ?? []);
  const search = (url.searchParams.get("search") ?? "").toLocaleLowerCase();
  const selected = url.searchParams.getAll("selected_id");
  const matches = source.filter(
    (item) =>
      (typeof item === "string" ? item : item.name)
        .toLocaleLowerCase()
        .includes(search) &&
      (!selected.length ||
        (typeof item !== "string" && selected.includes(String(item.id)))),
  );
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 25);
  return {
    items: matches.slice(offset, offset + limit),
    has_more: offset + limit < matches.length,
    ...(countries ? { unknown_available: data.unknown ?? false } : {}),
  };
}

// Exact endpoints only: unrelated missing mocks must remain visible.
export async function stubExplorerOptions(page: Page, data: OptionData = {}) {
  const pattern =
    /\/api\/v1\/explore\/(?:filter-options\/(?:breweries|styles)|brewery-countries)(?:\?|$)/;
  const respond = (route: Route) =>
    route.fulfill({
      json: optionResponse(new URL(route.request().url()), data),
    });
  // Context fallback also covers pending requests while a page is being closed.
  await page.context().route(pattern, respond);
  await page.route(pattern, respond);
}
