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
import ExplorerStyles from "./pages/ExplorerStyles";
import ExplorerStyleDetail from "./pages/ExplorerStyleDetail";
import { fetchExploreStyles, fetchStyleDetail } from "./api/explore";
import type { ExploreStyle, StyleDetail } from "./api/explore";
import { ApiError } from "./api/client";
import {
  styleReturnUrl,
  readExplorerScroll,
  saveExplorerScroll,
} from "./utils/explorer";
import { emptyFilters, readFilters, sameFilters } from "./pages/styleState";
vi.mock("./api/explore", async (original) => ({
  ...(await original<typeof import("./api/explore")>()),
  fetchExploreStyles: vi.fn(),
  fetchStyleDetail: vi.fn(),
  fetchStyleBounds: async () => ({ abv_max: 12.5 }),
}));
vi.mock("./components/BreweryRatingChart", () => ({
  default: () => <p>Rating distribution of check-ins</p>,
}));
const item: ExploreStyle = {
  id: 2,
  name: "IPA - Imperial / Double New England / Hazy",
  brewery_count: 1,
  average_abv: 10,
  known_abv_beer_count: 2,
  unique_beer_count: 2,
  checkin_count: 4,
  rated_checkin_count: 3,
  personal_average_rating: 3.9375,
  first_checked_in_at: "2026-01-01T00:00:00Z",
  last_checked_in_at: "2026-10-01T00:00:00Z",
};
const detail: StyleDetail = {
  ...item,

  highest_rating: 4.5,
  lowest_rating: 0,

  rating_distribution: [],
  most_explored_breweries: [
    { id: 1, name: "Personal Brewery", unique_beer_count: 2 },
  ],
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
function show(url = "/explore/styles") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/explore/styles" element={<ExplorerStyles />} />
        <Route
          path="/explore/styles/:styleId"
          element={<ExplorerStyleDetail />}
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
  vi.mocked(fetchExploreStyles)
    .mockReset()
    .mockImplementation(async (p) => ({
      items: [item],
      page: Number(p.get("page") || 1),
      page_size: 25,
      total: 26,
      total_pages: 2,
    }));
  vi.mocked(fetchStyleDetail).mockReset().mockResolvedValue(detail);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test("catalogue metadata, default sorting, search, sorting and pagination use URL state", async () => {
  const user = userEvent.setup();
  show();
  await screen.findAllByText(item.name);
  expect(fetchExploreStyles).toHaveBeenCalledWith(expect.any(URLSearchParams));
  expect(vi.mocked(fetchExploreStyles).mock.calls[0][0].get("sort")).toBe(
    "unique_beers_desc",
  );
  await user.type(screen.getByLabelText("Search styles"), "Imperial");
  await user.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() =>
    expect(screen.getByLabelText("URL").textContent).toContain(
      "search=Imperial",
    ),
  );
  fireEvent.change(screen.getByLabelText("Sort styles"), {
    target: { value: "rating_asc" },
  });
  await screen.findAllByText(item.name);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(screen.getByLabelText("URL").textContent).toContain("page=2"),
  );
  expect(screen.getByLabelText("URL").textContent).toContain("sort=rating_asc");
});
test("counts, zero ratings, date filters and removable chips", async () => {
  const user = userEvent.setup();
  show();
  await screen.findAllByText(item.name);
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
  expect(screen.getByLabelText("URL")).toHaveTextContent("/explore/styles");
});
test("missing metadata and unrated styles display without invented zero", async () => {
  vi.mocked(fetchExploreStyles).mockResolvedValue({
    items: [{ ...item, personal_average_rating: null }],
    page: 1,
    page_size: 25,
    total: 1,
    total_pages: 1,
  });
  show();
  await screen.findAllByText(item.name);
  expect(screen.getAllByText("Not rated").length).toBeGreaterThan(0);
});
test("loading, error retry and empty states", async () => {
  vi.mocked(fetchExploreStyles)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      items: [],
      page: 1,
      page_size: 25,
      total: 0,
      total_pages: 0,
    });
  show();
  expect(screen.getByText("Loading styles…")).toBeInTheDocument();
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByText("No styles in your catalogue yet."),
  ).toBeInTheDocument();
});
test("pending stale responses never replace newer results", async () => {
  let finish!: (v: Awaited<ReturnType<typeof fetchExploreStyles>>) => void;
  vi.mocked(fetchExploreStyles).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  show();
  fireEvent.change(screen.getByLabelText("Sort styles"), {
    target: { value: "name_asc" },
  });
  await screen.findAllByText(item.name);
  await act(async () =>
    finish({ items: [], page: 1, page_size: 25, total: 0, total_pages: 0 }),
  );
  expect(
    screen.queryByText("No styles in your catalogue yet."),
  ).not.toBeInTheDocument();
});
test("mobile sheet changes stay draft until Apply", async () => {
  mobile = true;
  const user = userEvent.setup();
  show();
  await screen.findAllByText(item.name);
  await user.click(screen.getByRole("button", { name: "Filters (0)" }));
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByText("Exploration", { exact: true }));
  fireEvent.change(
    within(dialog).getByLabelText("Minimum distinct breweries"),
    { target: { value: "0" } },
  );
  fireEvent.blur(within(dialog).getByLabelText("Minimum distinct breweries"));
  expect(screen.getByLabelText("URL").textContent).not.toContain(
    "min_breweries=",
  );
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
      "min_breweries=0",
    ),
  );
});
test("detail statistics and semantic cross-entity links", async () => {
  show("/explore/styles/2");
  await screen.findByRole("heading", { name: item.name });
  expect(screen.getByText("3.94")).toBeInTheDocument();
  expect(screen.getByText("0.00")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Explore all 2 beers" }),
  ).toHaveAttribute("href", "/explore/beers?style_id=2");
  expect(screen.getByRole("link", { name: "Top beer" })).toHaveAttribute(
    "href",
    expect.stringContaining("/explore/beers/5?returnTo="),
  );
  expect(screen.getByText("10.00%")).toBeInTheDocument();
  expect(screen.getByText(/based on 2 distinct beers/)).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Personal Brewery/ }),
  ).toHaveAttribute("href", expect.stringContaining("/explore/breweries/1?"));
});
test("catalogue return URL and history entry restoration remain scoped", async () => {
  const url = "/explore/styles?search=Personal&sort=name_asc&page=2";
  const user = userEvent.setup();
  show(url);
  await screen.findAllByText(item.name);
  await user.click(screen.getAllByRole("link", { name: item.name })[0]);
  await screen.findByRole("heading", { name: item.name });
  expect(screen.getByRole("link", { name: /Back to styles/ })).toHaveAttribute(
    "href",
    url,
  );
  await user.click(screen.getByRole("link", { name: /Back to styles/ }));
  await screen.findAllByText(item.name);
  expect(screen.getByLabelText("URL")).toHaveTextContent(url);
  saveExplorerScroll("brew-entry", "?page=2", "/explore/styles");
  expect(
    readExplorerScroll("brew-entry", "?page=2", "/explore/beers"),
  ).toBeNull();
  expect(readExplorerScroll("brew-entry", "?page=2", "/explore/styles")).toBe(
    0,
  );
});
test("beer-origin return path and unsafe redirects", async () => {
  show("/explore/styles/2?returnTo=%2Fexplore%2Fbeers%2F5");
  await screen.findByRole("heading", { name: item.name });
  expect(screen.getByRole("link", { name: /Back to beer$/ })).toHaveAttribute(
    "href",
    "/explore/beers/5",
  );
  expect(screen.getByRole("link", { name: "Style catalogue" })).toHaveAttribute(
    "href",
    "/explore/styles",
  );
  for (const input of [
    "https://evil.test/explore/styles",
    "//evil.test/explore/styles",
    "/explore/styles#x",
  ])
    expect(styleReturnUrl(input)).toBe("/explore/styles");
});
test("404, unrated detail and invalid identifier handling", async () => {
  vi.mocked(fetchStyleDetail).mockRejectedValue(new ApiError(404));
  show("/explore/styles/99");
  expect(await screen.findByRole("alert")).toHaveTextContent("Style not found");
  cleanup();
  show("/explore/styles/0");
  expect(screen.getByRole("alert")).toHaveTextContent("Style not found");
  cleanup();
  vi.mocked(fetchStyleDetail).mockResolvedValue({
    ...detail,
    personal_average_rating: null,
    average_abv: null,
    known_abv_beer_count: 0,
    highest_rating: null,
    lowest_rating: null,
    highest_rated_beers: [],
    most_explored_breweries: [],
  });
  show("/explore/styles/2");
  await screen.findByRole("heading", { name: item.name });
  expect(screen.getAllByText("Not rated")).toHaveLength(3);
  expect(screen.getByText("No rated beers yet.")).toBeInTheDocument();
  expect(screen.getByText("Not available")).toBeInTheDocument();
  expect(screen.getByText(/based on 0 distinct beers/)).toBeInTheDocument();
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
      { ...emptyFilters(), min_breweries: "0", rating_min: "0" },
      { ...emptyFilters(), min_breweries: "0", rating_min: "0.00" },
    ),
  ).toBe(true);
  expect(
    sameFilters(emptyFilters(), { ...emptyFilters(), rating_min: "0" }),
  ).toBe(false);
});

test("Average ABV and zero brewery filters distinguish inactive and no-op edits", async () => {
  show("/explore/styles?page=2");
  await screen.findAllByText(item.name);
  const minimum = screen.getByRole("spinbutton", {
    name: "Average ABV minimum",
  });
  fireEvent.change(minimum, { target: { value: "0" } });
  fireEvent.blur(minimum);
  await waitFor(() =>
    expect(screen.getByLabelText("URL").textContent).toContain("abv_min=0"),
  );
  expect(screen.getByLabelText("URL").textContent).not.toContain("page=2");
  const count = screen.getByLabelText("Minimum distinct breweries");
  fireEvent.change(count, { target: { value: "0" } });
  fireEvent.blur(count);
  await waitFor(() =>
    expect(screen.getByLabelText("URL").textContent).toContain(
      "min_breweries=0",
    ),
  );
  const calls = vi.mocked(fetchExploreStyles).mock.calls.length;
  fireEvent.change(minimum, { target: { value: "0.00" } });
  fireEvent.blur(minimum);
  expect(fetchExploreStyles).toHaveBeenCalledTimes(calls);
  expect(
    readFilters(
      new URLSearchParams("min_breweries=0&min_checkins=01&abv_min=0"),
    ),
  ).toEqual({ ...emptyFilters(), min_breweries: "0", abv_min: "0" });
});

test("pending range commits merge and unchanged search preserves pagination", async () => {
  show("/explore/styles?page=2");
  await screen.findAllByText(item.name);
  const calls = vi.mocked(fetchExploreStyles).mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(screen.getByLabelText("URL").textContent).toContain("page=2");
  expect(fetchExploreStyles).toHaveBeenCalledTimes(calls);
  act(() => {
    const abv = screen.getByRole("spinbutton", { name: "Average ABV minimum" });
    const rating = screen.getByRole("spinbutton", {
      name: "My rating minimum",
    });
    fireEvent.change(abv, { target: { value: "0" } });
    fireEvent.blur(abv);
    fireEvent.change(rating, { target: { value: "0" } });
    fireEvent.blur(rating);
  });
  await waitFor(() => {
    expect(screen.getByLabelText("URL").textContent).toContain("abv_min=0");
    expect(screen.getByLabelText("URL").textContent).toContain("rating_min=0");
  });
});
