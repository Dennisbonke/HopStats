import { expect, test, type Page } from "@playwright/test";

const viewports = [
  [320, 568],
  [375, 667],
  [390, 844],
  [430, 932],
  [667, 375],
  [844, 390],
  [932, 430],
  [768, 1024],
  [1280, 800],
  [1920, 1080],
];
const routes = ["/", "/analytics", "/inventory", "/locations", "/imports"];
const crossBrowserViewports = [
  [390, 844],
  [844, 390],
  [1280, 800],
];

async function expectNoDocumentOverflow(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const overflow = await page.evaluate(() => ({
    amount:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    offenders: Array.from(document.querySelectorAll("body *"))
      .map((element) => ({
        element: element.tagName.toLowerCase(),
        className: element instanceof HTMLElement ? element.className : "",
        bounds: (() => {
          const rect = element.getBoundingClientRect();
          return {
            x: Math.round(rect.x),
            width: Math.round(rect.width),
            right: Math.round(rect.right),
          };
        })(),
        parentWidth: Math.round(
          element.parentElement?.getBoundingClientRect().width ?? 0,
        ),
        ancestors: [element.parentElement, element.parentElement?.parentElement]
          .filter(
            (parent): parent is HTMLElement => parent instanceof HTMLElement,
          )
          .map((parent) => ({
            className: parent.className,
            width: Math.round(parent.getBoundingClientRect().width),
            style: parent.getAttribute("style"),
          })),
        html: element.outerHTML.slice(0, 180),
      }))
      .filter(
        (element) =>
          element.bounds.right > document.documentElement.clientWidth + 1,
      )
      .slice(0, 5),
  }));
  expect(
    overflow.amount,
    JSON.stringify(overflow.offenders),
  ).toBeLessThanOrEqual(1);
}

test("application pages fit mobile portrait, landscape, tablet and desktop", async ({
  page,
}, testInfo) => {
  const testedViewports =
    testInfo.project.name === "chromium" ? viewports : crossBrowserViewports;
  const loginPage = await page.context().newPage();
  await loginPage.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 401, json: { detail: "Sign in required" } }),
  );
  for (const [width, height] of testedViewports) {
    await loginPage.setViewportSize({ width, height });
    await loginPage.goto("/");
    await expect(
      loginPage.getByRole("heading", { name: "Sign in" }),
    ).toBeVisible();
    await expectNoDocumentOverflow(loginPage);
  }
  await loginPage.close();

  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path.endsWith("/auth/me")) {
      body = { id: 1, username: "test", created_at: "2026-01-01T00:00:00Z" };
    } else if (path.endsWith("/dashboard")) {
      body = {
        total_checkins: 0,
        unique_beers: 0,
        unique_breweries: 0,
        unique_styles: 0,
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
    } else if (path.endsWith("/inventory/styles")) {
      body = [];
    } else if (path.endsWith("/inventory")) {
      body = { items: [], total: 0, page: 1, page_size: 25, total_pages: 0 };
    } else if (path.endsWith("/locations")) {
      body = { locations: [], unresolved: { record_count: 0, total_units: 0 } };
    } else if (path.endsWith("/imports")) {
      body = [];
    }
    await route.fulfill({ json: body });
  });

  for (const [width, height] of testedViewports) {
    await page.setViewportSize({ width, height });
    for (const route of routes) {
      await page.goto(route);
      await page.locator("main").waitFor();
      await expectNoDocumentOverflow(page);
      const heading = page.locator("main h2").first();
      if (await heading.count()) {
        const bounds = await heading.boundingBox();
        expect(bounds?.x! + bounds?.width!).toBeLessThanOrEqual(width + 1);
      }
      if (width === 390 && route === "/") {
        await page.screenshot({
          path: testInfo.outputPath("dashboard-390.png"),
          fullPage: true,
        });
      }
      if (width === 390 && route === "/analytics") {
        await expect(
          page.getByRole("group", { name: /stacked bar chart/i }),
        ).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath("analytics-390.png"),
          fullPage: true,
        });
        await page
          .getByRole("button", { name: "Open Jan 2026" })
          .first()
          .click();
        await page.getByRole("button", { name: "Cumulative" }).click();
        await expect(
          page.getByRole("button", { name: "Cumulative" }),
        ).toHaveAttribute("aria-pressed", "true");
        await expectNoDocumentOverflow(page);
      }
    }
  }

  // Keep Analytics mounted throughout rotation and interaction.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/analytics");
  await expect(
    page.getByRole("group", { name: /stacked bar chart/i }),
  ).toBeVisible();
  await expectNoDocumentOverflow(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await expectNoDocumentOverflow(page);
  await page.getByLabel("Granularity").selectOption("week");
  await expectNoDocumentOverflow(page);
  await page.getByRole("button", { name: "Cumulative" }).click();
  await expectNoDocumentOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoDocumentOverflow(page);
});

// Recharts positions its tooltip from chart interaction coordinates. This test
// covers stale tooltip state on resize; Playwright does not reproduce the
// reported physical iOS Safari document overflow.
test("weekly chart tooltips stay within the document after orientation changes", async ({
  page,
}) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path.endsWith("/auth/me")) {
      body = { id: 1, username: "test", created_at: "2026-01-01T00:00:00Z" };
    } else if (path.endsWith("/dashboard")) {
      body = {
        total_checkins: 1,
        unique_beers: 1,
        unique_breweries: 1,
        unique_styles: 1,
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
      };
    } else if (path.endsWith("/analytics/checkins")) {
      const buckets = Array.from({ length: 40 }, (_, index) => {
        const startDate = new Date(Date.UTC(2026, 0, 5 + index * 7));
        const key = startDate.toISOString().slice(0, 10);
        const label = `Week ${String(index + 1).padStart(2, "0")}, 2026`;
        return {
          key,
          label,
          start: key,
          end: key,
          new_discoveries: 1,
          repeat_checkins: 1,
          total_checkins: 2,
          cumulative_checkins: (index + 1) * 2,
          cumulative_discoveries: index + 1,
        };
      });
      body = {
        start: buckets[0].start,
        end: buckets.at(-1)?.end,
        timezone: "Europe/Amsterdam",
        granularity: "week",
        summary: {
          total_checkins: 80,
          new_discoveries: 40,
          repeat_checkins: 40,
          distinct_beers: 40,
        },
        cumulative_baseline_checkins: 0,
        cumulative_baseline_discoveries: 0,
        buckets,
      };
    }
    await route.fulfill({ json: body });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "/analytics?period=custom&start=2026-01-05&end=2026-10-05&granularity=week",
  );
  const bars = page.locator(".recharts-bar-rectangle");
  await expect(bars).toHaveCount(80);
  await bars.last().hover();
  const tooltip = page.locator(".recharts-tooltip-wrapper").first();
  const lineTooltip = page.locator(".recharts-tooltip-wrapper").nth(1);
  await expect(tooltip).toBeVisible();
  const measureLayout = () =>
    page.evaluate(() => {
      const bounds = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          position: style.position,
          transform: style.transform,
        };
      };
      return {
        innerWidth: window.innerWidth,
        scrollX: window.scrollX,
        clientWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        visualViewportWidth: window.visualViewport?.width ?? null,
        visualViewportOffsetLeft: window.visualViewport?.offsetLeft ?? null,
        chartContainer: bounds(".chart-canvas .recharts-responsive-container"),
        chartSvg: bounds(".chart-canvas .recharts-wrapper"),
        tooltip: bounds(".chart-canvas .recharts-tooltip-wrapper"),
      };
    });
  const before = await measureLayout();
  expect(before.tooltip!.left).toBeGreaterThanOrEqual(-1);
  expect(before.tooltip!.right).toBeLessThanOrEqual(before.clientWidth + 1);

  await page.mouse.move(5, 5);
  await expect(tooltip).toBeHidden();
  const lineChartLocator = page
    .locator(".chart-canvas .recharts-wrapper")
    .nth(1);
  await lineChartLocator.scrollIntoViewIfNeeded();
  const lineChart = await lineChartLocator.boundingBox();
  await page.mouse.move(
    lineChart!.x + lineChart!.width * 0.65,
    lineChart!.y + 150,
  );
  await expect(lineTooltip).toBeVisible();
  await expect(tooltip).toBeHidden();
  await page.mouse.move(5, 5);
  await expect(lineTooltip).toBeHidden();
  await bars.last().hover();
  await expect(tooltip).toBeVisible();
  await expect(lineTooltip).toBeHidden();

  await page.setViewportSize({ width: 844, height: 390 });
  await expect
    .poll(async () => (await measureLayout()).chartSvg!.width)
    .toBeGreaterThan(before.chartSvg!.width);
  const landscape = await measureLayout();
  expect(await tooltip.isVisible()).toBe(false);
  expect(landscape.documentWidth - landscape.clientWidth).toBeLessThanOrEqual(
    1,
  );
  expect(landscape.bodyWidth - landscape.clientWidth).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => (await measureLayout()).chartSvg!.width)
    .toBeLessThan(landscape.chartSvg!.width);
  const after = await measureLayout();
  expect(await tooltip.isVisible()).toBe(false);
  expect(after.documentWidth - after.clientWidth).toBeLessThanOrEqual(1);
  expect(after.bodyWidth - after.clientWidth).toBeLessThanOrEqual(1);
  await page.evaluate(() =>
    window.scrollBy({ left: 1000, behavior: "instant" }),
  );
  expect(await page.evaluate(() => window.scrollX)).toBeLessThanOrEqual(1);
  const afterSwipe = await measureLayout();
  expect(afterSwipe.scrollX).toBeLessThanOrEqual(1);
  expect(afterSwipe.documentWidth - afterSwipe.clientWidth).toBeLessThanOrEqual(
    1,
  );
  expect(afterSwipe.bodyWidth - afterSwipe.clientWidth).toBeLessThanOrEqual(1);
  expect(await tooltip.isVisible()).toBe(false);

  await bars.nth(10).hover();
  await expect(tooltip).toBeVisible();
  await expect(lineTooltip).toBeHidden();
  const nextTooltip = await tooltip.boundingBox();
  expect(nextTooltip!.x).toBeGreaterThanOrEqual(-1);
  expect(nextTooltip!.x + nextTooltip!.width).toBeLessThanOrEqual(
    after.clientWidth + 1,
  );
});
