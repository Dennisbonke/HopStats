import { useCallback, useEffect, useRef, useState } from "react";

const CAPACITY = 600;
const ORIENTATION_CAPTURE_MS = 2800;
const IMPORTANT_SELECTORS = [
  ".analytics-page",
  ".chart-scroll",
  ".chart-canvas",
  ".recharts-responsive-container",
  ".recharts-wrapper",
  ".recharts-surface",
  ".recharts-tooltip-wrapper",
];

type DiagnosticSample = Record<string, unknown> & {
  t: number;
  source: string;
  anomaly?: boolean;
  offenders?: unknown[];
};

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

function elementDetails(element: Element) {
  const style = getComputedStyle(element);
  return {
    selector: element.matches(".analytics-page, .chart-scroll, .chart-canvas")
      ? `.${Array.from(element.classList).join(".")}`
      : `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.classList.length ? `.${Array.from(element.classList).join(".")}` : ""}`,
    rect: rect(element),
    scrollWidth: (element as HTMLElement).scrollWidth,
    clientWidth: (element as HTMLElement).clientWidth,
    scrollLeft: (element as HTMLElement).scrollLeft,
    styles: {
      position: style.position,
      display: style.display,
      width: style.width,
      minWidth: style.minWidth,
      maxWidth: style.maxWidth,
      overflowX: style.overflowX,
      transform: style.transform,
      contain: style.contain,
    },
  };
}

function collect(source: string): DiagnosticSample {
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
    elements: elements.map(elementDetails),
    chartScroll: chartScroll.map((element) => ({
      selector: `.${Array.from(element.classList).join(".")}`,
      scrollLeft: element.scrollLeft,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      rect: rect(element),
    })),
    anomaly,
  };

  if (anomaly) {
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
          ...elementDetails(element),
          containedByScrollableAncestor: scrollContainer
            ? elementDetails(scrollContainer).selector
            : null,
        };
      })
      .filter(Boolean)
      .slice(0, 35);
  }
  return sample;
}

export default function LayoutDiagnostics() {
  const samples = useRef<DiagnosticSample[]>([]);
  const raf = useRef<number | null>(null);
  const captureUntil = useRef(0);
  const lastTouch = useRef(new Map<number, { x: number; y: number }>());
  const capturing = useRef(true);
  const [active, setActive] = useState(true);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  const anomalous = samples.current.some((sample) => sample.anomaly);
  const latest = samples.current[samples.current.length - 1];
  const currentViewport = latest?.viewport as
    | {
        documentScrollWidth: number;
        documentClientWidth: number;
        scrollX: number;
      }
    | undefined;

  const record = useCallback((source: string) => {
    if (!capturing.current) return;
    const sample = collect(source);
    samples.current.push(sample);
    if (samples.current.length > CAPACITY) samples.current.shift();
    setRevision((value) => value + 1);
  }, []);

  const scheduleFrames = useCallback(() => {
    captureUntil.current = performance.now() + ORIENTATION_CAPTURE_MS;
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
  }, [record]);

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
      const touches = Array.from(event.changedTouches).map((touch) => {
        const previous = lastTouch.current.get(touch.identifier);
        const dx = previous ? touch.clientX - previous.x : 0;
        const dy = previous ? touch.clientY - previous.y : 0;
        lastTouch.current.set(touch.identifier, {
          x: touch.clientX,
          y: touch.clientY,
        });
        if (event.type === "touchend" || event.type === "touchcancel") {
          lastTouch.current.delete(touch.identifier);
        }
        return {
          x: touch.clientX,
          y: touch.clientY,
          pageX: touch.pageX,
          pageY: touch.pageY,
          dx,
          dy,
          direction:
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
                  : "stationary",
        };
      });
      record(`${event.type}:before`);
      const prior = samples.current[samples.current.length - 1];
      if (prior) prior.touch = touches;
      record(`${event.type}:after`);
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
    samples.current = [];
    setMessage("");
    record("capture-cleared");
  }

  async function exportJson() {
    const json = JSON.stringify(
      {
        format: "hopstats-layout-diagnostics-v1",
        exportedAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        samples: samples.current,
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
    <aside
      className="layout-diagnostics"
      aria-label="Layout diagnostics"
      data-revision={revision}
    >
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
        {samples.current.length} samples
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
              (samples.current
                .slice()
                .reverse()
                .find((sample) => sample.anomaly)?.offenders ?? []) as Array<{
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
