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
  if (!value || !value.startsWith("/explore/beers")) return "/explore/beers";
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin &&
      url.pathname === "/explore/beers" &&
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
export function saveExplorerScroll(entryKey: string, search: string) {
  try {
    sessionStorage.setItem(
      `explorer-entry:${entryKey}`,
      JSON.stringify({ url: `/explore/beers${search}`, y: window.scrollY }),
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
): number | null {
  if (typeof entryKey !== "string" || entryKey.length > 128) return null;
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(`explorer-entry:${entryKey}`) ?? "null",
    );
    return saved?.url === `/explore/beers${search}` &&
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
