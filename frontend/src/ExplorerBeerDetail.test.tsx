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
      <button onClick={() => navigate("/explore/beers/1?sort=oldest")}>
        Navigate oldest
      </button>
      <button onClick={() => navigate("/")}>Dashboard</button>
      <button onClick={() => navigate("/explore/beers")}>Fresh Explorer</button>
      <button
        onClick={() =>
          navigate("/explore/beers?search=previous&sort=name_desc&page_size=50")
        }
      >
        Previous filters
      </button>
    </>
  );
}
function show(url = "/explore/beers/1") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <RouterState />
      <Routes>
        <Route path="/" element={<p>Dashboard route</p>} />
        <Route path="/explore/beers" element={<ExplorerBeers />} />
        <Route path="/explore/beers/:beerId" element={<ExplorerBeerDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(
    () => {},
  );
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
  vi.restoreAllMocks();
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
  await user.click(screen.getByText("Navigate oldest"));
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

test("invalid beer IDs avoid requests and provide a safe return link", async () => {
  show("/explore/beers/invalid?returnTo=https%3A%2F%2Fevil.test");
  expect(await screen.findByRole("alert")).toHaveTextContent("Beer not found");
  expect(fetchBeerDetail).not.toHaveBeenCalled();
  expect(fetchBeerHistory).not.toHaveBeenCalled();
  expect(
    screen.getByRole("link", { name: /Back to Beer Explorer/ }),
  ).toHaveAttribute("href", "/explore/beers");
});

test("sparse history omits empty metadata and shows missing ratings explicitly", async () => {
  vi.mocked(fetchBeerHistory).mockResolvedValue({
    ...history,
    items: [
      {
        ...history.items[0],
        rating: null,
        comment: null,
        venue: null,
        serving_type: null,
        purchase_venue: null,
        photo_url: null,
        untappd_url: null,
      },
    ],
  });
  show();
  await screen.findByText("Not rated");
  expect(screen.queryByText("Check-in venue")).not.toBeInTheDocument();
  expect(screen.queryByText("Purchased at")).not.toBeInTheDocument();
  expect(screen.queryByText("Serving")).not.toBeInTheDocument();
  expect(
    screen.queryByAltText("Imported check-in photo"),
  ).not.toBeInTheDocument();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("pending history retains list and controls, hides stale content, and focuses the heading on success", async () => {
  const next = deferred<BeerHistory>();
  vi.mocked(fetchBeerHistory)
    .mockResolvedValueOnce(history)
    .mockReturnValueOnce(next.promise);
  const user = userEvent.setup();
  show();
  await screen.findByText("Bottle shop");
  const list = screen.getByRole("list", { name: "Imported check-ins" });
  const nextButton = screen.getByRole("button", { name: "Next" });
  nextButton.focus();
  await user.click(nextButton);
  expect(screen.getByText("Loading history page 2…")).toBeInTheDocument();
  expect(list).toBeInTheDocument();
  expect(list).not.toBeVisible();
  expect(list).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByRole("button", { name: "Next" })).toBe(nextButton);
  expect(nextButton).toBeDisabled();
  expect(screen.getByLabelText("History order")).toBeDisabled();
  await act(async () =>
    next.resolve({
      ...history,
      page: 2,
      items: [{ ...history.items[0], comment: "Second page" }],
    }),
  );
  expect(await screen.findByText("Second page")).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Check-in history" }),
  ).toHaveFocus();
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
    behavior: "instant",
    block: "start",
  });
  expect(fetchBeerDetail).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Previous" }));
  await screen.findByText(/First line/);
  expect(
    screen.getByRole("heading", { name: "Check-in history" }),
  ).toHaveFocus();
});

test("failed subsequent history requests retain geometry and usable navigation; retry completes focus management", async () => {
  const next = deferred<BeerHistory>();
  vi.mocked(fetchBeerHistory)
    .mockResolvedValueOnce(history)
    .mockReturnValueOnce(next.promise)
    .mockResolvedValueOnce({ ...history, page: 2 });
  const user = userEvent.setup();
  show();
  await screen.findByText("Bottle shop");
  const list = screen.getByRole("list", { name: "Imported check-ins" });
  await user.click(screen.getByRole("button", { name: "Next" }));
  await act(async () => next.reject(new Error("offline")));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "temporarily unavailable",
  );
  expect(list).toBeInTheDocument();
  expect(list).not.toBeVisible();
  expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(list).toBeVisible());
  expect(
    screen.getByRole("heading", { name: "Check-in history" }),
  ).toHaveFocus();
  expect(fetchBeerDetail).toHaveBeenCalledTimes(1);
});

test("catalogue scroll belongs to the detail flow, including Back/Forward and delayed restoration", async () => {
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal("scrollY", 420);
  const user = userEvent.setup();
  show("/explore/beers?search=previous&sort=name_desc&page_size=50");
  await screen.findByRole("region", { name: "Beer catalogue table" });
  await user.click(
    within(
      screen.getByRole("region", { name: "Beer catalogue table" }),
    ).getByRole("link", { name: "Personal stout" }),
  );
  await screen.findByRole("heading", { name: "Personal stout" });
  const delayed = deferred<Awaited<ReturnType<typeof fetchExploreBeers>>>();
  vi.mocked(fetchExploreBeers).mockReturnValueOnce(delayed.promise);
  scroll.mockClear();
  await user.click(screen.getByRole("link", { name: /Back to Beer Explorer/ }));
  expect(screen.getByText("Loading beers…")).toBeInTheDocument();
  expect(scroll).not.toHaveBeenCalled();
  await act(async () =>
    delayed.resolve({
      items: [detail],
      page: 1,
      page_size: 50,
      total: 1,
      total_pages: 1,
    }),
  );
  await waitFor(() => expect(scroll).toHaveBeenLastCalledWith(0, 420));
  await user.click(screen.getByText("Dashboard"));
  scroll.mockClear();
  await user.click(screen.getByText("Fresh Explorer"));
  await waitFor(() => expect(scroll).toHaveBeenLastCalledWith(0, 0));
  await user.click(screen.getByText("Previous filters"));
  await waitFor(() =>
    expect(screen.getByLabelText("Current URL")).toHaveTextContent(
      "search=previous",
    ),
  );
  await waitFor(() => expect(scroll).toHaveBeenLastCalledWith(0, 0));
  // Return through the actual history entries rather than reusing the query.
  await user.click(screen.getByText("Browser back"));
  await user.click(screen.getByText("Browser back"));
  await user.click(screen.getByText("Browser back"));
  await waitFor(() => expect(scroll).toHaveBeenLastCalledWith(0, 420));
  await user.click(screen.getByText("Browser back"));
  await screen.findByRole("heading", { name: "Personal stout" });
  await user.click(screen.getByText("Browser forward"));
  await waitFor(() => expect(scroll).toHaveBeenLastCalledWith(0, 420));
});

test("unavailable session storage does not break detail navigation", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("unavailable");
  });
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("unavailable");
  });
  const user = userEvent.setup();
  show("/explore/beers");
  await screen.findByRole("region", { name: "Beer catalogue table" });
  await user.click(
    within(
      screen.getByRole("region", { name: "Beer catalogue table" }),
    ).getByRole("link", { name: "Personal stout" }),
  );
  await screen.findByRole("heading", { name: "Personal stout" });
  await user.click(screen.getByRole("link", { name: /Back to Beer Explorer/ }));
  await screen.findByRole("heading", { name: "Beers" });
});
