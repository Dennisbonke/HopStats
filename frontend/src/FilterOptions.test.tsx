import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useFilterOptions } from "./pages/useFilterOptions";
import { FilterPanel } from "./pages/ExplorerFilters";
import { BreweryFilterPanel } from "./pages/BreweryFilters";
import { emptyFilters } from "./pages/explorerState";
import { emptyFilters as emptyBreweryFilters } from "./pages/breweryState";
import { fetchExploreOptions, fetchBreweryCountries } from "./api/explore";
import { optionResponse } from "../responsive-tests/explorer-option-fixtures";
vi.mock("./api/explore", () => ({
  fetchExploreOptions: vi.fn(),
  fetchBreweryCountries: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const key = (item: string) => item;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
test("eager country and style pages support local search and retain selected labels", async () => {
  vi.mocked(fetchExploreOptions).mockImplementation(
    async (category, params) => ({
      items:
        category === "breweries"
          ? []
          : [
              {
                id: Number(params?.get("offset")) + 1,
                name:
                  params?.get("offset") === "0"
                    ? "Selected style"
                    : "Distant style",
              },
            ],
      has_more: category === "styles" && params?.get("offset") === "0",
    }),
  );
  vi.mocked(fetchBreweryCountries).mockImplementation(async (params) => ({
    items: [
      params.get("offset") === "0" ? "Selected country" : "Distant country",
    ],
    unknown_available: true,
    has_more: params.get("offset") === "0",
  }));
  render(
    <>
      <FilterPanel
        value={{ ...emptyFilters(), style_id: ["1"] }}
        onChange={() => {}}
        abvMax={20}
        names={{ breweries: {}, styles: { "1": "Selected style" } }}
        onNames={{ breweries: () => {}, styles: () => {} }}
      />
      <BreweryFilterPanel
        value={{ ...emptyBreweryFilters(), country: ["Selected country"] }}
        onChange={() => {}}
      />
    </>,
  );
  await screen.findByLabelText("Distant style");
  await screen.findByLabelText("Distant country");
  const count = vi.mocked(fetchExploreOptions).mock.calls.length;
  fireEvent.change(screen.getByLabelText("Search styles"), {
    target: { value: "Distant" },
  });
  fireEvent.change(screen.getByLabelText("Search countries"), {
    target: { value: "Distant" },
  });
  expect(screen.getByLabelText("Selected style")).toBeChecked();
  expect(screen.getByLabelText("Selected country")).toBeChecked();
  expect(screen.queryByLabelText("Unknown country")).not.toBeInTheDocument();
  expect(fetchExploreOptions).toHaveBeenCalledTimes(count);
  expect(fetchBreweryCountries).toHaveBeenCalledTimes(2);
  expect(
    vi
      .mocked(fetchBreweryCountries)
      .mock.calls.every(
        ([params]) =>
          params.get("limit") === "100" && params.get("search") === "",
      ),
  ).toBe(true);
  expect(
    vi
      .mocked(fetchExploreOptions)
      .mock.calls.filter(([category]) => category === "styles")
      .every(([, params]) => params?.get("limit") === "100"),
  ).toBe(true);
  expect(
    screen.queryByRole("button", { name: /Load more|More countries/ }),
  ).not.toBeInTheDocument();
  expect(
    within(screen.getByLabelText("Available styles")).getAllByRole("checkbox"),
  ).toHaveLength(2);
});

test("incremental pages prevent concurrent requests, deduplicate and retain results on retry", async () => {
  const page = deferred<{ items: string[]; has_more: boolean }>();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ items: ["first"], has_more: true })
    .mockReturnValueOnce(page.promise)
    .mockResolvedValueOnce({ items: ["first", "last"], has_more: false });
  const { result } = renderHook(() =>
    useFilterOptions<string>(fetch, key, "", false),
  );
  await waitFor(() => expect(result.current.items).toEqual(["first"]));
  act(() => {
    result.current.retry();
    result.current.retry();
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => page.reject(new Error("offline")));
  expect(result.current.error).toBe(true);
  expect(result.current.items).toEqual(["first"]);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.items).toEqual(["first", "last"]));
  act(() => result.current.retry());
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[2][0].get("offset")).toBe("1");
});

test("search resets pagination and ignores a pending obsolete response", async () => {
  const old = deferred<{ items: string[]; has_more: boolean }>();
  const fetch = vi
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockResolvedValue({ items: ["new"], has_more: false });
  const { result, rerender } = renderHook(
    ({ search }) => useFilterOptions<string>(fetch, key, search, false),
    { initialProps: { search: "old" } },
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  rerender({ search: "new" });
  await waitFor(() => expect(result.current.items).toEqual(["new"]));
  await act(async () => old.resolve({ items: ["obsolete"], has_more: true }));
  expect(result.current.items).toEqual(["new"]);
  expect(fetch.mock.calls[1][0].get("offset")).toBe("0");
});

test("short initial brewery pages automatically fill the scroll container", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ items: ["first"], has_more: true })
    .mockResolvedValueOnce({ items: ["last"], has_more: false });
  function List() {
    const options = useFilterOptions<string>(fetch, key, "", false);
    return (
      <div
        ref={(node) => {
          options.container.current = node;
          if (node) {
            Object.defineProperty(node, "clientHeight", {
              configurable: true,
              value: 160,
            });
            Object.defineProperty(node, "scrollHeight", {
              configurable: true,
              value: 44,
            });
          }
        }}
      >
        {options.items.join(",")}
        <div ref={options.sentinel} />
      </div>
    );
  }
  render(<List />);
  await screen.findByText("first,last");
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("responsive option fixtures honour schemas, search, selected IDs and terminal pages", () => {
  const data = {
    styles: Array.from({ length: 105 }, (_, id) => ({
      id,
      name: `Style ${id}`,
    })),
    countries: ["Netherlands", "Belgium"],
    unknown: true,
  };
  const url = (query: string) =>
    new URL(`https://test/api/v1/explore/filter-options/styles?${query}`);
  expect(optionResponse(url("limit=100"), data)?.items).toHaveLength(100);
  expect(optionResponse(url("limit=100&offset=100"), data)).toEqual({
    items: data.styles.slice(100),
    has_more: false,
  });
  expect(optionResponse(url("search=104"), data)?.items).toEqual([
    data.styles[104],
  ]);
  expect(optionResponse(url("selected_id=3"), data)?.items).toEqual([
    data.styles[3],
  ]);
  expect(
    optionResponse(
      new URL("https://test/api/v1/explore/brewery-countries?offset=1&limit=1"),
      data,
    ),
  ).toEqual({ items: ["Belgium"], has_more: false, unknown_available: true });
  expect(
    optionResponse(new URL("https://test/api/v1/unmocked"), data),
  ).toBeUndefined();
});

test("obsolete observer callback cannot bypass the next search debounce", async () => {
  const callbacks: IntersectionObserverCallback[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  const fetch = vi.fn().mockResolvedValue({ items: ["first"], has_more: true });
  function List({ search }: { search: string }) {
    const options = useFilterOptions(fetch, key, search, false);
    return (
      <div ref={options.container}>
        {options.items.join(",")}
        <div ref={options.sentinel} />
      </div>
    );
  }
  const view = render(<List search="old" />);
  await screen.findByText("first");
  await waitFor(() => expect(callbacks.length).toBeGreaterThan(0));
  const obsolete = callbacks[0];
  vi.useFakeTimers();
  try {
    view.rerender(<List search="new" />);
    act(() =>
      obsolete(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(249));
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0].get("search")).toBe("new");
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

test("unknown country follows literal label search and selected visibility", async () => {
  vi.mocked(fetchBreweryCountries).mockResolvedValue({
    items: ["Netherlands"],
    unknown_available: true,
    has_more: false,
  });
  const view = render(
    <BreweryFilterPanel value={emptyBreweryFilters()} onChange={() => {}} />,
  );
  await screen.findByLabelText("Unknown country");
  fireEvent.change(screen.getByLabelText("Search countries"), {
    target: { value: "unKNOWN" },
  });
  expect(screen.getByLabelText("Unknown country")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search countries"), {
    target: { value: "absent" },
  });
  expect(screen.queryByLabelText("Unknown country")).not.toBeInTheDocument();
  expect(screen.getByText("No matching countries.")).toBeInTheDocument();
  view.rerender(
    <BreweryFilterPanel
      value={{ ...emptyBreweryFilters(), unknown_country: "true" }}
      onChange={() => {}}
    />,
  );
  expect(screen.getByLabelText("Unknown country")).toBeChecked();
  expect(screen.queryByText("No matching countries.")).not.toBeInTheDocument();
});
