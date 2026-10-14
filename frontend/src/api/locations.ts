export type LocationNode = {
  id: number;
  name: string;
  parent_id: number | null;
  description: string | null;
  path: string;
  aliases: string[];
  record_count: number;
  total_units: number;
  children: LocationNode[];
};

export type LocationData = {
  locations: LocationNode[];
  unresolved: { record_count: number; total_units: number };
};

export async function fetchLocations(): Promise<LocationData> {
  const response = await apiFetch("/api/v1/locations");
  if (!response.ok)
    throw new Error(`Unable to load locations (${response.status})`);
  return (await response.json()) as LocationData;
}
import { apiFetch } from "./client";
