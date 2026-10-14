import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, vi, test, expect } from "vitest";
import App from "./App";

beforeEach(() => {
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
        : Promise.resolve({ ok: true }),
    ),
  );
});
afterEach(() => cleanup());
test("renders shell and navigation", async () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText(/HopStats/)).toBeInTheDocument();
  expect(screen.getByText("Inventory")).toBeInTheDocument();
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
