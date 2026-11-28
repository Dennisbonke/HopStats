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

export function safeExplorerReturn(
  value: string | null,
  fallback = "/explore/beers",
): string {
  if (!value) return fallback;
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin &&
      !url.hash &&
      /^\/explore\/(beers|breweries|styles)(\/[1-9][0-9]*)?$/.test(url.pathname)
      ? `${url.pathname}${url.search}`
      : fallback;
  } catch {
    return fallback;
  }
}
export const explorerReturnUrl = (value: string | null) =>
  safeExplorerReturn(value);
export const styleReturnUrl = (value: string | null) =>
  safeExplorerReturn(value, "/explore/styles");
export function styleDetailUrl(id: number, search: string): string {
  return `/explore/styles/${id}?${new URLSearchParams({ returnTo: `/explore/styles${search}` })}`;
}
// Only catalogue URLs may carry the independent new-tab fallback.
export function safeCatalogueReturn(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !/^\/explore\/(beers|breweries|styles)(?:\?|$)/.test(value) ||
    value.length > 8192 ||
    !value.startsWith("/explore/")
  )
    return null;
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin &&
      !url.hash &&
      /^\/explore\/(beers|breweries|styles)$/.test(url.pathname) &&
      !url.searchParams.has("returnTo") &&
      !url.searchParams.has("catalogueReturn")
      ? url.pathname + url.search
      : null;
  } catch {
    return null;
  }
}
export function isExplorerDetail(value: string) {
  return /^\/explore\/(beers|breweries|styles)\/[1-9][0-9]*(?:\?|$)/.test(
    value,
  );
}
function catalogueDestination(
  params: URLSearchParams,
  state: Record<string, unknown> | null,
  fallback: string,
) {
  return (
    safeCatalogueReturn(state?.explorerCatalogueReturn) ??
    safeCatalogueReturn(params.get("catalogueReturn")) ??
    safeCatalogueReturn(params.get("returnTo")) ??
    fallback
  );
}
// Keep the same-tab trail in bounded history state and just one catalogue URL in links.
export function detailLink(
  entity: "beers" | "breweries" | "styles",
  id: number,
  location: {
    pathname: string;
    search: string;
    state: Record<string, unknown> | null;
  },
) {
  const query = new URLSearchParams(location.search);
  const catalogue = catalogueDestination(
    query,
    location.state,
    `/explore/${location.pathname.split("/")[2]}`,
  );
  query.delete("returnTo");
  query.delete("catalogueReturn");
  const previous = location.pathname + (query.size ? `?${query}` : "");
  const parents = Array.isArray(location.state?.explorerParents)
    ? (location.state.explorerParents as string[])
    : [];
  return {
    to: `/explore/${entity}/${id}?${new URLSearchParams({ returnTo: previous, catalogueReturn: catalogue })}`,
    state: {
      ...location.state,
      explorerCatalogueReturn: catalogue,
      explorerParents: [...parents, location.pathname + location.search].slice(
        -16,
      ),
    },
  };
}
export function detailReturn(
  params: URLSearchParams,
  state: Record<string, unknown> | null,
  fallback: string,
) {
  const parents = Array.isArray(state?.explorerParents)
    ? (state.explorerParents as string[])
    : [];
  if (parents.length) return safeExplorerReturn(parents.at(-1)!, fallback);
  const catalogue = catalogueDestination(params, state, fallback);
  const immediate = safeExplorerReturn(params.get("returnTo"), "");
  if (isExplorerDetail(immediate)) {
    const url = new URL(immediate, window.location.origin);
    url.searchParams.delete("returnTo");
    url.searchParams.delete("catalogueReturn");
    if (
      safeCatalogueReturn(state?.explorerCatalogueReturn) ||
      safeCatalogueReturn(params.get("catalogueReturn"))
    )
      url.searchParams.set("catalogueReturn", catalogue);
    return url.pathname + (url.searchParams.size ? "?" + url.searchParams : "");
  }
  return safeCatalogueReturn(immediate) ?? catalogue;
}
export function detailBackState(state: Record<string, unknown> | null) {
  const parents = Array.isArray(state?.explorerParents)
    ? (state.explorerParents as string[])
    : [];
  return {
    ...state,
    explorerParents: parents.slice(0, -1),
    explorerReturnKey: state?.explorerEntryKey,
  };
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
export const breweryReturnUrl = (value: string | null) =>
  safeExplorerReturn(value, "/explore/breweries");
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
