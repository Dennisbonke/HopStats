import { expect, test, type Page, type Locator } from "@playwright/test";
import { stubPages } from "./landscape-fixtures";
import { stubBeer } from "./landscape-beer-fixtures";

const viewports = [
  [568, 240],
  [667, 260],
  [740, 320],
  [844, 280],
  [844, 390],
  [932, 430],
  [1024, 600],
];
async function contained(control: Locator, page: Page) {
  await expect(control).toBeInViewport();
  const box = (await control.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(
    page.viewportSize()!.height + 1,
  );
  expect(box.height).toBeGreaterThanOrEqual(43);
}
async function canvas(page: Page, theme: string) {
  await expect(page.locator(".app")).toBeVisible();
  const geometry = await page.evaluate(() => {
    const html = document.documentElement;
    const app = document.querySelector(".app")!;
    return {
      colors: [html, document.body, document.querySelector("#root")!, app].map(
        (el) => getComputedStyle(el).backgroundColor,
      ),
      scheme: getComputedStyle(html).colorScheme,
      viewportWidth: html.clientWidth,
      heights: [html, document.body, document.querySelector("#root")!, app].map(
        (el) => el.getBoundingClientRect().height,
      ),
      widths: [html, document.body, document.querySelector("#root")!, app].map(
        (el) => el.getBoundingClientRect().width,
      ),
      overflow: html.scrollWidth - html.clientWidth,
    };
  });
  expect(geometry.scheme).toBe(theme);
  expect(new Set(geometry.colors).size).toBe(1);
  expect(geometry.colors[0]).not.toBe("rgba(0, 0, 0, 0)");
  geometry.widths.forEach((width) =>
    expect(Math.abs(width - geometry.viewportWidth)).toBeLessThanOrEqual(1),
  );
  geometry.heights.forEach((height) =>
    expect(height).toBeGreaterThanOrEqual(page.viewportSize()!.height),
  );
  expect(geometry.overflow).toBeLessThanOrEqual(1);
}
// Capture chart artifacts after their entrance animation reaches a stable,
// nonempty geometry, rather than taking an image of the initial zero-height bars.
async function settleBars(page: Page) {
  let previous = "";
  await expect
    .poll(async () => {
      const heights = await page
        .locator(".chart-canvas .recharts-bar-rectangle path")
        .evaluateAll((nodes) =>
          nodes.map(
            (node) => Math.round(node.getBoundingClientRect().height * 10) / 10,
          ),
        );
      const current = JSON.stringify(heights);
      const stable =
        heights.some((height) => height > 0) && previous === current;
      previous = current;
      return stable;
    })
    .toBe(true);
}
for (const theme of ["light", "dark"] as const) {
  for (const [width, height] of viewports) {
    test(`short landscape application geometry ${width}x${height} ${theme}`, async ({
      page,
    }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height });
      await stubPages(page, true);
      const compact = width <= 960;
      for (const route of [
        "/",
        "/milestones",
        "/milestones/1",
        "/inventory",
        "/locations",
        "/imports",
        "/analytics",
      ]) {
        await page.goto(route);
        await expect(page.locator(".app-header")).toBeVisible();
        if (route === "/")
          await expect(
            page.locator(".dashboard-primary strong").first(),
          ).toHaveText("12");
        await canvas(page, theme);
        const header = (await page.locator(".app-header").boundingBox())!;
        const main = (await page.locator(".app-main").boundingBox())!;
        // At most 60px for a 44px menu target and spacing; content starts
        // within 12px of the header, leaving room for useful page content.
        if (compact) {
          expect(header.height).toBeLessThanOrEqual(60);
          expect(main.y).toBeLessThanOrEqual(header.y + header.height + 1);
          const padding = await page
            .locator(".app-main")
            .evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
          expect(padding).toBeLessThanOrEqual(12);
          await contained(
            page.getByRole("button", { name: "Main menu" }),
            page,
          );
        }
        if (
          compact &&
          width >= 700 &&
          (route === "/" || route === "/milestones")
        ) {
          const cells = page.locator(
            route === "/"
              ? ".dashboard-primary .dashboard-metric-card"
              : ".milestone-counts > *",
          );
          const tops = await cells.evaluateAll((nodes) =>
            nodes.map((node) => node.getBoundingClientRect().top),
          );
          expect(tops).toHaveLength(4);
          expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
        }
        if (width === 844 && height === 280) {
          if (route === "/analytics") {
            await page
              .locator(".chart-canvas")
              .first()
              .scrollIntoViewIfNeeded();
            await settleBars(page);
          }
          await page.screenshot({
            path: info.outputPath(
              `${route.replaceAll("/", "-") || "dashboard"}-${theme}.png`,
            ),
          });
        }
      }
      const explorer = await page.context().newPage();
      await stubBeer(explorer);
      await explorer.setViewportSize({ width, height });
      await explorer.goto("/explore/beers");
      await expect(
        explorer.locator(
          compact ? ".explorer-beer-cards" : ".explorer-beer-table",
        ),
      ).toBeVisible();
      if (compact) {
        const firstResult = (await explorer
          .locator(".explorer-beer-card")
          .first()
          .boundingBox())!;
        expect(firstResult.y).toBeLessThan(height - 30);
        await contained(explorer.getByLabel("Sort beers"), explorer);
        await explorer.getByRole("button", { name: "Filters (0)" }).click();
        const sheet = explorer.getByRole("dialog");
        await contained(
          sheet.getByRole("button", { name: "Apply filters" }),
          explorer,
        );
        await sheet.getByRole("button", { name: "Cancel" }).click();
      }
      await explorer.close();
    });
  }
  test(`short landscape Explorer rotation, safe areas and overlays ${theme}`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await stubBeer(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/explore/beers?sort=name_asc&rating_min=3");
    await expect(page.locator(".explorer-beer-cards")).toBeVisible();
    const portraitContentTop = (await page
      .locator(".explorer-beer-card")
      .first()
      .boundingBox())!.y;
    await page.screenshot({ path: info.outputPath(`portrait-${theme}.png`) });
    await page.getByRole("button", { name: "Filters (1)" }).click();
    await page.setViewportSize({ width: 844, height: 280 });
    const sheet = page.getByRole("dialog");
    await contained(sheet.getByRole("button", { name: "Apply filters" }), page);
    await contained(sheet.getByRole("button", { name: "Close filters" }), page);
    await sheet
      .locator(".explorer-sheet-scroll")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.screenshot({
      path: info.outputPath(`filter-sheet-${theme}.png`),
    });
    await sheet.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/sort=name_asc/);
    await expect(page).toHaveURL(/rating_min=3/);
    await expect(page.locator("body")).not.toHaveCSS("position", "fixed");
    await page.evaluate(() => window.scrollTo(0, 0));
    await canvas(page, theme);
    await expect(page.locator(".explorer-filter-sidebar")).toBeHidden();
    await contained(page.getByRole("button", { name: "Filters (1)" }), page);
    await contained(
      page.getByRole("button", { name: "Search", exact: true }),
      page,
    );
    const card = (await page
      .locator(".explorer-beer-card")
      .first()
      .boundingBox())!;
    // Even with an active chip, expose at least 30px of the first result.
    expect(card.y).toBeLessThan(250);
    expect(card.y).toBeLessThan(portraitContentTop - 60);
    await page.screenshot({ path: info.outputPath(`catalogue-${theme}.png`) });
    await page.getByRole("button", { name: "Main menu" }).click();
    const menu = page.getByRole("navigation", { name: "Main navigation" });
    await menu
      .getByRole("button", { name: /Sign out/ })
      .scrollIntoViewIfNeeded();
    await contained(menu.getByRole("button", { name: /Sign out/ }), page);
    await page.screenshot({ path: info.outputPath(`navigation-${theme}.png`) });
    await page.keyboard.press("Escape");
    // CSS custom properties are a test seam for insets emulators cannot provide.
    for (const [left, right] of [
      [44, 12],
      [12, 44],
    ]) {
      await page.evaluate(
        ({ left, right }) => {
          const style = document.documentElement.style;
          style.setProperty("--safe-left", `${left}px`);
          style.setProperty("--safe-right", `${right}px`);
          style.setProperty("--safe-top", "6px");
          style.setProperty("--safe-bottom", "21px");
        },
        { left, right },
      );
      await canvas(page, theme);
      const bounds = await page.locator(".explorer-page").boundingBox();
      expect(bounds!.x).toBeCloseTo(Math.max(16, left), 0);
      expect(bounds!.x + bounds!.width).toBeCloseTo(
        844 - Math.max(16, right),
        0,
      );
      await page.screenshot({
        path: info.outputPath(`safe-${left}-${right}-${theme}.png`),
      });
      await page.getByRole("button", { name: "Filters (1)" }).click();
      const closeBox = (await sheet
        .getByRole("button", { name: "Close filters" })
        .boundingBox())!;
      expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(844 - right);
      await contained(
        sheet.getByRole("button", { name: "Apply filters" }),
        page,
      );
      await page.screenshot({
        path: info.outputPath(`safe-sheet-${left}-${right}-${theme}.png`),
      });
      await sheet.getByRole("button", { name: "Cancel" }).click();
    }
    await page.emulateMedia({
      colorScheme: theme === "dark" ? "light" : "dark",
    });
    await canvas(page, theme === "dark" ? "light" : "dark");
    await page.emulateMedia({ colorScheme: theme });
    await page.reload();
    await canvas(page, theme);
    await page.locator(".explorer-beer-card").first().click();
    await expect(page.locator(".beer-profile")).toBeVisible();
    await page.screenshot({ path: info.outputPath(`detail-${theme}.png`) });
    await page.locator(".beer-rating-chart").scrollIntoViewIfNeeded();
    await page.locator(".recharts-line-dot").last().hover();
    const tooltip = page.locator(".analytics-tooltip");
    await expect(tooltip).toBeVisible();
    const box = (await tooltip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(281);
    await page.screenshot({ path: info.outputPath(`chart-${theme}.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("body")).not.toHaveCSS("position", "fixed");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/explore/beers");
    await expect(page.locator(".explorer-filter-sidebar")).toBeVisible();
    await expect(page.locator(".explorer-filter-sidebar")).not.toContainText(
      "Loading",
    );
    await page.screenshot({ path: info.outputPath(`desktop-${theme}.png`) });
  });
  test(`short landscape form dialog rotates and scrolls ${theme}`, async ({
    page,
  }, info) => {
    await stubPages(page, true);
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 844, height: 280 });
    await page.goto("/milestones");
    await page.getByRole("button", { name: "Create milestone" }).click();
    const dialog = page.getByRole("dialog", { name: "Create milestone" });
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: info.outputPath(`form-${theme}.png`) });
    for (const viewport of [
      { width: 568, height: 240 },
      { width: 568, height: 160 },
      { width: 390, height: 844 },
      { width: 844, height: 280 },
    ]) {
      await page.setViewportSize(viewport);
      const cancel = dialog.getByRole("button", { name: "Cancel" });
      await cancel.scrollIntoViewIfNeeded();
      await contained(cancel, page);
    }
    await page.screenshot({
      path: info.outputPath(`form-actions-${theme}.png`),
    });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  });
}

test("compact backend failure remains actionable", async ({ page }) => {
  await stubPages(page, true);
  await page.route("**/api/v1/health", (route) =>
    route.fulfill({ status: 503, json: { detail: "Unavailable" } }),
  );
  await page.setViewportSize({ width: 568, height: 240 });
  await page.goto("/");
  await expect(page.locator(".app-status")).toBeVisible();
  await expect(page.locator(".app-status")).toHaveText("Backend: unavailable");
  await expect(page.locator(".header-connection")).toHaveCount(0);
});

test("landscape authentication and keyboard-height form scrolling", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 401, json: { detail: "Sign in required" } }),
  );
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 568, height: 240 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    const submit = page.getByRole("button", { name: "Sign in" });
    await submit.scrollIntoViewIfNeeded();
    await contained(submit, page);
    await expect(page.locator("html")).toHaveCSS("color-scheme", theme);
  }
});
