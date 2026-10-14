import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url === "/api/v1/health") return Promise.resolve({ ok: true });
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
              alias_details: [
                { id: 11, alias: "Cellar stash", managed_by_config: true },
              ],
              managed_by_config: true,
              ownership: "configuration",
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
                  alias_details: [],
                  managed_by_config: false,
                  ownership: "database",
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

test("shows configured locations as read-only and submits UI mutations", async () => {
  const fetchMock = vi.mocked(globalThis.fetch);
  render(
    <MemoryRouter initialEntries={["/locations"]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByText("Main Storage → Cellar");
  expect(
    screen.getByText(/read-only in the web interface/),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save location" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Transfer to UI management" }),
  ).toBeInTheDocument();

  const nameInput = screen.getAllByLabelText("Name")[0];
  fireEvent.change(nameInput, { target: { value: "New storage" } });
  fireEvent.submit(nameInput.closest("form")!);
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/locations",
      expect.objectContaining({ method: "POST" }),
    ),
  );

  const aliasInput = screen.getByPlaceholderText("Add an alias");
  fireEvent.change(aliasInput, { target: { value: "Phone shelf" } });
  fireEvent.submit(aliasInput.closest("form")!);
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/locations/1/aliases",
      expect.objectContaining({ method: "POST" }),
    ),
  );
});
