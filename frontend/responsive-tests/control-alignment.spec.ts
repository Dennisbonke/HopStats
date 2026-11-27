import { expect, test, type Locator, type Page } from "@playwright/test";
import { stubPages } from "./landscape-fixtures";
import { stubBeer } from "./landscape-beer-fixtures";

const viewports = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 844, height: 280 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
];
const reportingUrl =
  "/analytics?period=custom&start=2026-01-01&end=2026-12-31&granularity=month";

async function boxes(locator: Locator) {
  return locator.evaluateAll((nodes) =>
    nodes.map((node) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
}
function equal(values: number[]) {
  expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1.5);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
}
async function reportingFixture(page: Page, longLabels = false) {
  await stubPages(page, true);
  await page.route("**/api/v1/analytics/checkins?*", (route) =>
    route.fulfill({
      json: {
        start: "2026-01-01",
        end: "2026-12-31",
        timezone: "Europe/Amsterdam",
        granularity: "month",
        summary: {
          total_checkins: 24,
          new_discoveries: 12,
          repeat_checkins: 12,
          distinct_beers: 12,
        },
        cumulative_baseline_checkins: 0,
        cumulative_baseline_discoveries: 0,
        // Eleven long labels also exercise an incomplete final row.
        buckets: Array.from({ length: longLabels ? 11 : 12 }, (_, index) => {
          const month = String(index + 1).padStart(2, "0");
          const start = `2026-${month}-01`;
          const end = new Date(Date.UTC(2026, index + 1, 0))
            .toISOString()
            .slice(0, 10);
          return {
            key: `2026-${month}`,
            label: longLabels
              ? `${start} – ${end}`
              : new Date(`${start}T12:00:00Z`).toLocaleDateString("en-GB", {
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                }),
            start,
            end,
            new_discoveries: 1,
            repeat_checkins: 1,
            total_checkins: 2,
            cumulative_checkins: (index + 1) * 2,
            cumulative_discoveries: index + 1,
          };
        }),
      },
    }),
  );
}
async function buttonGrid(group: Locator) {
  const buttons = group.getByRole("button");
  const geometry = await boxes(buttons);
  expect(geometry.length).toBeGreaterThan(3);
  equal(geometry.map((box) => box.width));
  equal(geometry.map((box) => box.height));
  geometry.forEach((box) => expect(box.height).toBeGreaterThanOrEqual(43));
  const columns = geometry.filter(
    (box) => Math.abs(box.y - geometry[0].y) < 1.5,
  );
  geometry.forEach((box, index) => {
    expect(
      Math.abs(box.x - columns[index % columns.length].x),
    ).toBeLessThanOrEqual(1.5);
  });
  expect(
    await buttons.evaluateAll((nodes) =>
      nodes.every(
        (node) =>
          node.scrollWidth <= node.clientWidth + 1 &&
          node.scrollHeight <= node.clientHeight + 1,
      ),
    ),
  ).toBe(true);
  return columns.length;
}

for (const theme of ["light", "dark"] as const) {
  for (const viewport of viewports) {
    test(`control alignment ${viewport.width}x${viewport.height} ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      await stubBeer(page);
      await page.goto("/explore/beers?rating_min=3");
      await expect(
        page.locator(".explorer-catalogue-heading > span"),
      ).toBeVisible();
      const controls = page.locator(
        ".explorer-controls input, .explorer-controls select, .explorer-controls > button:visible",
      );
      const geometry = await boxes(controls);
      equal(geometry.map((box) => box.height));
      for (const box of geometry) {
        const row = geometry.filter((other) => Math.abs(box.y - other.y) < 5);
        equal(row.map((other) => other.y));
        equal(row.map((other) => other.y + other.height));
      }
      const count = (await page
        .locator(".explorer-catalogue-heading > span")
        .boundingBox())!;
      expect(
        Math.min(...geometry.map((box) => box.y)) - count.y - count.height,
      ).toBeGreaterThanOrEqual(6);
      if (viewport.width === 844) {
        const heading = (await page
          .locator(".explorer-page > .page-heading")
          .boundingBox())!;
        const tabs = (await page.locator(".explorer-tabs").boundingBox())!;
        equal([heading.y + heading.height / 2, tabs.y + tabs.height / 2]);
      }
      await noOverflow(page);
      const capture =
        info.project.name === "chromium" &&
        (viewport.width === 390 ||
          (viewport.width === 844 &&
            viewport.height === 280 &&
            theme === "light"));
      if (capture)
        await page.screenshot({
          path: info.outputPath(`explorer-${theme}.png`),
        });
      await page.getByLabel("Sort beers").selectOption("name_asc");
      await page.getByLabel("Search beers or breweries").fill("stout");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await expect(page).toHaveURL(/search=stout/);
      await expect(page).toHaveURL(/sort=name_asc/);
      await expect(page).toHaveURL(/rating_min=3/);

      await reportingFixture(page);
      await page.goto(reportingUrl);
      await expect(page.locator(".bucket-actions")).toHaveCount(2);
      const fields = page.locator(".analytics-filters .ui-form-field__control");
      const fieldBoxes = await boxes(fields);
      expect(fieldBoxes).toHaveLength(4);
      equal(fieldBoxes.map((box) => box.height));
      equal(fieldBoxes.map((box) => box.width));
      for (const box of fieldBoxes) {
        equal(
          fieldBoxes
            .filter((other) => Math.abs(box.y - other.y) < 5)
            .map((other) => other.y),
        );
      }
      for (const group of await page.locator(".bucket-actions").all()) {
        const columns = await buttonGrid(group);
        if (viewport.width <= 390) expect(columns).toBe(3);
      }
      await noOverflow(page);
      if (capture)
        await page
          .locator(".analytics-filters")
          .screenshot({ path: info.outputPath(`reporting-${theme}.png`) });
      const group = page.locator(".bucket-actions").first();
      if (capture && viewport.width === 390)
        await group.screenshot({
          path: info.outputPath(`months-${theme}.png`),
        });
      const january = group.getByRole("button", { name: "Open Jan 2026" });
      await january.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/zoom=month/);
      await page
        .getByLabel("Granularity", { exact: true })
        .selectOption("week");
      await expect(page).toHaveURL(/granularity=week/);
      await page.getByLabel("Start date", { exact: true }).fill("2026-01-02");
      await expect(page).toHaveURL(/start=2026-01-02/);
      await expect(
        page.getByText("Timezone: Europe/Amsterdam", { exact: true }),
      ).toBeVisible();
    });
  }
}

test("long period labels fit equal columns with enlarged text and an incomplete row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await reportingFixture(page, true);
  await page.goto(reportingUrl);
  await expect(page.locator(".bucket-actions")).toHaveCount(2);
  await page.addStyleTag({ content: ":root { font-size: 20px; }" });
  for (const group of await page.locator(".bucket-actions").all()) {
    await expect(group.getByRole("button")).toHaveCount(11);
    expect(await buttonGrid(group)).toBe(2);
  }
  await noOverflow(page);
});
