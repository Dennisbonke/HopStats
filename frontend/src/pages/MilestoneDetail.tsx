import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteMilestone,
  fetchMilestone,
  Milestone,
  MilestoneStatus,
  setMilestoneArchived,
} from "../api/milestones";
import MilestoneFormDialog from "../components/MilestoneFormDialog";
import { displayDate, goalLabel, metricLabel } from "./Milestones";

const statusLabels: Record<MilestoneStatus, string> = {
  scheduled: "Scheduled",
  active: "In progress",
  overdue: "Overdue",
  completed: "Completed",
  period_ended: "Period ended",
  archived: "Archived",
};

function timestamp(value: string, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function PaceValue({
  label,
  value,
  suffix = "",
  signed = false,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  signed?: boolean;
}) {
  if (value === null) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {signed && value > 0 ? "+" : ""}
        {value.toLocaleString()}
        {suffix}
      </dd>
    </div>
  );
}

export default function MilestoneDetail() {
  const { id: rawId } = useParams();
  const id = Number(rawId);
  const navigate = useNavigate();
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  const refresh = useCallback(async () => {
    if (!Number.isInteger(id) || id < 1) {
      setError("Milestone not found.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setMilestone(await fetchMilestone(id));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load this milestone.",
      );
    } finally {
      setLoading(false);
    }
  }, [id, retry]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function archive(archived: boolean) {
    if (!milestone) return;
    setBusy(true);
    setActionError(null);
    try {
      await setMilestoneArchived(milestone.id, archived);
      setMilestone(await fetchMilestone(milestone.id));
    } catch (actionFailure) {
      setActionError(
        actionFailure instanceof Error
          ? actionFailure.message
          : "Unable to update this milestone.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!milestone) return;
    const confirmed = window.confirm(
      `Permanently delete “${milestone.name}”? This cannot be undone.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteMilestone(milestone.id);
      navigate("/milestones");
    } catch (actionFailure) {
      setActionError(
        actionFailure instanceof Error
          ? actionFailure.message
          : "Unable to delete this milestone.",
      );
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="milestone-state" role="status" aria-busy="true">
        Loading milestone…
      </div>
    );
  }
  if (error || !milestone) {
    return (
      <div className="milestone-state error-state" role="alert">
        <p>{error ?? "Milestone not found."}</p>
        <button type="button" onClick={() => setRetry((value) => value + 1)}>
          Retry
        </button>
        <Link to="/milestones">Back to milestones</Link>
      </div>
    );
  }

  const visualProgress = Math.min(100, Math.max(0, milestone.progress_percent));
  const elapsedPaceExists =
    milestone.elapsed_per_day !== null || milestone.elapsed_per_week !== null;
  const requiredPaceExists =
    milestone.required_per_day !== null || milestone.required_per_week !== null;

  return (
    <div className="milestone-page">
      <Link to="/milestones">← All milestones</Link>
      <section className="milestone-detail">
        <div className="milestone-page-heading">
          <div>
            <span className={`milestone-status ${milestone.status}`}>
              {statusLabels[milestone.status]}
            </span>
            <h1>{milestone.name}</h1>
            <p>
              {metricLabel(milestone.metric)} · {goalLabel(milestone)}
            </p>
          </div>
          <div className="milestone-detail-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowForm(true)}
              disabled={busy}
            >
              Edit
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void archive(!milestone.archived_at)}
              disabled={busy}
            >
              {milestone.archived_at ? "Unarchive" : "Archive"}
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => void remove()}
              disabled={busy}
            >
              Delete
            </button>
          </div>
        </div>

        {actionError && (
          <p className="error-state" role="alert">
            {actionError}
          </p>
        )}
        <div className="milestone-detail-progress">
          <div className="milestone-detail-counts">
            <strong>
              {milestone.current.toLocaleString()} /{" "}
              {milestone.target.toLocaleString()}
            </strong>
            <span>{milestone.progress_percent.toLocaleString()}%</span>
          </div>
          <progress
            max={100}
            value={visualProgress}
            aria-label={`${milestone.name} progress`}
          />
          <p>{milestone.remaining.toLocaleString()} remaining</p>
        </div>

        {milestone.status === "overdue" &&
          milestone.goal_type === "incremental" && (
            <p className="milestone-notice">
              The deadline has passed, but progress continues to count check-ins
              from your start date onward.
            </p>
          )}
        {milestone.status === "period_ended" && (
          <p className="milestone-notice">
            This calendar-year counting window has closed. Its final progress is
            retained.
          </p>
        )}

        <dl className="milestone-detail-list">
          <div>
            <dt>Metric</dt>
            <dd>{metricLabel(milestone.metric)}</dd>
          </div>
          <div>
            <dt>Goal type</dt>
            <dd>{goalLabel(milestone)}</dd>
          </div>
          {milestone.start_date && (
            <div>
              <dt>Start date (inclusive)</dt>
              <dd>{displayDate(milestone.start_date)}</dd>
            </div>
          )}
          {milestone.deadline_date && (
            <div>
              <dt>Deadline (full local day)</dt>
              <dd>{displayDate(milestone.deadline_date)}</dd>
            </div>
          )}
          <div>
            <dt>Timezone</dt>
            <dd>{milestone.timezone}</dd>
          </div>
          {milestone.completed_at && (
            <div>
              <dt>Completed</dt>
              <dd>{timestamp(milestone.completed_at, milestone.timezone)}</dd>
            </div>
          )}
          {milestone.deadline_outcome && (
            <div>
              <dt>Deadline outcome</dt>
              <dd>{milestone.deadline_outcome.replace("_", " ")}</dd>
            </div>
          )}
        </dl>

        {(requiredPaceExists ||
          elapsedPaceExists ||
          milestone.trajectory_difference !== null) && (
          <section className="milestone-pace">
            <h2>Pace</h2>
            <dl className="milestone-detail-list">
              <PaceValue
                label="Required per day"
                value={milestone.required_per_day}
              />
              <PaceValue
                label="Required per week"
                value={milestone.required_per_week}
              />
              <PaceValue
                label="Elapsed average per day"
                value={milestone.elapsed_per_day}
              />
              <PaceValue
                label="Elapsed average per week"
                value={milestone.elapsed_per_week}
              />
              <PaceValue
                label="Difference from linear target trajectory"
                value={milestone.trajectory_difference}
                suffix=" qualifying events"
                signed
              />
            </dl>
          </section>
        )}
        {milestone.metric !== "checkins" && (
          <p className="muted">
            Only each beer&apos;s first-ever imported check-in counts. Repeats
            never advance discovery goals.
          </p>
        )}
      </section>
      {showForm && (
        <MilestoneFormDialog
          milestone={milestone}
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
