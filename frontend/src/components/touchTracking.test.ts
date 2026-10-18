import { expect, test } from "vitest";
import { TouchTracker, type TouchCoordinates } from "./touchTracking";

function touch(identifier: number, x: number, y = 20): TouchCoordinates {
  return {
    identifier,
    clientX: x,
    clientY: y,
    pageX: x,
    pageY: y,
  };
}

test.each(["touchend", "touchcancel"] as const)(
  "resets movement history after %s before an identifier is reused",
  (endEvent) => {
    const tracker = new TouchTracker();
    expect(tracker.track("touchstart", touch(7, 100))).toMatchObject({
      dx: 0,
      direction: "stationary",
    });
    expect(tracker.track("touchmove", touch(7, 140))).toMatchObject({
      dx: 40,
      direction: "right",
    });
    expect(tracker.track(endEvent, touch(7, 150))).toMatchObject({
      dx: 10,
      direction: "right",
    });

    expect(tracker.track("touchstart", touch(7, 5))).toMatchObject({
      dx: 0,
      dy: 0,
      direction: "stationary",
    });
    expect(tracker.track("touchmove", touch(7, 2))).toMatchObject({
      dx: -3,
      direction: "left",
    });
  },
);
