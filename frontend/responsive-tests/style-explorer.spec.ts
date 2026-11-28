import { expect, test, type Page } from "@playwright/test";
import { beer } from "./landscape-beer-fixtures";
import { style, stubStyles } from "./style-fixtures";
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
}
for (const viewport of [
  { width: 1440, height: 900, theme: "light" },
  { width: 390, height: 844, theme: "dark" },
  { width: 320, height: 740, theme: "light" },
  { width: 844, height: 390, theme: "dark" },
] as const) {
  test(`Styles catalogue and detail ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: viewport.theme });
    const unexpected = await stubStyles(page);
    await page.goto("/explore/styles");
    const mobile = viewport.width <= 700 || viewport.height < 500;
    await expect(
      page.getByRole("link", { name: "Styles", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".explorer-beer-table-wrap")).toBeVisible({
      visible: !mobile,
    });
    await expect(page.locator(".explorer-beer-cards")).toBeVisible({
      visible: mobile,
    });
    await noOverflow(page);
    if (mobile) {
      await page
        .getByRole("button", { name: "Filters (0)", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByText("Exploration", { exact: true }).click();
      await dialog.getByLabel("Minimum distinct breweries").fill("0");
      await dialog.getByText("Average ABV", { exact: true }).click();
      await dialog
        .getByRole("spinbutton", { name: "Average ABV minimum" })
        .fill("0");
      await dialog
        .getByRole("spinbutton", { name: "Average ABV minimum" })
        .blur();
      await noOverflow(page);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(page).toHaveURL(/\/explore\/styles$/);
      await page
        .getByRole("button", { name: "Filters (0)", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByText("Exploration", { exact: true })
        .click();
      await page.getByLabel("Minimum distinct breweries").fill("0");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Apply filters" })
        .click();
    } else {
      await page.getByLabel("Minimum distinct breweries").fill("0");
      await page.getByLabel("Minimum distinct breweries").blur();
    }
    await expect(page).toHaveURL(/min_breweries=0/);
    await page.getByLabel("Search styles", { exact: true }).fill("Imperial");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/search=Imperial/);
    const first = mobile
      ? page.getByRole("link").filter({
          has: page.getByRole("heading", { name: style.name, exact: true }),
        })
      : page.getByRole("link", { name: style.name, exact: true });
    await expect(first).toBeVisible();
    if (testInfo.project.name === "chromium" && viewport.width === 390)
      await page.screenshot({
        path: testInfo.outputPath("styles-catalogue.png"),
        fullPage: true,
      });
    await first.click();
    await expect(
      page.getByRole("heading", { name: style.name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Styles", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("10.00%", { exact: true })).toBeVisible();
    await expect(page.getByText(/based on 2 distinct beers/)).toBeVisible();
    const chart = page.getByRole("group", {
      name: "Personal check-in rating distribution",
    });
    const plot = chart.locator('[data-chart-bucket="9"]');
    await plot.scrollIntoViewIfNeeded();
    if (mobile) {
      await plot.evaluate(async (region) => {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        const box = region.getBoundingClientRect();
        const pointer = {
          pointerType: "touch",
          pointerId: 7,
          isPrimary: true,
          bubbles: true,
          clientX: box.x + box.width / 2,
          clientY: box.y + box.height / 2,
        };
        region.dispatchEvent(new PointerEvent("pointerdown", pointer));
        region.dispatchEvent(new PointerEvent("pointerup", pointer));
      });
    } else {
      const box = (await plot.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }
    await expect(page.locator(".analytics-tooltip").first()).toBeVisible();
    await chart.locator("svg.recharts-surface").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".analytics-tooltip").first()).toBeVisible();
    await page
      .getByText("View rating distribution data", { exact: true })
      .click();
    await expect(
      page.getByText("4.50–5.00: 1 check-ins", { exact: true }),
    ).toBeVisible();
    await noOverflow(page);
    if (testInfo.project.name === "chromium" && viewport.width === 390)
      await page.screenshot({
        path: testInfo.outputPath("style-detail.png"),
        fullPage: true,
      });
    await page.getByRole("link", { name: beer.name, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: beer.name, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "← Back to style", exact: true })
      .click();
    await page
      .getByRole("link", { name: "← Back to styles", exact: true })
      .click();
    await expect(page).toHaveURL(/min_breweries=0.*search=Imperial/);
    expect(unexpected).toEqual([]);
  });
}

test("cross-entity round trips preserve catalogue identity, scroll, back and forward", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const unexpected = await stubStyles(page);
  for (const [origin, destination] of [
    ["styles", "breweries"],
    ["beers", "styles"],
    ["breweries", "styles"],
  ] as const) {
    const url = `/explore/${origin}?search=${origin === "styles" ? "Imperial" : ""}&sort=${origin === "beers" ? "rating_desc" : "unique_beers_desc"}`;
    await page.goto(url);
    const first = page.locator(".explorer-beer-link").first();
    await expect(first).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 180));
    const saved = await page.evaluate(() => window.scrollY);
    await first.click();
    await expect(page.locator("h1")).toBeVisible();
    const cross =
      origin === "styles"
        ? page.getByRole("link", {
            name: `${beer.brewery.name}: 2 unique beers`,
            exact: true,
          })
        : origin === "beers"
          ? page.getByRole("link", { name: style.name, exact: true })
          : page.getByRole("link", {
              name: `${style.name}: 2 unique beers`,
              exact: true,
            });
    await cross.click();
    await expect(page).toHaveURL(new RegExp(`/explore/${destination}/`));
    await page.reload();
    await expect(page.locator("h1")).toBeVisible();
    await page.locator(".beer-detail-back").first().click();
    await expect(page.locator("h1")).toBeVisible();
    await page.locator(".beer-detail-back").first().click();
    await expect(page).toHaveURL(url);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(saved, 0);
    await page.goBack();
    await page.goForward();
    await expect(page).toHaveURL(url);
    // A catalogue shortcut creates a fresh SPA history entry; same-URL goto is a reload.
    await page.getByRole("link", { name: "Styles", exact: true }).click();
    await expect(page).toHaveURL("/explore/styles");
    await expect(page.locator(".explorer-beer-link").first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  }
  expect(unexpected).toEqual([]);
});
