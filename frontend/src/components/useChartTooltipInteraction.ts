import { useEffect, useRef, useState } from "react";
import type { BucketSelection } from "./ChartBucketSelection";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

/** Pin an explicit bucket, independently of Recharts' hover/click index.
 * Recharts selects on touchmove (not touchstart/end); a stationary tap cannot
 * safely reuse that index. Keep the native tooltip on hover for mouse/keyboard.
 */
export function useChartTooltipInteraction(
  chartRef: RefObject<HTMLElement | null>,
  contextKey: unknown,
) {
  const [selection, setSelection] = useState<BucketSelection | null>(null);
  const [hovered, setHovered] = useState(false);
  const [touchMode, setTouchMode] = useState(false);
  const lastPointerType = useRef<string | null>(null);
  const touchStart = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    setSelection(null);
    setHovered(false);
    setTouchMode(false);
    touchStart.current = null;
  }, [contextKey]);

  useEffect(() => {
    const clearTouchGesture = (pointerId: number) => {
      if (touchStart.current?.pointerId !== pointerId) return;
      touchStart.current = null;
      setHovered(false);
      setTouchMode(false);
    };
    const dismissOutside = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        lastPointerType.current = "mouse";
        touchStart.current = null;
        setTouchMode(false);
      }
      if (!chartRef.current?.contains(event.target as Node)) {
        setSelection(null);
        setHovered(false);
        setTouchMode(false);
      }
    };
    const trackTouchMovement = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        lastPointerType.current = "mouse";
        touchStart.current = null;
        setTouchMode(false);
        return;
      }
      const start = touchStart.current;
      if (
        event.pointerType === "touch" &&
        start?.pointerId === event.pointerId &&
        (Math.abs(event.clientX - start.x) > 8 ||
          Math.abs(event.clientY - start.y) > 8)
      ) {
        clearTouchGesture(event.pointerId);
      }
    };
    const cancelTouchGesture = (event: PointerEvent) => {
      if (event.pointerType === "touch") clearTouchGesture(event.pointerId);
    };
    const finishTouchGesture = (event: PointerEvent) => {
      const start = touchStart.current;
      if (event.pointerType !== "touch" || start?.pointerId !== event.pointerId)
        return;
      const rect = chartRef.current?.getBoundingClientRect();
      const moved =
        Math.abs(event.clientX - start.x) > 8 ||
        Math.abs(event.clientY - start.y) > 8;
      const hasBounds = !!rect && rect.width > 0 && rect.height > 0;
      const releasedOutside =
        !rect ||
        !chartRef.current?.contains(event.target as Node) ||
        (hasBounds &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom));
      if (moved || releasedOutside) clearTouchGesture(event.pointerId);
    };
    const cancelTouchOnScroll = () => {
      if (touchStart.current) clearTouchGesture(touchStart.current.pointerId);
    };
    const dismissOnResize = () => {
      setSelection(null);
      setHovered(false);
      setTouchMode(false);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("pointermove", trackTouchMovement, true);
    document.addEventListener("pointercancel", cancelTouchGesture, true);
    document.addEventListener("pointerup", finishTouchGesture, true);
    window.addEventListener("scroll", cancelTouchOnScroll, true);
    window.addEventListener("resize", dismissOnResize);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("pointermove", trackTouchMovement, true);
      document.removeEventListener("pointercancel", cancelTouchGesture, true);
      document.removeEventListener("pointerup", finishTouchGesture, true);
      window.removeEventListener("scroll", cancelTouchOnScroll, true);
      window.removeEventListener("resize", dismissOnResize);
    };
  }, [chartRef]);

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse") {
      lastPointerType.current = "mouse";
      setSelection(null);
      setHovered(true);
      setTouchMode(false);
    } else if (event.pointerType === "touch") {
      const start = touchStart.current;
      if (start?.pointerId === event.pointerId) setHovered(true);
    }
  }

  function onPointerLeave() {
    setHovered(false);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    lastPointerType.current = event.pointerType;
    if (event.pointerType === "mouse") {
      touchStart.current = null;
      setTouchMode(false);
    }
    if (event.pointerType === "touch" && event.isPrimary) {
      setTouchMode(true);
      touchStart.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      setHovered(true);
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (
      event.pointerType === "touch" &&
      touchStart.current?.pointerId === event.pointerId
    ) {
      const start = touchStart.current;
      const moved =
        !start ||
        Math.abs(event.clientX - start.x) > 8 ||
        Math.abs(event.clientY - start.y) > 8;
      if (!moved) {
        const chart = chartRef.current;
        const regions = chart?.querySelectorAll<SVGRectElement>(
          "[data-chart-bucket]",
        );
        const region = Array.from(regions ?? []).find((element) => {
          const bounds = element.getBoundingClientRect();
          return (
            event.clientX >= bounds.left &&
            event.clientX < bounds.right &&
            event.clientY >= bounds.top &&
            event.clientY <= bounds.bottom
          );
        });
        const bounds = chart?.getBoundingClientRect();
        setSelection(
          region && bounds
            ? {
                index: Number(region.dataset.chartBucket),
                coordinate: {
                  x: event.clientX - bounds.left,
                  y: event.clientY - bounds.top,
                },
              }
            : null,
        );
      } else setHovered(false);
      setTouchMode(!moved);
      touchStart.current = null;
    }
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
    if (
      event.pointerType === "touch" &&
      touchStart.current?.pointerId === event.pointerId
    ) {
      setHovered(false);
      setTouchMode(false);
      touchStart.current = null;
    }
  }

  function shouldIgnoreChartClick(event: Event | { nativeEvent: Event }) {
    const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;
    const pointerType = (nativeEvent as PointerEvent).pointerType;
    const firesTouchEvents = (
      nativeEvent as MouseEvent & {
        sourceCapabilities?: { firesTouchEvents?: boolean } | null;
      }
    ).sourceCapabilities?.firesTouchEvents;
    // WebKit sends a mouse-typed compatibility click after a touch pointerup.
    // Classify from pointer provenance, not the click's reported pointerType.
    // A real mouse pointerdown/move or keyboard action establishes fresh input.
    return (
      lastPointerType.current === "touch" ||
      pointerType === "touch" ||
      firesTouchEvents === true
    );
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (
      ["Enter", " ", "ArrowLeft", "ArrowRight", "Escape"].includes(event.key)
    ) {
      setSelection(null);
      setHovered(event.key !== "Escape");
      lastPointerType.current = null;
      setTouchMode(false);
    }
  }

  function onFocus() {
    setHovered(true);
  }

  function onBlur() {
    setHovered(false);
  }

  return {
    selection,
    active: touchMode || selection ? false : hovered ? undefined : false,
    trigger: "hover" as const,
    onPointerMove,
    onPointerLeave,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    shouldIgnoreChartClick,
    onKeyDown,
    onFocus,
    onBlur,
  };
}
