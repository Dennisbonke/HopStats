import { useState } from "react";
import { fetchBreweryCountries } from "../api/explore";
import { Button } from "../components/ui";
import { useFilterOptions } from "./useFilterOptions";
import {
  ExplorerFilterSheet,
  FilterSection,
  RangeFilter,
} from "./ExplorerFilters";
import { Filters, emptyFilters, activeGroups } from "./breweryState";
const countryKey = (country: string) => country;
function Countries({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (v: Filters) => void;
}) {
  const [search, setSearch] = useState("");
  const {
    items,
    unknown,
    loading: pending,
    error,
    retry,
  } = useFilterOptions(fetchBreweryCountries, countryKey, "", true);
  const options = [...new Set([...value.country, ...items])].filter(
    (country) =>
      value.country.includes(country) ||
      country.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <>
      <label>
        Search countries
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
        />
      </label>
      <div
        className="explorer-options"
        aria-label="Available countries"
        tabIndex={0}
      >
        {(unknown || value.unknown_country) && (
          <label>
            <input
              type="checkbox"
              checked={!!value.unknown_country}
              onChange={(e) =>
                onChange({
                  ...value,
                  unknown_country: e.target.checked ? "true" : "",
                })
              }
            />
            Unknown country
          </label>
        )}
        {options.map((country) => (
          <label key={country}>
            <input
              type="checkbox"
              checked={value.country.includes(country)}
              disabled={
                !value.country.includes(country) && value.country.length >= 100
              }
              onChange={(e) =>
                onChange({
                  ...value,
                  country: e.target.checked
                    ? [...value.country, country]
                    : value.country.filter((v) => v !== country),
                })
              }
            />
            {country}
          </label>
        ))}
        {pending && <p role="status">Loading countries…</p>}
        {error && (
          <p role="alert">
            Countries unavailable.{" "}
            <Button type="button" variant="secondary" onClick={retry}>
              Try again
            </Button>
          </p>
        )}
        {!pending && !error && !options.length && !unknown && (
          <p>No matching countries.</p>
        )}
      </div>
    </>
  );
}
export function BreweryFilterPanel({
  value,
  onChange,
  mobile = false,
}: {
  value: Filters;
  onChange: (v: Filters) => void;
  mobile?: boolean;
}) {
  return (
    <div className="explorer-filter-content">
      <FilterSection title="Country" initialOpen>
        {() => <Countries value={value} onChange={onChange} />}
      </FilterSection>
      <FilterSection
        title="Exploration"
        initialOpen={
          !mobile || !!(value.min_unique_beers || value.min_checkins)
        }
      >
        {() => (
          <>
            {(
              [
                ["Minimum unique beers", "min_unique_beers"],
                ["Minimum check-ins", "min_checkins"],
              ] as const
            ).map(([label, key]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min="1"
                  max="2147483647"
                  step="1"
                  inputMode="numeric"
                  defaultValue={value[key]}
                  key={`${key}:${value[key]}`}
                  onBlur={(e) => {
                    if (e.target.validity.valid)
                      onChange({ ...value, [key]: e.target.value });
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
      </p>
    </div>
  );
}
export function BreweryFilterSheet({
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
        <BreweryFilterPanel mobile value={value} onChange={onChange} />
      )}
    />
  );
}
