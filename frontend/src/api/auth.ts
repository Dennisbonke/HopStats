import { apiFetch, ApiError } from "./client";

export type CurrentUser = {
  id: number;
  username: string;
  created_at: string;
};

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    return body.detail ?? "Authentication request failed.";
  } catch {
    return "Authentication request failed.";
  }
}

function parseCurrentUser(body: unknown): CurrentUser {
  if (
    typeof body !== "object" ||
    body === null ||
    !Number.isInteger((body as { id?: unknown }).id) ||
    (body as { id: number }).id <= 0 ||
    typeof (body as { username?: unknown }).username !== "string" ||
    !(body as { username: string }).username.trim() ||
    typeof (body as { created_at?: unknown }).created_at !== "string" ||
    !Number.isFinite(Date.parse((body as { created_at: string }).created_at))
  ) {
    throw new ApiError(
      502,
      "The server returned an invalid current-user response.",
    );
  }
  return body as CurrentUser;
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const response = await apiFetch("/api/v1/auth/me");
  if (response.status === 401) return null;
  if (!response.ok)
    throw new ApiError(response.status, await responseMessage(response));
  if (typeof response.json !== "function")
    throw new ApiError(
      502,
      "The server returned an invalid current-user response.",
    );
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      502,
      "The server returned an invalid current-user response.",
    );
  }
  return parseCurrentUser(body);
}

export async function login(
  username: string,
  password: string,
): Promise<CurrentUser> {
  const response = await apiFetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok)
    throw new ApiError(response.status, await responseMessage(response));
  const body = (await response.json()) as { user: CurrentUser };
  return body.user;
}

export async function logout(): Promise<void> {
  const response = await apiFetch("/api/v1/auth/logout", { method: "POST" });
  if (!response.ok && response.status !== 401) {
    throw new ApiError(response.status, await responseMessage(response));
  }
}
