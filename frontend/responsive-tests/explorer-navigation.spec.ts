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
  await page.route("**/api/v1/**", async (route) => {
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
    expect(themeIsolation.pageBackground).toBe("rgb(245, 247, 251)");
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

test("upcoming Explorer sections remain unavailable in the tab strip", async ({
  page,
}) => {
  await stubExplorer(page);
  await page.goto("/explore/beers");
  const tabs = page.getByRole("navigation", { name: "Explorer sections" });
  for (const name of ["Breweries", "Styles"]) {
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

test("Brewery and Style placeholders remain readable in both themes", async ({
  page,
}) => {
  await stubExplorer(page);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const [route, heading] of [
      ["/explore/breweries", "Breweries catalogue coming later"],
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

for (const width of [320, 375, 390, 428, 768, 1280, 1440, 1920, 2560]) {
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
        "/explore/beers?brewery_id=1&style_id=2&abv_min=5&abv_max=10",
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

for (const width of [320, 375, 390, 428, 768, 1280]) {
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
});
