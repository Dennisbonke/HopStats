import {
  readFilters as readBeerFilters,
  validThreshold,
} from "./explorerState";
export const SORT_LABELS = {
  name_asc: "Brewery name A–Z",
  name_desc: "Brewery name Z–A",
  location_asc: "Location A–Z",
  location_desc: "Location Z–A",
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
  country: [] as string[],
  unknown_country: "",
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
    "rating_min",
    "rating_max",
    "first_tried_from",
    "first_tried_to",
    "last_tried_from",
    "last_tried_to",
  ] as const)
    result[key] = base[key];
  result.country = [
    ...new Set(
      params.getAll("country").filter((v) => v.length > 0 && v.length <= 200),
    ),
  ].slice(0, 100);
  result.unknown_country =
    params.get("unknown_country") === "true" ? "true" : "";
  for (const key of ["min_unique_beers", "min_checkins"] as const) {
    const v = params.get(key) ?? "";
    if (/^[1-9][0-9]*$/.test(v) && Number(v) <= 2147483647) result[key] = v;
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
    key === "country"
      ? a.country.length === b.country.length &&
        a.country.every((v) => b.country.includes(v))
      : key.includes("tried") || !a[key] || !b[key] || key === "unknown_country"
        ? a[key] === b[key]
        : Number(a[key]) === Number(b[key]),
  );
}
export function activeGroups(f: Filters) {
  return [
    f.country.length || f.unknown_country,
    f.min_unique_beers || f.min_checkins,
    f.rating_min || f.rating_max,
    f.first_tried_from || f.first_tried_to,
    f.last_tried_from || f.last_tried_to,
  ].filter(Boolean).length;
}
export { validThreshold };
