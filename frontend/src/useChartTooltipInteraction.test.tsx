import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { useChartTooltipInteraction } from "./components/useChartTooltipInteraction";

afterEach(cleanup);

function mountChart(onDrilldown: (event: Event) => void) {
  function Chart() {
    const chartRef = useRef<HTMLDivElement>(null);
    const interaction = useChartTooltipInteraction(chartRef, "stable");
    return (
      <div
        ref={chartRef}
        data-testid="chart"
        data-trigger={interaction.trigger}
        data-active={
          interaction.active === undefined ? "auto" : String(interaction.active)
        }
        onPointerDown={interaction.onPointerDown}
        onPointerMove={interaction.onPointerMove}
        onPointerUp={interaction.onPointerUp}
        onPointerCancel={interaction.onPointerCancel}
        onKeyDown={interaction.onKeyDown}
        onClick={(event) => {
          if (!interaction.shouldIgnoreChartClick(event)) {
            onDrilldown(event.nativeEvent);
          }
        }}
      />
    );
  }

  render(<Chart />);
  return screen.getByTestId("chart");
}

function pointerEvent(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  pointerType: string,
  clientY = 20,
) {
  return new PointerEvent(type, {
    bubbles: true,
    pointerId: 1,
    pointerType,
    isPrimary: true,
    clientX: 20,
    clientY,
  });
}

function clickEvent(
  pointerType: string,
  detail: number,
  firesTouchEvents?: boolean,
) {
  const event = new MouseEvent("click", { bubbles: true, detail });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  if (firesTouchEvents !== undefined) {
    Object.defineProperty(event, "sourceCapabilities", {
      value: { firesTouchEvents },
    });
  }
  return event;
}

test("touch click is ignored but a later mouse click drills down", () => {
  const onDrilldown = vi.fn();
  const chart = mountChart(onDrilldown);

  fireEvent(chart, pointerEvent("pointerdown", "touch"));
  expect(chart).toHaveAttribute("data-trigger", "hover");
  expect(chart).toHaveAttribute("data-active", "false");
  fireEvent(chart, pointerEvent("pointerup", "touch"));
  expect(chart).toHaveAttribute("data-active", "false");
  fireEvent(chart, clickEvent("", 0));
  expect(onDrilldown).not.toHaveBeenCalled();

  fireEvent(chart, pointerEvent("pointerdown", "touch"));
  fireEvent(chart, pointerEvent("pointerup", "touch"));
  // This is WebKit's actual compatibility-click sequence: touch pointers,
  // followed by a click which reports itself as mouse input.
  fireEvent(chart, clickEvent("mouse", 1));
  expect(onDrilldown).not.toHaveBeenCalled();

  fireEvent(chart, pointerEvent("pointerdown", "mouse"));
  fireEvent(chart, clickEvent("mouse", 1));
  expect(onDrilldown).toHaveBeenCalledTimes(1);

  fireEvent(chart, pointerEvent("pointerdown", "mouse"));
  expect(chart).toHaveAttribute("data-trigger", "hover");
  fireEvent(chart, clickEvent("touch", 1));
  expect(onDrilldown).toHaveBeenCalledTimes(1);
});

test("cancelled touch and keyboard clicks do not leave stale suppression", () => {
  const onDrilldown = vi.fn();
  const chart = mountChart(onDrilldown);

  fireEvent(chart, pointerEvent("pointerdown", "touch"));
  fireEvent(chart, pointerEvent("pointercancel", "touch"));
  fireEvent(chart, pointerEvent("pointerdown", "mouse"));
  fireEvent(chart, clickEvent("mouse", 1));
  expect(onDrilldown).toHaveBeenCalledTimes(1);

  fireEvent(chart, pointerEvent("pointerdown", "touch"));
  fireEvent(chart, pointerEvent("pointerup", "touch"));
  fireEvent.keyDown(chart, { key: "Enter" });
  fireEvent(chart, clickEvent("", 0));
  expect(onDrilldown).toHaveBeenCalledTimes(2);
});

test("a swipe does not leave touch-click suppression for later chart clicks", () => {
  const onDrilldown = vi.fn();
  const chart = mountChart(onDrilldown);

  fireEvent(chart, pointerEvent("pointerdown", "touch"));
  fireEvent(chart, pointerEvent("pointermove", "touch", 60));
  expect(chart).toHaveAttribute("data-trigger", "hover");
  expect(chart).toHaveAttribute("data-active", "false");
  fireEvent(chart, clickEvent("touch", 1));
  expect(onDrilldown).not.toHaveBeenCalled();

  fireEvent(chart, pointerEvent("pointerdown", "mouse"));
  fireEvent(chart, clickEvent("mouse", 1));
  expect(onDrilldown).toHaveBeenCalledTimes(1);
});

test("a lost touch pointerup suppresses only its own click", () => {
  const onDrilldown = vi.fn();
  const chart = mountChart(onDrilldown);

  fireEvent(chart, pointerEvent("pointerdown", "touch"));
  fireEvent(chart, clickEvent("", 0));
  expect(onDrilldown).not.toHaveBeenCalled();

  fireEvent(chart, pointerEvent("pointerdown", "mouse"));
  fireEvent(chart, clickEvent("mouse", 1));
  expect(onDrilldown).toHaveBeenCalledTimes(1);
});

test("a mouse pointer transition clears pending touch suppression", () => {
  const onDrilldown = vi.fn();
  const chart = mountChart(onDrilldown);

  fireEvent(chart, pointerEvent("pointerdown", "touch"));
  fireEvent(document, pointerEvent("pointermove", "mouse"));
  fireEvent(chart, clickEvent("", 1));
  expect(onDrilldown).toHaveBeenCalledTimes(1);
});

test("compatibility click metadata cannot override a known touch gesture", () => {
  const onDrilldown = vi.fn();
  const chart = mountChart(onDrilldown);

  fireEvent(chart, pointerEvent("pointerdown", "touch"));
  fireEvent(chart, clickEvent("", 1, false));
  expect(onDrilldown).not.toHaveBeenCalled();
  fireEvent(chart, pointerEvent("pointerdown", "mouse"));
  fireEvent(chart, clickEvent("", 1, false));
  expect(onDrilldown).toHaveBeenCalledTimes(1);
});

test("touch scrolling suppresses compatibility clicks until a new mouse gesture", () => {
  const onDrilldown = vi.fn();
  const chart = mountChart(onDrilldown);

  fireEvent(chart, pointerEvent("pointerdown", "touch"));
  fireEvent.scroll(window);
  expect(chart).toHaveAttribute("data-trigger", "hover");
  expect(chart).toHaveAttribute("data-active", "false");
  fireEvent(chart, clickEvent("", 1));
  expect(onDrilldown).not.toHaveBeenCalled();
  fireEvent(chart, pointerEvent("pointerdown", "mouse"));
  fireEvent(chart, clickEvent("", 1));
  expect(onDrilldown).toHaveBeenCalledTimes(1);
});

test("a touch released outside the chart cannot leave state for a later mouse click", () => {
  const onDrilldown = vi.fn();
  const chart = mountChart(onDrilldown);

  fireEvent(chart, pointerEvent("pointerdown", "touch"));
  fireEvent(document, pointerEvent("pointerup", "touch"));
  expect(chart).toHaveAttribute("data-trigger", "hover");
  expect(chart).toHaveAttribute("data-active", "false");

  fireEvent(chart, pointerEvent("pointerdown", "mouse"));
  fireEvent(chart, clickEvent("mouse", 1));
  expect(onDrilldown).toHaveBeenCalledTimes(1);
});

test("touch selects exact full-height bucket regions, not stale Recharts hover state", () => {
  function Chart({ context = "first" }: { context?: string }) {
    const chartRef = useRef<HTMLDivElement>(null);
    const interaction = useChartTooltipInteraction(chartRef, context);
    return (
      <div
        ref={chartRef}
        data-testid="regions"
        data-native-active={
          interaction.active === undefined ? "auto" : String(interaction.active)
        }
        onKeyDown={interaction.onKeyDown}
        onPointerDown={interaction.onPointerDown}
        onPointerUp={interaction.onPointerUp}
        onPointerMove={interaction.onPointerMove}
      >
        <output>{interaction.selection?.index ?? "none"}</output>
        <svg>
          {[0, 1, 2].map((index) => (
            <rect key={index} data-chart-bucket={index} />
          ))}
        </svg>
      </div>
    );
  }
  const { rerender } = render(<Chart />);
  const chart = screen.getByTestId("regions");
  const rect = (left: number, right: number) => ({
    left,
    right,
    top: 10,
    bottom: 110,
    width: right - left,
    height: 100,
    x: left,
    y: 10,
    toJSON: () => ({}),
  });
  vi.spyOn(chart, "getBoundingClientRect").mockReturnValue(rect(0, 200));
  chart.querySelectorAll("rect").forEach((element, index) => {
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
      rect(40 + index * 40, 80 + index * 40),
    );
  });
  const dispatch = (type: string, x: number, y = 15) =>
    fireEvent(
      chart,
      new PointerEvent(type, {
        bubbles: true,
        pointerType: "touch",
        pointerId: 1,
        isPrimary: true,
        clientX: x,
        clientY: y,
      }),
    );
  const tap = (x: number, y = 15) => {
    dispatch("pointerdown", x, y);
    dispatch("pointerup", x, y);
  };
  for (const [x, index] of [
    [41, 0],
    [79, 0],
    [80, 1],
    [120, 2],
    [159, 2],
  ]) {
    tap(x);
    expect(chart.querySelector("output")).toHaveTextContent(String(index));
  }
  // Axes, legend and margins have no bucket, even if Recharts retained an index.
  for (const [x, y] of [
    [39, 15],
    [161, 15],
    [60, 111],
    [60, 9],
  ]) {
    tap(x, y);
    expect(chart.querySelector("output")).toHaveTextContent("none");
  }
  tap(60);
  dispatch("pointerdown", 60);
  dispatch("pointermove", 105);
  dispatch("pointerup", 105);
  expect(chart.querySelector("output")).toHaveTextContent("0");
  fireEvent.keyDown(chart, { key: "ArrowRight" });
  expect(chart.querySelector("output")).toHaveTextContent("none");
  expect(chart).toHaveAttribute("data-native-active", "auto");
  fireEvent.keyDown(chart, { key: "Escape" });
  expect(chart).toHaveAttribute("data-native-active", "false");
  tap(60);
  rerender(<Chart context="changed" />);
  expect(chart.querySelector("output")).toHaveTextContent("none");
  tap(100);
  fireEvent.pointerDown(document.body);
  expect(chart.querySelector("output")).toHaveTextContent("none");
});
