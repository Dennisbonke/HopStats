import { useEffect, useRef, useState } from "react";

type Page<T> = { items: T[]; has_more: boolean; unknown_available?: boolean };

// One request at a time per search; obsolete searches never update the list.
export function useFilterOptions<T>(
  fetchPage: (params: URLSearchParams) => Promise<Page<T>>,
  key: (item: T) => string | number,
  search: string,
  eager: boolean,
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const load = useRef<() => void>(() => {});
  useEffect(() => {
    let cancelled = false;
    let ready = eager;
    let busy = false;
    let offset = 0;
    let hasMore = true;
    setItems([]);
    setError(false);
    setLoading(true);
    setMore(false);
    setUnknown(false);
    if (container.current) container.current.scrollTop = 0;
    async function next() {
      if (cancelled || !ready || busy || !hasMore) return;
      busy = true;
      setLoading(true);
      setError(false);
      try {
        const page = await fetchPage(
          new URLSearchParams({
            search,
            offset: String(offset),
            limit: eager ? "100" : "25",
          }),
        );
        if (cancelled) return;
        offset += page.items.length;
        // Empty pages must terminate even if a malformed response claims more.
        hasMore = page.has_more && page.items.length > 0;
        setItems((old) => [
          ...new Map(
            [...old, ...page.items].map((item) => [key(item), item]),
          ).values(),
        ]);
        setUnknown((old) => old || !!page.unknown_available);
        setMore(hasMore);
      } catch {
        if (!cancelled) setError(true);
        busy = false;
        if (!cancelled) setLoading(false);
        return;
      }
      busy = false;
      if (!cancelled) {
        setLoading(false);
        if (eager && hasMore) void next();
      }
    }
    load.current = () => void next();
    const timer = window.setTimeout(
      () => {
        ready = true;
        void next();
      },
      eager ? 0 : 250,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fetchPage, key, search, eager]);

  function checkBottom() {
    const node = container.current;
    if (
      node &&
      node.clientHeight > 0 &&
      node.scrollHeight - node.scrollTop - node.clientHeight < 100 &&
      !error &&
      !loading &&
      more
    )
      load.current();
  }
  useEffect(() => {
    if (eager || loading || error || !more) return;
    const root = container.current;
    const target = sentinel.current;
    if (!root || !target) return;
    // Recheck after each page so short pages also fill the available space.
    if (root.clientHeight > 0 && root.scrollHeight <= root.clientHeight + 100)
      load.current();
    if (typeof IntersectionObserver === "undefined") return;
    const loadPage = load.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadPage();
      },
      { root, rootMargin: "0px 0px 100px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [eager, items, loading, error, more]);
  return {
    items,
    loading,
    error,
    unknown,
    container,
    sentinel,
    checkBottom,
    retry: () => load.current(),
  };
}
