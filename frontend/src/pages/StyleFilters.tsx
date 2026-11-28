import CountFilter from "./CountFilter";
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui";
import { fetchStyleBounds } from "../api/explore";
import {
  ExplorerFilterSheet,
  FilterSection,
  RangeFilter,
} from "./ExplorerFilters";
import { Filters, emptyFilters, activeGroups } from "./styleState";
export function StyleFilterPanel({
  value,
  onChange,
  mobile = false,
}: {
  value: Filters;
  onChange: (v: Filters) => void;
  mobile?: boolean;
}) {
  const latest = useRef(value);
  latest.current = value;
  function change(patch: Partial<Filters>) {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    onChange(next);
  }
  const [bounds, setBounds] = useState<
    { status: "pending" | "failed" } | { status: "success"; maximum: number }
  >({ status: "pending" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setBounds({ status: "pending" });
    fetchStyleBounds()
      .then((v) => {
        if (!Number.isFinite(v.abv_max) || v.abv_max < 0)
          throw new Error("Invalid ABV bounds");
        if (current)
          setBounds({
            status: "success",
            maximum: Math.max(1, Math.ceil(v.abv_max)),
          });
      })
      .catch(() => {
        if (current) setBounds({ status: "failed" });
      });
    return () => {
      current = false;
    };
  }, [attempt]);
  return (
    <div className="explorer-filter-content">
      <FilterSection
        title="Exploration"
        initialOpen={
          !mobile ||
          !!(
            value.min_unique_beers ||
            value.min_checkins ||
            value.min_breweries
          )
        }
      >
        {() => (
          <>
            {(
              [
                ["Minimum unique beers", "min_unique_beers"],
                ["Minimum check-ins", "min_checkins"],
                ["Minimum distinct breweries", "min_breweries"],
              ] as const
            ).map(([label, key]) => (
              <CountFilter
                key={key}
                label={label}
                value={value[key]}
                minimum={key === "min_breweries" ? 0 : 1}
                onChange={(next) => change({ [key]: next })}
              />
            ))}
          </>
        )}
      </FilterSection>
      <FilterSection
        title="My rating"
        initialOpen={!mobile || !!(value.rating_min || value.rating_max)}
      >
        {() => (
          <RangeFilter
            label="My rating"
            low={value.rating_min}
            high={value.rating_max}
            maximum={5}
            onChange={(low, high) =>
              change({ rating_min: low, rating_max: high })
            }
          />
        )}
      </FilterSection>
      <FilterSection
        title="Average ABV"
        initialOpen={!mobile || !!(value.abv_min || value.abv_max)}
      >
        {() => (
          <>
            {bounds.status === "pending" && (
              <p role="status">Loading average ABV bounds…</p>
            )}
            {bounds.status === "failed" && (
              <p role="alert">
                Average ABV bounds unavailable.{" "}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAttempt((v) => v + 1)}
                >
                  Retry average ABV bounds
                </Button>
              </p>
            )}
            <RangeFilter
              label="Average ABV"
              low={value.abv_min}
              high={value.abv_max}
              maximum={bounds.status === "success" ? bounds.maximum : null}
              sliderAvailable={bounds.status === "success"}
              onChange={(low, high) => change({ abv_min: low, abv_max: high })}
            />
          </>
        )}
      </FilterSection>
      {(
        [
          ["First tried", "first_tried_from", "first_tried_to"],
          ["Last tried", "last_tried_from", "last_tried_to"],
        ] as const
      ).map(([label, from, to]) => (
        <FilterSection
          key={from}
          title={label}
          initialOpen={!mobile || !!(value[from] || value[to])}
        >
          {() => (
            <div className="explorer-date-inputs">
              {(
                [
                  ["From", from],
                  ["To", to],
                ] as const
              ).map(([direction, key]) => (
                <label key={key}>
                  {direction}
                  <input
                    type="date"
                    aria-label={`${label} ${direction.toLowerCase()}`}
                    min={
                      key === to ? value[from] || "0002-01-01" : "0002-01-01"
                    }
                    max={
                      key === from ? value[to] || "9999-12-30" : "9999-12-30"
                    }
                    value={value[key]}
                    onChange={(e) => {
                      if (e.target.validity.valid)
                        change({ [key]: e.target.value });
                    }}
                  />
                </label>
              ))}
            </div>
          )}
        </FilterSection>
      ))}
      <p className="explorer-filter-help">
        Dates filter lifetime first and last tried, including the complete
        calendar day in Europe/Amsterdam. Ratings average your rated check-ins.
        Average ABV uses distinct tried beers with known ABV, including zero.
      </p>
    </div>
  );
}
export function StyleFilterSheet({
  applied,
  onApply,
  onClose,
}: {
  applied: Filters;
  onApply: (v: Filters) => void;
  onClose: () => void;
}) {
  return (
    <ExplorerFilterSheet
      applied={applied}
      onApply={onApply}
      onClose={onClose}
      emptyFilters={emptyFilters}
      count={activeGroups}
      renderPanel={(value, onChange) => (
        <StyleFilterPanel mobile value={value} onChange={onChange} />
      )}
    />
  );
}
