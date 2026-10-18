export type TouchCoordinates = {
  identifier: number;
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
};

export type TouchMeasurement = Omit<
  TouchCoordinates,
  "identifier" | "clientX" | "clientY"
> & {
  x: number;
  y: number;
  dx: number;
  dy: number;
  direction: "right" | "left" | "down" | "up" | "stationary";
};

export class TouchTracker {
  private readonly previous = new Map<number, { x: number; y: number }>();

  track(eventType: string, touch: TouchCoordinates): TouchMeasurement {
    const last = this.previous.get(touch.identifier);
    const dx = last ? touch.clientX - last.x : 0;
    const dy = last ? touch.clientY - last.y : 0;
    const direction =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? "right"
          : dx < 0
            ? "left"
            : "stationary"
        : dy > 0
          ? "down"
          : dy < 0
            ? "up"
            : "stationary";

    if (eventType === "touchend" || eventType === "touchcancel") {
      this.previous.delete(touch.identifier);
    } else {
      this.previous.set(touch.identifier, {
        x: touch.clientX,
        y: touch.clientY,
      });
    }

    return {
      x: touch.clientX,
      y: touch.clientY,
      pageX: touch.pageX,
      pageY: touch.pageY,
      dx,
      dy,
      direction,
    };
  }
}
