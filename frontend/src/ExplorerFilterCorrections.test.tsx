import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { StyleFilterPanel, StyleFilterSheet } from "./pages/StyleFilters";
import { BreweryFilterPanel, BreweryFilterSheet } from "./pages/BreweryFilters";
import CountFilter, { canonicalCount } from "./pages/CountFilter";
import { emptyFilters } from "./pages/styleState";
import { emptyFilters as breweryFilters } from "./pages/breweryState";
import { fetchStyleBounds } from "./api/explore";
vi.mock("./api/explore", () => ({
  fetchStyleBounds: vi.fn(),
  fetchBreweryCountries: async () => ({
    items: [],
    has_more: false,
    unknown_available: false,
  }),
}));
beforeEach(() => {
  vi.mocked(fetchStyleBounds).mockReset().mockResolvedValue({ abv_max: 10 });
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test("pending ABV bounds retain explicit values and numeric commits without a slider", async () => {
  let finish!: (v: { abv_max: number }) => void;
  vi.mocked(fetchStyleBounds).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const change = vi.fn();
  render(
    <StyleFilterPanel
      value={{ ...emptyFilters(), abv_min: "0", abv_max: "25" }}
      onChange={change}
    />,
  );
  expect(screen.getByText("Loading average ABV bounds…")).toBeInTheDocument();
  expect(
    screen.queryByRole("slider", { name: "Average ABV minimum slider" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("spinbutton", { name: "Average ABV maximum" }),
  ).toHaveValue(25);
  expect(
    screen.getByRole("spinbutton", { name: "Average ABV minimum" }),
  ).toHaveValue(0);
  await act(async () => finish({ abv_max: 0 }));
  expect(
    screen.getByRole("slider", { name: "Average ABV maximum slider" }),
  ).toHaveAttribute("max", "25");
  expect(change).not.toHaveBeenCalled();
});
test("failed ABV bounds can retry without losing committed filters or committing on arrival", async () => {
  vi.mocked(fetchStyleBounds).mockRejectedValueOnce(new Error("offline"));
  const change = vi.fn();
  render(
    <StyleFilterPanel
      value={{ ...emptyFilters(), abv_min: "0" }}
      onChange={change}
    />,
  );
  await screen.findByText(/Average ABV bounds unavailable/);
  expect(
    screen.queryByRole("slider", { name: "Average ABV minimum slider" }),
  ).not.toBeInTheDocument();
  const high = screen.getByRole("spinbutton", { name: "Average ABV maximum" });
  fireEvent.change(high, { target: { value: "12.5" } });
  fireEvent.blur(high);
  expect(change).toHaveBeenLastCalledWith({
    ...emptyFilters(),
    abv_min: "0",
    abv_max: "12.5",
  });
  change.mockClear();
  fireEvent.click(
    screen.getByRole("button", { name: "Retry average ABV bounds" }),
  );
  await screen.findByRole("slider", { name: "Average ABV maximum slider" });
  expect(change).not.toHaveBeenCalled();
});
test.each([0, 0.1, 10])(
  "successful aggregate bound %s gives finite, positive geometry",
  async (maximum) => {
    vi.mocked(fetchStyleBounds).mockResolvedValue({ abv_max: maximum });
    const change = vi.fn();
    const view = render(
      <StyleFilterPanel value={emptyFilters()} onChange={change} />,
    );
    const slider = await screen.findByRole("slider", {
      name: "Average ABV maximum slider",
    });
    expect(Number(slider.getAttribute("max"))).toBeGreaterThan(0);
    const track = slider.parentElement!;
    expect(
      Number.isFinite(Number(track.style.getPropertyValue("--range-low"))),
    ).toBe(true);
    expect(
      Number.isFinite(Number(track.style.getPropertyValue("--range-high"))),
    ).toBe(true);
    expect(view.container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(change).not.toHaveBeenCalled();
  },
);
test.each([NaN, Infinity, -1])(
  "malformed ABV bound %s is a retriable failure",
  async (maximum) => {
    vi.mocked(fetchStyleBounds).mockResolvedValue({ abv_max: maximum });
    render(<StyleFilterPanel value={emptyFilters()} onChange={() => {}} />);
    await screen.findByRole("button", { name: "Retry average ABV bounds" });
    expect(
      screen.queryByRole("slider", { name: "Average ABV maximum slider" }),
    ).not.toBeInTheDocument();
  },
);
test.each(["-2", "1.5", "2147483648", "-", "1e", "1.00000000000000001"])(
  "invalid count %s stays visible with feedback and cannot commit",
  (value) => {
    const change = vi.fn();
    render(
      <CountFilter label="Minimum check-ins" value="5" onChange={change} />,
    );
    const input = screen.getByLabelText("Minimum check-ins");
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue(value);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("whole number");
    expect(change).not.toHaveBeenCalled();
  },
);
test.each([
  ["005", "5"],
  ["5.00", "5"],
  ["5e1", "50"],
  ["2147483647", "2147483647"],
  ["", ""],
])("count %s commits canonically as %s", (value, expected) => {
  const change = vi.fn();
  render(<CountFilter label="Count" value="2" onChange={change} />);
  const input = screen.getByLabelText("Count");
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(change).toHaveBeenCalledWith(expected);
  expect(input).toHaveValue(expected);
});
test("zero is exclusive to brewery counts and delayed acknowledgements preserve newer edits", () => {
  expect(canonicalCount("0", 1)).toBeNull();
  expect(canonicalCount("0.0", 0)).toBe("0");
  const change = vi.fn();
  const view = render(
    <CountFilter label="Count" minimum={0} value="5" onChange={change} />,
  );
  const input = screen.getByLabelText("Count");
  fireEvent.change(input, { target: { value: "0.0" } });
  fireEvent.blur(input);
  expect(change).toHaveBeenCalledWith("0");
  fireEvent.change(input, { target: { value: "7" } });
  view.rerender(
    <CountFilter label="Count" minimum={0} value="0" onChange={change} />,
  );
  expect(input).toHaveValue("7");
});
test.each(["styles", "breweries"])(
  "%s mobile Apply blocks invalid counts and Cancel preserves applied values",
  async (entity) => {
    const apply = vi.fn(),
      close = vi.fn();
    render(
      entity === "styles" ? (
        <StyleFilterSheet
          applied={{ ...emptyFilters(), min_checkins: "5" }}
          onApply={apply}
          onClose={close}
        />
      ) : (
        <BreweryFilterSheet
          applied={{ ...breweryFilters(), min_checkins: "5" }}
          onApply={apply}
          onClose={close}
        />
      ),
    );
    const dialog = screen.getByRole("dialog");
    // Happy DOM marks fractional range steps invalid; native browsers retain validation in CI.
    dialog
      .querySelectorAll<HTMLInputElement>('input[type="range"]')
      .forEach((input) => {
        input.disabled = true;
      });
    const input = within(dialog).getByLabelText("Minimum check-ins");
    fireEvent.change(input, { target: { value: "-2" } });
    fireEvent.blur(input);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Apply filters" }),
    );
    expect(apply).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "6.0" } });
    fireEvent.blur(input);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Apply filters" }),
    );
    await waitFor(() =>
      expect(apply).toHaveBeenCalledWith(
        expect.objectContaining({ min_checkins: "6" }),
      ),
    );
  },
);
test("rapid count and rating edits retain unrelated style filters", () => {
  const change = vi.fn();
  render(
    <StyleFilterPanel
      value={{ ...emptyFilters(), last_tried_from: "2026-01-01" }}
      onChange={change}
    />,
  );
  act(() => {
    for (const [label, value] of [
      ["Minimum check-ins", "5"],
      ["Minimum unique beers", "3"],
      ["Minimum distinct breweries", "0"],
    ]) {
      const input = screen.getByLabelText(label);
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
    }
    const rating = screen.getByRole("spinbutton", {
      name: "My rating minimum",
    });
    fireEvent.change(rating, { target: { value: "0" } });
    fireEvent.blur(rating);
  });
  expect(change).toHaveBeenLastCalledWith(
    expect.objectContaining({
      min_checkins: "5",
      min_unique_beers: "3",
      min_breweries: "0",
      rating_min: "0",
      last_tried_from: "2026-01-01",
    }),
  );
});
