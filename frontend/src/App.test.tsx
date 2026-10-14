import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, vi, test, expect } from "vitest";
import App from "./App";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => cleanup());
test("renders shell and navigation", async () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByText(/HopStats/)).toBeInTheDocument();
  expect(screen.getByText("Inventory")).toBeInTheDocument();
  expect(await screen.findByText("Backend: connected")).toBeInTheDocument();
});
test("shows connection failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Backend: unavailable")).toBeInTheDocument();
});
