import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, vi, test, expect } from "vitest";
import App from "./App";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url === "/api/v1/auth/me")
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: 1,
            username: "local",
            created_at: "2026-10-14T00:00:00Z",
          }),
        });
      if (url === "/api/v1/health") return Promise.resolve({ ok: true });
      if (url === "/api/v1/dashboard") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            total_checkins: 0,
            unique_beers: 0,
            unique_breweries: 0,
            unique_styles: 0,
            average_personal_rating: null,
            rated_checkins: 0,
            inventory_units: 0,
            unique_inventory_beers: 0,
            not_confirmed_checked_in: 0,
            match_coverage: {
              external_id: 0,
              exact: 0,
              ambiguous: 0,
              unmatched: 0,
            },
            freshness: {
              checkins_last_imported_at: null,
              inventory_last_imported_at: null,
              checkins_source_exported_at: null,
              inventory_source_exported_at: null,
            },
          }),
        });
      }
      if (String(url).startsWith("/api/v1/milestones"))
        return Promise.resolve({
          ok: true,
          json: async () => ({ milestones: [] }),
        });
      if (url === "/api/v1/insights")
        return Promise.resolve({
          ok: true,
          json: async () => ({ insights: [] }),
        });
      if (String(url).startsWith("/api/v1/explore/beers"))
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
        json: async () => ({ buckets: [] }),
      });
    }),
  );
});
afterEach(() => cleanup());
test("renders shell and navigation", async () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText("🍺 HopStats")).toBeInTheDocument();
  expect(screen.getByText("Inventory")).toBeInTheDocument();
  expect(screen.getByText("Explorer")).toBeInTheDocument();
  expect(await screen.findByText("Backend: connected")).toBeInTheDocument();
});
test("shows connection failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) =>
      url === "/api/v1/auth/me"
        ? Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              id: 1,
              username: "local",
              created_at: "2026-10-14T00:00:00Z",
            }),
          })
        : Promise.reject(new Error("offline")),
    ),
  );
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Backend: unavailable")).toBeInTheDocument();
});

test("mobile menu opens, closes on Escape and navigation, and marks the active route", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
  const toggle = await screen.findByRole("button", { name: "Main menu" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass("active");
  await user.keyboard("{Escape}");
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  await user.click(toggle);
  await user.click(screen.getByRole("link", { name: "Explorer" }));
  await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
  expect(
    await screen.findByRole("heading", { name: "Explorer" }),
  ).toBeInTheDocument();
});

test("opens Explorer beers and marks the other catalogues as upcoming", async () => {
  render(
    <MemoryRouter initialEntries={["/explore"]}>
      <App />
    </MemoryRouter>,
  );
  expect(
    await screen.findByRole("heading", { name: "Beers" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("navigation", { name: "Explorer sections" }),
  ).toHaveTextContent("Breweries Upcoming");
  expect(
    screen.getByRole("navigation", { name: "Explorer sections" }),
  ).toHaveTextContent("Styles Upcoming");
  expect(screen.getByRole("link", { name: "Beers" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(
    screen.getByText("Breweries", { selector: ".explorer-tab-unavailable" }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(
    screen.queryByRole("link", { name: /Breweries/ }),
  ).not.toBeInTheDocument();
  expect(
    await screen.findByText("No checked-in beers match your search."),
  ).toBeInTheDocument();
});

test("unfinished Explorer routes still render their explanatory placeholder", async () => {
  render(
    <MemoryRouter initialEntries={["/explore/breweries"]}>
      <App />
    </MemoryRouter>,
  );
  expect(
    await screen.findByRole("heading", {
      name: "Breweries catalogue coming later",
    }),
  ).toBeInTheDocument();
});
