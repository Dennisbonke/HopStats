import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ExplorerStyles from "./pages/ExplorerStyles";
import ExplorerBeers from "./pages/ExplorerBeers";
import ExplorerBreweries from "./pages/ExplorerBreweries";
import ExplorerStyleDetail from "./pages/ExplorerStyleDetail";
import ExplorerBeerDetail from "./pages/ExplorerBeerDetail";
import ExplorerBreweryDetail from "./pages/ExplorerBreweryDetail";
import {
  style,
  styleDetail,
  styledBeer,
  brewery,
  breweryDetail,
} from "../responsive-tests/style-fixtures";
import { detailLink, detailReturn, detailBackState } from "./utils/explorer";
vi.mock("./components/BreweryRatingChart", () => ({
  default: () => <p>Distribution</p>,
}));
vi.mock("./components/BeerRatingChart", () => ({
  default: () => <p>History</p>,
}));
vi.mock("./api/explore", async (original) => ({
  ...(await original<typeof import("./api/explore")>()),
  fetchExploreStyles: async () => ({
    items: [style],
    page: 2,
    page_size: 25,
    total: 26,
    total_pages: 2,
  }),
  fetchExploreBreweries: async () => ({
    items: [brewery],
    page: 2,
    page_size: 25,
    total: 26,
    total_pages: 2,
  }),
  fetchExploreBeers: async () => ({
    items: [styledBeer],
    page: 2,
    page_size: 25,
    total: 26,
    total_pages: 2,
  }),
  fetchStyleDetail: async () => styleDetail,
  fetchBreweryDetail: async () => breweryDetail,
  fetchBeerDetail: async () => styledBeer,
  fetchBeerHistory: async () => ({
    items: [],
    page: 1,
    page_size: 25,
    total: 0,
    total_pages: 0,
  }),
  fetchExploreBounds: async () => ({ abv_max: 20 }),
  fetchStyleBounds: async () => ({ abv_max: 10 }),
  fetchExploreOptions: async (category: string) => ({
    items: category === "styles" ? [style] : [brewery],
    has_more: false,
  }),
  fetchBreweryCountries: async () => ({
    items: ["Netherlands"],
    unknown_available: false,
    has_more: false,
  }),
}));
function State() {
  const location = useLocation();
  return (
    <output aria-label="navigation state">{JSON.stringify(location)}</output>
  );
}
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test.each([
  ["styles", "beers"],
  ["styles", "breweries"],
  ["beers", "styles"],
  ["breweries", "styles"],
] as const)(
  "%s catalogue via detail to %s retains the original return identity",
  async (origin, destination) => {
    const url = `/explore/${origin}?search=IPA&sort=rating_desc&page=2&rating_min=0`;
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/explore/styles" element={<ExplorerStyles />} />
          <Route path="/explore/beers" element={<ExplorerBeers />} />
          <Route path="/explore/breweries" element={<ExplorerBreweries />} />
          <Route
            path="/explore/styles/:styleId"
            element={<ExplorerStyleDetail />}
          />
          <Route
            path="/explore/beers/:beerId"
            element={<ExplorerBeerDetail />}
          />
          <Route
            path="/explore/breweries/:breweryId"
            element={<ExplorerBreweryDetail />}
          />
        </Routes>
        <State />
      </MemoryRouter>,
    );
    const name =
      origin === "styles"
        ? style.name
        : origin === "beers"
          ? styledBeer.name
          : brewery.name;
    fireEvent.click((await screen.findAllByRole("link", { name }))[0]);
    await screen.findByRole("heading", { level: 1, name });
    const originalKey = JSON.parse(
      screen.getByLabelText("navigation state").textContent!,
    ).state.explorerEntryKey;
    expect(originalKey).toEqual(expect.any(String));
    const crossName =
      destination === "beers"
        ? styledBeer.name
        : destination === "breweries"
          ? `${brewery.name}: 2 unique beers`
          : origin === "beers"
            ? style.name
            : `${style.name}: 2 unique beers`;
    fireEvent.click(screen.getByRole("link", { name: crossName }));
    await screen.findByRole("heading", {
      level: 1,
      name:
        destination === "styles"
          ? style.name
          : destination === "beers"
            ? styledBeer.name
            : brewery.name,
    });
    expect(
      JSON.parse(screen.getByLabelText("navigation state").textContent!).state
        .explorerEntryKey,
    ).toBe(originalKey);
    fireEvent.click(
      screen.getByRole("link", { name: /← Back to (style|beer|brewery)$/ }),
    );
    await screen.findByRole("heading", { level: 1, name });
    const back = screen.getByRole("link", {
      name: /← Back to (styles|Beer Explorer|breweries)$/,
    });
    expect(back).toHaveAttribute("href", url);
    fireEvent.click(back);
    await waitFor(() =>
      expect(
        JSON.parse(screen.getByLabelText("navigation state").textContent!)
          .pathname,
      ).toBe(`/explore/${origin}`),
    );
    expect(
      JSON.parse(screen.getByLabelText("navigation state").textContent!).state
        .explorerReturnKey,
    ).toBe(originalKey);
  },
);
test("detail trail stays flat and bounded and rejects external return destinations", () => {
  let location = {
    pathname: "/explore/styles/3",
    search: "?returnTo=%2Fexplore%2Fstyles%3Fpage%3D2",
    state: { explorerEntryKey: "original" } as Record<string, unknown>,
  };
  for (let i = 0; i < 50; i++) {
    const link = detailLink("beers", i + 1, location);
    const next = new URL(link.to, "http://localhost");
    expect(link.to.length).toBeLessThan(150);
    expect(link.state.explorerParents.length).toBeLessThanOrEqual(16);
    location = {
      pathname: next.pathname,
      search: next.search,
      state: link.state,
    };
  }
  expect(detailBackState(location.state).explorerReturnKey).toBe("original");
  expect(
    detailReturn(
      new URLSearchParams("returnTo=https://evil.test/explore/styles"),
      null,
      "/explore/styles",
    ),
  ).toBe("/explore/styles");
});

test("cross-entity URLs recover the original catalogue without router state and remain flat", () => {
  const catalogue =
    "/explore/styles?search=IPA&rating_min=0&sort=name_asc&page=3";
  let location = {
    pathname: "/explore/styles/3",
    search: `?${new URLSearchParams({ returnTo: catalogue })}`,
    state: null,
  };
  let firstLength = 0;
  for (let i = 0; i < 50; i++) {
    const link = detailLink("beers", 1, location);
    const next = new URL(link.to, window.location.origin);
    const returnTo = detailReturn(next.searchParams, null, "/explore/beers");
    const parent = new URL(returnTo, window.location.origin);
    expect(parent.pathname).toBe(location.pathname);
    expect(detailReturn(parent.searchParams, null, "/explore/styles")).toBe(
      catalogue,
    );
    expect(next.searchParams.get("catalogueReturn")).toBe(catalogue);
    expect(next.searchParams.get("returnTo")).not.toContain("returnTo");
    expect(next.searchParams.get("returnTo")).not.toContain("catalogueReturn");
    if (!i) firstLength = link.to.length;
    expect(link.to.length).toBeLessThanOrEqual(firstLength);
    location = { pathname: next.pathname, search: next.search, state: null };
  }
});

test.each([
  "https://evil.test/explore/styles",
  "//evil.test/explore/styles",
  "/explore/styles/3",
  "/explore/styles#fragment",
  "/explore/styles?returnTo=/explore/beers",
  "/explore/styles?catalogueReturn=/explore/beers",
  "/other",
  "/explore/styles/../styles",
])("catalogue fallback rejects %s", (invalid) => {
  // Normalized dot segments are rejected before accepting the route.
  const destination = detailReturn(
    new URLSearchParams({ catalogueReturn: invalid }),
    null,
    "/explore/beers",
  );
  expect(destination).toBe("/explore/beers");
});
