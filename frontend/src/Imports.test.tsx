import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";

const completed = {
  id: 1,
  source_type: "checkins",
  filename: "checkins.csv",
  sha256: "hash",
  started_at: "2026-10-14T10:00:00Z",
  completed_at: "2026-10-14T10:00:01Z",
  status: "completed",
  inserted_count: 3,
  updated_count: 1,
  unchanged_count: 2,
  removed_count: 0,
  rejected_count: 0,
  error_code: null,
  error_summary: null,
  errors: [],
};

function renderImports(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  return render(
    <MemoryRouter initialEntries={["/imports"]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => cleanup());

test("renders import sections and empty history", async () => {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === "/api/v1/health") return Promise.resolve({ ok: true });
    return Promise.resolve({ ok: true, json: async () => [] });
  });
  renderImports(fetchMock);
  expect(await screen.findByText("Untappd check-in CSV")).toBeInTheDocument();
  expect(screen.getByText("Untappd stash CSV")).toBeInTheDocument();
  expect(screen.getByText(/No imports yet/)).toBeInTheDocument();
});

test("selects and uploads a check-in file", async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/v1/health") return Promise.resolve({ ok: true });
      if (options?.method === "POST") {
        return Promise.resolve({ ok: true, json: async () => completed });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
  const user = userEvent.setup();
  renderImports(fetchMock);
  const file = new File(["beer_name,brewery_name"], "checkins.csv", {
    type: "text/csv",
  });
  await user.upload(screen.getAllByLabelText("Choose CSV file")[0], file);
  expect(screen.getByText("Selected: checkins.csv")).toBeInTheDocument();
  await user.click(screen.getAllByRole("button", { name: "Upload CSV" })[0]);
  expect(await screen.findByText("Import complete")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/v1/imports/checkins",
    expect.objectContaining({ method: "POST" }),
  );
});

test("requires stash replacement confirmation and displays validation errors", async () => {
  const failed = {
    ...completed,
    status: "failed",
    error_code: "invalid_csv",
    error_summary: "row 2 is invalid",
    errors: [{ row_number: 2, field: "quantity", reason: "invalid quantity" }],
  };
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/v1/health") return Promise.resolve({ ok: true });
      if (options?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 422,
          json: async () => failed,
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
  const user = userEvent.setup();
  renderImports(fetchMock);
  const file = new File(["item_id,quantity"], "stash.csv", {
    type: "text/csv",
  });
  await user.upload(screen.getAllByLabelText("Choose CSV file")[1], file);
  const uploadButton = screen.getAllByRole("button", { name: "Upload CSV" })[1];
  expect(uploadButton).toBeDisabled();
  await user.click(screen.getByLabelText(/understand this replaces/));
  await user.click(uploadButton);
  expect(
    (await screen.findAllByText("row 2 is invalid")).length,
  ).toBeGreaterThan(0);
  expect(screen.getByText(/Row 2, quantity/)).toBeInTheDocument();
});

test("requires a second acknowledgement for an undated replacement", async () => {
  let uploads = 0;
  const undated = {
    ...completed,
    source_type: "inventory",
    error_code: "undated_snapshot",
    status: "failed",
    error_summary: "undated",
  };
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/v1/health") return Promise.resolve({ ok: true });
      if (options?.method === "POST") {
        uploads += 1;
        return uploads === 1
          ? Promise.resolve({
              ok: false,
              status: 409,
              json: async () => undated,
            })
          : Promise.resolve({
              ok: true,
              json: async () => ({ ...completed, source_type: "inventory" }),
            });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
  const user = userEvent.setup();
  renderImports(fetchMock);
  const file = new File(["item_id,quantity"], "stash.csv", {
    type: "text/csv",
  });
  await user.upload(screen.getAllByLabelText("Choose CSV file")[1], file);
  await user.click(screen.getByLabelText(/understand this replaces/));
  await user.click(screen.getAllByRole("button", { name: "Upload CSV" })[1]);
  expect(
    await screen.findByText(/This export has no trusted date/),
  ).toBeInTheDocument();
  const retry = screen.getByLabelText(/This export has no trusted date/);
  expect(
    screen.getAllByRole("button", { name: "Upload CSV" })[1],
  ).toBeDisabled();
  await user.click(retry);
  await user.click(screen.getAllByRole("button", { name: "Upload CSV" })[1]);
  expect(await screen.findByText("Import complete")).toBeInTheDocument();
  expect(uploads).toBe(2);
});

test("displays a network error", async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/v1/health") return Promise.resolve({ ok: true });
      if (options?.method === "POST")
        return Promise.reject(new Error("offline"));
      return Promise.resolve({ ok: true, json: async () => [] });
    });
  const user = userEvent.setup();
  renderImports(fetchMock);
  const file = new File(["data"], "checkins.csv", { type: "text/csv" });
  await user.upload(screen.getAllByLabelText("Choose CSV file")[0], file);
  await user.click(screen.getAllByRole("button", { name: "Upload CSV" })[0]);
  await waitFor(() =>
    expect(screen.getByText(/Network error/)).toBeInTheDocument(),
  );
});
