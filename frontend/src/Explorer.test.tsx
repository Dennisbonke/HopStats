import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ExplorerBeers from "./pages/ExplorerBeers";

const requests: string[] = [];

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
    await screen.findByText("No checked-in beers match your search."),
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
