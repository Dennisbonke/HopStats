import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  ACTIVITY_BANDS,
  activityLevel,
  activityValue,
  calendarMonthLabels,
  calendarWeeks,
  isFutureDate,
  shiftCalendarDate,
} from "../utils/calendar";
import type {
  ActivityMetric,
  CalendarWeekStart,
  DailyActivity,
  ReportingRange,
} from "../utils/calendar";

type Props = {
  year: number;
  reportingRange: ReportingRange;
  daily: DailyActivity[];
  metric: ActivityMetric;
  weekStart?: CalendarWeekStart;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const METRIC_LABELS: Record<ActivityMetric, string> = {
  total: "All check-ins",
  discoveries: "New discoveries",
  repeats: "Repeat check-ins",
};

function localToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function weekdayIndex(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export default function CalendarHeatmap({
  year,
  reportingRange,
  daily,
  metric,
  weekStart = 0,
}: Props) {
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const weeks = useMemo(
    () => calendarWeeks(year, weekStart),
    [year, weekStart],
  );
  const months = useMemo(
    () => calendarMonthLabels(year, weekStart),
    [year, weekStart],
  );
  const activityByDate = useMemo(
    () => new Map(daily.map((item) => [item.date, item])),
    [daily],
  );
  const availableDates = useMemo(
    () =>
      weeks
        .flat()
        .filter(
          (date): date is string =>
            date !== null &&
            date >= reportingRange.start &&
            date <= reportingRange.end,
        ),
    [weeks, reportingRange.start, reportingRange.end],
  );
  const availableDateSet = useMemo(
    () => new Set(availableDates),
    [availableDates],
  );
  const tabStopDate =
    focusedDate && availableDateSet.has(focusedDate)
      ? focusedDate
      : (availableDates[0] ?? null);
  const today = localToday();
  const isYearEmpty = daily.every((item) => item.total === 0);
  const monthFormatter = new Intl.DateTimeFormat("en", {
    month: "short",
    timeZone: "UTC",
  });
  const rotatedWeekdays = Array.from(
    { length: 7 },
    (_, index) => WEEKDAY_LABELS[(weekStart + index) % 7],
  );
  const selectedDate =
    activeDate && availableDateSet.has(activeDate) ? activeDate : null;
  const activeActivity = selectedDate
    ? (activityByDate.get(selectedDate) ?? {
        date: selectedDate,
        total: 0,
        discoveries: 0,
        repeats: 0,
      })
    : null;

  useEffect(() => {
    setFocusedDate(null);
    setActiveDate(null);
  }, [year, reportingRange.start, reportingRange.end]);

  function focusDate(date: string) {
    setFocusedDate(date);
    setActiveDate(date);
    document.getElementById(`calendar-day-${date}`)?.focus();
  }

  function handleDayKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    date: string,
  ) {
    const dayOffset = (weekdayIndex(date) - weekStart + 7) % 7;
    let offset: number | null = null;
    if (event.key === "ArrowRight") offset = 7;
    if (event.key === "ArrowLeft") offset = -7;
    if (event.key === "ArrowDown") offset = 1;
    if (event.key === "ArrowUp") offset = -1;
    if (event.key === "Home") offset = -dayOffset;
    if (event.key === "End") offset = 6 - dayOffset;
    if (offset === null) return;

    event.preventDefault();
    let next = shiftCalendarDate(date, offset);
    const direction = Math.sign(offset || 1);
    for (let attempts = 0; attempts < 370; attempts++) {
      if (!next.startsWith(`${year}-`)) return;
      if (availableDateSet.has(next)) {
        focusDate(next);
        return;
      }
      next = shiftCalendarDate(next, direction);
    }
  }

  return (
    <section
      className="calendar-heatmap"
      aria-label={`${year} daily check-in activity`}
    >
      {isYearEmpty && (
        <p className="analytics-state" role="status">
          No check-ins in {year} for the selected reporting period. The calendar
          shows zero activity only on dates inside that period.
        </p>
      )}

      <div
        className="calendar-scroll"
        aria-label="Scrollable yearly activity calendar"
      >
        <div className="calendar-inner">
          <div
            className="calendar-months"
            style={{
              gridTemplateColumns: `2.6rem repeat(${weeks.length}, var(--calendar-cell-size))`,
            }}
            aria-hidden="true"
          >
            <span />
            {months.map(({ month, week }) => (
              <span
                className="calendar-month-label"
                key={month}
                style={{ gridColumn: week + 2 }}
              >
                {monthFormatter.format(new Date(Date.UTC(year, month, 1)))}
              </span>
            ))}
          </div>

          <div
            className="calendar-grid"
            role="grid"
            aria-label={`${year} daily activity, ${rotatedWeekdays[0]} first`}
            aria-rowcount={7}
            aria-colcount={weeks.length + 1}
          >
            {rotatedWeekdays.map((label, rowIndex) => (
              <div
                className="calendar-row"
                role="row"
                key={label}
                style={{
                  gridTemplateColumns: `2.6rem repeat(${weeks.length}, var(--calendar-cell-size))`,
                }}
              >
                <span className="calendar-weekday" role="rowheader">
                  {label}
                </span>
                {weeks.map((week, weekIndex) => {
                  const date = week[rowIndex];
                  if (!date) {
                    return (
                      <span
                        className="calendar-alignment-cell"
                        role="gridcell"
                        aria-hidden="true"
                        key={`${weekIndex}-alignment`}
                      />
                    );
                  }
                  const inPeriod =
                    date >= reportingRange.start && date <= reportingRange.end;
                  if (!inPeriod) {
                    return (
                      <span
                        className="calendar-day calendar-unavailable"
                        role="gridcell"
                        aria-label={`${formatDate(date)}: outside the reporting period`}
                        key={date}
                      />
                    );
                  }
                  const activity = activityByDate.get(date) ?? {
                    date,
                    total: 0,
                    discoveries: 0,
                    repeats: 0,
                  };
                  const selectedValue = activityValue(activity, metric);
                  const future = isFutureDate(date, today);
                  const accessibleLabel = `${formatDate(date)}: ${activity.total} check-ins, ${activity.discoveries} discoveries, ${activity.repeats} repeats${future ? ", future date" : ""}`;
                  return (
                    <button
                      id={`calendar-day-${date}`}
                      className={`calendar-day calendar-level-${activityLevel(selectedValue)}${future ? " calendar-future" : ""}${selectedDate === date ? " calendar-day-active" : ""}`}
                      type="button"
                      role="gridcell"
                      key={date}
                      tabIndex={date === tabStopDate ? 0 : -1}
                      aria-label={accessibleLabel}
                      aria-selected={selectedDate === date}
                      title={accessibleLabel}
                      data-calendar-date={date}
                      onPointerEnter={() => setActiveDate(date)}
                      onFocus={() => {
                        setFocusedDate(date);
                        setActiveDate(date);
                      }}
                      onClick={() => setActiveDate(date)}
                      onKeyDown={(event) => handleDayKeyDown(event, date)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="calendar-legend" aria-label="Activity intensity levels">
        <span>Daily {METRIC_LABELS[metric].toLowerCase()}</span>
        {ACTIVITY_BANDS.map(({ level, label }) => (
          <span className="calendar-legend-item" key={level}>
            <i
              className={`calendar-day calendar-level-${level}`}
              aria-hidden="true"
            />
            <span>{label}</span>
          </span>
        ))}
        <span className="calendar-legend-item">
          <i className="calendar-day calendar-unavailable" aria-hidden="true" />
          <span>Outside period</span>
        </span>
        <span className="calendar-legend-item">
          <i
            className="calendar-day calendar-level-0 calendar-future"
            aria-hidden="true"
          />
          <span>Future date</span>
        </span>
      </div>

      <section
        className="calendar-day-details"
        aria-live="polite"
        aria-atomic="true"
      >
        {activeActivity ? (
          <>
            <h3>{formatDate(activeActivity.date)}</h3>
            <dl>
              <div>
                <dt>All check-ins</dt>
                <dd>{activeActivity.total}</dd>
              </div>
              <div>
                <dt>New discoveries</dt>
                <dd>{activeActivity.discoveries}</dd>
              </div>
              <div>
                <dt>Repeat check-ins</dt>
                <dd>{activeActivity.repeats}</dd>
              </div>
              <div>
                <dt>Selected metric · {METRIC_LABELS[metric]}</dt>
                <dd>{activityValue(activeActivity, metric)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p>
            Focus, hover over, or select a date to see its check-in details.
          </p>
        )}
      </section>
    </section>
  );
}
