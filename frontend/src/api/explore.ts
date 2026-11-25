import { apiFetch, ApiError } from "./client";

export type ExploreEntity = { id: number; name: string };

export type ExploreBeer = {
  id: number;
  name: string;
  brewery: ExploreEntity | null;
  style: ExploreEntity | null;
  abv: number | null;
  ibu: number | null;
  photo_url: string | null;
  checkin_count: number;
  rated_checkin_count: number;
  personal_average_rating: number | null;
  first_checked_in_at: string;
  last_checked_in_at: string;
};

export type ExploreBeersResponse = {
  items: ExploreBeer[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export async function fetchExploreBeers(
  params: URLSearchParams,
): Promise<ExploreBeersResponse> {
  const response = await apiFetch(`/api/v1/explore/beers?${params.toString()}`);
  if (!response.ok)
    throw new Error(`Unable to load beer catalogue (${response.status})`);
  return (await response.json()) as ExploreBeersResponse;
}

export type ExploreOptionsResponse = {
  items: ExploreEntity[];
  has_more: boolean;
};
export async function fetchExploreOptions(
  category: "breweries" | "styles",
  params = new URLSearchParams(),
): Promise<ExploreOptionsResponse> {
  const response = await apiFetch(
    `/api/v1/explore/filter-options/${category}?${params}`,
  );
  if (!response.ok) throw new Error("Unable to load filter options");
  return response.json() as Promise<ExploreOptionsResponse>;
}
export async function fetchExploreBounds(): Promise<{ abv_max: number }> {
  const response = await apiFetch("/api/v1/explore/filter-bounds");
  if (!response.ok) throw new Error("Unable to load ABV bounds");
  return response.json() as Promise<{ abv_max: number }>;
}

export type ExploreLocation = ExploreEntity & {
  city: string | null;
  state: string | null;
  country: string | null;
};
export type RatingPoint = {
  id: number;
  occurred_at_utc: string;
  rating: number;
};
export type BeerDetail = ExploreBeer & {
  brewery: ExploreLocation | null;
  highest_rating: number | null;
  lowest_rating: number | null;
  rating_history: RatingPoint[];
  untappd_url: string | null;
};
export type BeerCheckin = {
  id: number;
  occurred_at_utc: string;
  rating: number | null;
  comment: string | null;
  serving_type: string | null;
  purchase_venue: string | null;
  photo_url: string | null;
  venue: ExploreLocation | null;
  untappd_url: string | null;
};
export type BeerHistory = Omit<ExploreBeersResponse, "items"> & {
  items: BeerCheckin[];
};

export async function fetchBeerDetail(id: string): Promise<BeerDetail> {
  const response = await apiFetch(`/api/v1/explore/beers/${id}`);
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<BeerDetail>;
}
export async function fetchBeerHistory(
  id: string,
  params: URLSearchParams,
): Promise<BeerHistory> {
  const response = await apiFetch(
    `/api/v1/explore/beers/${id}/checkins?${params}`,
  );
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<BeerHistory>;
}
