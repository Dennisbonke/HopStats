import { expect, test } from "vitest";
import { LayoutCapture, SAMPLE_CAPACITY } from "./layoutCapture";

function sample(id: number, anomaly = false) {
  return { t: id, source: "test", id, ...(anomaly ? { anomaly: true } : {}) };
}

test("keeps anomaly context after the rolling sample buffer has moved on", () => {
  const capture = new LayoutCapture<ReturnType<typeof sample>>();
  for (let id = 0; id < 100; id += 1) capture.append(sample(id));
  capture.append(sample(100, true));
  for (let id = 101; id < 161; id += 1) capture.append(sample(id));
  for (let id = 161; id < 901; id += 1) capture.append(sample(id));

  expect(capture.samples).toHaveLength(SAMPLE_CAPACITY);
  expect(capture.samples[0].id).toBe(301);
  expect(capture.incidents).toHaveLength(1);
  expect(capture.incidents[0].complete).toBe(true);
  expect(capture.incidents[0].samples[0].id).toBe(70);
  expect(capture.incidents[0].samples[30]).toMatchObject({
    id: 100,
    anomaly: true,
  });
  expect(capture.incidents[0].samples.at(-1)?.id).toBe(160);
});

test("bounds retained incident count", () => {
  const capture = new LayoutCapture<ReturnType<typeof sample>>();
  for (let incident = 0; incident < 12; incident += 1) {
    capture.append(sample(incident * 100, true));
    for (let quiet = 1; quiet <= 60; quiet += 1) {
      capture.append(sample(incident * 100 + quiet));
    }
  }
  expect(capture.incidents).toHaveLength(8);
  expect(capture.incidents[0].samples[30].id).toBe(400);
});
