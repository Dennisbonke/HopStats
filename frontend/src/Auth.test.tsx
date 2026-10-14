import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";
import { fetchCurrentUser } from "./api/auth";

const user = { id: 1, username: "local", created_at: "2026-10-14T00:00:00Z" };

function renderApp(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  document.cookie =
    "hopstats_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});
afterEach(() => cleanup());

test("protects routes and logs in with a session cookie", async () => {
  let loggedIn = false;
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/v1/auth/me") {
        return Promise.resolve(
          loggedIn
            ? { ok: true, json: async () => user }
            : {
                ok: false,
                status: 401,
                json: async () => ({ detail: "Authentication required" }),
              },
        );
      }
      if (url === "/api/v1/auth/csrf") return Promise.resolve({ ok: true });
      if (options?.method === "POST" && url === "/api/v1/auth/login") {
        loggedIn = true;
        return Promise.resolve({ ok: true, json: async () => ({ user }) });
      }
      if (url === "/api/v1/health") return Promise.resolve({ ok: true });
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
    });
  const testingUser = userEvent.setup();
  renderApp(fetchMock);
  expect(
    await screen.findByRole("heading", { name: "Sign in" }),
  ).toBeInTheDocument();
  await testingUser.type(screen.getByLabelText("Username"), "local");
  await testingUser.type(
    screen.getByLabelText("Password"),
    "synthetic password",
  );
  await testingUser.click(screen.getByRole("button", { name: "Sign in" }));
  expect(
    await screen.findByRole("button", { name: /Sign out/ }),
  ).toBeInTheDocument();
});

test("shows a generic login failure", async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/v1/auth/me")
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({}),
        });
      if (url === "/api/v1/auth/csrf") return Promise.resolve({ ok: true });
      if (options?.method === "POST")
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ detail: "Invalid username or password" }),
        });
      return Promise.resolve({ ok: true });
    });
  const testingUser = userEvent.setup();
  renderApp(fetchMock);
  await screen.findByRole("heading", { name: "Sign in" });
  await testingUser.type(screen.getByLabelText("Username"), "local");
  await testingUser.type(screen.getByLabelText("Password"), "wrong password");
  await testingUser.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The username or password is incorrect.",
  );
});

test("fails closed for malformed current-user responses", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  await expect(fetchCurrentUser()).rejects.toThrow(
    "invalid current-user response",
  );

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ username: "local" }),
    }),
  );
  await expect(fetchCurrentUser()).rejects.toThrow(
    "invalid current-user response",
  );

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 1,
        username: "local",
        created_at: "not-a-timestamp",
      }),
    }),
  );
  await expect(fetchCurrentUser()).rejects.toThrow(
    "invalid current-user response",
  );
});

test("keeps the authenticated UI when logout fails and allows retry", async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/v1/auth/me")
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => user,
        });
      if (url === "/api/v1/health") return Promise.resolve({ ok: true });
      if (options?.method === "POST" && url === "/api/v1/auth/logout")
        return Promise.resolve({
          ok: false,
          status: 503,
          json: async () => ({ detail: "temporarily unavailable" }),
        });
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
    });
  const testingUser = userEvent.setup();
  renderApp(fetchMock);
  const signOut = await screen.findByRole("button", { name: /Sign out/ });
  await testingUser.click(signOut);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unable to sign out. Please try again.",
  );
  expect(screen.getByRole("button", { name: /Sign out/ })).toBeInTheDocument();
});
