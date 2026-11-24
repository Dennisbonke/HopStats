export const SORT_LABELS = {
  name_asc: "Beer name A–Z",
  name_desc: "Beer name Z–A",
  brewery_asc: "Brewery A–Z",
  brewery_desc: "Brewery Z–A",
  style_asc: "Style A–Z",
  style_desc: "Style Z–A",
  abv_asc: "Lowest ABV",
  abv_desc: "Highest ABV",
  rating_asc: "Lowest my rating",
  rating_desc: "Highest my rating",
  first_tried_asc: "First tried: oldest",
  first_tried_desc: "First tried: newest",
  last_tried_desc: "Most recently tried",
  last_tried_asc: "Least recently tried",
  checkins_desc: "Most check-ins",
  checkins_asc: "Fewest check-ins",
};
export type ExploreSort = keyof typeof SORT_LABELS;
export const DEFAULT_SORT: ExploreSort = "last_tried_desc";
export function selectedSort(value: string | null): ExploreSort {
  return value && Object.hasOwn(SORT_LABELS, value)
    ? (value as ExploreSort)
    : DEFAULT_SORT;
}
export const FILTER_KEYS = [
  "brewery_id",
  "style_id",
  "abv_min",
  "abv_max",
  "rating_min",
  "rating_max",
  "first_tried_from",
  "first_tried_to",
  "last_tried_from",
  "last_tried_to",
] as const;
export type Filters = {
  brewery_id: string[];
  style_id: string[];
  abv_min: string;
  abv_max: string;
  rating_min: string;
  rating_max: string;
  first_tried_from: string;
  first_tried_to: string;
  last_tried_from: string;
  last_tried_to: string;
};
export const emptyFilters = (): Filters => ({
  brewery_id: [],
  style_id: [],
  abv_min: "",
  abv_max: "",
  rating_min: "",
  rating_max: "",
  first_tried_from: "",
  first_tried_to: "",
  last_tried_from: "",
  last_tried_to: "",
});
function validDay(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value > "0001-12-31" &&
    value < "9999-12-31" &&
    Number.isFinite(new Date(value).getTime()) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function readFilters(params: URLSearchParams): Filters {
  const filters = emptyFilters();
  for (const key of FILTER_KEYS) {
    if (key === "brewery_id" || key === "style_id") {
      filters[key] = [
        ...new Set(
          params
            .getAll(key)
            .filter(
              (v) => /^[1-9]\d*$/.test(v) && Number.isSafeInteger(Number(v)),
            ),
        ),
      ].slice(0, 100);
    } else {
      const value = params.get(key) ?? "";
      if (key.includes("tried")) {
        if (validDay(value)) filters[key] = value;
      } else if (
        /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) &&
        Number.isFinite(Number(value)) &&
        Number(value) >= 0 &&
        (!key.startsWith("rating") || Number(value) <= 5)
      )
        filters[key] = value;
    }
  }
  for (const [min, max] of [
    ["abv_min", "abv_max"],
    ["rating_min", "rating_max"],
    ["first_tried_from", "first_tried_to"],
    ["last_tried_from", "last_tried_to"],
  ] as const) {
    if (
      filters[min] &&
      filters[max] &&
      (min.includes("tried")
        ? filters[min] > filters[max]
        : Number(filters[min]) > Number(filters[max]))
    ) {
      filters[min] = "";
      filters[max] = "";
    }
  }
  return filters;
}
export function writeFilters(params: URLSearchParams, filters: Filters) {
  for (const key of FILTER_KEYS) {
    params.delete(key);
    const values = Array.isArray(filters[key]) ? filters[key] : [filters[key]];
    for (const value of values) if (value) params.append(key, value);
  }
}
export function activeGroups(f: Filters): number {
  return [
    f.brewery_id.length,
    f.style_id.length,
    f.abv_min || f.abv_max,
    f.rating_min || f.rating_max,
    f.first_tried_from || f.first_tried_to,
    f.last_tried_from || f.last_tried_to,
  ].filter(Boolean).length;
}
export function amsterdamDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
}
