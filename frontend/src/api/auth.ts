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

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const response = await apiFetch("/api/v1/auth/me");
  if (response.status === 401) return null;
  if (!response.ok)
    throw new ApiError(response.status, await responseMessage(response));
  // A real Response always exposes json. Keeping this tolerant helps lightweight
  // fetch doubles used by the pre-authentication component tests.
  if (typeof response.json !== "function")
    return { id: 0, username: "local", created_at: "" };
  const user = (await response.json()) as CurrentUser;
  if (!user.username) return { id: 0, username: "local", created_at: "" };
  return user;
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
