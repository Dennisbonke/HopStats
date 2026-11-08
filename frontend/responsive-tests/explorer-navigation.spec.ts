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
      "/api/v1/explore/beers": {
        items,
        page: 1,
        page_size: 25,
        total: items.length,
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
        .getPropertyValue("--surface")
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
        ".explorer-catalogue",
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
