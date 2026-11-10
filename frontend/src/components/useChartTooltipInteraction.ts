import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

/** Identify the synthesized click belonging to a touch without retaining gesture state. */
export function isTouchGeneratedClick(
  event: Event | { nativeEvent: Event },
): boolean {
  const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;
  const pointerType = (nativeEvent as PointerEvent).pointerType;
  return (
    pointerType === "touch" ||
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
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const touchMoved = useRef(false);

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
      if (touchStart.current) {
        const movedX = Math.abs(event.clientX - touchStart.current.x);
        const movedY = Math.abs(event.clientY - touchStart.current.y);
        if (movedX > 8 || movedY > 8) touchMoved.current = true;
      }
      setHovered(true);
    }
  }

  function onPointerLeave() {
    setHovered(false);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") {
      touchStart.current = { x: event.clientX, y: event.clientY };
      touchMoved.current = false;
      setHovered(true);
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") {
      const bounds = chartRef.current?.getBoundingClientRect();
      const releasedInsideChart =
        bounds !== undefined &&
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom;
      if (!touchMoved.current && releasedInsideChart) setPinned(true);
      else setHovered(false);
      touchStart.current = null;
      touchMoved.current = false;
    }
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") {
      setHovered(false);
      touchStart.current = null;
      touchMoved.current = false;
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
