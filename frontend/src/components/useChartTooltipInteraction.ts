import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

/** Identify the synthesized click belonging to a touch without retaining gesture state. */
export function isTouchGeneratedClick(
  event: Event | { nativeEvent: Event },
): boolean {
  const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;
  const pointerType = (nativeEvent as PointerEvent).pointerType;
  if (typeof pointerType === "string" && pointerType.length > 0) {
    return pointerType === "touch";
  }
  return (
    (
      nativeEvent as MouseEvent & {
        sourceCapabilities?: { firesTouchEvents?: boolean } | null;
      }
    ).sourceCapabilities?.firesTouchEvents === true
  );
}

/** Keep a touch-selected Recharts point open until dismissal or context change. */
export function useChartTooltipInteraction(
  chartRef: RefObject<HTMLElement | null>,
  contextKey: unknown,
) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const touchStart = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    setPinned(false);
    setHovered(false);
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
      touchStart.current = null;
    }
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
    if (
      event.pointerType === "touch" &&
      touchStart.current?.pointerId === event.pointerId
    ) {
      setHovered(false);
      touchStart.current = null;
    }
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
    onFocus,
    onBlur,
  };
}
