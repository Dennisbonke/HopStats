import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ActivityMetric } from "../utils/calendar";
import type { DrinkingTrends } from "../api/analytics";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const METRIC_LABELS: Record<ActivityMetric, string> = {
  total: "All check-ins",
  discoveries: "New discoveries",
  repeats: "Repeat check-ins",
};

type Cell = {
  weekday: number;
  hour: number;
  count: number;
  denominator: number;
  average: number | null;
  value: number | null;
  level: number;
};

export type HeatmapBand = { level: number; minimum: number; maximum: number };

export function heatmapBands(values: number[]): HeatmapBand[] {
  const positives = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (!positives.length) return [];
  const cutoffs = [0.25, 0.5, 0.75]
    .map((quantile) => positives[Math.ceil(positives.length * quantile) - 1])
    .filter(
      (value, index, all) =>
        value < positives.at(-1)! && all.indexOf(value) === index,
    );
  const levels = positives.map(
    (value) => 1 + cutoffs.filter((cutoff) => value > cutoff).length,
  );
  return Array.from(new Set(levels)).map((level) => {
    const inBand = positives.filter(
      (value) =>
        1 + cutoffs.filter((cutoff) => value > cutoff).length === level,
    );
    return {
      level,
      minimum: Math.min(...inBand),
      maximum: Math.max(...inBand),
    };
  });
}

export function buildHeatmapCells(
  trends: DrinkingTrends,
  metric: ActivityMetric,
  mode: "total" | "average",
): Cell[] {
  const denominatorByDay = new Map(
    trends.weekday.map((item) => [item.weekday, item.days_in_period]),
  );
  const aggregates = new Map(
    trends.weekday_hour.map((item) => [`${item.weekday}-${item.hour}`, item]),
  );
  const values = Array.from({ length: 7 * 24 }, (_, index) => {
    const weekday = Math.floor(index / 24);
    const hour = index % 24;
    const count = aggregates.get(`${weekday}-${hour}`)?.[metric] ?? 0;
    const denominator = denominatorByDay.get(weekday) ?? 0;
    const average = denominator > 0 ? count / denominator : null;
    return {
      weekday,
      hour,
      count,
      denominator,
      average,
      value: mode === "total" ? count : average,
    };
  });
  const bands = heatmapBands(values.map((cell) => cell.value ?? 0));
  return values.map((cell) => ({
    ...cell,
    level:
      cell.value === null || cell.value === 0
        ? 0
        : (bands.find(
            (band) =>
              cell.value! >= band.minimum && cell.value! <= band.maximum,
          )?.level ??
          bands.at(-1)?.level ??
          0),
  }));
}

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00–${String(hour).padStart(2, "0")}:59`;
}

function numberLabel(value: number | null) {
  return value === null ? "unavailable" : value.toFixed(2);
}

export function formatHeatmapBands(
  bands: HeatmapBand[],
  mode: "total" | "average",
): Array<HeatmapBand & { label: string }> {
  if (mode === "total") {
    const format = (value: number) =>
      new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        value,
      );
    return bands.map((band) => ({
      ...band,
      label:
        band.minimum === band.maximum
          ? format(band.minimum)
          : `${format(band.minimum)}–${format(band.maximum)}`,
    }));
  }

  const endpoints = Array.from(
    new Set(bands.flatMap((band) => [band.minimum, band.maximum])),
  ).sort((a, b) => a - b);
  let digits = 2;
  const formatFixed = (value: number, fractionDigits: number) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  while (
    digits < 12 &&
    (endpoints.some(
      (value, index) =>
        index > 0 &&
        formatFixed(value, digits) ===
          formatFixed(endpoints[index - 1], digits),
    ) ||
      endpoints.some(
        (value) => value !== 0 && Number(formatFixed(value, digits)) === 0,
      ))
  ) {
    digits++;
  }
  const format = (value: number) =>
    digits === 12 && value !== 0 && Number(formatFixed(value, digits)) === 0
      ? value.toExponential(4)
      : formatFixed(value, digits);
  return bands.map((band) => ({
    ...band,
    label:
      band.minimum === band.maximum
        ? format(band.minimum)
        : `${format(band.minimum)}–${format(band.maximum)}`,
  }));
}

export default function WeekdayHourHeatmap({
  trends,
  metric,
  mode,
  reportingPeriod,
}: {
  trends: DrinkingTrends;
  metric: ActivityMetric;
  mode: "total" | "average";
  reportingPeriod: string;
}) {
  const cells = useMemo(
    () => buildHeatmapCells(trends, metric, mode),
    [trends, metric, mode],
  );
  const bands = useMemo(
    () => heatmapBands(cells.map((cell) => cell.value ?? 0)),
    [cells],
  );
  const [focused, setFocused] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [previewed, setPreviewed] = useState<number | null>(null);
  const previewSource = useRef<"pointer" | "keyboard" | null>(null);
  const lastPointerPosition = useRef<{ x: number; y: number } | null>(null);
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const modeLabel = mode === "total" ? "Total" : "Average per weekday";
  const selectedCell =
    previewed !== null
      ? cells[previewed]
      : selected === null
        ? null
        : cells[selected];
  const legendBands = useMemo(
    () => formatHeatmapBands(bands, mode),
    [bands, mode],
  );
  const hasActivity = cells.some((cell) => cell.count > 0);

  function moveFocus(index: number) {
    const next = Math.min(cells.length - 1, Math.max(0, index));
    setFocused(next);
    cellRefs.current[next]?.focus();
  }

  function onCellKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    previewSource.current = "keyboard";
    setPreviewed(index);
    const weekday = Math.floor(index / 24);
    const hour = index % 24;
    let next: number | null = null;
    if (event.key === "ArrowLeft" && hour > 0) next = index - 1;
    if (event.key === "ArrowRight" && hour < 23) next = index + 1;
    if (event.key === "ArrowUp" && weekday > 0) next = index - 24;
    if (event.key === "ArrowDown" && weekday < 6) next = index + 24;
    if (event.key === "Home") next = weekday * 24;
    if (event.key === "End") next = weekday * 24 + 23;
    if (next !== null) {
      event.preventDefault();
      moveFocus(next);
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelected(index);
      setPreviewed(null);
      previewSource.current = null;
    }
  }

  return (
    <section
      className="weekday-hour-heatmap"
      aria-labelledby="weekday-hour-title"
    >
      <header>
        <h3 id="weekday-hour-title">Check-in Activity by Weekday and Hour</h3>
        <p id="weekday-hour-instructions">
          {reportingPeriod} · Europe/Amsterdam · {METRIC_LABELS[metric]} ·{" "}
          {modeLabel}. Use arrow keys to move; left/right stay within a weekday,
          up/down stay within the hour column. Home and End move to the first or
          last hour.
        </p>
      </header>
      <div
        className="weekday-hour-scroll"
        role="grid"
        aria-label={`Check-in Activity by Weekday and Hour, ${reportingPeriod}`}
        aria-describedby="weekday-hour-instructions"
        aria-rowcount={8}
        aria-colcount={25}
        onBlur={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            if (previewSource.current === "keyboard") {
              previewSource.current = null;
              setPreviewed(null);
            }
          }
        }}
      >
        <div className="weekday-hour-row weekday-hour-axis" role="row">
          <span className="weekday-hour-day-heading" role="columnheader">
            Weekday
          </span>
          {Array.from({ length: 24 }, (_, hour) => (
            <span className="weekday-hour-label" role="columnheader" key={hour}>
              {hour % 2 === 0 ? `${String(hour).padStart(2, "0")}:00` : ""}
            </span>
          ))}
        </div>
        {DAYS.map((day, weekday) => (
          <div className="weekday-hour-row" role="row" key={day}>
            <span className="weekday-hour-day" role="rowheader">
              {day}
            </span>
            {cells.slice(weekday * 24, (weekday + 1) * 24).map((cell) => {
              const index = weekday * 24 + cell.hour;
              const isSelected = selected === index;
              const isPreviewed = previewed === index;
              const averageText = numberLabel(cell.average);
              const valueText =
                mode === "total" ? `${cell.count}` : averageText;
              const accessibleName = `${day}, ${hourLabel(cell.hour)}, ${cell.count} ${METRIC_LABELS[metric].toLowerCase()}, ${cell.denominator} ${day} occurrences, average ${averageText}${cell.denominator === 0 ? ", average unavailable because this weekday does not occur in the reporting period" : ""}`;
              return (
                <button
                  key={cell.hour}
                  ref={(element) => {
                    cellRefs.current[index] = element;
                  }}
                  type="button"
                  role="gridcell"
                  className={`weekday-hour-cell heat-level-${cell.level}${isPreviewed ? " is-previewed" : ""}${isSelected ? " is-selected" : ""}`}
                  aria-label={accessibleName}
                  aria-selected={isSelected}
                  aria-describedby="weekday-hour-instructions"
                  title={accessibleName}
                  tabIndex={focused === index ? 0 : -1}
                  onPointerDown={() => {
                    previewSource.current = "pointer";
                    setPreviewed(index);
                  }}
                  onPointerMove={(event) => {
                    if (event.pointerType !== "mouse") return;
                    const position = { x: event.clientX, y: event.clientY };
                    const moved =
                      lastPointerPosition.current?.x !== position.x ||
                      lastPointerPosition.current?.y !== position.y;
                    lastPointerPosition.current = position;
                    // Ignore stationary-pointer hover updates while keyboard
                    // navigation owns the preview (notably after Safari layout).
                    if (previewSource.current === "keyboard" && !moved) return;
                    previewSource.current = "pointer";
                    setPreviewed(index);
                  }}
                  onPointerEnter={() => {
                    if (previewSource.current !== "keyboard") {
                      previewSource.current = "pointer";
                      setPreviewed(index);
                    }
                  }}
                  onPointerLeave={() => {
                    if (previewSource.current === "pointer") {
                      previewSource.current = null;
                      setPreviewed(null);
                    }
                  }}
                  onFocus={() => {
                    setFocused(index);
                    previewSource.current = "keyboard";
                    setPreviewed(index);
                  }}
                  onClick={() => {
                    setSelected(index);
                    setPreviewed(null);
                    previewSource.current = null;
                  }}
                  onKeyDown={(event) => onCellKeyDown(event, index)}
                  data-heat-level={cell.level}
                  data-value={valueText}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div
        className="weekday-hour-legend"
        aria-label="Heatmap intensity legend"
      >
        <span>
          Intensity · {mode === "total" ? "check-ins" : "average per weekday"}
        </span>
        <span className="weekday-hour-legend-item">
          <i className="heat-level-0" />0
        </span>
        {legendBands.map((band) => (
          <span className="weekday-hour-legend-item" key={band.level}>
            <i className={`heat-level-${band.level}`} />
            {band.label}
          </span>
        ))}
      </div>
      {!hasActivity && (
        <p className="analytics-state" role="status">
          {metric === "total"
            ? "No check-ins"
            : `No ${METRIC_LABELS[metric].toLowerCase()}`}{" "}
          in this reporting period.
        </p>
      )}
      <section
        className="weekday-hour-details"
        aria-live="polite"
        aria-atomic="true"
      >
        {selectedCell ? (
          <>
            <h4>
              {DAYS[selectedCell.weekday]}, {hourLabel(selectedCell.hour)}
            </h4>
            <p className="weekday-hour-preview-state">
              {previewed === null
                ? "Selected cell"
                : previewSource.current === "pointer"
                  ? "Pointer preview"
                  : "Keyboard focus preview"}
            </p>
            <dl>
              <div>
                <dt>{METRIC_LABELS[metric]} (raw count)</dt>
                <dd>{selectedCell.count}</dd>
              </div>
              <div>
                <dt>Weekday occurrences</dt>
                <dd>{selectedCell.denominator}</dd>
              </div>
              <div>
                <dt>Average per {DAYS[selectedCell.weekday]}</dt>
                <dd>
                  {numberLabel(selectedCell.average)}
                  {selectedCell.average === null ? " (no occurrences)" : ""}
                </dd>
              </div>
              <div>
                <dt>Displayed {modeLabel.toLowerCase()}</dt>
                <dd>
                  {mode === "total"
                    ? selectedCell.count
                    : numberLabel(selectedCell.average)}
                </dd>
              </div>
              <div>
                <dt>Reporting period</dt>
                <dd>{reportingPeriod}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p>
            Focus and select a cell to inspect its check-in count and average.
          </p>
        )}
      </section>
      <details className="weekday-hour-data">
        <summary>Show all 168 heatmap values</summary>
        <table className="weekday-hour-table">
          <caption>
            {reportingPeriod} · {METRIC_LABELS[metric]} · {modeLabel} ·
            Europe/Amsterdam
          </caption>
          <thead>
            <tr>
              <th scope="col">Weekday</th>
              <th scope="col">Local hour</th>
              <th scope="col">{METRIC_LABELS[metric]} count</th>
              <th scope="col">Weekday occurrences</th>
              <th scope="col">Average per weekday</th>
              <th scope="col">Displayed value</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((cell) => (
              <tr key={`${cell.weekday}-${cell.hour}`}>
                <th scope="row">{DAYS[cell.weekday]}</th>
                <td>{hourLabel(cell.hour)}</td>
                <td>{cell.count}</td>
                <td>{cell.denominator}</td>
                <td>{numberLabel(cell.average)}</td>
                <td>
                  {mode === "total" ? cell.count : numberLabel(cell.average)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
