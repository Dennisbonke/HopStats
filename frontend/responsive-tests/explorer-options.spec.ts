import { expect, test } from "@playwright/test";
import { stubBeer } from "./landscape-beer-fixtures";
import {
  optionResponse,
  stubExplorerOptions,
} from "./explorer-option-fixtures";

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 844, height: 280 },
]) {
  test(`Explorer option lists load and scroll at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await stubBeer(page);
    const data = {
      breweries: Array.from({ length: 55 }, (_, id) => ({
        id: id + 1,
        name: `Brewery ${String(id + 1).padStart(3, "0")} with a long regional name`,
      })),
      styles: Array.from({ length: 105 }, (_, id) => ({
        id: id + 1,
        name: `Style ${String(id + 1).padStart(3, "0")}`,
      })),
      countries: Array.from(
        { length: 105 },
        (_, id) => `Country ${String(id + 1).padStart(3, "0")}`,
      ),
      unknown: true,
    };
    await stubExplorerOptions(page, data);
    const intercepted: URL[] = [];
    let failed = false;
    await page.route(
      "**/api/v1/explore/filter-options/breweries?*",
      async (route) => {
        const url = new URL(route.request().url());
        intercepted.push(url);
        if (url.searchParams.get("offset") === "25" && !failed) {
          failed = true;
          await route.fulfill({ status: 503, json: { detail: "Try again" } });
        } else await route.fulfill({ json: optionResponse(url, data) });
      },
    );
    await page.goto("/explore/beers");
    const mobile = viewport.width < 1024;
    if (mobile) await page.getByRole("button", { name: /^Filters/ }).click();
    const scope = mobile
      ? page.getByRole("dialog")
      : page.locator(".explorer-filter-sidebar");
    const breweries = scope.getByLabel("Available breweries");
    await expect(breweries.getByRole("checkbox")).toHaveCount(25);
    await breweries.getByRole("checkbox").first().check();
    await breweries.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect(breweries.getByRole("alert")).toBeVisible();
    await expect(breweries.getByRole("checkbox")).toHaveCount(25);
    await breweries.getByRole("button", { name: "Retry" }).click();
    await expect(breweries.getByRole("checkbox")).toHaveCount(50);
    expect(
      intercepted.filter((url) => url.searchParams.get("offset") === "25"),
    ).toHaveLength(2);
    await expect(breweries.getByRole("checkbox").first()).toBeChecked();
    await breweries.focus();
    await page.keyboard.press("End");
    await breweries.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect(breweries.getByRole("checkbox")).toHaveCount(55);
    await scope.getByLabel("Search breweries").fill("055");
    await expect(breweries.getByRole("checkbox")).toHaveCount(1);
    await expect(
      scope.getByRole("button", { name: /^Remove Brewery 001/ }),
    ).toBeVisible();
    if (mobile)
      await scope.locator("summary").filter({ hasText: "Beer style" }).click();
    await expect(
      scope.getByLabel("Available styles").getByRole("checkbox"),
    ).toHaveCount(105);
    await scope.getByLabel("Search styles").fill("105");
    await expect(scope.getByLabel("Style 105", { exact: true })).toBeVisible();
    await expect(
      scope.getByRole("button", { name: /Load more|More countries/ }),
    ).toHaveCount(0);
    const lists = scope.locator(".explorer-options");
    for (const list of await lists.all()) {
      expect(
        await list.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      ).toBe(true);
    }
    await page.screenshot({ path: info.outputPath("beer-options.png") });
    if (mobile)
      await scope.getByRole("button", { name: "Cancel", exact: true }).click();
    // Countries need a catalogue response but no real backend.
    await page.route(/\/api\/v1\/explore\/breweries\?/, (route) =>
      route.fulfill({
        json: { items: [], page: 1, page_size: 25, total: 0, total_pages: 0 },
      }),
    );
    await page.goto("/explore/breweries");
    if (mobile) await page.getByRole("button", { name: /^Filters/ }).click();
    const countries = page.getByLabel("Available countries");
    await expect(countries.getByRole("checkbox")).toHaveCount(106);
    await countries.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const lastCountry = countries.getByLabel("Country 105", { exact: true });
    await lastCountry.scrollIntoViewIfNeeded();
    await expect(lastCountry).toBeInViewport();
    expect(
      await countries.evaluate((node) => node.scrollHeight > node.clientHeight),
    ).toBe(true);
    await page.getByLabel("Search countries").fill("105");
    await expect(page.getByLabel("Country 105", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "More countries" }),
    ).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("country-options.png") });
  });
}
