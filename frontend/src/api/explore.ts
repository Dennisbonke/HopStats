import { apiFetch } from "./client";

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
