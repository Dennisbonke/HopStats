import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  createMilestone,
  Milestone,
  MilestoneGoalType,
  MilestoneInput,
  updateMilestone,
} from "../api/milestones";

type FormValues = {
  name: string;
  metric: "discoveries" | "checkins";
  goalType: MilestoneGoalType;
  target: string;
  calendarYear: string;
  startDate: string;
  deadlineDate: string;
  timezone: string;
};

function valuesFrom(milestone?: Milestone): FormValues {
  return {
    name: milestone?.name ?? "",
    metric: milestone?.metric === "checkins" ? "checkins" : "discoveries",
    goalType: milestone?.goal_type ?? "absolute",
    target: milestone ? String(milestone.target) : "",
    calendarYear: milestone?.calendar_year
      ? String(milestone.calendar_year)
      : "",
    startDate: milestone?.start_date ?? "",
    deadlineDate: milestone?.deadline_date ?? "",
    timezone: milestone?.timezone ?? "Europe/Amsterdam",
  };
}

function explanation(values: FormValues): string {
  if (values.metric === "checkins") {
    return "Every check-in counts, including repeat check-ins for the same beer.";
  }
  if (values.goalType === "absolute") {
    return "Counts all first-ever beer discoveries across your imported history.";
  }
  if (values.goalType === "calendar_year") {
    return `Counts beers first discovered during ${values.calendarYear || "the selected year"}. Earlier discoveries and repeats do not count.`;
  }
  return `Counts beers first discovered on or after ${values.startDate || "the selected local start date"}. Earlier discoveries and repeats do not count.`;
}

export default function MilestoneFormDialog({
  milestone,
  onClose,
  onSaved,
}: {
  milestone?: Milestone;
  onClose: () => void;
  onSaved: (milestone: Milestone) => void;
}) {
  const [values, setValues] = useState(() => valuesFrom(milestone));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [metricTouched, setMetricTouched] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const savingRef = useRef(saving);
  closeRef.current = onClose;
  savingRef.current = saving;

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    nameRef.current?.focus();
    function keydown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !savingRef.current) closeRef.current();
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previousFocus.current?.focus();
    };
  }, []);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function changeGoalType(goalType: MilestoneGoalType) {
    setValues((current) => ({
      ...current,
      goalType,
      calendarYear: goalType === "calendar_year" ? current.calendarYear : "",
      startDate: goalType === "incremental" ? current.startDate : "",
    }));
  }

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = Number(values.target);
    if (!Number.isInteger(target) || target <= 0) {
      setTargetError("Enter a positive whole-number target.");
      return;
    }
    setTargetError(null);
    setSaving(true);
    setError(null);
    const input: MilestoneInput = {
      name: values.name.trim(),
      // Keep legacy unique_beers unchanged unless an editor explicitly changes it.
      metric:
        milestone?.metric === "unique_beers" && !metricTouched
          ? "unique_beers"
          : values.metric,
      goal_type: values.goalType,
      target,
      calendar_year:
        values.goalType === "calendar_year"
          ? Number(values.calendarYear)
          : null,
      start_date: values.goalType === "incremental" ? values.startDate : null,
      deadline_date: values.deadlineDate || null,
      timezone: values.timezone,
    };
    try {
      const saved = milestone
        ? await updateMilestone(milestone.id, input)
        : await createMilestone(input);
      onSaved(saved);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save this milestone. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="milestone-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="milestone-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="milestone-form-title"
        ref={dialogRef}
        onKeyDown={trapFocus}
      >
        <div className="milestone-dialog-heading">
          <h2 id="milestone-form-title">
            {milestone ? "Edit milestone" : "Create milestone"}
          </h2>
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close milestone form"
          >
            Close
          </button>
        </div>
        <form className="milestone-form" onSubmit={submit}>
          <label>
            Name
            <input
              ref={nameRef}
              required
              maxLength={150}
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            Metric
            <select
              value={values.metric}
              onChange={(event) => {
                setMetricTouched(true);
                update("metric", event.target.value as FormValues["metric"]);
              }}
            >
              <option value="discoveries">Unique beer discoveries</option>
              <option value="checkins">Total check-ins</option>
            </select>
          </label>
          <p className="milestone-form-explanation" aria-live="polite">
            {explanation(values)}
          </p>
          <label>
            Goal type
            <select
              value={values.goalType}
              onChange={(event) =>
                changeGoalType(event.target.value as MilestoneGoalType)
              }
            >
              <option value="absolute">Lifetime</option>
              <option value="calendar_year">Calendar year</option>
              <option value="incremental">From a start date</option>
            </select>
          </label>
          {values.goalType === "calendar_year" && (
            <label>
              Calendar year
              <input
                type="number"
                min="1"
                max="9999"
                step="1"
                required
                value={values.calendarYear}
                onChange={(event) => update("calendarYear", event.target.value)}
              />
            </label>
          )}
          {values.goalType === "incremental" && (
            <label>
              Start date
              <input
                type="date"
                required
                value={values.startDate}
                onChange={(event) => update("startDate", event.target.value)}
              />
            </label>
          )}
          <label>
            Positive integer target
            <input
              type="number"
              min="1"
              step="1"
              required
              value={values.target}
              aria-invalid={Boolean(targetError)}
              aria-describedby={
                targetError ? "milestone-target-error" : undefined
              }
              onChange={(event) => {
                update("target", event.target.value);
                setTargetError(null);
              }}
            />
            {targetError && (
              <span
                id="milestone-target-error"
                className="milestone-field-error"
              >
                {targetError}
              </span>
            )}
          </label>
          <label>
            Optional deadline
            <input
              type="date"
              value={values.deadlineDate}
              onChange={(event) => update("deadlineDate", event.target.value)}
            />
            <span className="muted">
              The complete local deadline day counts. Progress can continue
              after it.
            </span>
          </label>
          <p className="muted milestone-timezone">
            Dates and check-ins use {values.timezone} local time.
          </p>
          {error && (
            <p className="error-state" role="alert">
              {error}
            </p>
          )}
          <div className="milestone-dialog-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving}>
              {saving
                ? "Saving…"
                : milestone
                  ? "Save changes"
                  : "Create milestone"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
