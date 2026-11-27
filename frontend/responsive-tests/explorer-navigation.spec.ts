import { optionResponse } from "./explorer-option-fixtures";
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

async function contrastRatio(
  text: Locator,
  surfaceSelector: string,
): Promise<number> {
  const { foreground, background } = await text.evaluate(
    (node, surfaceSelector) => ({
      foreground: getComputedStyle(node).color,
      background: getComputedStyle(
        document.querySelector(surfaceSelector) as HTMLElement,
      ).backgroundColor,
    }),
    surfaceSelector,
  );
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function stubExplorer(
  page: Page,
  items = [
    {
      id: 1,
      name: "A Long-named Hoppy Beer That Wraps on Small Screens",
      brewery: { id: 1, name: "A Brewery with a Long Name" },
      style: { id: 2, name: "West Coast IPA" },
      abv: 6.5,
      ibu: 55,
      photo_url: null,
      checkin_count: 3,
      rated_checkin_count: 2,
      personal_average_rating: 4.25,
      first_checked_in_at: "2026-01-01T00:00:00Z",
      last_checked_in_at: "2026-01-02T00:00:00Z",
    },
  ],
) {
  await page.context().route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      "/api/v1/auth/me": {
        id: 1,
        username: "visual-test",
        created_at: "2026-01-01T00:00:00Z",
      },
      "/api/v1/health": { status: "ok" },
      "/api/v1/explore/filter-bounds": { abv_max: 67.5 },
      "/api/v1/explore/filter-options/breweries": {
        items: [
          ...new Map(
            items.map((item) => [item.brewery.id, item.brewery]),
          ).values(),
        ],
        has_more: false,
      },
      "/api/v1/explore/filter-options/styles": {
        items: [
          ...new Map(items.map((item) => [item.style.id, item.style])).values(),
        ],
        has_more: false,
      },
      "/api/v1/explore/beers": {
        items,
        page: Number(
          new URL(route.request().url()).searchParams.get("page") ?? 1,
        ),
        page_size: 25,
        total: items.length ? 26 : 0,
        total_pages: items.length ? 2 : 0,
      },
    };
    const optionData = {
      breweries: (
        responses["/api/v1/explore/filter-options/breweries"] as {
          items: { id: number; name: string }[];
        }
      ).items,
      styles: (
        responses["/api/v1/explore/filter-options/styles"] as {
          items: { id: number; name: string }[];
        }
      ).items,
    };
    const options = optionResponse(new URL(route.request().url()), optionData);
    if (options) {
      await route.fulfill({ json: options });
      return;
    }
    await route.fulfill({
      status: path in responses ? 200 : 404,
      json: responses[path] ?? { detail: "Not found" },
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("Explorer colors and active tab stay distinct in light and dark themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await stubExplorer(page);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/explore/beers");
    await expect(page.locator(".explorer-page")).toBeVisible();
    const themeIsolation = await page.evaluate(() => ({
      pageBackground: getComputedStyle(document.documentElement)
        .backgroundColor,
      explorerBackground: getComputedStyle(
        document.querySelector(".explorer-page") as HTMLElement,
      ).backgroundColor,
      explorerScheme: getComputedStyle(
        document.querySelector(".explorer-page") as HTMLElement,
      ).colorScheme,
      explorerSurface: getComputedStyle(
        document.querySelector(".explorer-page") as HTMLElement,
      )
        .getPropertyValue("--color-surface")
        .trim(),
    }));
    expect(themeIsolation.pageBackground).toBe(
      colorScheme === "dark" ? "rgb(16, 25, 35)" : "rgb(245, 247, 251)",
    );
    expect(themeIsolation.explorerBackground).toBe(
      colorScheme === "dark" ? "rgb(16, 25, 35)" : "rgb(245, 247, 251)",
    );
    expect(themeIsolation.explorerScheme).toBe(colorScheme);
    expect(themeIsolation.explorerSurface).toBe(
      colorScheme === "dark" ? "#172533" : "#ffffff",
    );
    const activeTab = page.getByRole("link", { name: "Beers" });
    await expect(activeTab).toBeVisible();
    const tabStyle = await activeTab.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        borderBottomStyle: style.borderBottomStyle,
        borderBottomWidth: style.borderBottomWidth,
      };
    });
    expect(tabStyle.background).toBe("rgba(0, 0, 0, 0)");
    expect(tabStyle.borderBottomStyle).toBe("solid");
    expect(tabStyle.borderBottomWidth).toBe("2px");
    expect(
      await contrastRatio(
        page.getByRole("heading", { name: "Explorer" }),
        ".explorer-page",
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await contrastRatio(
        page.locator(".explorer-catalogue-heading p"),
        ".explorer-page",
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await contrastRatio(
        page.locator(".explorer-beer-card dt").first(),
        ".explorer-beer-card",
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await contrastRatio(
        page.getByRole("searchbox", { name: "Search beers or breweries" }),
        ".explorer-controls input",
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await contrastRatio(
        page.getByRole("combobox", { name: "Sort beers" }),
        ".explorer-controls select",
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await contrastRatio(
        page.locator(".explorer-pagination button:enabled").first(),
        ".explorer-pagination button:enabled",
      ),
    ).toBeGreaterThanOrEqual(4.5);
    await expect(
      page.getByRole("img", {
        name: "A Long-named Hoppy Beer That Wraps on Small Screens artwork unavailable",
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("mobile navigation stays compact, usable, and does not overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubExplorer(page);
  await page.goto("/explore/beers");
  const header = page.locator(".app-header");
  const toggle = page.getByRole("button", { name: "Main menu" });
  await expect(header).toBeVisible();
  expect((await header.boundingBox())?.height).toBeLessThanOrEqual(72);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.focus();
  expect(
    await toggle.evaluate((node) => getComputedStyle(node).outlineStyle),
  ).toBe("solid");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav).toBeVisible();
  for (const destination of [
    "Dashboard",
    "Inventory",
    "Locations",
    "Milestones",
    "Analytics",
    "Explorer",
    "Imports",
  ]) {
    await expect(nav.getByRole("link", { name: destination })).toBeVisible();
  }
  await expect(
    nav.getByRole("button", { name: "Sign out (visual-test)" }),
  ).toBeVisible();
  await expect(nav.getByRole("link", { name: "Explorer" })).toHaveClass(
    /active/,
  );
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await nav.getByRole("link", { name: "Dashboard" }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/\/$/);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole("button", { name: "Main menu" })).toBeHidden();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
});

test("Breweries is enabled and Styles remains unavailable in the tab strip", async ({
  page,
}) => {
  await stubExplorer(page);
  await page.goto("/explore/beers");
  const tabs = page.getByRole("navigation", { name: "Explorer sections" });
  await expect(
    tabs.getByRole("link", { name: "Breweries", exact: true }),
  ).toHaveAttribute("href", "/explore/breweries");
  for (const name of ["Styles"]) {
    const unavailable = tabs.locator(".explorer-tab-unavailable", {
      hasText: name,
    });
    await expect(unavailable).toContainText("Upcoming");
    await expect(unavailable).toHaveAttribute("aria-disabled", "true");
    await expect(unavailable).not.toHaveAttribute("href", /./);
    expect(
      await contrastRatio(
        unavailable.locator(".upcoming-label"),
        ".explorer-page",
      ),
    ).toBeGreaterThanOrEqual(4.5);
  }
});

test("Style placeholder remains readable in both themes", async ({ page }) => {
  await stubExplorer(page);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const [route, heading] of [
      ["/explore/styles", "Styles catalogue coming later"],
    ]) {
      await page.goto(route);
      const placeholder = page.locator(".explorer-upcoming");
      await expect(
        placeholder.getByRole("heading", { name: heading }),
      ).toBeVisible();
      await expect(placeholder).toContainText(
        "This Explorer catalogue is planned for a later HopStats milestone.",
      );
      expect(
        await contrastRatio(
          placeholder.getByRole("heading"),
          ".explorer-upcoming",
        ),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrastRatio(placeholder.locator("p"), ".explorer-upcoming"),
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
});

for (const width of [
  320, 375, 390, 428, 700, 701, 768, 1280, 1440, 1920, 2560,
]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`Explorer geometry and URL controls at ${width}px in ${colorScheme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme });
      await stubExplorer(page, [
        {
          id: 1,
          name: "ExtraordinarilyLongUnbrokenBeerName".repeat(4),
          brewery: {
            id: 1,
            name: "ExtraordinarilyLongUnbrokenBreweryName".repeat(4),
          },
          style: {
            id: 2,
            name: "ExtraordinarilyLongUnbrokenStyleName".repeat(4),
          },
          abv: 6.5,
          ibu: 55,
          photo_url: null,
          checkin_count: 3,
          rated_checkin_count: 2,
          personal_average_rating: 4.25,
          first_checked_in_at: "2026-01-01T00:00:00Z",
          last_checked_in_at: "2026-01-02T00:00:00Z",
        },
      ]);
      await page.goto("/explore/beers");
      await expect(
        page.getByRole("button", { name: "Next", exact: true }),
      ).toBeEnabled();
      const geometry = await page.evaluate(() => {
        function box(selector: string) {
          const node = document.querySelector(selector) as HTMLElement;
          const rect = node.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            bottom: rect.bottom,
          };
        }
        const main = document.querySelector(".app-main") as HTMLElement;
        const mainStyle = getComputedStyle(main);
        const catalogue = document.querySelector(
          ".explorer-catalogue",
        ) as HTMLElement;
        const catalogueStyle = getComputedStyle(catalogue);
        return {
          main: box(".app-main"),
          page: box(".explorer-page"),
          catalogue: box(".explorer-catalogue"),
          results: box(".explorer-results"),
          table: box(".explorer-beer-table"),
          form: box(".explorer-controls"),
          mobileFilters: box(".explorer-mobile-filters"),
          fields: [
            box(".explorer-search-control"),
            box(".explorer-sort-control"),
          ],
          controls: [
            box("#explorer-beer-search"),
            box("#explorer-beer-sort"),
            box(".explorer-controls button"),
          ],
          gap: parseFloat(
            getComputedStyle(document.querySelector(".explorer-controls")!).gap,
          ),
          gutter: parseFloat(mainStyle.paddingLeft),
          background: catalogueStyle.backgroundColor,
          radius: catalogueStyle.borderRadius,
          shadow: catalogueStyle.boxShadow,
          tableOverflow:
            document.querySelector(".explorer-beer-table-wrap")!.scrollWidth -
            document.querySelector(".explorer-beer-table-wrap")!.clientWidth,
        };
      });
      expect(geometry.background).toBe("rgba(0, 0, 0, 0)");
      expect(geometry.radius).toBe("0px");
      expect(geometry.shadow).toBe("none");
      expect(Math.abs(geometry.main.width - width)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.page.x - geometry.gutter)).toBeLessThanOrEqual(
        1,
      );
      expect(
        Math.abs(geometry.page.width - (width - 2 * geometry.gutter)),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(geometry.catalogue.width - geometry.page.width),
      ).toBeLessThanOrEqual(1);
      for (const control of geometry.controls)
        expect(control.height).toBeGreaterThanOrEqual(44);
      const table = page.locator(".explorer-beer-table-wrap");
      const cards = page.locator(".explorer-beer-cards");
      if (width <= 700) {
        await expect(table).toBeHidden();
        await expect(cards).toBeVisible();
        for (const field of geometry.fields) {
          // A field is its label, label gap and control, never an 18rem/16rem height.
          expect(field.height).toBeLessThan(100);
        }
        // Search + submit share the first row; sort + Filters share the second.
        expect(
          Math.abs(geometry.controls[0].y - geometry.controls[2].y),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(geometry.controls[1].bottom - geometry.mobileFilters.bottom),
        ).toBeLessThanOrEqual(1);
        expect(
          geometry.fields[1].y - geometry.fields[0].bottom,
        ).toBeGreaterThanOrEqual(8);
        expect(geometry.form.height).toBeLessThan(140);
        expect(
          geometry.controls[0].width +
            geometry.controls[2].width +
            geometry.gap,
        ).toBeLessThanOrEqual(geometry.form.width + 1);
      } else {
        await expect(table).toBeVisible();
        await expect(cards).toBeHidden();
        expect(
          Math.abs(geometry.table.width - geometry.results.width),
        ).toBeLessThanOrEqual(1);
        expect(geometry.tableOverflow).toBeLessThanOrEqual(1);
        // Long beer, brewery and style names wrap within their actual cells.
        for (const cell of await page
          .locator(".explorer-beer-table tbody td")
          .all()) {
          expect(
            await cell.evaluate((node) => node.scrollWidth - node.clientWidth),
          ).toBeLessThanOrEqual(1);
        }
      }
      await expectNoHorizontalOverflow(page);

      const search = page.getByRole("searchbox", {
        name: "Search beers or breweries",
      });
      const sort = page.getByRole("combobox", { name: "Sort beers" });
      await search.fill("hoppy");
      // URL changes can precede React's committed render. Wait for the request
      // from the submitted search before interacting with the next control.
      await Promise.all([
        page.waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            url.pathname === "/api/v1/explore/beers" &&
            url.searchParams.get("search") === "hoppy"
          );
        }),
        page.getByRole("button", { name: "Search", exact: true }).click(),
      ]);
      await expect(page).toHaveURL(/search=hoppy/);
      await expect(
        page.getByRole("button", { name: "Next", exact: true }),
      ).toBeEnabled();
      await Promise.all([
        page.waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            url.pathname === "/api/v1/explore/beers" &&
            url.searchParams.get("search") === "hoppy" &&
            url.searchParams.get("sort") === "name_asc"
          );
        }),
        sort.selectOption("name_asc"),
      ]);
      await expect(page).toHaveURL(/search=hoppy&sort=name_asc/);
      await expect(
        page.getByRole("button", { name: "Next", exact: true }),
      ).toBeEnabled();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(page).toHaveURL(/search=hoppy&sort=name_asc&page=2/);
      await expect(
        page.getByRole("button", { name: "Previous", exact: true }),
      ).toBeEnabled();
      await page.reload();
      await expect(search).toHaveValue("hoppy");
      await expect(sort).toHaveValue("name_asc");
      await expect(
        page.getByText("Page 2 of 2", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Previous", exact: true }).click();
      await expect(page).toHaveURL(/search=hoppy&sort=name_asc$/);
      await expectNoHorizontalOverflow(page);

      // Client-side navigation must restore the standard shell width.
      if (width >= 1440) {
        await page
          .getByRole("navigation", { name: "Main navigation" })
          .getByRole("link", { name: "Dashboard", exact: true })
          .click();
        await expect(page.locator(".app-main")).not.toHaveClass(
          /app-main--explorer/,
        );
        expect(
          (await page.locator(".app-main").boundingBox())!.width,
        ).toBeLessThanOrEqual(1280);
      }
    });
  }
}

for (const width of [390, 1280, 1920]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`Explorer screenshot at ${width}px in ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme });
      await stubExplorer(
        page,
        [
          ["DIPA v14", 8.5, 4.75, 6],
          ["Citra Sequences", 6.8, 4.5, 4],
          ["Nelson Sauvin Pale", 5.6, 4.25, 3],
          ["A Proper IPA", 6.5, 4.25, 5],
          ["Kveik Dreams", 7, 4, 2],
        ].map(([name, abv, rating, count], index) => ({
          id: index + 1,
          name: String(name),
          brewery: { id: 1, name: "Cloudwater Brew Co." },
          style: { id: 2, name: "IPA – New England / Hazy" },
          abv: Number(abv),
          ibu: 55,
          photo_url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="9" y="3" width="22" height="34" rx="4" fill="${["#539a67", "#ce9833", "#9366ad", "#5c9fa2", "#bd7560"][index]}"/><path d="M10 7h20M10 33h20" stroke="white" stroke-width="2"/><circle cx="20" cy="20" r="7" fill="white" opacity=".85"/></svg>`)}`,
          checkin_count: Number(count),
          rated_checkin_count: Number(count),
          personal_average_rating: Number(rating),
          first_checked_in_at: "2026-01-01T00:00:00Z",
          last_checked_in_at: `2026-08-${String(12 - index).padStart(2, "0")}T12:00:00Z`,
        })),
      );
      await page.goto(
        "/explore/beers?brewery_id=1&style_id=2&abv_min=5&abv_max=10&rating_min=3.70&rating_max=4.80",
      );
      await expect(page.getByLabel("Active filters")).toContainText(
        "Cloudwater Brew Co.",
      );
      await expect(
        page.getByRole("button", { name: "Next", exact: true }),
      ).toBeEnabled();
      const path = testInfo.outputPath(`explorer-${width}-${colorScheme}.png`);
      if (width === 390) {
        // The entire page section includes controls and the complete first beer card.
        await page.locator(".explorer-page").screenshot({ path });
      } else {
        await page.screenshot({ path, fullPage: true });
      }
      await testInfo.attach(`Explorer ${width}px ${colorScheme}`, {
        path,
        contentType: "image/png",
      });
    });
  }
}

for (const width of [320, 375, 390, 428, 700, 701, 768, 1280]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`advanced Explorer controls at ${width}px in ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await stubExplorer(page);
      await page.goto("/explore/beers?rating_min=3.70&future=preserved");
      await expect(
        page.getByRole("button", { name: "Next", exact: true }),
      ).toBeEnabled();
      const mobile = width <= 700;
      const opener = page.getByRole("button", { name: "Filters (1)" });
      if (mobile) await opener.click();
      const panel = mobile
        ? page.getByRole("dialog")
        : page.getByRole("complementary", { name: "Beer filters" });
      await expect(panel).toBeVisible();
      await expect(
        panel.getByRole("spinbutton", {
          name: "My rating minimum",
          exact: true,
        }),
      ).toHaveValue("3.70");
      // URL-backed desktop controls commit through React Router navigation.
      // Wait for the controlled checkbox after that asynchronous commit.
      const brewery = panel.getByRole("checkbox", {
        name: "A Brewery with a Long Name",
      });
      await brewery.click();
      await expect(brewery).toBeChecked();
      await panel
        .getByRole("searchbox", { name: "Search breweries" })
        .fill("another");
      await panel
        .getByRole("searchbox", { name: "Search breweries" })
        .press("Enter");
      await expect(panel).toBeVisible();
      await expect(
        panel.getByRole("button", {
          name: "Remove A Brewery with a Long Name",
        }),
      ).toBeVisible();
      const lower = panel.getByRole("slider", {
        name: "My rating minimum slider",
      });
      const upper = panel.getByRole("slider", {
        name: "My rating maximum slider",
      });
      await lower.focus();
      await lower.press("ArrowRight");
      await expect(
        panel.getByRole("spinbutton", {
          name: "My rating minimum",
          exact: true,
        }),
      ).toHaveValue("3.71");
      await upper.focus();
      await upper.press("ArrowLeft");
      await expect(
        panel.getByRole("spinbutton", {
          name: "My rating maximum",
          exact: true,
        }),
      ).toHaveValue("4.99");
      const abv = panel.getByRole("spinbutton", {
        name: "ABV maximum",
        exact: true,
      });
      await abv.fill("67.50");
      await abv.press("Tab");
      await expect(
        panel.getByRole("slider", { name: "ABV maximum slider" }),
      ).toHaveValue("67.5");
      if (mobile)
        await panel
          .locator("summary")
          .filter({ hasText: /^First tried/ })
          .click();
      await panel
        .getByLabel("First tried from", { exact: true })
        .fill("2026-01-01");
      await panel
        .getByLabel("First tried to", { exact: true })
        .fill("2026-12-31");
      for (const input of await panel.locator('input[type="date"]').all()) {
        const geometry = await input.evaluate((node) => ({
          width: node.getBoundingClientRect().width,
          parent: node.parentElement!.getBoundingClientRect().width,
        }));
        expect(geometry.width).toBeLessThanOrEqual(geometry.parent + 1);
      }
      if (mobile) {
        await expect(page).not.toHaveURL(/brewery_id/);
        const path = testInfo.outputPath(
          `explorer-sheet-${width}-${colorScheme}.png`,
        );
        await page.screenshot({ path });
        await testInfo.attach("Mobile filter sheet", {
          path,
          contentType: "image/png",
        });
        await panel
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await expect(opener).toBeFocused();
        await opener.click();
        await expect(
          panel.getByRole("spinbutton", {
            name: "My rating minimum",
            exact: true,
          }),
        ).toHaveValue("3.70");
        await panel
          .getByRole("button", { name: "Clear all", exact: true })
          .click();
        await expect(page).toHaveURL(/rating_min=3.70/);
        await panel
          .locator("summary")
          .filter({ hasText: /^Beer style/ })
          .click();
        await panel.getByRole("checkbox", { name: "West Coast IPA" }).check();
        await panel
          .getByRole("button", { name: "Apply filters", exact: true })
          .click();
        await expect(panel).toBeHidden();
        await expect(page).toHaveURL(/style_id=2/);
        await expect(page).not.toHaveURL(/rating_min/);
        await page.getByRole("button", { name: "Filters (1)" }).click();
        await page.keyboard.press("Escape");
        await expect(panel).toBeHidden();
        await page.getByRole("button", { name: "Filters (1)" }).click();
        await page.mouse.click(5, 5);
        await expect(panel).toBeHidden();
        // Landscape keeps the fixed footer reachable and the sheet scrollable.
        await page.setViewportSize({ width: 667, height: 375 });
        await page.getByRole("button", { name: "Filters (1)" }).click();
        await expect(
          panel.getByRole("button", { name: "Apply filters" }),
        ).toBeInViewport();
        await panel
          .locator("summary")
          .filter({ hasText: /^Last tried/ })
          .click();
        await panel
          .getByLabel("Last tried to", { exact: true })
          .scrollIntoViewIfNeeded();
        await expect(
          panel.getByRole("button", { name: "Cancel", exact: true }),
        ).toBeInViewport();
        await panel
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
      } else {
        await expect(page).toHaveURL(/rating_min=3.71/);
        await expect(page).toHaveURL(/brewery_id=1/);
        const header = page.getByRole("columnheader", { name: /^My rating/ });
        await header.getByRole("button").click();
        await expect(header).toHaveAttribute("aria-sort", "ascending");
        await expect(
          page.getByRole("combobox", { name: "Sort beers" }),
        ).toHaveValue("rating_asc");
        await expect(
          page.locator(".explorer-beer-name-cell"),
        ).not.toContainText("A Brewery with a Long Name");
        expect(
          await panel.evaluate((node) => getComputedStyle(node).position),
        ).toBe("sticky");
        await expect(page).toHaveURL(/future=preserved/);
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await expect(page).toHaveURL(/brewery_id=1/);
        await expect(page).toHaveURL(/page=2/);
        await page.reload();
        await expect(
          panel.getByRole("spinbutton", {
            name: "My rating minimum",
            exact: true,
          }),
        ).toHaveValue("3.71");
      }
      await expectNoHorizontalOverflow(page);
    });
  }
}

test("both range handles support pointer dragging and keyboard endpoints", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await stubExplorer(page);
  await page.goto("/explore/beers?rating_min=1&rating_max=4");
  const panel = page.getByRole("complementary", { name: "Beer filters" });
  for (const [side, initial, delta] of [
    ["minimum", 1, 0.1],
    ["maximum", 4, -0.1],
  ] as const) {
    const slider = panel.getByRole("slider", {
      name: `My rating ${side} slider`,
    });
    await slider.scrollIntoViewIfNeeded();
    const box = (await slider.boundingBox())!;
    // The native thumb is 24px wide; its center travels inside that inset.
    const x = box.x + 12 + ((box.width - 24) * initial) / 5;
    await page.mouse.move(x, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x + box.width * delta, box.y + box.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    await expect
      .poll(async () =>
        side === "minimum"
          ? Number(await slider.inputValue()) > initial
          : Number(await slider.inputValue()) < initial,
      )
      .toBe(true);
    await expect(
      panel.getByRole("spinbutton", { name: `My rating ${side}`, exact: true }),
    ).toHaveValue(await slider.inputValue());
  }
  const minimum = panel.getByRole("slider", {
    name: "My rating minimum slider",
  });
  await minimum.focus();
  await minimum.press("Home");
  await expect(minimum).toHaveValue("0");
  const maximum = panel.getByRole("slider", {
    name: "My rating maximum slider",
  });
  await maximum.focus();
  await maximum.press("End");
  await expect(maximum).toHaveValue("5");
  await expect(page).not.toHaveURL(/rating_min|rating_max/);
  for (const [label, field, side, value, key] of [
    ["My rating", "rating", "minimum", "1", "Home"],
    ["My rating", "rating", "maximum", "4", "End"],
    ["ABV", "abv", "minimum", "1", "Home"],
    ["ABV", "abv", "maximum", "10", "End"],
  ]) {
    await page.goto(
      `/explore/beers?${field}_${side === "minimum" ? "min" : "max"}=${value}`,
    );
    await expect(
      page.getByRole("button", { name: "Next", exact: true }),
    ).toBeEnabled();
    const handle = page.getByRole("slider", {
      name: `${label} ${side} slider`,
    });
    await handle.focus();
    await handle.press(key);
    await expect(page).not.toHaveURL(new RegExp(`${field}_min|${field}_max`));
  }
  // Tabbing through a restored, explicitly entered zero threshold must preserve it.
  await page.goto("/explore/beers?rating_min=0");
  const zero = page.getByRole("slider", { name: "My rating minimum slider" });
  await zero.focus();
  await zero.press("Tab");
  await expect(page).toHaveURL(/rating_min=0/);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Explorer review fixes: intentional submission, validation and compact sheet in ${colorScheme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme });
    await stubExplorer(page);
    const optionRequests: string[] = [];
    const catalogueRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/filter-options/"))
        optionRequests.push(request.url());
      if (new URL(request.url()).pathname === "/api/v1/explore/beers")
        catalogueRequests.push(request.url());
    });
    await page.goto(
      "/explore/beers?rating_min=3.755&abv_max=100.01&future=kept&sort=rating_desc",
    );
    await expect(
      page.getByRole("button", { name: "Filters (1)" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Next", exact: true }),
    ).toBeEnabled();
    // Bounds are shared metadata; no hidden option panel may fetch on mobile.
    await expect(page.locator(".explorer-filter-content")).toHaveCount(0);
    // Outlive option-search debounce when asserting that no requests occurred.
    await page.waitForTimeout(350);
    expect(optionRequests).toHaveLength(0);
    expect(catalogueRequests.at(-1)).not.toContain("rating_min");
    await page.getByRole("button", { name: "Filters (1)" }).click();
    const sheet = page.getByRole("dialog");
    const sections = sheet.locator("details");
    await expect(sections).toHaveCount(6);
    for (const [index, open] of [
      true,
      false,
      true,
      false,
      false,
      false,
    ].entries())
      expect(
        await sections
          .nth(index)
          .evaluate((node) => (node as HTMLDetailsElement).open),
      ).toBe(open);
    await expect(sheet.getByRole("checkbox")).toHaveCount(1);
    expect(
      optionRequests.filter((url) => url.includes("/styles")),
    ).toHaveLength(0);
    const initial = testInfo.outputPath(
      `explorer-sheet-compact-${colorScheme}.png`,
    );
    await page.screenshot({ path: initial });
    await testInfo.attach("Compact initial filter sheet", {
      path: initial,
      contentType: "image/png",
    });
    const initialUrl = page.url(),
      initialCount = catalogueRequests.length;
    await sheet.getByRole("checkbox").check();
    for (const category of ["breweries", "styles"]) {
      if (category === "styles")
        await sheet
          .locator("summary")
          .filter({ hasText: /^Beer style/ })
          .click();
      const search = sheet.getByRole("searchbox", {
        name: `Search ${category}`,
      });
      await search.fill("IPA");
      await search.press("Enter");
      await expect(sheet).toBeVisible();
      expect(page.url()).toBe(initialUrl);
      expect(catalogueRequests).toHaveLength(initialCount);
      await expect(
        sheet.getByRole("button", {
          name: "Remove A Brewery with a Long Name",
        }),
      ).toBeVisible();
    }
    await sheet
      .locator("summary")
      .filter({ hasText: /^My rating/ })
      .click();
    const min = sheet.getByRole("spinbutton", {
      name: "My rating minimum",
      exact: true,
    });
    await min.fill("3.755");
    await sheet.getByRole("button", { name: "Apply filters" }).click();
    await expect(sheet).toBeVisible();
    await expect(min).toHaveAttribute("aria-invalid", "true");
    await expect(sheet.getByRole("alert")).toContainText("0.01");
    expect(page.url()).toBe(initialUrl);
    await min.fill("3.75");
    await min.press("Tab");
    await expect(min).toHaveAttribute("aria-invalid", "false");
    await expect(
      sheet.getByRole("slider", { name: "ABV maximum slider" }),
    ).toHaveAttribute("max", "100.01");
    for (const field of await sheet.locator('input[type="number"]').all())
      expect(
        await field.evaluate((node: HTMLInputElement) => node.validity.valid),
      ).toBe(true);
    await expect(
      sheet.getByRole("checkbox", { name: "West Coast IPA" }),
    ).toBeVisible();
    await expect(sheet.getByRole("status")).toHaveCount(0);
    // Keep the selected brewery visible in its summary while showing both ranges.
    await sheet
      .locator("summary")
      .filter({ hasText: /^Brewery/ })
      .click();
    const expanded = testInfo.outputPath(
      `explorer-sheet-expanded-${colorScheme}.png`,
    );
    await sheet
      .locator(".explorer-sheet-scroll")
      .evaluate((node) => (node.scrollTop = 0));
    await page.screenshot({ path: expanded });
    await testInfo.attach("Expanded draft filters", {
      path: expanded,
      contentType: "image/png",
    });
    // Intentional keyboard activation of Apply is preserved.
    await sheet.getByRole("button", { name: "Apply filters" }).focus();
    await page.keyboard.press("Enter");
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/rating_min=3.75/);
    await expect(page).toHaveURL(/brewery_id=1/);
    await expect(page).toHaveURL(/abv_max=100.01/);
    await page.reload();
    await expect(page.getByLabel("Active filters")).toContainText(
      "A Brewery with a Long Name",
    );
    await page.getByRole("button", { name: "Filters (3)" }).click();
    await expect(
      sheet.getByRole("spinbutton", { name: "My rating minimum", exact: true }),
    ).toHaveValue("3.75");
    // Clear also resets invalid local input and remains draft-only until Apply.
    await sheet
      .getByRole("spinbutton", { name: "My rating minimum", exact: true })
      .fill("5.01");
    await sheet.getByRole("button", { name: "Clear all", exact: true }).click();
    await expect(sheet.getByRole("alert")).toHaveCount(0);
    await expect(page).toHaveURL(/rating_min=3.75/);
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".explorer-filter-content")).toHaveCount(0);
    // Crossing the exact breakpoint discards drafts and releases body locking.
    await page.setViewportSize({ width: 700, height: 600 });
    await page.getByRole("button", { name: "Filters (3)" }).click();
    await sheet.getByRole("button", { name: "Clear all", exact: true }).click();
    await page.setViewportSize({ width: 701, height: 600 });
    await expect(sheet).toHaveCount(0);
    await expect(page.locator(".explorer-filter-content")).toHaveCount(1);
    await expect(page.locator("body")).not.toHaveCSS("position", "fixed");
    await expect(page).toHaveURL(/rating_min=3.75/);
    await expect(page.getByLabel("Active filters")).toContainText(
      "A Brewery with a Long Name",
    );
    await expectNoHorizontalOverflow(page);
  });

  test(`Explorer review fixes: context-aware empty states in ${colorScheme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme });
    await stubExplorer(page, []);
    for (const [query, text] of [
      ["", "No beers in your catalogue yet."],
      ["search=ipa", "No beers match your search."],
      ["rating_min=3.70", "No beers match your filters."],
      ["search=ipa&rating_min=3.70", "No beers match your search and filters."],
    ]) {
      await page.goto(
        `/explore/beers?${query}&sort=rating_desc&future=kept&page=2`,
      );
      await expect(page.getByText(text, { exact: true })).toBeVisible();
      await expect(page).toHaveURL(/page=1/);
      if (query.includes("search") && query.includes("rating")) {
        const path = testInfo.outputPath(`explorer-empty-${colorScheme}.png`);
        await page.screenshot({ path });
        await testInfo.attach("Search and filters without matches", {
          path,
          contentType: "image/png",
        });
        await page
          .getByRole("button", { name: "Clear filters", exact: true })
          .click();
        await expect(page).toHaveURL(/search=ipa/);
        await expect(page).not.toHaveURL(/rating_min/);
        await page.goBack();
        await page
          .getByRole("button", { name: "Clear search", exact: true })
          .click();
        await expect(page).toHaveURL(/rating_min=3.70/);
        await expect(page).not.toHaveURL(/search=/);
        await page.goBack();
        await page
          .getByRole("button", {
            name: "Clear search and filters",
            exact: true,
          })
          .click();
        await expect(page).not.toHaveURL(/search=|rating_min|page=/);
        await expect(page).toHaveURL(/sort=rating_desc&future=kept/);
      }
      await expectNoHorizontalOverflow(page);
    }
  });
}

test("Explorer review fixes: both sliders separate coincident handles with real pointer dragging", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await stubExplorer(page);
  let requests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/explore/beers") requests++;
  });
  for (const [label, key, max] of [
    ["My rating", "rating", 5],
    ["ABV", "abv", 67.5],
  ] as const) {
    for (const [low, high, side, direction] of [
      [1, 4, 0, 1],
      [1, 4, 1, -1],
      [2, 2, 0, -1],
      [2, 2, 1, 1],
      [2, 2.01, 0, -1],
      [2, 2.01, 1, 1],
      [0, 0, 1, 1],
      [5, 5, 0, -1],
    ]) {
      await page.goto(
        `/explore/beers?${key}_min=${((low * max) / 5).toFixed(2)}&${key}_max=${((high * max) / 5).toFixed(2)}`,
      );
      const slider = page.getByRole("slider", {
        name: `${label} ${side ? "maximum" : "minimum"} slider`,
      });
      await slider.scrollIntoViewIfNeeded();
      await expect(
        page.getByRole("button", { name: "Next", exact: true }),
      ).toBeEnabled();
      const track = slider.locator("..");
      const box = (await track.boundingBox())!;
      const initial = Number(await slider.inputValue());
      const start = box.x + 12 + (initial / max) * (box.width - 24);
      const end = start + (direction * (box.width - 24)) / 5;
      const before = requests;
      await page.mouse.move(start, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(end, box.y + box.height / 2, { steps: 8 });
      expect(requests).toBe(before);
      // Highlight updates before release, while catalogue requests remain unchanged.
      const fraction = await track.evaluate(
        (node, side) =>
          Number(
            (node as HTMLElement).style.getPropertyValue(
              side ? "--range-high" : "--range-low",
            ),
          ),
        side,
      );
      expect(Math.abs(fraction - initial / max)).toBeGreaterThan(0.1);
      const highlight = await track.evaluate((node) => ({
        width: getComputedStyle(node, "::after").width,
        color: getComputedStyle(node, "::after").backgroundColor,
        accent: getComputedStyle(node)
          .getPropertyValue("--color-action-primary")
          .trim(),
      }));
      const expectedWidth = await track.evaluate((node) => {
        const style = (node as HTMLElement).style;
        return (
          (Number(style.getPropertyValue("--range-high")) -
            Number(style.getPropertyValue("--range-low"))) *
          (node.getBoundingClientRect().width - 24)
        );
      });
      expect(
        Math.abs(parseFloat(highlight.width) - expectedWidth),
      ).toBeLessThan(2);
      expect(parseFloat(highlight.width)).toBeGreaterThan(1);
      expect(highlight.color).not.toBe("rgba(0, 0, 0, 0)");
      await page.mouse.up();
      await expect.poll(() => requests).toBe(before + 1);
      expect(
        (Number(await slider.inputValue()) - initial) * direction,
      ).toBeGreaterThan(0);
      await expect(
        page.getByRole("spinbutton", {
          name: `${label} ${side ? "maximum" : "minimum"}`,
          exact: true,
        }),
      ).toHaveValue(await slider.inputValue());
    }
  }
});

test("Explorer review fixes: touch-capable slider gestures", async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName === "firefox",
    "Playwright Firefox does not support hasTouch contexts",
  );
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await stubExplorer(page);
    await page.goto(
      "/explore/beers?rating_min=2&rating_max=2&abv_min=20&abv_max=20",
    );
    await page.getByRole("button", { name: "Filters (2)" }).tap();
    const sheet = page.getByRole("dialog");
    const inputEvents: string[] = [];
    page.on("console", (message) => {
      if (message.text().startsWith("explorer-touch"))
        inputEvents.push(message.text());
    });
    await page.evaluate(() => {
      for (const type of [
        "pointerdown",
        "pointerup",
        "pointercancel",
        "touchstart",
        "touchend",
        "click",
        "mousedown",
        "mouseup",
        "focusin",
        "focusout",
        "lostpointercapture",
      ])
        document.addEventListener(
          type,
          (event) =>
            console.debug(
              "explorer-touch",
              JSON.stringify({
                type,
                target: (event.target as HTMLElement).outerHTML.slice(0, 200),
                pointerId: (event as PointerEvent).pointerId,
                pointerType: (event as PointerEvent).pointerType,
                prevented: event.defaultPrevented,
              }),
            ),
          true,
        );
    });
    // Verify native touch dismissal before and after the drag sequence.
    await sheet.getByRole("button", { name: "Cancel" }).tap();
    await expect(sheet).toHaveCount(0);
    await page.getByRole("button", { name: "Filters (2)" }).tap();
    // Reuse one CDP session and explicit contact IDs for the native gesture
    // sequence, as in the existing chart swipe regressions.
    const cdp =
      browserName === "chromium" ? await context.newCDPSession(page) : null;
    for (const [label, max] of [
      ["ABV", 67.5],
      ["My rating", 5],
    ] as const) {
      const slider = sheet.getByRole("slider", {
        name: `${label} maximum slider`,
      });
      await slider.scrollIntoViewIfNeeded();
      const box = (await slider.boundingBox())!;
      if (cdp) {
        for (const direction of [-1, 1]) {
          const handle = sheet.getByRole("slider", {
            name: `${label} ${direction < 0 ? "minimum" : "maximum"} slider`,
          });
          const start =
            box.x +
            12 +
            (Number(await handle.inputValue()) / max) * (box.width - 24);
          const y = box.y + box.height / 2;
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ id: 1, x: start, y }],
          });
          // Pace native moves like a finger drag rather than a one-frame fling.
          for (const fraction of [0.25, 0.5, 0.75, 1]) {
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [
                {
                  id: 1,
                  x: start + direction * (box.width - 24) * 0.15 * fraction,
                  y,
                },
              ],
            });
            await page.waitForTimeout(50);
          }
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
        }
      } else {
        // WebKit exposes real touchscreen taps, but no touch-drag automation API.
        // Separate using keyboard, then touch the track to move each handle.
        const lower = sheet.getByRole("slider", {
          name: `${label} minimum slider`,
        });
        await lower.focus();
        await lower.press("Home");
        await slider.focus();
        await slider.press("End");
        await page.touchscreen.tap(
          box.x + 12 + (box.width - 24) * 0.15,
          box.y + box.height / 2,
        );
        await page.touchscreen.tap(
          box.x + 12 + (box.width - 24) * 0.85,
          box.y + box.height / 2,
        );
      }
      const lo = Number(
        await sheet
          .getByRole("slider", { name: `${label} minimum slider` })
          .inputValue(),
      );
      const hi = Number(await slider.inputValue());
      expect(hi).toBeGreaterThan(lo);
    }
    await expect(page).toHaveURL(
      /rating_min=2&rating_max=2&abv_min=20&abv_max=20/,
    );
    // Native gesture recognition continues after CDP's touchEnd acknowledgement.
    // Let it settle before a separate tap, while retaining real touchscreen input.
    await page.waitForTimeout(500);
    await sheet.getByRole("button", { name: "Cancel" }).tap();
    try {
      await expect(sheet).toHaveCount(0);
    } catch (error) {
      console.log(inputEvents.join("\n"));
      throw error;
    }
    await cdp?.detach();
  } finally {
    await context.close();
  }
});

for (const width of [390, 1280]) {
  test(`Explorer review fixes: numeric contract and native submission at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await stubExplorer(page);
    await page.goto(
      "/explore/beers?rating_min=3.70&abv_max=100.01&future=kept",
    );
    const mobile = width < 701;
    if (mobile) await page.getByRole("button", { name: "Filters (2)" }).click();
    const panel = mobile
      ? page.getByRole("dialog")
      : page.getByRole("complementary", { name: "Beer filters" });
    const min = panel.getByRole("spinbutton", {
      name: "My rating minimum",
      exact: true,
    });
    const max = panel.getByRole("spinbutton", {
      name: "My rating maximum",
      exact: true,
    });
    for (const invalid of ["3.755", "-0.01", "5.01"]) {
      await min.fill(invalid);
      await min.press("Tab");
      await expect(min).toHaveAttribute("aria-invalid", "true");
      await expect(page).toHaveURL(/rating_min=3.70/);
      if (mobile) {
        await panel.getByRole("button", { name: "Apply filters" }).click();
        await expect(panel).toBeVisible();
      }
    }
    // Native number inputs report incomplete exponents as value="", badInput=true.
    // Preserve the applied bound rather than treating that state as a clear.
    await min.fill("");
    await min.pressSequentially("1e");
    await min.press("Tab");
    await expect(min).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/rating_min=3.70/);
    for (const value of ["3.70", "3.75", "4.10", "0", "5"]) {
      await min.fill(value);
      await min.press("Tab");
      await expect(min).toHaveAttribute("aria-invalid", "false");
      expect(
        await min.evaluate((node: HTMLInputElement) => node.validity.valid),
      ).toBe(true);
      if (!mobile)
        await expect
          .poll(() => new URL(page.url()).searchParams.get("rating_min"))
          .toBe(value);
    }
    await max.fill("4");
    await max.press("Tab");
    await expect(panel.getByRole("alert")).toContainText("ordered");
    if (mobile) {
      await panel.getByRole("button", { name: "Apply filters" }).click();
      await expect(panel).toBeVisible();
      await expect(min).toBeFocused();
    }
    await min.fill("3.70");
    await min.press("Tab");
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await max.fill("");
    await max.press("Tab");
    await expect(max).toHaveValue("");
    await min.fill("");
    await min.press("Tab");
    await expect(min).toHaveValue("");
    await expect(
      panel.getByRole("slider", { name: "My rating minimum slider" }),
    ).toHaveValue("0");
    await expect(
      panel.getByRole("slider", { name: "My rating maximum slider" }),
    ).toHaveValue("5");
    if (mobile) {
      await panel.getByRole("button", { name: "Apply filters" }).click();
      await expect(panel).toHaveCount(0);
    }
    await expect(page).not.toHaveURL(/rating_min|rating_max/);
    await expect(page).toHaveURL(/abv_max=100.01/);
    await expect(page).toHaveURL(/future=kept/);
  });
}

for (const bounds of [
  "",
  "&abv_min=0&abv_max=100.01&rating_min=0&rating_max=5",
]) {
  test(`Explorer review fixes: no-op desktop range interactions preserve pagination (${bounds || "inactive"})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await stubExplorer(page);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/v1/explore/beers")
        requests.push(request.url());
    });
    await page.goto(
      `/explore/beers?page=2&page_size=25&search=beer&sort=name_asc&future=kept${bounds}`,
    );
    await expect(page.getByRole("table")).toBeVisible();
    const original = page.url();
    const history = await page.evaluate(() => window.history.length);
    const count = requests.length;
    const panel = page.getByRole("complementary", { name: "Beer filters" });
    for (const label of ["ABV", "My rating"]) {
      for (const side of ["minimum", "maximum"]) {
        const numeric = panel.getByRole("spinbutton", {
          name: `${label} ${side}`,
        });
        await numeric.focus();
        await numeric.press("Enter");
        await numeric.press("Tab");
        const slider = panel.getByRole("slider", {
          name: `${label} ${side} slider`,
        });
        await slider.focus();
        await slider.press("Tab");
      }
    }
    await expect(page).toHaveURL(original);
    expect(requests).toHaveLength(count);
    if (!bounds) {
      for (const label of ["ABV", "My rating"]) {
        const lower = panel.getByRole("slider", {
          name: `${label} minimum slider`,
        });
        await lower.press("Home");
        const upper = panel.getByRole("slider", {
          name: `${label} maximum slider`,
        });
        await upper.press("End");
        const track = lower.locator("..");
        await track.scrollIntoViewIfNeeded();
        const box = (await track.boundingBox())!;
        // Click beyond the thumb centres so integer pointer coordinates still
        // clamp to the exact endpoints on every browser's subpixel geometry.
        await page.mouse.click(box.x + 1, box.y + box.height / 2);
        await page.mouse.click(box.x + box.width - 1, box.y + box.height / 2);
      }
      await panel
        .getByRole("button", { name: "Clear all", exact: true })
        .click();
    }
    await expect(page).toHaveURL(original);
    expect(requests).toHaveLength(count);
    expect(await page.evaluate(() => window.history.length)).toBe(history);
    const minimum = panel.getByRole("spinbutton", {
      name: "My rating minimum",
    });
    await minimum.fill("3.70");
    await minimum.press("Tab");
    await expect.poll(() => requests.length).toBe(count + 1);
    await expect(page).not.toHaveURL(/[?&]page=/);
    // A new page-2 URL with equivalent numeric text must remain byte-for-byte unchanged.
    const params = new URL(page.url()).searchParams;
    params.set("page", "2");
    await page.goto(`/explore/beers?${params}`);
    // Restored controls can precede the catalogue effects, especially in WebKit.
    // Exclude the reload's startup requests from the no-op interaction baseline.
    await expect(page.getByRole("table")).toBeVisible();
    await expect(minimum).toHaveValue("3.70");
    const equivalentUrl = page.url();
    const equivalentCount = requests.length;
    await minimum.fill("3.7");
    await minimum.press("Enter");
    await minimum.press("Tab");
    await expect(page).toHaveURL(equivalentUrl);
    expect(requests).toHaveLength(equivalentCount);
    for (const [key, value] of [
      ["page_size", "25"],
      ["search", "beer"],
      ["sort", "name_asc"],
      ["future", "kept"],
    ]) {
      expect(new URL(page.url()).searchParams.get(key)).toBe(value);
    }
  });
}

test("Explorer review fixes: unchanged mobile Apply preserves explicit ranges and selection order on page two", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubExplorer(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/explore/beers")
      requests.push(request.url());
  });
  await page.goto(
    "/explore/beers?page=2&brewery_id=1&style_id=2&rating_min=0&rating_max=5&abv_min=0&abv_max=100.01&future=kept",
  );
  await expect(page.locator(".explorer-beer-card").first()).toBeVisible();
  await page.getByRole("button", { name: "Filters (4)" }).click();
  const sheet = page.getByRole("dialog");
  const original = page.url();
  const count = requests.length;
  for (const name of ["A Brewery with a Long Name", "West Coast IPA"]) {
    const checkbox = sheet.getByRole("checkbox", { name });
    await checkbox.uncheck();
    await checkbox.check();
  }
  for (const label of ["ABV", "My rating"]) {
    for (const side of ["minimum", "maximum"]) {
      const numeric = sheet.getByRole("spinbutton", {
        name: `${label} ${side}`,
      });
      await numeric.focus();
      await numeric.press("Enter");
      await numeric.press("Tab");
    }
  }
  await sheet.getByRole("button", { name: "Apply filters" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(original);
  expect(requests).toHaveLength(count);
  // Clear all is a draft edit; committing it genuinely changes the result set.
  await page.getByRole("button", { name: "Filters (4)" }).click();
  await sheet.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect(page).toHaveURL(original);
  await sheet.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/\/explore\/beers\?future=kept$/);
  await expect.poll(() => requests.length).toBe(count + 1);
  await page.goto("/explore/beers?page=2&future=kept");
  await expect(page.locator(".explorer-beer-card").first()).toBeVisible();
  await page.getByRole("button", { name: "Filters (0)" }).click();
  const inactive = page.url();
  const inactiveCount = requests.length;
  await sheet.getByRole("button", { name: "Clear all", exact: true }).click();
  await sheet.getByRole("button", { name: "Apply filters" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(inactive);
  expect(requests).toHaveLength(inactiveCount);
});

for (const width of [390, 1280]) {
  test(`Explorer review fixes: explicit numeric full ranges and intentional slider resets at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await stubExplorer(page);
    await page.goto("/explore/beers?page=2&future=kept");
    const mobile = width <= 700;
    if (mobile) await page.getByRole("button", { name: "Filters (0)" }).click();
    const panel = mobile
      ? page.getByRole("dialog")
      : page.getByRole("complementary", { name: "Beer filters" });
    if (mobile)
      await panel.locator("summary").filter({ hasText: "My rating" }).click();
    for (const [label, prefix, maximum] of [
      ["ABV", "abv", "100.01"],
      ["My rating", "rating", "5"],
    ]) {
      const bounds = [
        ["minimum", "0", "min"],
        ["maximum", maximum, "max"],
      ];
      // Exercise each one-sided boundary independently before forming the full range.
      for (const [side, value, suffix] of mobile ? bounds.reverse() : bounds) {
        const input = panel.getByRole("spinbutton", {
          name: `${label} ${side}`,
        });
        await input.fill(value);
        await input.press("Tab");
        await expect(input).toHaveValue(value);
        if (!mobile)
          expect(
            new URL(page.url()).searchParams.get(`${prefix}_${suffix}`),
          ).toBe(value);
      }
      await expect(
        panel.getByRole("slider", { name: `${label} maximum slider` }),
      ).toHaveAttribute("max", maximum);
    }
    if (mobile) {
      await expect(page).toHaveURL(/page=2/);
      await panel.getByRole("button", { name: "Apply filters" }).click();
    }
    await expect(page).toHaveURL(
      /abv_min=0&abv_max=100.01&rating_min=0&rating_max=5/,
    );
    await expect(page).not.toHaveURL(/page=2/);
    await expect(
      page.getByRole("button", { name: "Remove My rating: 0–5", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Remove ABV: 0–100.01%", exact: true })
      .click();
    await expect(page).not.toHaveURL(/abv_min|abv_max/);
    await expect(page).toHaveURL(/rating_min=0/);
    // Preserve explicit full-range URL bounds through real focus/blur, then reset deliberately.
    await page.goto(
      "/explore/beers?page=2&abv_min=0&abv_max=67.5&rating_min=0&rating_max=5&future=kept",
    );
    if (mobile) await page.getByRole("button", { name: "Filters (2)" }).click();
    for (const label of ["ABV", "My rating"]) {
      const lower = panel.getByRole("slider", {
        name: `${label} minimum slider`,
      });
      await lower.focus();
      await lower.press("Tab");
      await expect(page).toHaveURL(/page=2/);
      await expect(
        panel.getByRole("spinbutton", { name: `${label} minimum` }),
      ).toHaveValue("0");
    }
    for (const label of ["ABV", "My rating"]) {
      const lower = panel.getByRole("slider", {
        name: `${label} minimum slider`,
      });
      // Home is an intentional slider reset even when the lower handle is already zero.
      await lower.focus();
      await lower.press("Home");
      await expect(
        panel.getByRole("spinbutton", { name: `${label} minimum` }),
      ).toHaveValue("");
      await expect(
        panel.getByRole("spinbutton", { name: `${label} maximum` }),
      ).toHaveValue("");
    }
    if (mobile) {
      await expect(page).toHaveURL(/page=2/);
      await panel.getByRole("button", { name: "Apply filters" }).click();
    }
    await expect(page).toHaveURL(/\/explore\/beers\?future=kept$/);
  });
}
