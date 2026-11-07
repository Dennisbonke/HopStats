import { expect, test, type Locator, type Page } from "@playwright/test";

function luminance(color: string): number {
  const channels =
    color
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number) ?? [];
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

async function contrastRatio(element: Locator): Promise<number> {
  const { color, background } = await element.evaluate((node) => ({
    color: getComputedStyle(node).color,
    background: getComputedStyle(
      node.closest(".dashboard-metric-card") as HTMLElement,
    ).backgroundColor,
  }));
  const values = [luminance(color), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function stubDashboard(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      "/api/v1/auth/me": {
        id: 1,
        username: "mobile-test",
        created_at: "2026-01-01T00:00:00Z",
      },
      "/api/v1/health": { status: "ok" },
      "/api/v1/dashboard": {
        total_checkins: 2924,
        unique_beers: 2325,
        unique_breweries: 640,
        unique_styles: 209,
        average_personal_rating: null,
        rated_checkins: 0,
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
        import_deltas: {
          total_checkins: -2345,
          unique_beers: 2345,
          unique_breweries: 0,
          unique_styles: null,
        },
      },
      "/api/v1/milestones": { milestones: [] },
      "/api/v1/insights": { insights: [] },
      "/api/v1/analytics/checkins": {
        start: "2026-01-01",
        end: "2026-01-31",
        timezone: "Europe/Amsterdam",
        granularity: "month",
        summary: {
          total_checkins: 0,
          new_discoveries: 0,
          repeat_checkins: 0,
          distinct_beers: 0,
        },
        cumulative_baseline_checkins: 0,
        cumulative_baseline_discoveries: 0,
        buckets: [],
      },
    };
    await route.fulfill({
      status: path in responses ? 200 : 404,
      json: responses[path] ?? { detail: "Not found" },
    });
  });
}

test("dashboard import deltas fit a narrow mobile viewport and meet contrast", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await stubDashboard(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your beer journey" }),
  ).toBeVisible();

  const positive = page.locator(".dashboard-import-delta.increase");
  const negative = page.locator(".dashboard-import-delta.decrease");
  const unchanged = page.locator(".dashboard-import-delta.unchanged");
  await expect(positive).toContainText("+2,345 since last import");
  await expect(negative).toContainText("−2,345 since last import");
  await expect(unchanged).toContainText("No change since last import");
  await expect(
    page.locator(".dashboard-primary .dashboard-metric-card"),
  ).toHaveCount(4);

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  for (const indicator of [positive, negative, unchanged]) {
    expect(await contrastRatio(indicator)).toBeGreaterThanOrEqual(4.5);
  }

  await page.emulateMedia({ colorScheme: "dark" });
  for (const indicator of [positive, negative, unchanged]) {
    expect(await contrastRatio(indicator)).toBeGreaterThanOrEqual(4.5);
  }
});
