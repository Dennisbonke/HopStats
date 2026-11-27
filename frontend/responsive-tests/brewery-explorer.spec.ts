import { expect, test, type Page } from "@playwright/test";
import { beer, stubBeer } from "./landscape-beer-fixtures";
const brewery = {
  ...beer.brewery,
  name: "A Very Long Brewery Name With An ExtraordinarilyLongUnbrokenRegionalCooperativeName",
  city: "Amsterdam with a very long neighbourhood name",
  state: "Noord-Holland with a long region name",
  unique_beer_count: 2,
  checkin_count: 26,
  rated_checkin_count: 4,
  personal_average_rating: 3.125,
  first_checked_in_at: beer.first_checked_in_at,
  last_checked_in_at: beer.last_checked_in_at,
};
async function stub(page: Page) {
  await stubBeer(page);
  await page.route("**/api/v1/explore/brewery-countries*", (route) =>
    route.fulfill({
      json: {
        items: ["Netherlands"],
        unknown_available: true,
        has_more: false,
      },
    }),
  );
  await page.route("**/api/v1/explore/breweries*", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: url.pathname.endsWith("/2")
        ? {
            ...brewery,
            style_count: 1,
            highest_rating: 5,
            lowest_rating: 0,
            untappd_url: "https://untappd.com/brewery/765",
            rating_distribution: Array.from({ length: 10 }, (_, i) => ({
              lower: i / 2,
              upper: (i + 1) / 2,
              count: i === 0 ? 1 : i === 7 ? 1 : i === 8 ? 1 : i === 9 ? 1 : 0,
            })),
            most_explored_styles: [
              { id: 3, name: beer.style.name, unique_beer_count: 2 },
            ],
            highest_rated_beers: [beer],
          }
        : {
            items: [brewery],
            page: Number(url.searchParams.get("page") || 1),
            page_size: 25,
            total: 26,
            total_pages: 2,
          },
    });
  });
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
const cases = [
  { width: 1440, height: 900, theme: "light" },
  { width: 390, height: 844, theme: "dark" },
  { width: 320, height: 740, theme: "light" },
  { width: 844, height: 390, theme: "dark" },
] as const;
for (const viewport of cases) {
  test(`brewery catalogue and details ${viewport.width}x${viewport.height} ${viewport.theme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: viewport.theme });
    await stub(page);
    const catalogue =
      "/explore/breweries?search=brewery&sort=rating_desc&rating_min=0&page=2";
    await page.goto(catalogue);
    const mobile = viewport.width <= 700 || viewport.height < 500;
    await expect(
      page.getByRole("link", { name: "Breweries", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".explorer-beer-table-wrap")).toBeVisible({
      visible: !mobile,
    });
    await expect(page.locator(".explorer-beer-cards")).toBeVisible({
      visible: mobile,
    });
    await noOverflow(page);
    const search = await page
      .getByRole("searchbox", { name: "Search breweries or locations" })
      .boundingBox();
    const searchButton = await page
      .getByRole("button", { name: "Search", exact: true })
      .boundingBox();
    expect(Math.abs(search!.y - searchButton!.y)).toBeLessThan(4);
    if (mobile) {
      await page.getByRole("button", { name: "Filters (1)" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByLabel("Netherlands", { exact: true }).check();
      expect(page.url()).not.toContain("country=");
      await dialog.getByRole("button", { name: "Apply filters" }).click();
      await expect(dialog).not.toBeVisible();
      await expect(page).toHaveURL(/country=Netherlands/);
      await page
        .getByRole("button", { name: "Remove Netherlands", exact: true })
        .click();
    } else {
      await expect(
        page.getByRole("complementary", { name: "Brewery filters" }),
      ).toBeVisible();
    }
    // Save this exact committed catalogue state, then verify explicit and browser return.
    const returnUrl = new URL(page.url()).pathname + new URL(page.url()).search;
    if (!mobile)
      await page
        .getByRole("button", { name: "Next", exact: true })
        .scrollIntoViewIfNeeded();
    const savedY = await page.evaluate(() => window.scrollY);
    if (
      testInfo.project.name === "chromium" &&
      (viewport.width === 1440 || viewport.width === 390)
    )
      await page.screenshot({
        path: testInfo.outputPath("brewery-catalogue.png"),
        fullPage: true,
      });
    const link = page
      .locator(mobile ? ".explorer-beer-card" : ".explorer-beer-link")
      .first();
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { level: 1, name: brewery.name }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Breweries", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".beer-personal-stats > div")).toHaveCount(9);
    await noOverflow(page);
    await page.getByRole("link", { name: "Explore all 2 beers" }).click();
    await expect(page).toHaveURL(/\/explore\/beers\?brewery_id=2/);
    await page.goBack();
    const chart = page.getByRole("group", {
      name: "Personal check-in rating distribution",
    });
    await chart.scrollIntoViewIfNeeded();
    await expect(chart.locator("svg.recharts-surface")).toBeVisible();
    const plot = chart.locator('[data-chart-bucket="9"]');
    const box = (await plot.boundingBox())!;
    if (mobile) {
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await chart.dispatchEvent("pointerdown", {
        pointerType: "touch",
        pointerId: 1,
        clientX: point.x,
        clientY: point.y,
      });
      await chart.dispatchEvent("pointerup", {
        pointerType: "touch",
        pointerId: 1,
        clientX: point.x,
        clientY: point.y,
      });
    } else {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }
    await expect(page.locator(".analytics-tooltip").first()).toBeVisible();
    await chart.locator("svg.recharts-surface").focus();
    await page.keyboard.press("ArrowRight");
    await page
      .getByText("View rating distribution data", { exact: true })
      .click();
    await expect(
      page.getByText("4.50–5.00: 1 check-ins", { exact: true }),
    ).toBeVisible();
    await noOverflow(page);
    if (
      testInfo.project.name === "chromium" &&
      (viewport.width === 1440 || viewport.width === 390)
    )
      await page.screenshot({
        path: testInfo.outputPath("brewery-detail.png"),
        fullPage: true,
      });
    await page.getByRole("link", { name: beer.name, exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: beer.name }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: beer.brewery.name, exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "← Back to beer", exact: true }),
    ).toBeVisible();
    await page.goBack();
    await page.goBack();
    await page
      .getByRole("link", { name: "← Back to breweries", exact: true })
      .click();
    await expect(page).toHaveURL(returnUrl);
    await expect(
      page.locator(".explorer-beer-card, .explorer-beer-link").first(),
    ).toBeAttached();
    if (!mobile)
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeCloseTo(savedY, 0);
    await page.goBack();
    await page.goForward();
    await expect(page).toHaveURL(returnUrl);
    if (mobile) {
      await page.getByRole("button", { name: "Main menu" }).click();
    }
    await page.getByRole("link", { name: "🍺 HopStats" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.locator(".mobile-menu-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
}
