import { cloneElement, type ReactElement, type ReactNode } from "react";

interface FormControlProps {
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
}

export interface FormFieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  className?: string;
  children: ReactElement<FormControlProps>;
}

export function FormField({
  id,
  label,
  hint,
  error,
  disabled = false,
  className,
  children,
}: FormFieldProps) {
  const hasHint = hint !== undefined && hint !== null;
  const hasError = error !== undefined && error !== null;
  const describedBy = [
    children.props["aria-describedby"],
    hasHint ? `${id}-hint` : undefined,
    hasError ? `${id}-error` : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  const control = cloneElement(children, {
    id,
    disabled: disabled || children.props.disabled,
    className: ["ui-form-field__control", children.props.className]
      .filter(Boolean)
      .join(" "),
    "aria-describedby": describedBy || undefined,
    "aria-invalid": hasError ? true : children.props["aria-invalid"],
  });

  return (
    <div className={["ui-form-field", className].filter(Boolean).join(" ")}>
      <label className="ui-form-field__label" htmlFor={id}>
        {label}
      </label>
      {control}
      {hasHint && (
        <span className="ui-form-field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {hasError && (
        <span className="ui-form-field__error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
