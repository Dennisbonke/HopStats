import { useLayoutEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import type { Coordinate } from "recharts";

export const ANALYTICS_TOOLTIP_WRAPPER_STYLE = {
  position: "fixed",
  left: 0,
  top: 0,
  pointerEvents: "none",
} as const;

type Props = {
  active?: boolean;
  coordinate?: Coordinate;
  chartRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  contentRef?: RefObject<HTMLDivElement | null>;
};

/** Render chart tooltip content in the document layer and keep it in view. */
export default function AnalyticsChartTooltip({
  active,
  coordinate,
  chartRef,
  children,
  contentRef: suppliedRef,
}: Props) {
  const fallbackRef = useRef<HTMLDivElement>(null);
  const contentRef = suppliedRef ?? fallbackRef;
  const x = coordinate?.x;
  const y = coordinate?.y;

  useLayoutEffect(() => {
    if (!active || x === undefined || y === undefined) return;

    const content = contentRef.current;
    const wrapper = content?.parentElement;
    if (!content || !wrapper) return;

    const place = () => {
      const chart = chartRef.current;
      if (!chart) return;

      const chartBounds = chart.getBoundingClientRect();
      const tooltipBounds = content.getBoundingClientRect();
      const viewportWidth =
        document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight =
        document.documentElement.clientHeight || window.innerHeight;
      const style = getComputedStyle(document.documentElement);
      const safe = (side: string) =>
        Math.max(8, parseFloat(style.getPropertyValue(`--safe-${side}`)) || 0);
      const leftInset = safe("left");
      const rightInset = safe("right");
      const topInset = safe("top");
      const bottomInset = safe("bottom");
      const gap = 12;
      const anchorX = chartBounds.left + x;
      const anchorY = chartBounds.top + y;
      const maxLeft = Math.max(
        leftInset,
        viewportWidth - tooltipBounds.width - rightInset,
      );
      const maxTop = Math.max(
        topInset,
        viewportHeight - tooltipBounds.height - bottomInset,
      );

      let left = anchorX + gap;
      if (left + tooltipBounds.width > viewportWidth - rightInset) {
        left = anchorX - tooltipBounds.width - gap;
      }

      let top = anchorY + gap;
      if (top + tooltipBounds.height > viewportHeight - bottomInset) {
        top = anchorY - tooltipBounds.height - gap;
      }

      wrapper.style.position = "fixed";
      wrapper.style.left = `${Math.min(Math.max(left, leftInset), maxLeft)}px`;
      wrapper.style.top = `${Math.min(Math.max(top, topInset), maxTop)}px`;
      wrapper.style.transform = "none";
      wrapper.style.pointerEvents = "none";
      wrapper.style.zIndex = "30";
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);

    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [active, chartRef, contentRef, x, y, children]);

  if (!active || x === undefined || y === undefined) return null;

  return (
    <div ref={contentRef} className="analytics-tooltip theme-aware">
      {children}
    </div>
  );
}
