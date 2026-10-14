export type ImportError = {
  row_number: number;
  field: string | null;
  reason: string;
};

export type ImportSummary = {
  id: number;
  source_type: string;
  filename: string;
  sha256: string;
  started_at: string;
  completed_at: string | null;
  status: "processing" | "completed" | "failed";
  inserted_count: number;
  updated_count: number;
  unchanged_count: number;
  removed_count: number;
  rejected_count: number;
  error_code: string | null;
  error_summary: string | null;
  errors: ImportError[];
};

export class ImportApiError extends Error {
  readonly status: number;
  readonly summary: ImportSummary | null;

  constructor(status: number, summary: ImportSummary | null) {
    super(summary?.error_summary ?? `Import request failed (${status})`);
    this.name = "ImportApiError";
    this.status = status;
    this.summary = summary;
  }
}

async function parseResponse(response: Response): Promise<ImportSummary> {
  let body: ImportSummary | null = null;
  try {
    body = (await response.json()) as ImportSummary;
  } catch {
    // Keep a useful network/server error when the response is not JSON.
  }
  if (!response.ok) {
    throw new ImportApiError(response.status, body);
  }
  if (!body) {
    throw new Error("The server returned an empty import response");
  }
  return body;
}

export async function uploadImport(
  kind: "checkins" | "inventory",
  file: File,
  confirmReplacement = false,
  sourceExportedAt?: string,
  allowOlder = false,
  allowUndated = false,
): Promise<ImportSummary> {
  const form = new FormData();
  form.append("file", file);
  if (kind === "inventory") {
    form.append("confirm_replacement", String(confirmReplacement));
    if (sourceExportedAt) form.append("source_exported_at", sourceExportedAt);
    form.append("allow_older", String(allowOlder));
    form.append("allow_undated", String(allowUndated));
  }
  const response = await apiFetch(`/api/v1/imports/${kind}`, {
    method: "POST",
    body: form,
  });
  return parseResponse(response);
}

export async function fetchImportHistory(): Promise<ImportSummary[]> {
  const response = await apiFetch("/api/v1/imports");
  if (!response.ok) {
    throw new Error(`Unable to load import history (${response.status})`);
  }
  return (await response.json()) as ImportSummary[];
}
import { apiFetch } from "./client";
