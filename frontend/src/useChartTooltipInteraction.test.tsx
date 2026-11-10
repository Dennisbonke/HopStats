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
        onPointerDown={interaction.onPointerDown}
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
  type: "pointerdown" | "pointerup" | "pointercancel",
  pointerType: string,
) {
  return new PointerEvent(type, {
    bubbles: true,
    pointerId: 1,
    pointerType,
    isPrimary: true,
    clientX: 20,
    clientY: 20,
  });
}

function clickEvent(pointerType: string, detail: number) {
  const event = new MouseEvent("click", { bubbles: true, detail });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  return event;
}

test("touch click is ignored but a later mouse click drills down", () => {
  const onDrilldown = vi.fn();
  const chart = mountChart(onDrilldown);

  chart.dispatchEvent(pointerEvent("pointerdown", "touch"));
  chart.dispatchEvent(pointerEvent("pointerup", "touch"));
  chart.dispatchEvent(clickEvent("", 0));
  expect(onDrilldown).not.toHaveBeenCalled();

  chart.dispatchEvent(pointerEvent("pointerdown", "mouse"));
  chart.dispatchEvent(clickEvent("touch", 1));
  expect(onDrilldown).toHaveBeenCalledTimes(1);
});

test("cancelled touch and keyboard clicks do not leave stale suppression", () => {
  const onDrilldown = vi.fn();
  const chart = mountChart(onDrilldown);

  chart.dispatchEvent(pointerEvent("pointerdown", "touch"));
  chart.dispatchEvent(pointerEvent("pointercancel", "touch"));
  chart.dispatchEvent(pointerEvent("pointerdown", "mouse"));
  chart.dispatchEvent(clickEvent("mouse", 1));
  expect(onDrilldown).toHaveBeenCalledTimes(1);

  chart.dispatchEvent(pointerEvent("pointerdown", "touch"));
  chart.dispatchEvent(pointerEvent("pointerup", "touch"));
  fireEvent.keyDown(chart, { key: "Enter" });
  chart.dispatchEvent(clickEvent("", 0));
  expect(onDrilldown).toHaveBeenCalledTimes(2);
});
