export function safeImageUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function explorerReturnUrl(value: string | null): string {
  if (!value) return "/explore/beers";
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin &&
      (url.pathname === "/explore/beers" ||
        /^\/explore\/breweries\/[1-9][0-9]*$/.test(url.pathname)) &&
      !url.hash
      ? `${url.pathname}${url.search}`
      : "/explore/beers";
  } catch {
    return "/explore/beers";
  }
}
export function beerDetailUrl(id: number, search: string): string {
  return `/explore/beers/${id}?${new URLSearchParams({ returnTo: `/explore/beers${search}` })}`;
}
// Router's initial "default" key repeats in new documents. The opaque marker
// identifies the actual saved entry across reloads without sharing that default.
const documentScrollKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export function explorerEntryKey(routerKey: string): string {
  const marked = window.history.state?.hopstatsExplorerSavedKey;
  return typeof marked === "string" && marked.length <= 128
    ? marked
    : `${documentScrollKey}:${routerKey}`;
}
export function saveExplorerScroll(
  entryKey: string,
  search: string,
  catalogue = "/explore/beers",
) {
  try {
    sessionStorage.setItem(
      `explorer-entry:${entryKey}`,
      JSON.stringify({ url: `${catalogue}${search}`, y: window.scrollY }),
    );
    window.history.replaceState(
      { ...window.history.state, hopstatsExplorerSavedKey: entryKey },
      "",
    );
  } catch {
    /* Storage is optional. */
  }
}
export function readExplorerScroll(
  entryKey: unknown,
  search: string,
  catalogue = "/explore/beers",
): number | null {
  if (typeof entryKey !== "string" || entryKey.length > 128) return null;
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(`explorer-entry:${entryKey}`) ?? "null",
    );
    return saved?.url === `${catalogue}${search}` &&
      Number.isFinite(saved.y) &&
      saved.y >= 0
      ? saved.y
      : null;
  } catch {
    return null;
  }
}
export function checkinDate(value: string, time = false) {
  return new Date(value).toLocaleString(undefined, {
    timeZone: "Europe/Amsterdam",
    dateStyle: "medium",
    ...(time ? { timeStyle: "short" as const } : {}),
  });
}
export function personalRating(value: number | null) {
  return value === null ? "Not rated" : value.toFixed(2);
}

export function breweryDetailUrl(id: number, search: string): string {
  return `/explore/breweries/${id}?${new URLSearchParams({ returnTo: `/explore/breweries${search}` })}`;
}
export function breweryReturnUrl(value: string | null): string {
  try {
    const url = new URL(value ?? "/explore/breweries", window.location.origin);
    return url.origin === window.location.origin &&
      !url.hash &&
      (url.pathname === "/explore/breweries" ||
        /^\/explore\/beers\/[1-9][0-9]*$/.test(url.pathname))
      ? `${url.pathname}${url.search}`
      : "/explore/breweries";
  } catch {
    return "/explore/breweries";
  }
}
export function breweryLocation(value: {
  city: string | null;
  state: string | null;
  country: string | null;
}) {
  return (
    [value.city, value.state, value.country]
      .filter((v) => v?.trim())
      .join(", ") || "Location unavailable"
  );
}
