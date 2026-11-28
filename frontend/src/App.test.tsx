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
      if (String(url).startsWith("/api/v1/explore/filter-options/"))
        return Promise.resolve({
          ok: true,
          json: async () => ({ items: [], has_more: false }),
        });
      if (
        url === "/api/v1/explore/filter-bounds" ||
        url === "/api/v1/explore/style-bounds"
      )
        return Promise.resolve({
          ok: true,
          json: async () => ({ abv_max: 20 }),
        });
      if (
        String(url).startsWith("/api/v1/explore/beers") ||
        String(url).startsWith("/api/v1/explore/breweries") ||
        String(url).startsWith("/api/v1/explore/styles")
      )
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
      if (String(url).startsWith("/api/v1/analytics/checkins"))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            start: "2026-01-01",
            end: "2026-12-31",
            timezone: "Europe/Amsterdam",
            granularity: "month",
            summary: {
              total_checkins: 0,
              new_discoveries: 0,
              repeat_checkins: 0,
              distinct_beers: 0,
            },
            cumulative_baseline_checkins: 0,
            cumulative_baseline_discoveries: 0,
            buckets: [],
          }),
        });
      if (String(url).startsWith("/api/v1/analytics/drinking-trends"))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            start: "2026-01-01",
            end: "2026-12-31",
            timezone: "Europe/Amsterdam",
            daily: [],
            weekday: [],
            hourly: [],
            weekday_hour: [],
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
  expect(document.querySelector(".app")).toHaveClass("theme-aware");
  expect(screen.getByText("Inventory")).toBeInTheDocument();
  expect(screen.getByText("Explorer")).toBeInTheDocument();
  expect(await screen.findByText("Backend: connected")).toBeInTheDocument();
});

test("Analytics enables the semantic route boundary for URL-selected trends", async () => {
  render(
    <MemoryRouter initialEntries={["/analytics?view=trends"]}>
      <App />
    </MemoryRouter>,
  );
  expect(
    await screen.findByRole("heading", { name: "Drinking Trends" }),
  ).toBeInTheDocument();
  expect(document.querySelector(".app")).toHaveClass("theme-aware");
  expect(document.querySelector(".app-header")).toHaveClass("theme-aware");
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

test("opens Explorer beers and enables Breweries and Styles", async () => {
  render(
    <MemoryRouter initialEntries={["/explore"]}>
      <App />
    </MemoryRouter>,
  );
  expect(
    await screen.findByRole("heading", { name: "Beers" }),
  ).toBeInTheDocument();
  expect(document.querySelector(".app")).toHaveClass("theme-aware");
  expect(
    screen.getByRole("navigation", { name: "Explorer sections" }),
  ).toHaveTextContent("Breweries");
  expect(
    screen.getByRole("navigation", { name: "Explorer sections" }),
  ).toHaveTextContent("Styles");
  expect(screen.getByRole("link", { name: "Beers" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("link", { name: "Breweries" })).toHaveAttribute(
    "href",
    "/explore/breweries",
  );
  expect(
    await screen.findByText("No beers in your catalogue yet."),
  ).toBeInTheDocument();
});

test("Styles route renders the catalogue", async () => {
  render(
    <MemoryRouter initialEntries={["/explore/styles"]}>
      <App />
    </MemoryRouter>,
  );
  expect(
    await screen.findByRole("heading", {
      name: "Styles",
    }),
  ).toBeInTheDocument();
  expect(document.querySelector(".app")).toHaveClass("theme-aware");
  expect(document.querySelector(".explorer-page")).not.toHaveClass(
    "theme-aware",
  );
});

test("HopStats brand returns to Dashboard and closes the mobile menu", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/explore/beers"]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Beers" });
  await user.click(screen.getByRole("button", { name: "Main menu" }));
  const brand = screen.getByRole("link", { name: "🍺 HopStats" });
  expect(brand).toHaveAttribute("href", "/");
  await user.click(brand);
  await waitFor(() =>
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    ),
  );
  expect(screen.getByRole("button", { name: "Main menu" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
