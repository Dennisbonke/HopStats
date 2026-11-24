import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { within } from "@testing-library/react";
import ExplorerBeers from "./pages/ExplorerBeers";
import { readFilters } from "./pages/explorerState";

vi.mock("./api/explore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api/explore")>()),
  fetchExploreBounds: async () => ({ abv_max: 67.5 }),
  fetchExploreOptions: async (category: string, params: URLSearchParams) => {
    const items =
      category === "breweries"
        ? [
            { id: 1, name: "Cloudwater" },
            { id: 2, name: "Moersleutel" },
          ]
        : [
            { id: 3, name: "Imperial IPA" },
            { id: 4, name: "Stout" },
          ];
    const selected = params.getAll("selected_id");
    return {
      items: items.filter(
        (i) =>
          (!selected.length || selected.includes(String(i.id))) &&
          i.name
            .toLowerCase()
            .includes((params.get("search") ?? "").toLowerCase()),
      ),
      has_more: false,
    };
  },
}));

const requests: string[] = [];
let mobile = false;
const mediaListeners = new Set<() => void>();
function viewport(isMobile: boolean) {
  mobile = isMobile;
  act(() => mediaListeners.forEach((listener) => listener()));
}

function RouterState() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Current URL">
        {location.pathname + location.search}
      </output>
      <button
        type="button"
        onClick={() =>
          navigate("?search=stout&sort=name_asc&page=2&future=preserved")
        }
      >
        Navigate to page 2
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        Browser back
      </button>
    </>
  );
}

function beer(id: number, name: string) {
  return {
    id,
    name,
    brewery: { id: 1, name: "Brewery" },
    style: null,
    abv: null,
    ibu: null,
    photo_url: null,
    checkin_count: 2,
    rated_checkin_count: 0,
    personal_average_rating: null,
    first_checked_in_at: "2026-01-01T00:00:00+00:00",
    last_checked_in_at: "2026-01-02T00:00:00+00:00",
  };
}

beforeEach(() => {
  mobile = false;
  mediaListeners.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return mobile;
      },
      addEventListener: (_: string, listener: () => void) =>
        mediaListeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        mediaListeners.delete(listener),
    })),
  );
  requests.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      requests.push(url);
      const params = new URL(url, "http://localhost").searchParams;
      const page = Number(params.get("page"));
      return Promise.resolve({
        ok: true,
        json: async () => ({
          items:
            page === 2
              ? [beer(2, "Second Page Pilsner")]
              : [beer(1, "First Page Stout")],
          page,
          page_size: 25,
          total: 2,
          total_pages: 2,
        }),
      });
    }),
  );
});
afterEach(() => cleanup());

test("restores URL state, searches, sorts, and paginates without dropping parameters", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter
      initialEntries={["/explore/beers?search=stout&sort=name_asc&page=2"]}
    >
      <ExplorerBeers />
    </MemoryRouter>,
  );
  expect(
    (await screen.findAllByText("Second Page Pilsner")).length,
  ).toBeGreaterThan(0);
  expect(
    screen.getByRole("searchbox", { name: "Search beers or breweries" }),
  ).toHaveValue("stout");
  expect(requests.at(-1)).toContain("search=stout");
  expect(requests.at(-1)).toContain("sort=name_asc");
  expect(requests.at(-1)).toContain("page=2");
  expect(requests).toHaveLength(1);

  await user.selectOptions(
    screen.getByRole("combobox", { name: "Sort beers" }),
    "checkins_asc",
  );
  expect(
    (await screen.findAllByText("First Page Stout")).length,
  ).toBeGreaterThan(0);
  expect(requests.at(-1)).toContain("sort=checkins_asc");
  expect(requests.at(-1)).toContain("page=1");

  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    (await screen.findAllByText("Second Page Pilsner")).length,
  ).toBeGreaterThan(0);
  expect(requests.at(-1)).toContain("page=2");

  await user.clear(
    screen.getByRole("searchbox", { name: "Search beers or breweries" }),
  );
  await user.type(
    screen.getByRole("searchbox", { name: "Search beers or breweries" }),
    "lager",
  );
  await user.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() => expect(requests.at(-1)).toContain("search=lager"));
  expect(requests.at(-1)).toContain("sort=checkins_asc");
  expect(requests.at(-1)).toContain("page=1");
});

test("replaces an out-of-range page while preserving search, sort, and other URL state", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      requests.push(url);
      const params = new URL(url, "http://localhost").searchParams;
      const page = Number(params.get("page"));
      const response =
        page === 99
          ? { items: [], page, page_size: 25, total: 4, total_pages: 1 }
          : {
              items: [beer(10, "Corrected Stout")],
              page,
              page_size: 25,
              total: 4,
              total_pages: 1,
            };
      return Promise.resolve({ ok: true, json: async () => response });
    }),
  );
  render(
    <MemoryRouter
      initialEntries={[
        "/explore/beers?search=previous&page=1",
        "/explore/beers?search=stout&sort=name_asc&page=99&future=preserved",
      ]}
      initialIndex={1}
    >
      <RouterState />
      <ExplorerBeers />
    </MemoryRouter>,
  );

  expect(
    (await screen.findAllByText("Corrected Stout")).length,
  ).toBeGreaterThan(0);
  expect(screen.getByLabelText("Current URL")).toHaveTextContent(
    "/explore/beers?search=stout&sort=name_asc&page=1&future=preserved",
  );
  expect(requests).toHaveLength(2);
  expect(
    new URL(requests[0], "http://localhost").searchParams.get("page"),
  ).toBe("99");
  expect(
    new URL(requests[1], "http://localhost").searchParams.get("page"),
  ).toBe("1");

  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Browser back" }));
  expect(screen.getByLabelText("Current URL")).toHaveTextContent(
    "/explore/beers?search=previous&page=1",
  );
});

test("normalizes an empty result page to page one and keeps the empty state", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      requests.push(url);
      const page = Number(
        new URL(url, "http://localhost").searchParams.get("page"),
      );
      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [],
          page,
          page_size: 25,
          total: 0,
          total_pages: 0,
        }),
      });
    }),
  );
  render(
    <MemoryRouter initialEntries={["/explore/beers?search=stout&page=5"]}>
      <RouterState />
      <ExplorerBeers />
    </MemoryRouter>,
  );

  expect(
    await screen.findByText("No beers match your search."),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Current URL")).toHaveTextContent(
    "/explore/beers?search=stout&page=1",
  );
  expect(
    requests.map((request) =>
      new URL(request, "http://localhost").searchParams.get("page"),
    ),
  ).toEqual(["5", "1"]);
});

test("ignores an out-of-range response after navigating to another page", async () => {
  let resolveStale!: (response: {
    ok: boolean;
    json: () => Promise<unknown>;
  }) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      requests.push(url);
      const page = Number(
        new URL(url, "http://localhost").searchParams.get("page"),
      );
      if (page === 99) {
        return new Promise((resolve) => {
          resolveStale = resolve;
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [beer(2, "Second Page Pilsner")],
          page: 2,
          page_size: 25,
          total: 30,
          total_pages: 2,
        }),
      });
    }),
  );
  const user = userEvent.setup();
  render(
    <MemoryRouter
      initialEntries={["/explore/beers?search=stout&sort=name_asc&page=99"]}
    >
      <RouterState />
      <ExplorerBeers />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("button", { name: "Navigate to page 2" }));
  expect(
    (await screen.findAllByText("Second Page Pilsner")).length,
  ).toBeGreaterThan(0);

  await act(async () => {
    resolveStale({
      ok: true,
      json: async () => ({
        items: [],
        page: 99,
        page_size: 25,
        total: 4,
        total_pages: 1,
      }),
    });
  });
  expect(screen.getByLabelText("Current URL")).toHaveTextContent("page=2");
  expect(requests).toHaveLength(2);
});

test("uses an accessible artwork fallback for missing beer images", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [beer(3, "No Photo Ale")],
          page: 1,
          page_size: 25,
          total: 1,
          total_pages: 1,
        }),
      });
    }),
  );
  render(
    <MemoryRouter>
      <ExplorerBeers />
    </MemoryRouter>,
  );
  expect((await screen.findAllByText("No Photo Ale")).length).toBeGreaterThan(
    0,
  );
  expect(
    screen.getAllByRole("img", { name: "No Photo Ale artwork unavailable" })
      .length,
  ).toBeGreaterThan(0);
});

test("restores filters, removes chips, preserves unrelated parameters and browser history", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter
      initialEntries={[
        "/explore/beers?search=ipa&brewery_id=1&brewery_id=2&style_id=3&rating_min=3.70&abv_max=8.5&first_tried_from=2026-01-01&page=2&future=preserved",
      ]}
    >
      <RouterState />
      <ExplorerBeers />
    </MemoryRouter>,
  );
  await screen.findAllByText("Second Page Pilsner");
  expect(requests.at(-1)).toContain("rating_min=3.70");
  expect(
    new URL(requests.at(-1)!, "http://localhost").searchParams.getAll(
      "brewery_id",
    ),
  ).toEqual(["1", "2"]);
  const chips = screen.getByLabelText("Active filters");
  await user.click(
    await within(chips).findByRole("button", { name: "Remove Cloudwater" }),
  );
  await waitFor(() => expect(requests.at(-1)).not.toContain("brewery_id=1"));
  expect(requests.at(-1)).toContain("brewery_id=2");
  expect(screen.getByLabelText("Current URL")).toHaveTextContent(
    "future=preserved",
  );
  expect(requests.at(-1)).toContain("page=1");
  await user.click(screen.getByRole("button", { name: "Browser back" }));
  await waitFor(() => expect(requests.at(-1)).toContain("brewery_id=1"));
  await user.click(screen.getByRole("button", { name: "Clear all filters" }));
  await waitFor(() => expect(requests.at(-1)).not.toContain("rating_min"));
  expect(requests.at(-1)).toContain("search=ipa");
  expect(screen.getByLabelText("Current URL")).toHaveTextContent(
    "future=preserved",
  );
});

test("multi-select retains selections during option search and uses OR IDs", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <ExplorerBeers />
    </MemoryRouter>,
  );
  await user.click(await screen.findByRole("checkbox", { name: "Cloudwater" }));
  await user.type(
    screen.getByRole("searchbox", { name: "Search breweries" }),
    "moers",
  );
  await user.click(
    await screen.findByRole("checkbox", { name: "Moersleutel" }),
  );
  await waitFor(() =>
    expect(
      new URL(requests.at(-1)!, "http://localhost").searchParams.getAll(
        "brewery_id",
      ),
    ).toEqual(["1", "2"]),
  );
  expect(screen.getByLabelText("Active filters")).toHaveTextContent(
    "Active filters (1)",
  );
});

test("exact numeric thresholds synchronize sliders and sortable headers", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/explore/beers?sort=rating_desc"]}>
      <ExplorerBeers />
    </MemoryRouter>,
  );
  const minimum = screen.getByRole("spinbutton", { name: "My rating minimum" });
  await user.type(minimum, "3.70");
  await user.tab();
  await waitFor(() => expect(requests.at(-1)).toContain("rating_min=3.70"));
  expect(
    screen.getByRole("slider", { name: "My rating minimum slider" }),
  ).toHaveValue("3.7");
  await user.click(screen.getByRole("button", { name: /^My rating/ }));
  expect(screen.getByRole("combobox", { name: "Sort beers" })).toHaveValue(
    "rating_asc",
  );
  expect(
    screen.getByRole("columnheader", { name: /^My rating/ }),
  ).toHaveAttribute("aria-sort", "ascending");
  await user.clear(minimum);
  await user.type(minimum, "5.01");
  await user.tab();
  expect(screen.getByRole("alert")).toHaveTextContent("ordered 0–5 range");
  expect(requests.at(-1)).toContain("rating_min=3.70");
});

test("mobile sheet cancels, applies atomically, clears only drafts and restores focus", async () => {
  viewport(true);
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/explore/beers?rating_min=3.7"]}>
      <ExplorerBeers />
    </MemoryRouter>,
  );
  await screen.findAllByText("First Page Stout");
  const open = screen.getByRole("button", { name: "Filters (1)" });
  await user.click(open);
  let dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Clear all" }));
  expect(requests.at(-1)).toContain("rating_min=3.7");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(open).toHaveFocus();
  await user.click(open);
  dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByRole("spinbutton", { name: "My rating minimum" }),
  ).toHaveValue(3.7);
  await user.click(within(dialog).getByRole("button", { name: "Clear all" }));
  // Happy DOM incorrectly flags fractional range steps as stepMismatch.
  // Disable only its range constraint checks; CI tests the native form unchanged.
  dialog
    .querySelectorAll<HTMLInputElement>('input[type="range"]')
    .forEach((input) => {
      input.disabled = true;
    });
  await user.click(
    within(dialog).getByRole("button", { name: "Apply filters" }),
  );
  await waitFor(() => expect(requests.at(-1)).not.toContain("rating_min"));
  expect(document.body.style.overflow).toBe("");
});

test("formats precise averages, zero and missing values", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        items: [
          { ...beer(1, "Precise"), personal_average_rating: 4.2333333333 },
          { ...beer(2, "Zero"), personal_average_rating: 0 },
          beer(3, "Unrated"),
        ],
        total: 3,
        total_pages: 1,
        page: 1,
        page_size: 25,
      }),
    })),
  );
  render(
    <MemoryRouter>
      <ExplorerBeers />
    </MemoryRouter>,
  );
  expect((await screen.findAllByText("4.23")).length).toBe(2);
  expect(screen.getAllByText("0.00").length).toBe(2);
  expect(screen.getAllByText("Not rated").length).toBe(2);
});

test("invalid URL filters are ignored and errors have an accessible state", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requests.push(url);
      return { ok: false, status: 503 };
    }),
  );
  render(
    <MemoryRouter
      initialEntries={[
        "/explore/beers?rating_min=6&abv_min=10&abv_max=5&style_id=-1&last_tried_from=bogus",
      ]}
    >
      <ExplorerBeers />
    </MemoryRouter>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "temporarily unavailable",
  );
  expect(requests[0]).not.toContain("rating_min");
  expect(requests[0]).not.toContain("abv_min");
});

test("range chips remove only their category and malformed calendar dates are safe", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter
      initialEntries={[
        "/explore/beers?abv_min=5&abv_max=10&rating_min=3.70&last_tried_from=2026-99-99&future=preserved",
      ]}
    >
      <RouterState />
      <ExplorerBeers />
    </MemoryRouter>,
  );
  await screen.findAllByText("First Page Stout");
  await user.click(screen.getByRole("button", { name: "Remove ABV: 5–10%" }));
  await waitFor(() => expect(requests.at(-1)).not.toContain("abv_"));
  expect(requests.at(-1)).toContain("rating_min=3.70");
  expect(requests.at(-1)).not.toContain("last_tried_from");
  expect(screen.getByLabelText("Current URL")).toHaveTextContent(
    "future=preserved",
  );
});

test("Enter in sheet search or numeric editing does not implicitly apply drafts", async () => {
  viewport(true);
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <ExplorerBeers />
    </MemoryRouter>,
  );
  await screen.findAllByText("First Page Stout");
  await user.click(screen.getByRole("button", { name: "Filters (0)" }));
  const dialog = screen.getByRole("dialog");
  await user.type(
    within(dialog).getByRole("searchbox", { name: "Search breweries" }),
    "Cloudwater{Enter}",
  );
  expect(dialog).toBeInTheDocument();
  await user.click(
    within(dialog).getByText("My rating", { selector: "summary" }),
  );
  await user.type(
    within(dialog).getByRole("spinbutton", {
      name: "My rating minimum",
    }),
    "3.70{Enter}",
  );
  expect(dialog).toBeInTheDocument();
  fireEvent.submit(dialog.querySelector("form")!);
  expect(dialog).toBeInTheDocument();
  expect(requests).toHaveLength(1);
  expect(
    within(dialog).getByRole("slider", { name: "My rating minimum slider" }),
  ).toHaveValue("3.7");
  expect(
    within(dialog).getByRole("heading", { name: "Filters 1 active" }),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
});

test.each([
  ["", "No beers in your catalogue yet."],
  ["search=ipa", "No beers match your search."],
  ["rating_min=3.70", "No beers match your filters."],
  ["search=ipa&rating_min=3.70", "No beers match your search and filters."],
])("empty catalogue messaging for %s and recovery", async (query, message) => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requests.push(url);
      return {
        ok: true,
        json: async () => ({
          items: [],
          total: 0,
          total_pages: 0,
          page: 1,
          page_size: 25,
        }),
      };
    }),
  );
  render(
    <MemoryRouter
      initialEntries={[`/explore/beers?${query}&sort=rating_desc&future=kept`]}
    >
      <RouterState />
      <ExplorerBeers />
    </MemoryRouter>,
  );
  await screen.findByText(message);
  if (query.includes("search")) {
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(requests.at(-1)).not.toContain("search="));
    if (query.includes("rating"))
      expect(requests.at(-1)).toContain("rating_min=3.70");
    expect(screen.getByLabelText("Current URL")).toHaveTextContent(
      "future=kept",
    );
    expect(requests.at(-1)).toContain("sort=rating_desc");
  } else if (query) {
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(requests.at(-1)).not.toContain("rating_min="));
  }
});

test("unsupported URL precision is ignored and corrected numeric errors clear", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter
      initialEntries={["/explore/beers?rating_min=3.755&abv_max=100.01"]}
    >
      <RouterState />
      <ExplorerBeers />
    </MemoryRouter>,
  );
  await screen.findAllByText("First Page Stout");
  expect(requests.at(-1)).not.toContain("rating_min");
  const input = screen.getByRole("spinbutton", { name: "My rating minimum" });
  await user.type(input, "3.755");
  await user.tab();
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(requests.at(-1)).not.toContain("rating_min");
  await user.clear(input);
  await user.type(input, "3.75");
  expect(input).toHaveAttribute("aria-invalid", "false");
  await user.tab();
  await waitFor(() => expect(requests.at(-1)).toContain("rating_min=3.75"));
  await user.clear(input);
  await user.type(input, "3.755");
  await user.click(screen.getByRole("button", { name: "Clear all" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(
    screen.getByRole("spinbutton", { name: "My rating minimum" }),
  ).toHaveValue(null);
});

test("mobile panels unmount on close and viewport changes discard drafts", async () => {
  viewport(true);
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/explore/beers?brewery_id=1&future=kept"]}>
      <RouterState />
      <ExplorerBeers />
    </MemoryRouter>,
  );
  await screen.findAllByText("First Page Stout");
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("searchbox", { name: "Search breweries" }),
  ).not.toBeInTheDocument();
  expect(
    await within(screen.getByLabelText("Active filters")).findByText(
      /Cloudwater/,
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Filters (1)" }));
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).queryByRole("searchbox", { name: "Search styles" }),
  ).not.toBeInTheDocument();
  await user.click(
    await within(dialog).findByRole("checkbox", { name: "Moersleutel" }),
  );
  viewport(false);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(document.body.style.overflow).toBe("");
  expect(screen.getByRole("complementary")).toBeInTheDocument();
  expect(screen.getByLabelText("Current URL")).not.toHaveTextContent(
    "brewery_id=2",
  );
  expect(screen.getByLabelText("Current URL")).toHaveTextContent("future=kept");
  viewport(true);
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("searchbox", { name: "Search breweries" }),
  ).not.toBeInTheDocument();
});

test.each(["3.70", "3.75", "4.10", "0", "5", "3.700", "37e-1"])(
  "valid threshold %s restores without rounding",
  async (value) => {
    render(
      <MemoryRouter initialEntries={[`/explore/beers?rating_min=${value}`]}>
        <ExplorerBeers />
      </MemoryRouter>,
    );
    await screen.findAllByText("First Page Stout");
    expect(
      new URL(requests[0], "http://localhost").searchParams.get("rating_min"),
    ).toBe(value);
  },
);

test.each(["3.755", "-0.01", "Infinity", "NaN", "5.01", "1e-3"])(
  "invalid URL rating threshold %s is safely omitted",
  (value) => {
    expect(
      readFilters(new URLSearchParams({ rating_min: value })).rating_min,
    ).toBe("");
  },
);

test("one-sided slider bounds reset fully while explicit zero survives focus traversal", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/explore/beers?rating_max=4&future=kept"]}>
      <RouterState />
      <ExplorerBeers />
    </MemoryRouter>,
  );
  await screen.findAllByText("First Page Stout");
  const upper = screen.getByRole("slider", {
    name: "My rating maximum slider",
  });
  fireEvent.change(upper, { target: { value: "5" } });
  fireEvent.keyUp(upper, { key: "End" });
  await waitFor(() => expect(requests.at(-1)).not.toContain("rating_max"));
  const minimum = screen.getByRole("spinbutton", { name: "My rating minimum" });
  await user.type(minimum, "0");
  await user.tab();
  await waitFor(() => expect(requests.at(-1)).toContain("rating_min=0"));
  const lower = screen.getByRole("slider", {
    name: "My rating minimum slider",
  });
  lower.focus();
  await user.tab();
  expect(screen.getByLabelText("Current URL")).toHaveTextContent(
    "rating_min=0",
  );
  expect(screen.getByLabelText("Current URL")).toHaveTextContent("future=kept");
});

test.each([
  "",
  "&abv_min=0&abv_max=100.01&rating_min=0&rating_max=5",
  "&abv_min=3.70&rating_min=3.70",
  "&abv_max=100.01&rating_max=5",
])(
  "unchanged range commits preserve page, URL and requests (%s)",
  async (bounds) => {
    const user = userEvent.setup();
    const url = `/explore/beers?page=2&page_size=25&search=stout&sort=name_asc&future=kept${bounds}`;
    render(
      <MemoryRouter initialEntries={[url]}>
        <RouterState />
        <ExplorerBeers />
      </MemoryRouter>,
    );
    await screen.findAllByText("Second Page Pilsner");
    const count = requests.length;
    for (const label of ["ABV", "My rating"]) {
      for (const side of ["minimum", "maximum"]) {
        const numeric = screen.getByRole("spinbutton", {
          name: `${label} ${side}`,
        });
        await user.click(numeric);
        await user.keyboard("{Enter}");
        await user.tab();
        const slider = screen.getByRole("slider", {
          name: `${label} ${side} slider`,
        });
        act(() => slider.focus());
        await user.tab();
      }
    }
    if (bounds.includes("3.70")) {
      for (const label of ["ABV", "My rating"]) {
        const numeric = screen.getByRole("spinbutton", {
          name: `${label} minimum`,
        });
        await user.clear(numeric);
        await user.type(numeric, "3.7");
        await user.keyboard("{Enter}");
        await user.tab();
      }
    }
    expect(screen.getByLabelText("Current URL")).toHaveTextContent(url);
    expect(requests).toHaveLength(count);
    if (!bounds) {
      await user.click(screen.getByRole("button", { name: "Clear all" }));
      expect(screen.getByLabelText("Current URL")).toHaveTextContent(url);
      expect(requests).toHaveLength(count);
    }
    const minimum = screen.getByRole("spinbutton", {
      name: "My rating minimum",
    });
    await user.clear(minimum);
    await user.type(minimum, "4.1");
    await user.tab();
    await waitFor(() => expect(requests).toHaveLength(count + 1));
    const changed = new URL(
      screen.getByLabelText("Current URL").textContent!,
      "http://localhost",
    );
    expect(changed.searchParams.has("page")).toBe(false);
    expect(changed.searchParams.get("rating_min")).toBe("4.1");
    for (const key of ["page_size", "search", "sort", "future"]) {
      expect(changed.searchParams.get(key)).toBe(
        new URL(url, "http://localhost").searchParams.get(key),
      );
    }
  },
);

test.each([false, true])(
  "explicit numeric boundary ranges remain active (mobile=%s)",
  async (isMobile) => {
    viewport(isMobile);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/explore/beers?page=2&future=kept"]}>
        <RouterState />
        <ExplorerBeers />
      </MemoryRouter>,
    );
    await screen.findAllByText("Second Page Pilsner");
    if (isMobile)
      await user.click(screen.getByRole("button", { name: "Filters (0)" }));
    const panel = isMobile
      ? screen.getByRole("dialog")
      : screen.getByRole("complementary");
    for (const [label, maximum] of [
      ["ABV", "100.01"],
      ["My rating", "5"],
    ]) {
      if (isMobile && label === "My rating")
        await user.click(within(panel).getByText("My rating", { exact: true }));
      for (const [side, value] of [
        ["minimum", "0"],
        ["maximum", maximum],
      ]) {
        const input = within(panel).getByRole("spinbutton", {
          name: `${label} ${side}`,
        });
        await user.type(input, value);
        await user.tab();
        expect(input).toHaveValue(Number(value));
        if (!isMobile)
          expect(screen.getByLabelText("Current URL")).toHaveTextContent(
            `${label === "ABV" ? "abv" : "rating"}_${side === "minimum" ? "min" : "max"}=${value}`,
          );
      }
    }
    if (isMobile) {
      expect(screen.getByLabelText("Current URL")).toHaveTextContent("page=2");
      // Happy DOM flags valid hundredths (even 5) as stepMismatch.
      // Browser regressions exercise the unchanged native form validation.
      panel.querySelector("form")!.noValidate = true;
      await user.click(
        within(panel).getByRole("button", { name: "Apply filters" }),
      );
    }
    await waitFor(() =>
      expect(screen.getByLabelText("Current URL")).toHaveTextContent(
        "rating_max=5",
      ),
    );
    expect(screen.getByLabelText("Current URL")).toHaveTextContent(
      "abv_min=0&abv_max=100.01&rating_min=0&rating_max=5",
    );
    expect(screen.getByLabelText("Current URL")).not.toHaveTextContent(
      "page=2",
    );
    expect(
      within(screen.getByLabelText("Active filters")).getByRole("button", {
        name: "Remove My rating: 0–5",
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Remove ABV: 0–100.01%" }),
    );
    expect(screen.getByLabelText("Current URL")).not.toHaveTextContent(
      "abv_min",
    );
    expect(screen.getByLabelText("Current URL")).toHaveTextContent(
      "rating_min=0",
    );
    await user.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(screen.getByLabelText("Current URL")).toHaveTextContent(
      "/explore/beers?future=kept",
    );
  },
);

test("unchanged mobile Apply preserves full bounds and reordered selections on page two", async () => {
  viewport(true);
  const user = userEvent.setup();
  const url =
    "/explore/beers?page=2&brewery_id=1&brewery_id=2&style_id=3&style_id=4&abv_min=0&abv_max=67.5&rating_min=0&rating_max=5&future=kept";
  render(
    <MemoryRouter initialEntries={[url]}>
      <RouterState />
      <ExplorerBeers />
    </MemoryRouter>,
  );
  await screen.findAllByText("Second Page Pilsner");
  await user.click(screen.getByRole("button", { name: "Filters (4)" }));
  const dialog = screen.getByRole("dialog");
  for (const name of ["Cloudwater", "Imperial IPA"]) {
    const checkbox = await within(dialog).findByRole("checkbox", { name });
    await user.click(checkbox);
    await user.click(checkbox);
  }
  // Happy DOM miscalculates hundredths steps; CI exercises native validation.
  dialog.querySelector("form")!.noValidate = true;
  await user.click(
    within(dialog).getByRole("button", { name: "Apply filters" }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Current URL")).toHaveTextContent(url);
  expect(requests).toHaveLength(1);
});
