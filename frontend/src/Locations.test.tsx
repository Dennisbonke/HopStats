import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url === "/api/v1/health") return Promise.resolve({ ok: true });
      return Promise.resolve({
        ok: true,
        json: async () => ({
          locations: [
            {
              id: 1,
              name: "Main Storage",
              parent_id: null,
              description: null,
              path: "Main Storage",
              aliases: ["Cellar stash"],
              record_count: 3,
              total_units: 5,
              children: [
                {
                  id: 2,
                  name: "Cellar",
                  parent_id: 1,
                  description: null,
                  path: "Main Storage → Cellar",
                  aliases: [],
                  record_count: 3,
                  total_units: 5,
                  children: [],
                },
              ],
            },
          ],
          unresolved: { record_count: 1, total_units: 2 },
        }),
      });
    }),
  );
});
afterEach(() => cleanup());

test("shows hierarchy, aliases, descendant counts, and unresolved link", async () => {
  render(
    <MemoryRouter initialEntries={["/locations"]}>
      <App />
    </MemoryRouter>,
  );
  expect((await screen.findAllByText("Main Storage")).length).toBeGreaterThan(
    0,
  );
  expect(screen.getByText("Main Storage → Cellar")).toBeInTheDocument();
  expect(screen.getByText("Aliases: Cellar stash")).toBeInTheDocument();
  expect(screen.getAllByText("3 records").length).toBe(2);
  expect(screen.getByText("View unresolved inventory")).toBeInTheDocument();
});
