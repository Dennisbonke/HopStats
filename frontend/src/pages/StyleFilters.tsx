import { useEffect, useState } from "react";
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
  const [abvMax, setAbvMax] = useState(0);
  useEffect(() => {
    let current = true;
    fetchStyleBounds()
      .then((v) => {
        if (current) setAbvMax(Math.max(1, Math.ceil(v.abv_max)));
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);
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
              <label key={key}>
                {label}
                <input
                  type="number"
                  min={key === "min_breweries" ? "0" : "1"}
                  max="2147483647"
                  step="1"
                  inputMode="numeric"
                  defaultValue={value[key]}
                  key={`${key}:${value[key]}`}
                  onBlur={(e) => {
                    if (e.target.validity.valid)
                      onChange({
                        ...value,
                        [key]: e.target.value
                          ? String(Number(e.target.value))
                          : "",
                      });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                />
              </label>
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
              onChange({ ...value, rating_min: low, rating_max: high })
            }
          />
        )}
      </FilterSection>
      <FilterSection
        title="Average ABV"
        initialOpen={!mobile || !!(value.abv_min || value.abv_max)}
      >
        {() => (
          <RangeFilter
            label="Average ABV"
            low={value.abv_min}
            high={value.abv_max}
            maximum={abvMax}
            onChange={(low, high) =>
              onChange({ ...value, abv_min: low, abv_max: high })
            }
          />
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
                        onChange({ ...value, [key]: e.target.value });
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
