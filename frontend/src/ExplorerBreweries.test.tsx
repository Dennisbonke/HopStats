import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ExplorerBreweries from "./pages/ExplorerBreweries";
import ExplorerBreweryDetail from "./pages/ExplorerBreweryDetail";
import { fetchExploreBreweries, fetchBreweryDetail } from "./api/explore";
import type { ExploreBrewery, BreweryDetail } from "./api/explore";
import { ApiError } from "./api/client";
import {
  breweryReturnUrl,
  readExplorerScroll,
  saveExplorerScroll,
} from "./utils/explorer";
import { emptyFilters, readFilters, sameFilters } from "./pages/breweryState";
vi.mock("./api/explore", async (original) => ({
  ...(await original<typeof import("./api/explore")>()),
  fetchExploreBreweries: vi.fn(),
  fetchBreweryDetail: vi.fn(),
  fetchBreweryCountries: async () => ({
    items: ["Netherlands"],
    unknown_available: true,
    has_more: false,
  }),
}));
vi.mock("./components/BreweryRatingChart", () => ({
  default: () => <p>Rating distribution of check-ins</p>,
}));
const item: ExploreBrewery = {
  id: 2,
  name: "Personal Brewery",
  city: "Amsterdam",
  state: null,
  country: "Netherlands",
  unique_beer_count: 2,
  checkin_count: 4,
  rated_checkin_count: 3,
  personal_average_rating: 3.9375,
  first_checked_in_at: "2026-01-01T00:00:00Z",
  last_checked_in_at: "2026-10-01T00:00:00Z",
};
const detail: BreweryDetail = {
  ...item,
  style_count: 1,
  highest_rating: 4.5,
  lowest_rating: 0,
  untappd_url: "https://untappd.com/brewery/765",
  rating_distribution: [],
  most_explored_styles: [{ id: 1, name: "IPA", unique_beer_count: 2 }],
  highest_rated_beers: [
    {
      id: 5,
      name: "Top beer",
      brewery: { id: 2, name: item.name },
      style: null,
      abv: null,
      ibu: null,
      photo_url: null,
      checkin_count: 1,
      rated_checkin_count: 1,
      personal_average_rating: 4.5,
      first_checked_in_at: item.first_checked_in_at,
      last_checked_in_at: item.last_checked_in_at,
    },
  ],
};
let mobile = false;
function State() {
  const l = useLocation();
  return <output aria-label="URL">{l.pathname + l.search}</output>;
}
function show(url = "/explore/breweries") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/explore/breweries" element={<ExplorerBreweries />} />
        <Route
          path="/explore/breweries/:breweryId"
          element={<ExplorerBreweryDetail />}
        />
        <Route path="/explore/beers" element={<p>Filtered beers</p>} />
        <Route
          path="/explore/beers/:beerId"
          element={<p>Beer details destination</p>}
        />
      </Routes>
      <State />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  mobile = false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: mobile,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal("scrollTo", vi.fn());
  vi.mocked(fetchExploreBreweries)
    .mockReset()
    .mockImplementation(async (p) => ({
      items: [item],
      page: Number(p.get("page") || 1),
      page_size: 25,
      total: 26,
      total_pages: 2,
    }));
  vi.mocked(fetchBreweryDetail).mockReset().mockResolvedValue(detail);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test("catalogue metadata, default sorting, search, sorting and pagination use URL state", async () => {
  const user = userEvent.setup();
  show();
  await screen.findAllByText(item.name);
  expect(fetchExploreBreweries).toHaveBeenCalledWith(
    expect.any(URLSearchParams),
  );
  expect(vi.mocked(fetchExploreBreweries).mock.calls[0][0].get("sort")).toBe(
    "unique_beers_desc",
  );
  expect(screen.getAllByText("Amsterdam, Netherlands").length).toBeGreaterThan(
    0,
  );
  await user.type(
    screen.getByLabelText("Search breweries or locations"),
    "Amsterdam",
  );
  await user.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() =>
    expect(screen.getByLabelText("URL").textContent).toContain(
      "search=Amsterdam",
    ),
  );
  fireEvent.change(screen.getByLabelText("Sort breweries"), {
    target: { value: "rating_asc" },
  });
  await screen.findAllByText(item.name);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(screen.getByLabelText("URL").textContent).toContain("page=2"),
  );
  expect(screen.getByLabelText("URL").textContent).toContain("sort=rating_asc");
});
test("country, counts, zero ratings, date filters and removable chips", async () => {
  const user = userEvent.setup();
  show();
  await screen.findAllByText(item.name);
  await user.click(await screen.findByLabelText("Unknown country"));
  await waitFor(() =>
    expect(screen.getByLabelText("URL").textContent).toContain(
      "unknown_country=true",
    ),
  );
  const count = screen.getByLabelText("Minimum unique beers");
  await user.type(count, "2");
  fireEvent.blur(count);
  await waitFor(() =>
    expect(screen.getByLabelText("URL").textContent).toContain(
      "min_unique_beers=2",
    ),
  );
  const rating = screen.getByRole("spinbutton", { name: "My rating minimum" });
  fireEvent.change(rating, { target: { value: "0" } });
  fireEvent.blur(rating);
  await waitFor(() =>
    expect(screen.getByLabelText("URL").textContent).toContain("rating_min=0"),
  );
  fireEvent.change(screen.getByLabelText("First tried from"), {
    target: { value: "2026-03-29" },
  });
  await waitFor(() =>
    expect(screen.getByLabelText("URL").textContent).toContain(
      "first_tried_from=2026-03-29",
    ),
  );
  await user.click(screen.getByRole("button", { name: /Remove My rating/ }));
  expect(screen.getByLabelText("URL").textContent).not.toContain("rating_min");
  await user.click(screen.getByRole("button", { name: "Clear all filters" }));
  expect(screen.getByLabelText("URL")).toHaveTextContent("/explore/breweries");
});
test("missing metadata and unrated breweries display without invented zero", async () => {
  vi.mocked(fetchExploreBreweries).mockResolvedValue({
    items: [
      { ...item, city: null, country: null, personal_average_rating: null },
    ],
    page: 1,
    page_size: 25,
    total: 1,
    total_pages: 1,
  });
  show();
  expect(
    (await screen.findAllByText("Location unavailable")).length,
  ).toBeGreaterThan(0);
  expect(screen.getAllByText("Not rated").length).toBeGreaterThan(0);
});
test("loading, error retry and empty states", async () => {
  vi.mocked(fetchExploreBreweries)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      items: [],
      page: 1,
      page_size: 25,
      total: 0,
      total_pages: 0,
    });
  show();
  expect(screen.getByText("Loading breweries…")).toBeInTheDocument();
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByText("No breweries in your catalogue yet."),
  ).toBeInTheDocument();
});
test("pending stale responses never replace newer results", async () => {
  let finish!: (v: Awaited<ReturnType<typeof fetchExploreBreweries>>) => void;
  vi.mocked(fetchExploreBreweries).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  show();
  fireEvent.change(screen.getByLabelText("Sort breweries"), {
    target: { value: "name_asc" },
  });
  await screen.findAllByText(item.name);
  await act(async () =>
    finish({ items: [], page: 1, page_size: 25, total: 0, total_pages: 0 }),
  );
  expect(
    screen.queryByText("No breweries in your catalogue yet."),
  ).not.toBeInTheDocument();
});
test("mobile sheet changes stay draft until Apply", async () => {
  mobile = true;
  const user = userEvent.setup();
  show();
  await screen.findAllByText(item.name);
  await user.click(screen.getByRole("button", { name: "Filters (0)" }));
  const dialog = screen.getByRole("dialog");
  await user.click(await within(dialog).findByLabelText("Netherlands"));
  expect(screen.getByLabelText("URL").textContent).not.toContain("country=");
  // Happy DOM incorrectly treats fractional range steps as invalid (native CI coverage remains enabled).
  dialog
    .querySelectorAll<HTMLInputElement>('input[type="range"]')
    .forEach((input) => {
      input.disabled = true;
    });
  await user.click(
    within(dialog).getByRole("button", { name: "Apply filters" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("URL").textContent).toContain(
      "country=Netherlands",
    ),
  );
});
test("detail statistics and semantic cross-entity links", async () => {
  show("/explore/breweries/2");
  await screen.findByRole("heading", { name: item.name });
  expect(
    screen.queryByRole("link", { name: "Brewery catalogue" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("3.94")).toBeInTheDocument();
  expect(screen.getByText("0.00")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Explore all 2 beers" }),
  ).toHaveAttribute("href", "/explore/beers?brewery_id=2");
  expect(screen.getByRole("link", { name: "Top beer" })).toHaveAttribute(
    "href",
    expect.stringContaining("/explore/beers/5?returnTo="),
  );
  expect(
    screen.getByRole("link", { name: /View brewery on Untappd/ }),
  ).toHaveAttribute("href", "https://untappd.com/brewery/765");
  expect(screen.getByRole("link", { name: /IPA/ })).toHaveAttribute(
    "href",
    expect.stringContaining("/explore/styles/1?"),
  );
});
test("catalogue return URL and history entry restoration remain scoped", async () => {
  const url = "/explore/breweries?search=Personal&sort=name_asc&page=2";
  const user = userEvent.setup();
  show(url);
  await screen.findAllByText(item.name);
  await user.click(screen.getAllByRole("link", { name: item.name })[0]);
  await screen.findByRole("heading", { name: item.name });
  expect(
    screen.getByRole("link", { name: /Back to breweries/ }),
  ).toHaveAttribute("href", url);
  await user.click(screen.getByRole("link", { name: /Back to breweries/ }));
  await screen.findAllByText(item.name);
  expect(screen.getByLabelText("URL")).toHaveTextContent(url);
  saveExplorerScroll("brew-entry", "?page=2", "/explore/breweries");
  expect(
    readExplorerScroll("brew-entry", "?page=2", "/explore/beers"),
  ).toBeNull();
  expect(
    readExplorerScroll("brew-entry", "?page=2", "/explore/breweries"),
  ).toBe(0);
});
test("beer-origin return path and unsafe redirects", async () => {
  show("/explore/breweries/2?returnTo=%2Fexplore%2Fbeers%2F5");
  await screen.findByRole("heading", { name: item.name });
  expect(screen.getByRole("link", { name: /Back to beer$/ })).toHaveAttribute(
    "href",
    "/explore/beers/5",
  );
  expect(
    screen.getByRole("link", { name: "Brewery catalogue" }),
  ).toHaveAttribute("href", "/explore/breweries");
  for (const input of [
    "https://evil.test/explore/breweries",
    "//evil.test/explore/breweries",
    "/explore/breweries#x",
  ])
    expect(breweryReturnUrl(input)).toBe("/explore/breweries");
});
test("404, unrated detail and invalid identifier handling", async () => {
  vi.mocked(fetchBreweryDetail).mockRejectedValue(new ApiError(404));
  show("/explore/breweries/99");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Brewery not found",
  );
  cleanup();
  show("/explore/breweries/0");
  expect(screen.getByRole("alert")).toHaveTextContent("Brewery not found");
  cleanup();
  vi.mocked(fetchBreweryDetail).mockResolvedValue({
    ...detail,
    personal_average_rating: null,
    highest_rating: null,
    lowest_rating: null,
    highest_rated_beers: [],
    most_explored_styles: [],
  });
  show("/explore/breweries/2");
  await screen.findByRole("heading", { name: item.name });
  expect(screen.getAllByText("Not rated")).toHaveLength(3);
  expect(screen.getByText("No rated beers yet.")).toBeInTheDocument();
});
test("URL validation and equivalent no-op filter edits preserve state", () => {
  expect(
    readFilters(
      new URLSearchParams(
        "min_checkins=0&rating_min=0&last_tried_to=2026-02-30",
      ),
    ),
  ).toEqual({ ...emptyFilters(), rating_min: "0" });
  expect(
    sameFilters(
      { ...emptyFilters(), country: ["NL", "BE"], rating_min: "0" },
      { ...emptyFilters(), country: ["BE", "NL"], rating_min: "0.00" },
    ),
  ).toBe(true);
  expect(
    sameFilters(emptyFilters(), { ...emptyFilters(), rating_min: "0" }),
  ).toBe(false);
});

test("style-origin brewery detail offers a fresh catalogue shortcut", async () => {
  show("/explore/breweries/2?returnTo=%2Fexplore%2Fstyles%2F1");
  await screen.findByRole("heading", { name: item.name });
  expect(
    screen.getByRole("link", { name: "Brewery catalogue" }),
  ).toHaveAttribute("href", "/explore/breweries");
});

test("invalid count edits preserve applied brewery filters and rapid valid edits merge", async () => {
  show("/explore/breweries?page=2&min_checkins=5");
  await screen.findAllByText(item.name);
  const calls = vi.mocked(fetchExploreBreweries).mock.calls.length;
  const count = screen.getByLabelText("Minimum check-ins");
  fireEvent.change(count, { target: { value: "-2" } });
  fireEvent.blur(count);
  expect(screen.getByLabelText("URL").textContent).toContain(
    "page=2&min_checkins=5",
  );
  expect(fetchExploreBreweries).toHaveBeenCalledTimes(calls);
  act(() => {
    fireEvent.change(count, { target: { value: "6.0" } });
    fireEvent.blur(count);
    const beers = screen.getByLabelText("Minimum unique beers");
    fireEvent.change(beers, { target: { value: "03" } });
    fireEvent.blur(beers);
  });
  await waitFor(() => {
    expect(screen.getByLabelText("URL").textContent).toContain(
      "min_checkins=6",
    );
    expect(screen.getByLabelText("URL").textContent).toContain(
      "min_unique_beers=3",
    );
  });
});
