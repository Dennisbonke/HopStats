import type { ActivityMetric } from "../utils/calendar";

type Props = {
  value: ActivityMetric;
  onChange: (metric: ActivityMetric) => void;
};

const OPTIONS: Array<{ value: ActivityMetric; label: string }> = [
  { value: "total", label: "All check-ins" },
  { value: "discoveries", label: "New discoveries" },
  { value: "repeats", label: "Repeat check-ins" },
];

export default function ActivityMetricSelector({ value, onChange }: Props) {
  return (
    <label className="filter-control activity-metric-selector">
      Activity metric
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as ActivityMetric)}
      >
        {OPTIONS.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
