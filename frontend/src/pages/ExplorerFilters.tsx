import {
  CSSProperties,
  ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ExploreEntity, fetchExploreOptions } from "../api/explore";
import { Button } from "../components/ui";
import {
  activeGroups,
  amsterdamDay,
  emptyFilters,
  Filters,
  validThreshold,
} from "./explorerState";

export type OptionNames = Record<string, string>;
function MultiSelect({
  category,
  selected,
  onChange,
  names,
  onNames,
}: {
  category: "breweries" | "styles";
  selected: string[];
  onChange: (ids: string[]) => void;
  names: OptionNames;
  onNames: (items: ExploreEntity[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<ExploreEntity[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const timer = window.setTimeout(() => {
      fetchExploreOptions(
        category,
        new URLSearchParams({ search, offset: String(offset) }),
      )
        .then((result) => {
          if (cancelled) return;
          setItems((old) =>
            offset ? [...old, ...result.items] : result.items,
          );
          setMore(result.has_more);
          onNames(result.items);
        })
        .catch(() => {
          if (!cancelled) setError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [category, search, offset, onNames, retry]);
  return (
    <>
      <label>
        Search {category}
        <input
          type="search"
          maxLength={200}
          value={search}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
        />
      </label>
      <div className="explorer-selections">
        {selected.map((id) => (
          <button
            key={id}
            type="button"
            className="explorer-chip"
            onClick={() => onChange(selected.filter((v) => v !== id))}
            aria-label={`Remove ${names[id] ?? `${category} ${id}`}`}
          >
            {names[id] ?? `#${id}`} ×
          </button>
        ))}
      </div>
      {loading && <p role="status">Loading {category}…</p>}
      {error ? (
        <p role="alert">
          Unable to load {category}.{" "}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </button>
        </p>
      ) : (
        <div className="explorer-options" aria-label={`Available ${category}`}>
          {items.map((item) => (
            <label key={item.id}>
              <input
                type="checkbox"
                checked={selected.includes(String(item.id))}
                disabled={
                  !selected.includes(String(item.id)) && selected.length >= 100
                }
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selected, String(item.id)]
                      : selected.filter((id) => id !== String(item.id)),
                  )
                }
              />
              {item.name}
            </label>
          ))}
          {!loading && !items.length && <p>No matching {category}.</p>}
          {more && (
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => setOffset(items.length)}
            >
              Load more {category}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function RangeFilter({
  label,
  low,
  high,
  maximum,
  onChange,
}: {
  label: string;
  low: string;
  high: string;
  maximum: number;
  onChange: (low: string, high: string) => void;
}) {
  const [draft, setDraft] = useState([low, high]);
  const draftRef = useRef(draft);
  const [badInput, setBadInput] = useState([false, false]);
  const badInputRef = useRef(badInput);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const gesture = useRef<{
    x: number;
    index: number | null;
    original: string[];
  } | null>(null);
  const errorId = useId();
  const rating = label === "My rating";
  function valid(values: string[]) {
    return (
      values.every((v) => validThreshold(v, rating)) &&
      (!values[0] || !values[1] || Number(values[0]) <= Number(values[1]))
    );
  }
  const error = badInput.some(Boolean) || !valid(draft);
  function edit(values: string[], bad = [false, false]) {
    badInputRef.current = bad;
    setBadInput(bad);
    draftRef.current = values;
    setDraft(values);
  }
  useEffect(() => {
    draftRef.current = [low, high];
    badInputRef.current = [false, false];
    setBadInput([false, false]);
    setDraft([low, high]);
  }, [low, high]);
  const max = rating
    ? 5
    : Math.max(
        maximum,
        ...[low, high, ...draft].filter((v) => validThreshold(v)).map(Number),
      );
  const sliderValues = error ? [low, high] : draft;
  const lower = Number(sliderValues[0] || 0);
  const upper = Number(sliderValues[1] || max);
  function commit(values: string[]) {
    if (!badInputRef.current.some(Boolean) && valid(values)) {
      const next =
        values[0] !== "" &&
        values[1] !== "" &&
        Number(values[0]) === 0 &&
        Number(values[1]) === max
          ? ["", ""]
          : values;
      edit(next);
      onChange(next[0], next[1]);
    }
  }
  function move(event: React.PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current) return;
    const box = event.currentTarget.getBoundingClientRect();
    const value =
      Math.round(
        Math.max(
          0,
          Math.min(1, (event.clientX - box.left - 12) / (box.width - 24)),
        ) *
          max *
          100,
      ) / 100;
    if (current.index === null) {
      if (event.clientX === current.x) return;
      // A collapsed pair splits in the drag direction, including at either end.
      current.index = event.clientX < current.x ? 0 : 1;
      inputs.current[current.index]?.focus({ preventScroll: true });
    }
    const next = [...draftRef.current];
    const lo = Number(next[0] || 0),
      hi = Number(next[1] || max);
    next[current.index] = String(
      current.index ? Math.max(lo, value) : Math.min(hi, value),
    );
    edit(next);
  }
  return (
    <div className="explorer-range">
      <div
        className="explorer-range-track"
        style={
          {
            "--range-low": Math.min(lower, upper) / max,
            "--range-high": Math.max(lower, upper) / max,
          } as CSSProperties
        }
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          const box = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - box.left - 12) / (box.width - 24)) * max;
          const collapsed =
            (Math.abs(upper - lower) / max) * (box.width - 24) < 12;
          gesture.current = {
            x: event.clientX,
            index: collapsed
              ? null
              : Math.abs(x - lower) < Math.abs(x - upper)
                ? 0
                : 1,
            original: [...draftRef.current],
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          if (gesture.current.index !== null) {
            inputs.current[gesture.current.index]?.focus({
              preventScroll: true,
            });
            move(event);
          }
        }}
        onPointerMove={move}
        onPointerUp={(event) => {
          if (!gesture.current) return;
          move(event);
          gesture.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          commit(draftRef.current);
        }}
        onPointerCancel={() => {
          if (gesture.current) edit(gesture.current.original);
          gesture.current = null;
        }}
      >
        {[0, 1].map((index) => (
          <input
            key={index}
            ref={(node) => {
              inputs.current[index] = node;
            }}
            type="range"
            aria-label={`${label} ${index ? "maximum" : "minimum"} slider`}
            min={0}
            max={max}
            step="0.01"
            value={index ? upper : lower}
            aria-valuemin={index ? lower : 0}
            aria-valuemax={index ? max : upper}
            onChange={(event) => {
              const next = [...draftRef.current];
              next[index] = String(
                index
                  ? Math.max(lower, Number(event.target.value))
                  : Math.min(upper, Number(event.target.value)),
              );
              edit(next);
            }}
            onKeyUp={() => commit(draftRef.current)}
            onBlur={() => {
              if (!gesture.current) commit(draftRef.current);
            }}
          />
        ))}
      </div>
      <div className="explorer-range-inputs">
        {[0, 1].map((index) => (
          <label key={index}>
            {index ? "Maximum" : "Minimum"}
            <input
              type="number"
              inputMode="decimal"
              aria-label={`${label} ${index ? "maximum" : "minimum"}`}
              min="0"
              max={rating ? 5 : undefined}
              step="0.01"
              placeholder={index ? String(maximum) : "0"}
              value={draft[index]}
              aria-invalid={error}
              aria-describedby={error ? errorId : undefined}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit(draftRef.current);
                }
              }}
              onChange={(event) => {
                const next = [...draftRef.current];
                next[index] = event.target.value;
                const bad = [...badInputRef.current];
                bad[index] = event.target.validity.badInput;
                edit(next, bad);
              }}
              onBlur={() => commit(draftRef.current)}
            />
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} role="alert">
          Enter an ordered {rating ? "0–5" : "non-negative"} range in increments
          of 0.01.
        </p>
      )}
    </div>
  );
}

function FilterSection({
  title,
  summary,
  initialOpen,
  children,
}: {
  title: string;
  summary?: ReactNode;
  initialOpen: boolean;
  children: (open: boolean) => ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {title}
        {summary && <span>{summary}</span>}
      </summary>
      {children(open)}
    </details>
  );
}

export function FilterPanel({
  value,
  onChange,
  abvMax,
  names,
  onNames,
  mobile = false,
}: {
  mobile?: boolean;
  value: Filters;
  onChange: (value: Filters) => void;
  abvMax: number;
  names: Record<"breweries" | "styles", OptionNames>;
  onNames: Record<"breweries" | "styles", (items: ExploreEntity[]) => void>;
}) {
  return (
    <div className="explorer-filter-content">
      {(
        [
          ["Brewery", "breweries", "brewery_id"],
          ["Beer style", "styles", "style_id"],
        ] as const
      ).map(([label, category, key]) => (
        <FilterSection
          key={key}
          title={label}
          initialOpen={!mobile || key === "brewery_id" || value[key].length > 0}
          summary={
            value[key].length ? `${value[key].length} selected` : undefined
          }
        >
          {(open) =>
            open && (
              <MultiSelect
                category={category}
                selected={value[key]}
                onChange={(ids) => onChange({ ...value, [key]: ids })}
                names={names[category]}
                onNames={onNames[category]}
              />
            )
          }
        </FilterSection>
      ))}
      {(
        [
          ["ABV", "abv_min", "abv_max", abvMax],
          ["My rating", "rating_min", "rating_max", 5],
        ] as const
      ).map(([label, low, high, max]) => (
        <FilterSection
          key={low}
          title={label}
          initialOpen={
            !mobile || low === "abv_min" || !!(value[low] || value[high])
          }
          summary={
            value[low] || value[high]
              ? `${value[low] || "Any"}–${value[high] || "Any"}`
              : undefined
          }
        >
          {() => (
            <>
              <RangeFilter
                label={label}
                low={value[low]}
                high={value[high]}
                maximum={max}
                onChange={(a, b) => onChange({ ...value, [low]: a, [high]: b })}
              />
              {label === "My rating" && (
                <p className="explorer-filter-help">
                  Average of your rated check-ins. Exact thresholds to 0.01;
                  unrated check-ins are excluded from the average.
                </p>
              )}
            </>
          )}
        </FilterSection>
      ))}
      {(
        [
          ["First tried", "first_tried_from", "first_tried_to", 90],
          ["Last tried", "last_tried_from", "last_tried_to", 30],
        ] as const
      ).map(([label, from, to, days]) => (
        <FilterSection
          key={from}
          title={label}
          initialOpen={!mobile || !!(value[from] || value[to])}
          summary={
            value[from] || value[to]
              ? `${value[from] || "Any"}–${value[to] || "Any"}`
              : undefined
          }
        >
          {() => (
            <>
              <div className="explorer-presets">
                {["Any time", `Last ${days} days`, "This year"].map(
                  (preset, index) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        const today = amsterdamDay();
                        const day = new Date(`${today}T12:00:00Z`);
                        day.setUTCDate(day.getUTCDate() - days + 1);
                        onChange({
                          ...value,
                          [from]:
                            index === 0
                              ? ""
                              : index === 1
                                ? day.toISOString().slice(0, 10)
                                : `${today.slice(0, 4)}-01-01`,
                          [to]: index === 0 ? "" : today,
                        });
                      }}
                    >
                      {preset}
                    </button>
                  ),
                )}
              </div>
              <div className="explorer-date-inputs">
                <label>
                  From
                  <input
                    type="date"
                    aria-label={`${label} from`}
                    min="0002-01-01"
                    max={value[to] || "9999-12-30"}
                    value={value[from]}
                    onChange={(e) => {
                      if (e.target.validity.valid)
                        onChange({ ...value, [from]: e.target.value });
                    }}
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    aria-label={`${label} to`}
                    min={value[from] || "0002-01-01"}
                    max="9999-12-30"
                    value={value[to]}
                    onChange={(e) => {
                      if (e.target.validity.valid)
                        onChange({ ...value, [to]: e.target.value });
                    }}
                  />
                </label>
              </div>
            </>
          )}
        </FilterSection>
      ))}
      <p className="explorer-filter-help">
        Dates include the complete calendar day in Europe/Amsterdam.
      </p>
    </div>
  );
}

export function FilterSheet({
  applied,
  onApply,
  onClose,
  ...props
}: Omit<Parameters<typeof FilterPanel>[0], "value" | "onChange"> & {
  applied: Filters;
  onApply: (filters: Filters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(applied);
  const [resetKey, setResetKey] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);
  const applyIntent = useRef(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const body = document.body;
    const scrollY = window.scrollY;
    const saved = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.position = "fixed";
    body.style.top = `${-scrollY}px`;
    body.style.width = "100%";
    document.body.style.overflow = "hidden";
    const dialog = ref.current!;
    dialog.showModal();
    const viewport = window.visualViewport;
    function fitViewport() {
      if (!viewport) return;
      dialog.style.height = `${viewport.height * 0.9}px`;
      dialog.style.bottom = `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`;
    }
    fitViewport();
    viewport?.addEventListener("resize", fitViewport);
    viewport?.addEventListener("scroll", fitViewport);
    return () => {
      dialog.close();
      viewport?.removeEventListener("resize", fitViewport);
      viewport?.removeEventListener("scroll", fitViewport);
      Object.assign(body.style, saved);
      window.scrollTo(0, scrollY);
      previous?.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="explorer-filter-sheet theme-aware"
      aria-labelledby="explorer-filter-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const box = e.currentTarget.getBoundingClientRect();
          if (
            e.clientY < box.top ||
            e.clientX < box.left ||
            e.clientX > box.right
          )
            onClose();
        }
      }}
    >
      <form
        onInvalidCapture={(event) => {
          applyIntent.current = false;
          const input = event.target as HTMLInputElement;
          const section = input.closest("details");
          if (section) section.open = true;
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            event.target instanceof HTMLInputElement &&
            event.target.type !== "date"
          )
            event.preventDefault();
        }}
        onSubmit={(e) => {
          e.preventDefault();
          const intentional = applyIntent.current;
          applyIntent.current = false;
          if (!intentional) return;
          const invalid = e.currentTarget.querySelector<HTMLInputElement>(
            '[aria-invalid="true"]',
          );
          if (invalid) {
            const section = invalid.closest("details");
            if (section) section.open = true;
            invalid.focus();
          } else onApply(draft);
        }}
      >
        <header>
          <h2 id="explorer-filter-title">
            Filters <span>{activeGroups(draft)} active</span>
          </h2>
          <button
            type="button"
            onClick={() => {
              setDraft(emptyFilters());
              setResetKey((key) => key + 1);
            }}
          >
            Clear all
          </button>
          <button type="button" aria-label="Close filters" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="explorer-sheet-scroll">
          <FilterPanel
            key={resetKey}
            {...props}
            mobile
            value={draft}
            onChange={setDraft}
          />
        </div>
        <footer>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={() => {
              applyIntent.current = true;
            }}
          >
            Apply filters
          </Button>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}
