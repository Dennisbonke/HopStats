import type { HTMLAttributes } from "react";

export type CardVariant = "standard" | "muted" | "raised";
export type CardElement = "div" | "article" | "aside" | "section";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: CardElement;
  variant?: CardVariant;
}

export function Card({
  as: Element = "div",
  className,
  variant = "standard",
  ...props
}: CardProps) {
  return (
    <Element
      {...props}
      className={["ui-card", `ui-card--${variant}`, className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
