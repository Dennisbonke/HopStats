import "./Milestones.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMilestones, Milestone, MilestoneStatus } from "../api/milestones";
import MilestoneFormDialog from "../components/MilestoneFormDialog";
import { Button, Card, StatusBadge } from "../components/ui";

type Filter =
  | "all"
  | "active"
  | "scheduled"
  | "completed"
  | "overdue"
  | "period_ended"
  | "archived";

const filters: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "In progress" },
  { id: "scheduled", label: "Scheduled" },
  { id: "completed", label: "Completed" },
  { id: "overdue", label: "Overdue" },
  { id: "period_ended", label: "Period ended" },
  { id: "archived", label: "Archived" },
];

const statusLabels: Record<MilestoneStatus, string> = {
  scheduled: "Scheduled",
  active: "In progress",
  overdue: "Overdue",
  completed: "Completed",
  period_ended: "Period ended",
  archived: "Archived",
};

function statusVariant(
  status: MilestoneStatus,
): "success" | "warning" | "error" | "info" | "neutral" {
  if (status === "overdue") return "error";
  if (status === "scheduled") return "info";
  if (status === "completed" || status === "active") return "success";
  return "neutral";
}

export function metricLabel(metric: Milestone["metric"]): string {
  return metric === "checkins" ? "Total check-ins" : "Unique beer discoveries";
}

export function goalLabel(milestone: Milestone): string {
  if (milestone.goal_type === "calendar_year") {
    return `Calendar year ${milestone.calendar_year}`;
  }
  if (milestone.goal_type === "incremental") {
    return `From ${milestone.start_date}`;
  }
  return "Lifetime";
}

export function displayDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function ProgressCard({ milestone }: { milestone: Milestone }) {
  const visualProgress = Math.min(100, Math.max(0, milestone.progress_percent));
  return (
    <Link className="milestone-card" to={`/milestones/${milestone.id}`}>
      <div className="milestone-card-heading">
        <h2>{milestone.name}</h2>
        <StatusBadge
          className={`milestone-status ${milestone.status}`}
          variant={statusVariant(milestone.status)}
        >
          {statusLabels[milestone.status]}
        </StatusBadge>
      </div>
      <p className="milestone-card-meta">
        {metricLabel(milestone.metric)} · {goalLabel(milestone)}
      </p>
      <p className="milestone-card-count">
        <strong>{milestone.current.toLocaleString()}</strong> /{" "}
        {milestone.target.toLocaleString()}
        <span>{milestone.progress_percent.toLocaleString()}%</span>
      </p>
      <progress
        max={100}
        value={visualProgress}
        aria-label={`${milestone.name} progress`}
      />
      {milestone.deadline_date && (
        <p className="milestone-card-deadline">
          Deadline: {displayDate(milestone.deadline_date)}
        </p>
      )}
      {milestone.status === "period_ended" && (
        <p className="milestone-card-deadline">
          This calendar-year counting window has closed.
        </p>
      )}
    </Link>
  );
}

export default function Milestones() {
  const [filter, setFilter] = useState<Filter>("all");
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [nonArchivedMilestones, setNonArchivedMilestones] = useState<
    Milestone[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const archived = filter === "archived";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (archived) {
        const [archivedItems, currentItems] = await Promise.all([
          fetchMilestones(true),
          fetchMilestones(false),
        ]);
        setMilestones(archivedItems);
        setNonArchivedMilestones(currentItems);
      } else {
        const currentItems = await fetchMilestones(false);
        setMilestones(currentItems);
        setNonArchivedMilestones(currentItems);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Milestones are temporarily unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [archived, retry]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter === "all" || filter === "archived") return milestones;
    return milestones.filter((milestone) => milestone.status === filter);
  }, [filter, milestones]);

  const counts = useMemo(() => {
    return {
      active: nonArchivedMilestones.filter((item) => item.status === "active")
        .length,
      scheduled: nonArchivedMilestones.filter(
        (item) => item.status === "scheduled",
      ).length,
      completed: nonArchivedMilestones.filter(
        (item) => item.status === "completed",
      ).length,
      overdue: nonArchivedMilestones.filter((item) => item.status === "overdue")
        .length,
    };
  }, [nonArchivedMilestones]);

  return (
    <div className="milestone-page">
      <div className="milestone-page-heading">
        <div>
          <h1>Milestones</h1>
          <p>
            Set a personal target and track progress from your imported
            check-ins.
          </p>
        </div>
        <Button type="button" onClick={() => setShowForm(true)}>
          Create milestone
        </Button>
      </div>

      <div className="milestone-counts" aria-label="Milestone counts">
        {(
          [
            ["In progress", counts.active],
            ["Scheduled", counts.scheduled],
            ["Completed", counts.completed],
            ["Overdue", counts.overdue],
          ] as const
        ).map(([label, count]) => (
          <Card className="milestone-count" key={label}>
            <span>{label}</span>
            <strong>{count}</strong>
          </Card>
        ))}
      </div>

      <div
        className="milestone-filters"
        role="group"
        aria-label="Filter milestones"
      >
        {filters.map(({ id, label }) => (
          <Button
            variant="secondary"
            className={filter === id ? "selected" : ""}
            type="button"
            key={id}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <Card
          as="section"
          className="milestone-state"
          role="status"
          aria-busy="true"
        >
          Loading milestones…
        </Card>
      ) : error ? (
        <Card as="section" className="milestone-state error-state" role="alert">
          <p>{error}</p>
          <Button type="button" onClick={() => setRetry((value) => value + 1)}>
            Retry
          </Button>
        </Card>
      ) : visible.length === 0 ? (
        <Card as="section" className="milestone-state">
          <h2>
            {filter === "all"
              ? "No milestones yet"
              : `No ${filters.find((item) => item.id === filter)?.label.toLowerCase()} milestones`}
          </h2>
          <p>
            {filter === "all"
              ? "Create a milestone to start tracking a personal goal. Beer discoveries count only the first-ever check-in for each beer."
              : "Try another filter or create a milestone."}
          </p>
          {filter === "all" && (
            <Button type="button" onClick={() => setShowForm(true)}>
              Create milestone
            </Button>
          )}
        </Card>
      ) : (
        <div className="milestone-grid">
          {visible.map((milestone) => (
            <ProgressCard milestone={milestone} key={milestone.id} />
          ))}
        </div>
      )}

      {showForm && (
        <MilestoneFormDialog
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            setRetry((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
