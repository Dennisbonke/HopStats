import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

/** Keep a touch-selected Recharts point open until dismissal or context change. */
export function useChartTooltipInteraction(
  chartRef: RefObject<HTMLElement | null>,
  contextKey: unknown,
) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [touchMode, setTouchMode] = useState(false);
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
    setTouchMode(false);
    touchClickPending.current = false;
    touchStart.current = null;
  }, [contextKey]);

  useEffect(() => {
    const clearTouchGesture = (pointerId: number) => {
      if (touchStart.current?.pointerId !== pointerId) return;
      touchStart.current = null;
      touchClickPending.current = false;
      setHovered(false);
      setTouchMode(false);
    };
    const dismissOutside = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        lastPointerType.current = "mouse";
        touchClickPending.current = false;
      }
      if (!chartRef.current?.contains(event.target as Node)) {
        setPinned(false);
        setHovered(false);
        setTouchMode(false);
      }
    };
    const trackTouchMovement = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        lastPointerType.current = "mouse";
        touchClickPending.current = false;
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
    const cancelTouchOnScroll = () => {
      if (touchStart.current) clearTouchGesture(touchStart.current.pointerId);
    };
    const dismissOnResize = () => {
      setPinned(false);
      setHovered(false);
      setTouchMode(false);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("pointermove", trackTouchMovement, true);
    document.addEventListener("pointercancel", cancelTouchGesture, true);
    window.addEventListener("scroll", cancelTouchOnScroll, true);
    window.addEventListener("resize", dismissOnResize);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("pointermove", trackTouchMovement, true);
      document.removeEventListener("pointercancel", cancelTouchGesture, true);
      window.removeEventListener("scroll", cancelTouchOnScroll, true);
      window.removeEventListener("resize", dismissOnResize);
    };
  }, [chartRef]);

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse") {
      lastPointerType.current = "mouse";
      touchClickPending.current = false;
      setPinned(false);
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
    touchClickPending.current = false;
    if (event.pointerType === "mouse") {
      touchStart.current = null;
      setTouchMode(false);
    }
    if (event.pointerType === "touch" && event.isPrimary) {
      setTouchMode(true);
      touchClickPending.current = true;
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
      touchClickPending.current = false;
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
    if (pointerType === "mouse" || firesTouchEvents === false) {
      lastPointerType.current = "mouse";
      touchClickPending.current = false;
      return false;
    }
    if (lastPointerType.current === "mouse") return false;
    if (touchClickPending.current) {
      touchClickPending.current = false;
      return true;
    }
    return false;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      lastPointerType.current = null;
      touchClickPending.current = false;
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
    active: pinned ? true : hovered || touchMode ? undefined : false,
    trigger: touchMode ? ("click" as const) : ("hover" as const),
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
