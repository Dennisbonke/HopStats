import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";

const item = {
  id: 1,
  source_item_id: "stash-1",
  source_system: "untappd_stash",
  source_name: "Untappd stash",
  beer_id: 2,
  beer_name: "Example IPA",
  brewery_name: "Example Brewery",
  style_id: 3,
  style_name: "IPA",
  abv: 6.5,
  ibu: 40,
  photo_url: null,
  quantity: 2,
  container: "Bottle",
  notes: "Shelf A",
  purchase_date: "2026-09-01",
  bottled_date: null,
  best_before: "2100-01-01",
  raw_best_before: "2100-01-01",
  best_before_suspicious: true,
  purchase_location: "Shop",
  purchase_price: 4.5,
  created_at_source: null,
  imported_at: "2026-10-01T00:00:00+00:00",
  location: { id: 4, name: "Shelf A", path: "Storage → Shelf A" },
  location_resolution_status: "resolved",
  location_resolution_source: "alias",
  location_resolution_detail: "Exact normalized location name or alias.",
  match_status: "unmatched",
  matched_checkin_beer_id: null,
  source_metadata: null,
};

const locations = {
  locations: [
    {
      id: 1,
      name: "Storage",
      parent_id: null,
      description: null,
      path: "Storage",
      aliases: [],
      record_count: 1,
      total_units: 2,
      children: [],
    },
  ],
  unresolved: { record_count: 0, total_units: 0 },
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url === "/api/v1/health") return Promise.resolve({ ok: true });
      if (url.startsWith("/api/v1/inventory/1"))
        return Promise.resolve({ ok: true, json: async () => item });
      if (url.startsWith("/api/v1/inventory/styles"))
        return Promise.resolve({
          ok: true,
          json: async () => [{ id: 3, name: "IPA" }],
        });
      if (url.startsWith("/api/v1/inventory"))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [item],
            page: 1,
            page_size: 25,
            total: 1,
            total_pages: 1,
          }),
        });
      return Promise.resolve({ ok: true, json: async () => locations });
    }),
  );
});
afterEach(() => cleanup());

test("loads inventory, applies search, and opens record details", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/inventory"]}>
      <App />
    </MemoryRouter>,
  );

  expect((await screen.findAllByText("Example IPA")).length).toBeGreaterThan(0);
  expect(
    screen.getByText("Suspicious best-before date; review manually."),
  ).toBeInTheDocument();
  await user.type(screen.getByPlaceholderText("Search inventory…"), "Example");
  await user.click(screen.getByRole("button", { name: "Search" }));
  expect(
    (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url]) =>
      String(url).includes("search=Example"),
    ),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Details" }));
  expect(await screen.findByText("Original notes")).toBeInTheDocument();
  expect(
    screen.getByText("This does not prove the beer was never checked in."),
  ).toBeInTheDocument();
});

test("shows a useful empty inventory state", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url === "/api/v1/health") return Promise.resolve({ ok: true });
      if (url.startsWith("/api/v1/inventory/styles"))
        return Promise.resolve({ ok: true, json: async () => [] });
      if (url.startsWith("/api/v1/inventory"))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [],
            page: 1,
            page_size: 25,
            total: 0,
            total_pages: 0,
          }),
        });
      return Promise.resolve({
        ok: true,
        json: async () => ({
          locations: [],
          unresolved: { record_count: 0, total_units: 0 },
        }),
      });
    }),
  );
  render(
    <MemoryRouter initialEntries={["/inventory"]}>
      <App />
    </MemoryRouter>,
  );
  expect(
    await screen.findByText("No inventory records match these filters."),
  ).toBeInTheDocument();
});
