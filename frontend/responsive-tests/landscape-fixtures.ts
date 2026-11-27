import { stubExplorerOptions } from "./explorer-option-fixtures";
import type { Page } from "@playwright/test";

export async function stubPages(page: Page, populated = false) {
  await page.route("**/api/v1/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const path = requestUrl.pathname;
    let body: unknown = {};
    if (path.endsWith("/auth/me")) {
      body = { id: 1, username: "test", created_at: "2026-01-01T00:00:00Z" };
    } else if (path.endsWith("/health")) {
      body = { status: "ok" };
    } else if (path.endsWith("/dashboard")) {
      body = {
        total_checkins: populated ? 20 : 0,
        unique_beers: populated ? 12 : 0,
        unique_breweries: populated ? 6 : 0,
        unique_styles: populated ? 5 : 0,
        average_personal_rating: populated ? 4.25 : null,
        rated_checkins: populated ? 18 : 0,
        inventory_units: 0,
        unique_inventory_beers: 0,
        not_confirmed_checked_in: 0,
        match_coverage: {
          external_id: 0,
          exact: 0,
          ambiguous: 0,
          unmatched: 0,
        },
        freshness: {
          checkins_last_imported_at: null,
          inventory_last_imported_at: null,
          checkins_source_exported_at: null,
          inventory_source_exported_at: null,
        },
      };
    } else if (path.endsWith("/analytics/checkins")) {
      body = {
        start: "2026-01-01",
        end: "2026-01-31",
        timezone: "Europe/Amsterdam",
        granularity: "month",
        summary: {
          total_checkins: 2,
          new_discoveries: 1,
          repeat_checkins: 1,
          distinct_beers: 1,
        },
        cumulative_baseline_checkins: 0,
        cumulative_baseline_discoveries: 0,
        buckets: [
          {
            key: "2026-01",
            label: "Jan 2026",
            start: "2026-01-01",
            end: "2026-01-31",
            new_discoveries: 1,
            repeat_checkins: 1,
            total_checkins: 2,
            cumulative_checkins: 2,
            cumulative_discoveries: 1,
          },
        ],
      };
    } else if (path.endsWith("/analytics/drinking-trends")) {
      body = {
        start: "2026-01-01",
        end: "2026-12-31",
        timezone: "Europe/Amsterdam",
        daily:
          requestUrl.searchParams.get("daily") === "false"
            ? []
            : Array.from({ length: 365 }, (_, index) => ({
                date: new Date(Date.UTC(2026, 0, index + 1))
                  .toISOString()
                  .slice(0, 10),
                total: 0,
                discoveries: 0,
                repeats: 0,
              })),
        weekday: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          total: weekday === 0 ? 2 : 0,
          discoveries: weekday === 0 ? 1 : 0,
          repeats: weekday === 0 ? 1 : 0,
          days_in_period: weekday === 0 ? 53 : 52,
        })),
        hourly: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          total: hour === 12 ? 2 : 0,
          discoveries: hour === 12 ? 1 : 0,
          repeats: hour === 12 ? 1 : 0,
        })),
        weekday_hour: Array.from({ length: 168 }, (_, index) => ({
          weekday: Math.floor(index / 24),
          hour: index % 24,
          total: Math.floor(index / 24) === 0 && index % 24 === 12 ? 2 : 0,
          discoveries:
            Math.floor(index / 24) === 0 && index % 24 === 12 ? 1 : 0,
          repeats: Math.floor(index / 24) === 0 && index % 24 === 12 ? 1 : 0,
        })),
      };
    } else if (path.endsWith("/inventory/styles")) {
      body = [];
    } else if (path.endsWith("/inventory")) {
      body = { items: [], total: 0, page: 1, page_size: 25, total_pages: 0 };
    } else if (path.endsWith("/locations")) {
      body = { locations: [], unresolved: { record_count: 0, total_units: 0 } };
    } else if (path.endsWith("/milestones/1")) {
      body = {
        id: 1,
        name: "Test milestone",
        metric: "discoveries",
        goal_type: "incremental",
        target: 10,
        calendar_year: null,
        start_date: "2026-01-01",
        deadline_date: "2026-12-31",
        timezone: "Europe/Amsterdam",
        archived_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        current: 3,
        remaining: 7,
        progress_percent: 30,
        status: "active",
        deadline_outcome: "pending",
        completed_at: null,
        completed_before_deadline: null,
        required_per_day: 0.1,
        required_per_week: 0.7,
        elapsed_per_day: 0.05,
        elapsed_per_week: 0.35,
        trajectory_difference: -1,
      };
    } else if (path.endsWith("/milestones")) {
      body = {
        milestones: [
          {
            id: 1,
            name: "A compact progress row",
            status: "active",
            progress_percent: 90,
            current: 90,
            target: 100,
            remaining: 10,
            metric: "discoveries",
            goal_type: "absolute",
            calendar_year: null,
            start_date: null,
            deadline_date: null,
            timezone: "Europe/Amsterdam",
            archived_at: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            deadline_outcome: null,
            completed_at: null,
            completed_before_deadline: null,
            required_per_day: null,
            required_per_week: null,
            elapsed_per_day: null,
            elapsed_per_week: null,
            trajectory_difference: null,
          },
          {
            id: 2,
            name: "Another compact row",
            status: "active",
            progress_percent: 80,
            current: 80,
            target: 100,
            remaining: 20,
            metric: "discoveries",
            goal_type: "absolute",
            calendar_year: null,
            start_date: null,
            deadline_date: null,
            timezone: "Europe/Amsterdam",
            archived_at: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            deadline_outcome: null,
            completed_at: null,
            completed_before_deadline: null,
            required_per_day: null,
            required_per_week: null,
            elapsed_per_day: null,
            elapsed_per_week: null,
            trajectory_difference: null,
          },
          {
            id: 3,
            name: "Third compact row",
            status: "active",
            progress_percent: 70,
            current: 70,
            target: 100,
            remaining: 30,
            metric: "discoveries",
            goal_type: "absolute",
            calendar_year: null,
            start_date: null,
            deadline_date: null,
            timezone: "Europe/Amsterdam",
            archived_at: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            deadline_outcome: null,
            completed_at: null,
            completed_before_deadline: null,
            required_per_day: null,
            required_per_week: null,
            elapsed_per_day: null,
            elapsed_per_week: null,
            trajectory_difference: null,
          },
        ],
      };
    } else if (path.endsWith("/imports")) {
      body = [];
    }
    await route.fulfill({ json: body });
  });
  await stubExplorerOptions(page, {});
}
