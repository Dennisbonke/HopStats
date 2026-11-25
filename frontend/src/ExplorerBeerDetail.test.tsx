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
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ExplorerBeerDetail from "./pages/ExplorerBeerDetail";
import ExplorerBeers from "./pages/ExplorerBeers";
import { ApiError } from "./api/client";
import {
  fetchBeerDetail,
  fetchBeerHistory,
  fetchExploreBeers,
} from "./api/explore";
import type { BeerDetail, BeerHistory } from "./api/explore";
import { explorerReturnUrl, safeImageUrl } from "./utils/explorer";

vi.mock("./api/explore", async (original) => ({
  ...(await original<typeof import("./api/explore")>()),
  fetchBeerDetail: vi.fn(),
  fetchBeerHistory: vi.fn(),
  fetchExploreBeers: vi.fn(),
  fetchExploreBounds: async () => ({ abv_max: 20 }),
  fetchExploreOptions: async () => ({ items: [], has_more: false }),
}));
// Real chart geometry and pointer handling are exercised in Playwright.
vi.mock("./components/BeerRatingChart", () => ({
  default: ({ points }: { points: unknown[] }) => (
    <section aria-label="Rating chart">
      {points.length
        ? `${points.length} rated observations`
        : "No rated check-ins yet."}
    </section>
  ),
}));
const detail: BeerDetail = {
  id: 1,
  name: "Personal stout",
  brewery: {
    id: 2,
    name: "Brewery",
    city: "Amsterdam",
    state: null,
    country: "NL",
  },
  style: { id: 3, name: "Stout" },
  abv: 6.5,
  ibu: 45,
  photo_url: "https://example.test/art.jpg",
  checkin_count: 26,
  rated_checkin_count: 2,
  personal_average_rating: 2.25,
  highest_rating: 4.5,
  lowest_rating: 0,
  first_checked_in_at: "2026-01-01T23:30:00Z",
  last_checked_in_at: "2026-02-02T12:30:00Z",
  rating_history: [
    { id: 1, occurred_at_utc: "2026-01-01T23:30:00Z", rating: 0 },
    { id: 2, occurred_at_utc: "2026-02-02T12:30:00Z", rating: 4.5 },
  ],
  untappd_url: "https://untappd.com/beer/4509",
};
const history: BeerHistory = {
  page: 1,
  page_size: 25,
  total: 26,
  total_pages: 2,
  items: [
    {
      id: 2,
      occurred_at_utc: "2026-02-02T12:30:00Z",
      rating: 0,
      comment: "First line\n<script>plain text</script>",
      serving_type: "Bottle",
      purchase_venue: "Bottle shop",
      photo_url: "https://example.test/photo.jpg",
      venue: {
        id: 1,
        name: "Taproom",
        city: "Haarlem",
        state: null,
        country: "NL",
      },
      untappd_url: "https://untappd.com/c/123",
    },
  ],
};
function RouterState() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Current URL">
        {location.pathname}
        {location.search}
      </output>
      <button onClick={() => navigate(-1)}>Browser back</button>
      <button onClick={() => navigate(1)}>Browser forward</button>
      <button onClick={() => navigate("/explore/beers/2")}>Other beer</button>
    </>
  );
}
function show(url = "/explore/beers/1") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <RouterState />
      <Routes>
        <Route path="/explore/beers" element={<ExplorerBeers />} />
        <Route path="/explore/beers/:beerId" element={<ExplorerBeerDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.mocked(fetchBeerDetail).mockResolvedValue(detail);
  vi.mocked(fetchBeerHistory).mockImplementation(async (_, params) => ({
    ...history,
    page: Number(params.get("page")),
    items:
      params.get("page") === "2"
        ? [{ ...history.items[0], id: 1, comment: "Older entry", rating: null }]
        : history.items,
  }));
  vi.mocked(fetchExploreBeers).mockResolvedValue({
    items: [detail],
    page: 1,
    page_size: 25,
    total: 1,
    total_pages: 1,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("direct route shows profile, complete statistics and safe plain-text check-ins", async () => {
  show();
  expect(
    await screen.findByRole("heading", { name: "Personal stout" }),
  ).toBeInTheDocument();
  expect(screen.getByText("2.25")).toBeInTheDocument();
  expect(screen.getByText("2 rated check-ins")).toBeInTheDocument();
  expect(screen.getByText("2 rated observations")).toBeInTheDocument();
  expect(screen.getByText("Amsterdam, NL")).toBeInTheDocument();
  expect(screen.getByText("Haarlem, NL")).toBeInTheDocument();
  expect(screen.getByText("Bottle shop")).toBeInTheDocument();
  expect(screen.getByText("Check-in venue")).toBeInTheDocument();
  expect(screen.getByText(/<script>plain text<\/script>/)).toBeInTheDocument();
  expect(document.querySelector("script")).toBeNull();
  expect(screen.getAllByText("0.00")).toHaveLength(2);
  expect(
    screen.getByRole("link", { name: /Back to Beer Explorer/ }),
  ).toHaveAttribute("href", "/explore/beers");
  const original = screen.getByRole("link", { name: /View original/ });
  expect(original).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.getByAltText("Imported check-in photo")).toHaveAttribute(
    "loading",
    "lazy",
  );
});

test("history pagination and order restore URL state without refetching profile", async () => {
  const user = userEvent.setup();
  show("/explore/beers/1?future=keep");
  await screen.findByText("Bottle shop");
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByText("Older entry")).toBeInTheDocument();
  expect(screen.getByLabelText("Current URL").textContent).toContain("page=2");
  expect(screen.getByText("Not rated")).toBeInTheDocument();
  expect(fetchBeerDetail).toHaveBeenCalledTimes(1);
  await user.selectOptions(screen.getByLabelText("History order"), "oldest");
  await waitFor(() =>
    expect(screen.getByLabelText("Current URL").textContent).toContain(
      "page=1&sort=oldest",
    ),
  );
  expect(screen.getByLabelText("Current URL").textContent).toContain(
    "future=keep",
  );
  await user.click(screen.getByText("Browser back"));
  expect(await screen.findByText("Older entry")).toBeInTheDocument();
  expect(screen.getByLabelText("History order")).toHaveValue("newest");
  await user.click(screen.getByText("Browser forward"));
  await waitFor(() =>
    expect(screen.getByLabelText("History order")).toHaveValue("oldest"),
  );
  expect(fetchBeerDetail).toHaveBeenCalledTimes(1);
});

test("normalizes invalid and out-of-range history URLs", async () => {
  vi.mocked(fetchBeerHistory).mockResolvedValue({ ...history, page: 2 });
  show("/explore/beers/1?page=999&page_size=invalid&sort=bad&future=keep");
  await screen.findByText("Bottle shop");
  await waitFor(() =>
    expect(screen.getByLabelText("Current URL").textContent).toContain(
      "page=2&page_size=25&sort=newest&future=keep",
    ),
  );
});

test("missing metadata, no ratings and broken images have honest fallbacks", async () => {
  vi.mocked(fetchBeerDetail).mockResolvedValue({
    ...detail,
    brewery: null,
    style: null,
    abv: null,
    ibu: null,
    personal_average_rating: null,
    highest_rating: null,
    lowest_rating: null,
    rated_checkin_count: 0,
    rating_history: [],
    untappd_url: null,
  });
  show();
  await screen.findByRole("heading", { name: "Personal stout" });
  expect(screen.getByText("Brewery unavailable")).toBeInTheDocument();
  expect(screen.getByText("Style unavailable")).toBeInTheDocument();
  expect(screen.getAllByText("Not rated")).toHaveLength(3);
  expect(screen.queryByText("IBU")).not.toBeInTheDocument();
  expect(screen.getByText("No rated check-ins yet.")).toBeInTheDocument();
  fireEvent.error(screen.getByAltText("Personal stout artwork"));
  expect(
    screen.getByRole("img", { name: /artwork unavailable/ }),
  ).toBeInTheDocument();
  fireEvent.error(await screen.findByAltText("Imported check-in photo"));
  expect(screen.getByText("Check-in photo unavailable")).toBeInTheDocument();
});

test.each([404, 401, 500])("handles profile error %s", async (status) => {
  vi.mocked(fetchBeerDetail).mockRejectedValue(new ApiError(status));
  show();
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(
    status === 404
      ? "Beer not found"
      : status === 401
        ? "session has expired"
        : "temporarily unavailable",
  );
});

test("history failure leaves profile and chart available, retry succeeds", async () => {
  vi.mocked(fetchBeerHistory).mockRejectedValueOnce(new Error("offline"));
  const user = userEvent.setup();
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Check-in history is temporarily unavailable",
  );
  expect(
    screen.getByRole("heading", { name: "Personal stout" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Bottle shop")).toBeInTheDocument();
  expect(fetchBeerDetail).toHaveBeenCalledTimes(1);
});

test("switching beers hides previous data and ignores late responses", async () => {
  let resolveOld!: (value: BeerDetail) => void;
  let resolveNew!: (value: BeerDetail) => void;
  vi.mocked(fetchBeerDetail)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNew = resolve;
        }),
    );
  const user = userEvent.setup();
  show();
  expect(screen.getByText("Loading beer details…")).toBeInTheDocument();
  await user.click(screen.getByText("Other beer"));
  await act(async () => resolveNew({ ...detail, id: 2, name: "New beer" }));
  await screen.findByRole("heading", { name: "New beer" });
  await act(async () => resolveOld(detail));
  expect(
    screen.queryByRole("heading", { name: "Personal stout" }),
  ).not.toBeInTheDocument();
});

test("rapid history requests cannot replace the latest ordering", async () => {
  let resolveOld!: (value: BeerHistory) => void;
  vi.mocked(fetchBeerHistory)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce({
      ...history,
      items: [{ ...history.items[0], comment: "Newest request" }],
    });
  const user = userEvent.setup();
  show();
  await screen.findByLabelText("History order");
  expect(screen.getByText("Loading check-in history…")).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("History order"), "oldest");
  await screen.findByText("Newest request");
  await act(async () => resolveOld(history));
  expect(screen.queryByText("Bottle shop")).toBeInTheDocument();
  expect(screen.getByText("Newest request")).toBeInTheDocument();
  expect(screen.queryByText(/First line/)).not.toBeInTheDocument();
});

test.each([false, true])(
  "catalogue semantic links preserve every parameter, mobile=%s",
  async (mobile) => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: mobile,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const query =
      "?search=stout&sort=rating_desc&brewery_id=2&style_id=3&abv_min=0&abv_max=12&rating_min=0&rating_max=5&first_tried_from=2020-01-01&first_tried_to=2026-01-31&last_tried_from=2020-01-01&last_tried_to=2026-12-31&page=1&page_size=50&future=keep";
    const user = userEvent.setup();
    show(`/explore/beers${query}`);
    await screen.findByRole("region", { name: "Beer catalogue table" });
    const link = mobile
      ? document.querySelector<HTMLAnchorElement>(".explorer-beer-card")!
      : within(
          screen.getByRole("region", { name: "Beer catalogue table" }),
        ).getByRole("link", { name: "Personal stout" });
    const href = link.getAttribute("href")!;
    expect(new URL(href, "http://localhost").searchParams.get("returnTo")).toBe(
      `/explore/beers${query}`,
    );
    await user.click(link);
    await screen.findByRole("heading", { name: "Personal stout" });
    await user.click(
      screen.getByRole("link", { name: /Back to Beer Explorer/ }),
    );
    await screen.findByRole("heading", { name: "Beers" });
    expect(screen.getByLabelText("Current URL").textContent).toBe(
      `/explore/beers${query}`,
    );
  },
);

test("return URLs and image URLs are validated", () => {
  for (const value of [
    "https://evil.test/explore/beers",
    "//evil.test",
    "/explore/beers/1",
    "/explore/beers/../imports",
    "/imports",
    "/explore/beers#unsafe",
  ])
    expect(explorerReturnUrl(value)).toBe("/explore/beers");
  expect(explorerReturnUrl("/explore/beers?future=keep")).toBe(
    "/explore/beers?future=keep",
  );
  for (const value of [
    "javascript:alert(1)",
    "data:image/svg+xml,test",
    "https://user:pass@host.test/x",
  ])
    expect(safeImageUrl(value)).toBeNull();
});
