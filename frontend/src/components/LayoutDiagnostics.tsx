import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutCapture, type CapturedSample } from "./layoutCapture";
import { TouchTracker } from "./touchTracking";

const ORIENTATION_CAPTURE_MS = 2800;
const ANOMALY_CAPTURE_MS = 1800;
const PANEL_REFRESH_MS = 500;
const TOUCH_MOVE_SAMPLE_MS = 50;
const IMPORTANT_SELECTORS = [
  ".analytics-page",
  ".chart-scroll",
  ".chart-canvas",
  ".recharts-responsive-container",
  ".recharts-wrapper",
  ".recharts-surface",
  ".recharts-tooltip-wrapper",
];

type DiagnosticSample = CapturedSample & { offenders?: unknown[] };

function rect(element: Element) {
  const bounds = element.getBoundingClientRect();
  return {
    x: bounds.x,
    y: bounds.y,
    top: bounds.top,
    right: bounds.right,
    bottom: bounds.bottom,
    left: bounds.left,
    width: bounds.width,
    height: bounds.height,
  };
}

function elementDetails(element: Element, includeStyles: boolean) {
  const details: Record<string, unknown> = {
    selector: element.matches(".analytics-page, .chart-scroll, .chart-canvas")
      ? `.${Array.from(element.classList).join(".")}`
      : `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.classList.length ? `.${Array.from(element.classList).join(".")}` : ""}`,
    rect: rect(element),
    scrollWidth: (element as HTMLElement).scrollWidth,
    clientWidth: (element as HTMLElement).clientWidth,
    scrollLeft: (element as HTMLElement).scrollLeft,
  };
  if (includeStyles) {
    const style = getComputedStyle(element);
    details.styles = {
      position: style.position,
      display: style.display,
      width: style.width,
      minWidth: style.minWidth,
      maxWidth: style.maxWidth,
      overflowX: style.overflowX,
      transform: style.transform,
      contain: style.contain,
    };
  }
  return details;
}

function collect(
  source: string,
  detailed: boolean,
  scanOffenders: boolean,
  touch?: unknown,
): DiagnosticSample {
  const root = document.documentElement;
  const visual = window.visualViewport;
  const layoutWidth = root.clientWidth;
  const anomaly =
    root.scrollWidth > layoutWidth + 1 ||
    document.body.scrollWidth > layoutWidth + 1 ||
    Math.abs(window.scrollX) > 1;
  const elements = IMPORTANT_SELECTORS.flatMap((selector) =>
    Array.from(document.querySelectorAll(selector)),
  );
  const chartScroll = Array.from(
    document.querySelectorAll<HTMLElement>(".chart-scroll"),
  );
  const sample: DiagnosticSample = {
    t: performance.now(),
    source,
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      documentClientWidth: root.clientWidth,
      documentScrollWidth: root.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      visualViewport: visual
        ? {
            width: visual.width,
            height: visual.height,
            offsetLeft: visual.offsetLeft,
            offsetTop: visual.offsetTop,
            pageLeft: visual.pageLeft,
            pageTop: visual.pageTop,
            scale: visual.scale,
          }
        : null,
      screenOrientation: screen.orientation
        ? {
            type: screen.orientation.type,
            angle: screen.orientation.angle,
          }
        : null,
      portraitMediaQuery: matchMedia("(orientation: portrait)").matches,
      devicePixelRatio: window.devicePixelRatio,
    },
    elements: elements.map((element) => elementDetails(element, detailed)),
    chartScroll: chartScroll.map((element) => ({
      selector: `.${Array.from(element.classList).join(".")}`,
      scrollLeft: element.scrollLeft,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      rect: rect(element),
    })),
    anomaly,
  };
  if (touch) sample.touch = touch;

  if (anomaly && scanOffenders) {
    sample.offenders = Array.from(document.querySelectorAll("body *"))
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        if (bounds.right <= layoutWidth + 1 && bounds.left >= -1) return null;
        let scrollContainer: Element | null = element.parentElement;
        while (
          scrollContainer &&
          !["auto", "scroll"].includes(
            getComputedStyle(scrollContainer).overflowX,
          )
        ) {
          scrollContainer = scrollContainer.parentElement;
        }
        return {
          ...elementDetails(element, true),
          containedByScrollableAncestor: scrollContainer
            ? (elementDetails(scrollContainer, true) as { selector: string })
                .selector
            : null,
        };
      })
      .filter(Boolean)
      .slice(0, 35);
  }
  return sample;
}

export default function LayoutDiagnostics() {
  const capture = useRef(new LayoutCapture<DiagnosticSample>()).current;
  const raf = useRef<number | null>(null);
  const captureUntil = useRef(0);
  const touchTracker = useRef(new TouchTracker()).current;
  const lastTouchSampleAt = useRef(0);
  const capturing = useRef(true);
  const [active, setActive] = useState(true);
  const [, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  const anomalous = capture.incidents.length > 0;
  const latest = capture.samples[capture.samples.length - 1];
  const currentViewport = latest?.viewport as
    | {
        documentScrollWidth: number;
        documentClientWidth: number;
        scrollX: number;
      }
    | undefined;

  const record = useCallback(
    (source: string, touch?: unknown) => {
      if (!capturing.current) return;
      const sample = collect(
        source,
        [
          "capture-start",
          "resize",
          "orientationchange",
          "visualViewport.resize",
          "touchstart",
          "touchend",
        ].includes(source),
        !capture.hasOpenIncident(),
        touch,
      );
      capture.append(sample);
      if (sample.anomaly) {
        captureUntil.current = Math.max(
          captureUntil.current,
          performance.now() + ANOMALY_CAPTURE_MS,
        );
      }
    },
    [capture],
  );

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(
      () => setRevision((value) => value + 1),
      PANEL_REFRESH_MS,
    );
    return () => window.clearInterval(interval);
  }, [active]);

  const scheduleFrames = useCallback(
    (duration = ORIENTATION_CAPTURE_MS) => {
      if (!capturing.current) return;
      captureUntil.current = Math.max(
        captureUntil.current,
        performance.now() + duration,
      );
      if (raf.current !== null) return;
      const frame = () => {
        if (!capturing.current) {
          raf.current = null;
          return;
        }
        record("orientation-rAF");
        if (performance.now() < captureUntil.current) {
          raf.current = requestAnimationFrame(frame);
        } else {
          raf.current = null;
        }
      };
      raf.current = requestAnimationFrame(frame);
    },
    [record],
  );

  useEffect(() => {
    const onOrientation = () => {
      record("orientationchange");
      scheduleFrames();
    };
    const onResize = () => {
      record("resize");
      scheduleFrames();
    };
    const onVisualResize = () => {
      record("visualViewport.resize");
      scheduleFrames();
    };
    const onVisualScroll = () => record("visualViewport.scroll");
    const onScroll = (event: Event) => {
      const target = event.target;
      const chart =
        target instanceof Element
          ? target.closest<HTMLElement>(".chart-scroll")
          : null;
      record(chart ? `chart-scroll:${chart.scrollLeft}` : "scroll");
    };
    const onTouch = (event: TouchEvent) => {
      if (
        event.type === "touchmove" &&
        performance.now() - lastTouchSampleAt.current < TOUCH_MOVE_SAMPLE_MS
      ) {
        return;
      }
      if (event.type === "touchmove") {
        lastTouchSampleAt.current = performance.now();
      }
      const touches = Array.from(event.changedTouches, (touch) =>
        touchTracker.track(event.type, touch),
      );
      record(event.type, touches);
      if (event.type === "touchstart" || event.type === "touchmove") {
        scheduleFrames(600);
      }
    };
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onOrientation, {
      passive: true,
    });
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchend", onTouch, { passive: true });
    window.addEventListener("touchcancel", onTouch, { passive: true });
    window.visualViewport?.addEventListener("resize", onVisualResize, {
      passive: true,
    });
    window.visualViewport?.addEventListener("scroll", onVisualScroll, {
      passive: true,
    });
    record("capture-start");
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend", onTouch);
      window.removeEventListener("touchcancel", onTouch);
      window.visualViewport?.removeEventListener("resize", onVisualResize);
      window.visualViewport?.removeEventListener("scroll", onVisualScroll);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [record, scheduleFrames]);

  function toggleCapture() {
    capturing.current = !capturing.current;
    setActive(capturing.current);
    if (capturing.current) record("capture-resume");
    else if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    setRevision((value) => value + 1);
  }

  function clear() {
    capture.clear();
    setMessage("");
    record("capture-cleared");
    setRevision((value) => value + 1);
  }

  async function exportJson() {
    const json = JSON.stringify(
      {
        format: "hopstats-layout-diagnostics-v1",
        exportedAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        samples: capture.samples,
        incidents: capture.incidents,
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(json);
      setMessage("Copied JSON");
    } catch {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(
        new Blob([json], { type: "application/json" }),
      );
      link.download = `hopstats-layout-${new Date().toISOString().replaceAll(":", "-")}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      setMessage("JSON downloaded");
    }
  }

  return (
    <aside className="layout-diagnostics" aria-label="Layout diagnostics">
      <div className="layout-diagnostics-heading">
        <strong>Layout debug</strong>
        <span className={anomalous ? "has-anomaly" : ""}>
          {anomalous ? "OVERFLOW CAPTURED" : "No overflow captured"}
        </span>
      </div>
      <output>
        doc{" "}
        {currentViewport?.documentScrollWidth ??
          document.documentElement.scrollWidth}
        /
        {currentViewport?.documentClientWidth ??
          document.documentElement.clientWidth}{" "}
        · x {currentViewport?.scrollX ?? window.scrollX} ·{" "}
        {capture.samples.length} samples · {capture.incidents.length} incidents
      </output>
      <div className="layout-diagnostics-buttons">
        <button type="button" onClick={toggleCapture}>
          {active ? "Pause" : "Start"} capture
        </button>
        <button type="button" onClick={clear}>
          Clear
        </button>
        <button type="button" onClick={exportJson}>
          Copy / export JSON
        </button>
      </div>
      {message && <small role="status">{message}</small>}
      {anomalous && (
        <details>
          <summary>Suspected overflow elements</summary>
          <ul>
            {(
              (capture.incidents[capture.incidents.length - 1]?.samples
                .slice()
                .reverse()
                .find((sample) => sample.anomaly && sample.offenders)
                ?.offenders ?? []) as Array<{
                selector?: string;
                rect?: { left: number; right: number; width: number };
                containedByScrollableAncestor?: string | null;
              }>
            )
              .slice(0, 8)
              .map((offender, index) => (
                <li key={`${offender.selector}-${index}`}>
                  {offender.selector}: {offender.rect?.left.toFixed(1)}–
                  {offender.rect?.right.toFixed(1)} (
                  {offender.rect?.width.toFixed(1)}px)
                  {offender.containedByScrollableAncestor
                    ? ` · within ${offender.containedByScrollableAncestor}`
                    : " · root candidate"}
                </li>
              ))}
          </ul>
        </details>
      )}
    </aside>
  );
}
