import type { HTMLAttributes } from "react";

export type StatusBadgeVariant =
  "success" | "warning" | "error" | "info" | "neutral";

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: StatusBadgeVariant;
}

export function StatusBadge({
  className,
  variant = "neutral",
  ...props
}: StatusBadgeProps) {
  return (
    <span
      {...props}
      className={["ui-status-badge", `ui-status-badge--${variant}`, className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
