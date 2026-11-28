import { useEffect, useId, useRef, useState } from "react";

// Validate the decimal value before Number conversion can round a fraction away.
export function canonicalCount(value: string, minimum: number): string | null {
  const text = value.trim();
  if (!text) return "";
  const match = /^(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) return null;
  const [whole, fraction = ""] = match[1].split(".");
  const digits = whole + fraction;
  const trailing = digits.length - digits.replace(/0+$/, "").length;
  if (
    digits.replace(/0/g, "") &&
    fraction.length - Number(match[2] || 0) > trailing
  )
    return null;
  const count = Number(text);
  return Number.isInteger(count) && count >= minimum && count <= 2147483647
    ? String(count)
    : null;
}

export default function CountFilter({
  label,
  value,
  minimum = 1,
  onChange,
}: {
  label: string;
  value: string;
  minimum?: number;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  const errorId = useId();
  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    setDraft(value);
  }, [value]);
  const normalized = canonicalCount(draft, minimum);
  const invalid = normalized === null;
  function commit() {
    if (normalized === null) return;
    setDraft(normalized);
    if (normalized === committed.current) return;
    committed.current = normalized;
    onChange(normalized);
  }
  return (
    <label>
      {label}
      <input
        type="text"
        aria-label={label}
        inputMode="numeric"
        value={draft}
        maxLength={100}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
      {invalid && (
        <span id={errorId} role="alert">
          Enter a whole number from {minimum} through 2147483647, or leave
          empty.
        </span>
      )}
    </label>
  );
}
