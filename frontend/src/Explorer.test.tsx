import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ExplorerBeers from "./pages/ExplorerBeers";

const requests: string[] = [];
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
