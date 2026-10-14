export type LocationPath = {
  id: number;
  name: string;
  path: string;
};

export type InventoryItem = {
  id: number;
  source_item_id: string;
  source_system: string;
  source_name: string;
  beer_id: number;
  beer_name: string;
  brewery_name: string | null;
  style_id: number | null;
  style_name: string | null;
  abv: number | null;
  ibu: number | null;
  photo_url: string | null;
  quantity: number;
  container: string | null;
  notes: string | null;
  purchase_date: string | null;
  bottled_date: string | null;
  best_before: string | null;
  raw_best_before: string | null;
  best_before_suspicious: boolean;
  purchase_location: string | null;
  purchase_price: number | null;
  created_at_source: string | null;
  imported_at: string;
  location: LocationPath | null;
  location_resolution_status: "resolved" | "unresolved" | "ambiguous" | string;
  location_resolution_source: string | null;
  location_resolution_detail: string | null;
  match_status: "external_id" | "exact" | "ambiguous" | "unmatched" | string;
  matched_checkin_beer_id: number | null;
  source_metadata: Record<string, unknown> | null;
};

export type InventoryResponse = {
  items: InventoryItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export type InventoryStyle = { id: number; name: string };

export async function fetchInventory(
  params: URLSearchParams,
): Promise<InventoryResponse> {
  const response = await apiFetch(`/api/v1/inventory?${params.toString()}`);
  if (!response.ok)
    throw new Error(`Unable to load inventory (${response.status})`);
  return (await response.json()) as InventoryResponse;
}

export async function fetchInventoryItem(id: number): Promise<InventoryItem> {
  const response = await apiFetch(`/api/v1/inventory/${id}`);
  if (!response.ok)
    throw new Error(`Unable to load inventory item (${response.status})`);
  return (await response.json()) as InventoryItem;
}

export async function fetchInventoryStyles(): Promise<InventoryStyle[]> {
  const response = await apiFetch("/api/v1/inventory/styles");
  if (!response.ok)
    throw new Error(`Unable to load inventory styles (${response.status})`);
  return (await response.json()) as InventoryStyle[];
}
import { apiFetch } from "./client";
