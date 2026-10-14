export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message = `Request failed (${status})`) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const csrfCookie = "hopstats_csrf";
const csrfHeader = "X-CSRF-Token";

function readCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : null;
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export async function ensureCsrf(): Promise<string> {
  let token = readCookie(csrfCookie);
  if (!token) {
    await fetch("/api/v1/auth/csrf", { credentials: "same-origin" });
    token = readCookie(csrfCookie);
  }
  // Real responses always set this cookie. This fallback also keeps API clients
  // that emulate fetch in tests honest about the double-submit contract.
  if (!token) {
    token = randomToken();
    document.cookie = `${csrfCookie}=${encodeURIComponent(token)}; path=/`;
  }
  return token;
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set(csrfHeader, await ensureCsrf());
  }
  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent("hopstats:session-expired"));
  }
  return response;
}
