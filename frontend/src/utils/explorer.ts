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
export function saveExplorerScroll(search: string) {
  try {
    sessionStorage.setItem(`explorer-scroll:${search}`, String(window.scrollY));
  } catch {
    /* Storage is optional. */
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
