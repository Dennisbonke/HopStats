import { apiFetch } from "./client";

export type LocationAlias = {
  id: number;
  alias: string;
  managed_by_config: boolean;
};

export type LocationRule = {
  id: number;
  pattern: string;
  match_kind: string;
  priority: number;
  managed_by_config: boolean;
};

export type Reconciliation = {
  changed_records: number;
  unresolved_records: number;
  ambiguous_records: number;
};

export type LocationNode = {
  id: number;
  name: string;
  parent_id: number | null;
  description: string | null;
  path: string;
  aliases: string[];
  alias_details?: LocationAlias[];
  rules?: LocationRule[];
  managed_by_config?: boolean;
  ownership?: "configuration" | "database" | "unknown";
  record_count: number;
  total_units: number;
  children: LocationNode[];
};

export type LocationData = {
  locations: LocationNode[];
  unresolved: { record_count: number; total_units: number };
};

export type LocationMutation = LocationNode & {
  reconciliation: Reconciliation;
};

export type AliasMutation = {
  alias: LocationAlias;
  reconciliation: Reconciliation;
};

export async function fetchLocations(): Promise<LocationData> {
  const response = await apiFetch("/api/v1/locations");
  if (!response.ok)
    throw new Error(`Unable to load locations (${response.status})`);
  return (await response.json()) as LocationData;
}

async function parseMutation<T>(response: Response): Promise<T> {
  let body: { detail?: string } & T;
  try {
    body = (await response.json()) as { detail?: string } & T;
  } catch {
    throw new Error(`Request failed (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(body.detail ?? `Request failed (${response.status})`);
  }
  return body as T;
}

export async function createLocation(payload: {
  name: string;
  parent_id: number | null;
  description: string | null;
}): Promise<LocationMutation> {
  return parseMutation(
    await apiFetch("/api/v1/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function updateLocation(
  id: number,
  payload: {
    name?: string;
    parent_id?: number | null;
    description?: string | null;
  },
): Promise<LocationMutation> {
  return parseMutation(
    await apiFetch(`/api/v1/locations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function transferLocationToUi(
  id: number,
): Promise<LocationMutation> {
  return parseMutation(
    await apiFetch(`/api/v1/locations/${id}/ownership`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm_configuration_removed: true }),
    }),
  );
}

export async function deleteLocation(id: number): Promise<void> {
  const response = await apiFetch(`/api/v1/locations/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      detail =
        ((await response.json()) as { detail?: string }).detail ?? detail;
    } catch {
      // Keep the status message for non-JSON errors.
    }
    throw new Error(detail);
  }
}

export async function createAlias(
  locationId: number,
  alias: string,
): Promise<AliasMutation> {
  return parseMutation(
    await apiFetch(`/api/v1/locations/${locationId}/aliases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias }),
    }),
  );
}

export async function updateAlias(
  locationId: number,
  aliasId: number,
  alias: string,
): Promise<AliasMutation> {
  return parseMutation(
    await apiFetch(`/api/v1/locations/${locationId}/aliases/${aliasId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias }),
    }),
  );
}

export async function deleteAlias(
  locationId: number,
  aliasId: number,
): Promise<void> {
  const response = await apiFetch(
    `/api/v1/locations/${locationId}/aliases/${aliasId}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      detail =
        ((await response.json()) as { detail?: string }).detail ?? detail;
    } catch {
      // Keep the status message for non-JSON errors.
    }
    throw new Error(detail);
  }
}
