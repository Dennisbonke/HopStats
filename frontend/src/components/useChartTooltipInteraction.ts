import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

/** Keep a touch-selected Recharts point open until dismissal or context change. */
export function useChartTooltipInteraction(
  chartRef: RefObject<HTMLElement | null>,
  contextKey: unknown,
) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const lastPointerType = useRef<string | null>(null);
  const touchClickPending = useRef(false);
  const touchStart = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    setPinned(false);
    setHovered(false);
    touchClickPending.current = false;
    touchStart.current = null;
  }, [contextKey]);

  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      if (!chartRef.current?.contains(event.target as Node)) {
        setPinned(false);
        setHovered(false);
      }
    };
    const dismissOnResize = () => {
      setPinned(false);
      setHovered(false);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    window.addEventListener("resize", dismissOnResize);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      window.removeEventListener("resize", dismissOnResize);
    };
  }, [chartRef]);

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse") {
      setPinned(false);
      setHovered(true);
    } else if (event.pointerType === "touch") {
      setHovered(true);
    }
  }

  function onPointerLeave() {
    setHovered(false);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    lastPointerType.current = event.pointerType;
    touchClickPending.current = false;
    if (event.pointerType === "mouse") {
      touchStart.current = null;
    }
    if (event.pointerType === "touch" && event.isPrimary) {
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
      if (!moved) setPinned(true);
      else setHovered(false);
      touchClickPending.current = !moved;
      touchStart.current = null;
    }
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
    if (
      event.pointerType === "touch" &&
      touchStart.current?.pointerId === event.pointerId
    ) {
      setHovered(false);
      touchClickPending.current = false;
      touchStart.current = null;
    }
  }

  function shouldIgnoreChartClick(event: Event | { nativeEvent: Event }) {
    const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;
    const detail = (nativeEvent as MouseEvent).detail;
    if (detail === 0 || lastPointerType.current === "mouse") return false;

    const pointerType = (nativeEvent as PointerEvent).pointerType;
    const ignore = pointerType === "touch" || touchClickPending.current;
    touchClickPending.current = false;
    return ignore;
  }

  function onFocus() {
    setHovered(true);
  }

  function onBlur() {
    setHovered(false);
  }

  return {
    active: pinned ? true : hovered ? undefined : false,
    onPointerMove,
    onPointerLeave,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    shouldIgnoreChartClick,
    onFocus,
    onBlur,
  };
}
