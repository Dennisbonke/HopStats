import {
  readFilters as readBeerFilters,
  validThreshold,
} from "./explorerState";
export const SORT_LABELS = {
  name_asc: "Style name A–Z",
  name_desc: "Style name Z–A",
  breweries_asc: "Fewest breweries",
  breweries_desc: "Most breweries",
  unique_beers_desc: "Most unique beers",
  unique_beers_asc: "Fewest unique beers",
  checkins_desc: "Most check-ins",
  checkins_asc: "Fewest check-ins",
  rating_desc: "Highest my rating",
  rating_asc: "Lowest my rating",
  first_tried_asc: "First tried: oldest",
  first_tried_desc: "First tried: newest",
  last_tried_desc: "Most recently tried",
  last_tried_asc: "Least recently tried",
};
export type ExploreSort = keyof typeof SORT_LABELS;
export const DEFAULT_SORT: ExploreSort = "unique_beers_desc";
export const selectedSort = (value: string | null): ExploreSort =>
  value && Object.hasOwn(SORT_LABELS, value)
    ? (value as ExploreSort)
    : DEFAULT_SORT;
export const emptyFilters = () => ({
  min_breweries: "",
  abv_min: "",
  abv_max: "",
  min_unique_beers: "",
  min_checkins: "",
  rating_min: "",
  rating_max: "",
  first_tried_from: "",
  first_tried_to: "",
  last_tried_from: "",
  last_tried_to: "",
});
export type Filters = ReturnType<typeof emptyFilters>;
export const FILTER_KEYS = Object.keys(emptyFilters()) as (keyof Filters)[];
export function readFilters(params: URLSearchParams): Filters {
  const base = readBeerFilters(params);
  const result = emptyFilters();
  for (const key of [
    "abv_min",
    "abv_max",
    "rating_min",
    "rating_max",
    "first_tried_from",
    "first_tried_to",
    "last_tried_from",
    "last_tried_to",
  ] as const)
    result[key] = base[key];
  for (const key of [
    "min_unique_beers",
    "min_checkins",
    "min_breweries",
  ] as const) {
    const v = params.get(key) ?? "";
    if (
      v &&
      /^(?:0|[1-9][0-9]*)$/.test(v) &&
      Number(v) <= 2147483647 &&
      (key === "min_breweries" || Number(v) > 0)
    )
      result[key] = String(Number(v));
  }
  return result;
}
export function writeFilters(params: URLSearchParams, value: Filters) {
  for (const key of FILTER_KEYS) {
    params.delete(key);
    const values = Array.isArray(value[key]) ? value[key] : [value[key]];
    for (const v of values) if (v) params.append(key, v);
  }
}
export function sameFilters(a: Filters, b: Filters) {
  return FILTER_KEYS.every((key) =>
    key.includes("tried") || !a[key] || !b[key]
      ? a[key] === b[key]
      : Number(a[key]) === Number(b[key]),
  );
}
export function activeGroups(f: Filters) {
  return [
    f.min_unique_beers || f.min_checkins || f.min_breweries,
    f.abv_min || f.abv_max,
    f.rating_min || f.rating_max,
    f.first_tried_from || f.first_tried_to,
    f.last_tried_from || f.last_tried_to,
  ].filter(Boolean).length;
}
export { validThreshold };
