import { expect, test, type Locator, type Page } from "@playwright/test";

const longBeerName =
  "Imperial Double Dry Hopped Pale Ale with a Remarkably Long Seasonal Release Name That Should Wrap on Narrow Screens";
const longBreweryName =
  "The Independent Brewery with an Exceptionally Long Regional Name and Brewing Company";
const longLocationPath =
  "Cellar → North Storage Room → Top Shelf → Long Term Bottle Conditioning Area";
const longStyleName =
  "Imperial IPA with an Exceptionally Long Dry-Hopped Seasonal Release Name";

const inventoryItems = [
  {
    id: 1,
    source_item_id: "inventory-1",
    source_system: "untappd_stash",
    source_name: "Test stash",
    beer_id: 1,
    beer_name: longBeerName,
    brewery_name: longBreweryName,
    style_id: 1,
    style_name: longStyleName,
    abv: 8.2,
    ibu: 72,
    photo_url: null,
    quantity: 2,
    container: "Bottle",
    notes: null,
    purchase_date: null,
    bottled_date: null,
    best_before: "2027-06-01",
    raw_best_before: null,
    best_before_suspicious: false,
    purchase_location: null,
    purchase_price: null,
    created_at_source: null,
    imported_at: "2026-01-01T00:00:00Z",
    location: { id: 1, name: "Top Shelf", path: longLocationPath },
    location_resolution_status: "resolved",
    location_resolution_source: "exact",
    location_resolution_detail: null,
    match_status: "exact",
    matched_checkin_beer_id: 11,
    source_metadata: null,
  },
  {
    id: 2,
    source_item_id: "inventory-2",
    source_system: "untappd_stash",
    source_name: "Test stash",
    beer_id: 2,
    beer_name: "A Second Imperial IPA with a Long Name",
    brewery_name: "Another Long Named Brewery",
    style_id: 1,
    style_name: longStyleName,
    abv: 7.8,
    ibu: 65,
    photo_url: null,
    quantity: 1,
    container: "Can",
    notes: null,
    purchase_date: null,
    bottled_date: null,
    best_before: null,
    raw_best_before: null,
    best_before_suspicious: false,
    purchase_location: null,
    purchase_price: null,
    created_at_source: null,
    imported_at: "2026-01-01T00:00:00Z",
    location: { id: 1, name: "Top Shelf", path: longLocationPath },
    location_resolution_status: "resolved",
    location_resolution_source: "exact",
    location_resolution_detail: null,
    match_status: "ambiguous",
    matched_checkin_beer_id: null,
    source_metadata: null,
  },
  {
    id: 3,
    source_item_id: "inventory-3",
    source_system: "untappd_stash",
    source_name: "Test stash",
    beer_id: 3,
    beer_name: "Unresolved Pilsner",
    brewery_name: null,
    style_id: 2,
    style_name: "Pilsner",
    abv: null,
    ibu: null,
    photo_url: null,
    quantity: 4,
    container: null,
    notes: null,
    purchase_date: null,
    bottled_date: null,
    best_before: null,
    raw_best_before: null,
    best_before_suspicious: false,
    purchase_location: null,
    purchase_price: null,
    created_at_source: null,
    imported_at: "2026-01-01T00:00:00Z",
    location: null,
    location_resolution_status: "unresolved",
    location_resolution_source: null,
    location_resolution_detail: null,
    match_status: "external_id",
    matched_checkin_beer_id: 13,
    source_metadata: null,
  },
  {
    id: 4,
    source_item_id: "inventory-4",
    source_system: "untappd_stash",
    source_name: "Test stash",
    beer_id: 4,
    beer_name: "Seasonal Sour",
    brewery_name: "Orchard Brewery",
    style_id: 3,
    style_name: "Fruited Sour Ale",
    abv: 5.1,
    ibu: 12,
    photo_url: null,
    quantity: 1,
    container: "Bottle",
    notes: null,
    purchase_date: null,
    bottled_date: null,
    best_before: null,
    raw_best_before: null,
    best_before_suspicious: false,
    purchase_location: null,
    purchase_price: null,
    created_at_source: null,
    imported_at: "2026-01-01T00:00:00Z",
    location: { id: 2, name: "Fridge", path: "Kitchen → Fridge" },
    location_resolution_status: "resolved",
    location_resolution_source: "exact",
    location_resolution_detail: null,
    match_status: "unmatched",
    matched_checkin_beer_id: null,
    source_metadata: null,
  },
];

const checkins = {
  start: "2026-01-01",
  end: "2026-02-28",
  timezone: "Europe/Amsterdam",
  granularity: "month",
  summary: {
    total_checkins: 7,
    new_discoveries: 3,
    repeat_checkins: 4,
    distinct_beers: 5,
  },
  cumulative_baseline_checkins: 12,
  cumulative_baseline_discoveries: 8,
  buckets: [
    {
      key: "2026-01",
      label: "Jan 2026",
      start: "2026-01-01",
      end: "2026-01-31",
      new_discoveries: 2,
      repeat_checkins: 3,
      total_checkins: 5,
      cumulative_checkins: 17,
      cumulative_discoveries: 10,
    },
    {
      key: "2026-02",
      label: "Feb 2026",
      start: "2026-02-01",
      end: "2026-02-28",
      new_discoveries: 1,
      repeat_checkins: 1,
      total_checkins: 2,
      cumulative_checkins: 19,
      cumulative_discoveries: 11,
    },
  ],
};

const drinkingTrends = {
  start: "2026-01-01",
  end: "2026-12-31",
  timezone: "Europe/Amsterdam",
  daily: Array.from({ length: 365 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    total: index % 3,
    discoveries: index % 2,
    repeats: index % 2,
  })),
  weekday: Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    total: weekday + 1,
    discoveries: weekday % 2,
    repeats: weekday,
    days_in_period: 52,
  })),
  hourly: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    total: hour % 4,
    discoveries: hour % 2,
    repeats: hour % 3,
  })),
  weekday_hour: Array.from({ length: 168 }, (_, index) => ({
    weekday: Math.floor(index / 24),
    hour: index % 24,
    total: (index % 6) + 1,
    discoveries: index % 2,
    repeats: index % 3,
  })),
};

async function stubApplication(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body: Record<string, unknown> = {
      "/api/v1/auth/me": {
        id: 1,
        username: "styling-test",
        created_at: "2026-01-01T00:00:00Z",
      },
      "/api/v1/health": { status: "ok" },
      "/api/v1/inventory/styles": [
        { id: 1, name: longStyleName },
        { id: 2, name: "Pilsner" },
        { id: 3, name: "Fruited Sour Ale" },
      ],
      "/api/v1/locations": {
        locations: [],
        unresolved: { record_count: 0, total_units: 0 },
      },
      "/api/v1/imports": [
        {
          id: 1,
          source_type: "checkins",
          filename: "untappd-checkins.csv",
          sha256: "test-hash",
          started_at: "2026-01-01T12:00:00Z",
          completed_at: "2026-01-01T12:00:05Z",
          status: "completed",
          inserted_count: 4,
          updated_count: 0,
          unchanged_count: 0,
          removed_count: 0,
          rejected_count: 0,
          error_code: null,
          error_summary: null,
          errors: [],
        },
        {
          id: 2,
          source_type: "inventory",
          filename: "untappd-stash.csv",
          sha256: "test-hash-2",
          started_at: "2026-01-02T12:00:00Z",
          completed_at: "2026-01-02T12:00:05Z",
          status: "failed",
          inserted_count: 0,
          updated_count: 0,
          unchanged_count: 0,
          removed_count: 0,
          rejected_count: 1,
          error_code: "invalid_csv",
          error_summary: "Invalid CSV",
          errors: [],
        },
        {
          id: 3,
          source_type: "checkins",
          filename: "new-checkins.csv",
          sha256: "test-hash-3",
          started_at: "2026-01-03T12:00:00Z",
          completed_at: null,
          status: "processing",
          inserted_count: 0,
          updated_count: 0,
          unchanged_count: 0,
          removed_count: 0,
          rejected_count: 0,
          error_code: null,
          error_summary: null,
          errors: [],
        },
      ],
      "/api/v1/explore/beers": {
        items: [
          {
            id: 101,
            name: "A Long Seasonal IPA with a Name That Wraps on Narrow Screens",
            brewery: { id: 1, name: "North Storage Brewing Company" },
            style: { id: 2, name: "West Coast IPA" },
            abv: 7.2,
            ibu: 55,
            photo_url: null,
            checkin_count: 4,
            rated_checkin_count: 2,
            personal_average_rating: 4.1,
            first_checked_in_at: "2026-01-01T00:00:00Z",
            last_checked_in_at: "2026-02-01T00:00:00Z",
          },
        ],
        page: 1,
        page_size: 25,
        total: 1,
        total_pages: 1,
      },
      "/api/v1/analytics/checkins": checkins,
      "/api/v1/analytics/drinking-trends": drinkingTrends,
    };
    if (path === "/api/v1/inventory") {
      await route.fulfill({
        json: {
          items: inventoryItems,
          page: 1,
          page_size: 25,
          total: inventoryItems.length,
          total_pages: 1,
          style_groups: [
            { style_id: 1, style_name: longStyleName, total: 2 },
            { style_id: 2, style_name: "Pilsner", total: 1 },
            { style_id: 3, style_name: "Fruited Sour Ale", total: 1 },
          ],
        },
      });
      return;
    }
    await route.fulfill({
      status: path in body ? 200 : 404,
      json: body[path] ?? { detail: "Not found" },
    });
  });
}

async function renderedContrast(text: Locator) {
  return text.evaluate((node) => {
    type Color = { red: number; green: number; blue: number; alpha: number };
    const parse = (value: string): Color => {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return {
        red: channels[0] ?? 0,
        green: channels[1] ?? 0,
        blue: channels[2] ?? 0,
        alpha: channels[3] ?? 1,
      };
    };
    const composite = (foreground: Color, background: Color): Color => {
      const alpha =
        foreground.alpha + background.alpha * (1 - foreground.alpha);
      if (alpha === 0) return { red: 255, green: 255, blue: 255, alpha: 1 };
      return {
        red:
          (foreground.red * foreground.alpha +
            background.red * background.alpha * (1 - foreground.alpha)) /
          alpha,
        green:
          (foreground.green * foreground.alpha +
            background.green * background.alpha * (1 - foreground.alpha)) /
          alpha,
        blue:
          (foreground.blue * foreground.alpha +
            background.blue * background.alpha * (1 - foreground.alpha)) /
          alpha,
        alpha,
      };
    };
    const chain: HTMLElement[] = [];
    let current: HTMLElement | null = node as HTMLElement;
    while (current) {
      chain.push(current);
      current = current.parentElement;
    }
    let background: Color = { red: 255, green: 255, blue: 255, alpha: 1 };
    let opacity = 1;
    const filters: string[] = [];
    const nonOpaqueAncestors: string[] = [];
    for (const element of chain.reverse()) {
      const style = getComputedStyle(element);
      background = composite(parse(style.backgroundColor), background);
      opacity *= Number(style.opacity);
      if (style.opacity !== "1") nonOpaqueAncestors.push(style.opacity);
      if (style.filter !== "none") filters.push(style.filter);
    }
    const foreground = parse(getComputedStyle(node).color);
    foreground.alpha *= opacity;
    const visibleForeground = composite(foreground, background);
    const luminance = (color: Color) => {
      const linear = [color.red, color.green, color.blue].map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const values = [luminance(visibleForeground), luminance(background)].sort(
      (left, right) => right - left,
    );
    return {
      ratio: (values[0] + 0.05) / (values[1] + 0.05),
      foreground: getComputedStyle(node).color,
      background: `rgb(${Math.round(background.red)}, ${Math.round(background.green)}, ${Math.round(background.blue)})`,
      nonOpaqueAncestors,
      filters,
    };
  });
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (value: string) => {
    const channels =
      value
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number) ?? [];
    const linear = channels.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const values = [luminance(foreground), luminance(background)].sort(
    (left, right) => right - left,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function expectReadable(text: Locator, label: string) {
  const result = await renderedContrast(text);
  expect(result.nonOpaqueAncestors, `${label} ancestor opacity`).toEqual([]);
  expect(result.filters, `${label} ancestor filters`).toEqual([]);
  expect(
    result.ratio,
    `${label}: ${JSON.stringify(result)}`,
  ).toBeGreaterThanOrEqual(4.5);
}

async function expectNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("grouped Inventory stays readable and wraps at mobile and desktop widths", async ({
  page,
}) => {
  await stubApplication(page);
  await page.goto("/inventory");
  const groupToggle = page.getByLabel("Group by beer style");
  await expect(groupToggle).toBeVisible();
  await groupToggle.check();
  const longStyleGroup = page
    .locator(".inventory-style-group")
    .filter({ hasText: longStyleName });
  await expect(longStyleGroup.locator(":scope > h3")).toContainText(
    "(2 total)",
  );
  await expect(page.locator(".inventory-style-group")).toHaveCount(3);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
      const group = longStyleGroup;
      const groupHeading = group.locator(":scope > h3");
      const groupCount = groupHeading.locator("span");
      const isMobile = width <= 520;
      const beerName = isMobile
        ? group.locator(".inventory-card h3").first()
        : group.locator(".inventory-table td:first-child strong").first();
      const metadata = isMobile
        ? group.locator(".inventory-card-meta span").first()
        : group.locator(".inventory-table td:first-child .muted").first();
      await expectReadable(groupHeading, `${colorScheme} group heading`);
      await expectReadable(groupCount, `${colorScheme} group count`);
      await expectReadable(beerName, `${colorScheme} beer name`);
      await expectReadable(metadata, `${colorScheme} brewery metadata`);
      for (const status of await page
        .locator(".inventory-style-group .status-pill")
        .all()) {
        await expectReadable(status, `${colorScheme} status label`);
      }

      const surfaces = await group.evaluate((element) => {
        const groupStyle = getComputedStyle(element);
        const card = element.querySelector<HTMLElement>(".inventory-card");
        return {
          group: groupStyle.backgroundColor,
          card: card ? getComputedStyle(card).backgroundColor : null,
          groupBorder: groupStyle.borderTopColor,
          cardBorder: card ? getComputedStyle(card).borderTopColor : null,
        };
      });
      expect(surfaces.card).not.toBe(surfaces.group);
      expect(surfaces.cardBorder).not.toBe(surfaces.groupBorder);
      await expectNoDocumentOverflow(page);

      if (isMobile) {
        await expect(
          page.locator(".inventory-style-group .inventory-cards").first(),
        ).toBeVisible();
        const longText = await group
          .locator(
            ".inventory-card-title, .inventory-card-title h3, .inventory-card-title p, .inventory-card-meta, .location-line",
          )
          .evaluateAll((elements) =>
            elements.map((element) => ({
              text: element.textContent,
              client: element.clientWidth,
              scroll: element.scrollWidth,
            })),
          );
        for (const element of longText) {
          expect(
            element.scroll,
            `${colorScheme} ${width}px text overflow: ${element.text}`,
          ).toBeLessThanOrEqual(element.client + 1);
        }
      }
    }
  }
});

test("semantic themes stay scoped while Explorer uses the shared palette", async ({
  page,
}) => {
  await stubApplication(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/explore/beers");

  const explorer = page.locator(".explorer-page");
  const catalogue = page.locator(".explorer-catalogue");
  const longBeerName =
    "A Long Seasonal IPA with a Name That Wraps on Narrow Screens";
  await expect(page.locator(".explorer-beer-card h4")).toHaveText(longBeerName);
  await expect(page.locator(".explorer-beer-card")).toHaveCount(1);
  await explorer.evaluate((element) => {
    const badge = document.createElement("span");
    badge.className =
      "ui-status-badge ui-status-badge--success theme-test-status";
    badge.textContent = "Theme test status";
    element.querySelector(".explorer-catalogue")?.append(badge);
  });
  const themeStatusBadge = page.getByText("Theme test status");

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const expected =
      colorScheme === "light"
        ? {
            canvas: "rgb(245, 247, 251)",
            surface: "rgb(255, 255, 255)",
            text: "rgb(23, 32, 51)",
            secondary: "rgb(71, 85, 105)",
            controlScheme: "light",
            actionBackground: "rgb(23, 107, 77)",
            actionText: "rgb(255, 255, 255)",
          }
        : {
            canvas: "rgb(16, 25, 35)",
            surface: "rgb(23, 37, 51)",
            text: "rgb(241, 245, 249)",
            secondary: "rgb(193, 204, 216)",
            controlScheme: "dark",
            actionBackground: "rgb(85, 189, 141)",
            actionText: "rgb(16, 37, 27)",
          };

    await expect(explorer).toHaveCSS("color-scheme", expected.controlScheme);
    await expect(explorer).toHaveCSS("background-color", expected.canvas);
    await expect(catalogue).toHaveCSS("background-color", expected.surface);
    await expect(page.locator(".explorer-beer-card")).toHaveCSS(
      "background-color",
      expected.surface,
    );
    const themeStatusValues =
      colorScheme === "light"
        ? {
            surface: "rgb(232, 246, 237)",
            text: "rgb(21, 91, 53)",
            border: "rgb(22, 128, 60)",
          }
        : {
            surface: "rgb(23, 55, 42)",
            text: "rgb(187, 247, 208)",
            border: "rgb(85, 189, 141)",
          };
    await expect(themeStatusBadge).toHaveCSS(
      "background-color",
      themeStatusValues.surface,
    );
    await expect(themeStatusBadge).toHaveCSS("color", themeStatusValues.text);
    await expect(themeStatusBadge).toHaveCSS(
      "border-top-color",
      themeStatusValues.border,
    );
    await expectReadable(
      themeStatusBadge,
      `${colorScheme} themed status badge`,
    );
    await expect(explorer).toHaveCSS("color", expected.text);
    await expect(explorer.locator(".page-heading p")).toHaveCSS(
      "color",
      expected.secondary,
    );
    const scopedPalette = await explorer.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        primaryAction: style.getPropertyValue("--color-action-primary").trim(),
        errorSurfaceText: style
          .getPropertyValue("--color-text-on-error-surface")
          .trim(),
        dangerActionText: style
          .getPropertyValue("--color-text-on-danger-action")
          .trim(),
        border: style.getPropertyValue("--color-border").trim(),
        focus: style.getPropertyValue("--color-focus").trim(),
        statusSuccess: style.getPropertyValue("--color-status-success").trim(),
        chartPrimary: style.getPropertyValue("--color-chart-primary").trim(),
        chartTooltip: style
          .getPropertyValue("--color-chart-tooltip-surface")
          .trim(),
      };
    });
    expect(scopedPalette).toEqual(
      colorScheme === "light"
        ? {
            primaryAction: "#176b4d",
            errorSurfaceText: "#a32920",
            dangerActionText: "#ffffff",
            border: "#cbd5e1",
            focus: "#805500",
            statusSuccess: "#16803c",
            chartPrimary: "#176b4d",
            chartTooltip: "#172033",
          }
        : {
            primaryAction: "#55bd8d",
            errorSurfaceText: "#fecaca",
            dangerActionText: "#ffffff",
            border: "#526476",
            focus: "#fbbf24",
            statusSuccess: "#55bd8d",
            chartPrimary: "#55bd8d",
            chartTooltip: "#0b121a",
          },
    );

    const rootPalette = await page.locator("html").evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        colorScheme: style.colorScheme,
        canvas: style.backgroundColor,
        foreground: style.color,
        surfaceToken: style.getPropertyValue("--color-surface").trim(),
      };
    });
    expect(rootPalette).toEqual({
      colorScheme: "light",
      canvas: "rgb(245, 247, 251)",
      foreground: "rgb(23, 32, 51)",
      surfaceToken: "#ffffff",
    });

    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
      await expectNoDocumentOverflow(page);
      await expectReadable(
        explorer.locator(".page-heading h2"),
        `${colorScheme} Explorer title at ${width}px`,
      );
      await expectReadable(
        explorer.locator(".page-heading p"),
        `${colorScheme} Explorer description at ${width}px`,
      );
      await expectReadable(
        explorer.locator(".explorer-catalogue-heading p"),
        `${colorScheme} catalogue description at ${width}px`,
      );
      await expectReadable(
        page.getByRole("searchbox", { name: "Search beers or breweries" }),
        `${colorScheme} search control at ${width}px`,
      );
      await expect(
        page.getByRole("searchbox", { name: "Search beers or breweries" }),
      ).toHaveCSS("background-color", expected.surface);
      await expect(
        page.getByRole("searchbox", { name: "Search beers or breweries" }),
      ).toHaveCSS("color", expected.text);
      await expect(
        page.getByRole("searchbox", { name: "Search beers or breweries" }),
      ).toHaveCSS(
        "border-color",
        colorScheme === "light" ? "rgb(100, 116, 139)" : "rgb(113, 128, 150)",
      );
      const searchBoundary = await page
        .getByRole("searchbox", { name: "Search beers or breweries" })
        .evaluate((element) => {
          const catalogue = element.closest(".explorer-catalogue");
          if (!catalogue) throw new Error("Search control lost its surface");
          return {
            border: getComputedStyle(element).borderTopColor,
            surface: getComputedStyle(catalogue).backgroundColor,
          };
        });
      expect(
        contrastRatio(searchBoundary.border, searchBoundary.surface),
      ).toBeGreaterThanOrEqual(3);
      await expectReadable(
        page.getByLabel("Sort beers"),
        `${colorScheme} Explorer sort control at ${width}px`,
      );
      await expect(page.getByLabel("Sort beers")).toHaveCSS(
        "background-color",
        expected.surface,
      );
      await expectReadable(
        page.getByRole("button", { name: "Search" }),
        `${colorScheme} search action at ${width}px`,
      );
      const searchAction = page.getByRole("button", { name: "Search" });
      await expect(searchAction).toHaveCSS(
        "background-color",
        expected.actionBackground,
      );
      await expect(searchAction).toHaveCSS("color", expected.actionText);
      await expect(searchAction).toHaveCSS("min-height", "44px");
      await expect(
        page.getByRole("searchbox", { name: "Search beers or breweries" }),
      ).toHaveCSS("min-height", "44px");
      const actionAndSurface = await searchAction.evaluate((element) => {
        const surface = element.closest(".explorer-catalogue");
        if (!surface)
          throw new Error("Search action lost its catalogue surface");
        return {
          action: getComputedStyle(element).backgroundColor,
          surface: getComputedStyle(surface).backgroundColor,
        };
      });
      expect(
        contrastRatio(actionAndSurface.action, actionAndSurface.surface),
        `${colorScheme} search action boundary at ${width}px`,
      ).toBeGreaterThanOrEqual(3);
      const paginationAction = page.getByRole("button", { name: "Next" });
      await expect(paginationAction).toBeDisabled();
      await expect(paginationAction).toHaveCSS("min-height", "44px");

      if (width <= 700) {
        await expect(page.locator(".explorer-beer-cards")).toBeVisible();
        await expectReadable(
          page.locator(".explorer-beer-card h4"),
          `${colorScheme} beer name at ${width}px`,
        );
        await expectReadable(
          page.locator(".explorer-beer-card p").first(),
          `${colorScheme} brewery name at ${width}px`,
        );
      } else {
        await expect(page.locator(".explorer-beer-table-wrap")).toBeVisible();
        await expectReadable(
          page.locator(".explorer-beer-table tbody strong"),
          `${colorScheme} beer name at ${width}px`,
        );
        await expect(page.locator(".explorer-beer-table td").first()).toHaveCSS(
          "white-space",
          "nowrap",
        );
      }
    }

    await page
      .getByRole("searchbox", { name: "Search beers or breweries" })
      .focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const focusedSearchAction = page.getByRole("button", { name: "Search" });
    await expect(focusedSearchAction).toBeFocused();
    await expect(focusedSearchAction).toHaveCSS("outline-style", "solid");
    await expect(focusedSearchAction).toHaveCSS("outline-width", "3px");
    await expect(focusedSearchAction).toHaveCSS(
      "outline-color",
      colorScheme === "light" ? "rgb(128, 85, 0)" : "rgb(251, 191, 36)",
    );
    expect(
      contrastRatio(
        await focusedSearchAction.evaluate(
          (element) => getComputedStyle(element).outlineColor,
        ),
        expected.canvas,
      ),
    ).toBeGreaterThanOrEqual(3);
  }
});

test("shared primitives stay readable on the light compatibility route", async ({
  page,
}) => {
  await stubApplication(page);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/imports");
    await expect(page.getByRole("heading", { name: "Imports" })).toBeVisible();

    const root = page.locator("html");
    await expect(root).toHaveCSS("color-scheme", "light");
    const uploadCard = page.getByRole("region", {
      name: "Untappd check-in CSV",
    });
    await expect(uploadCard).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    const uploadButton = uploadCard.getByRole("button", { name: "Upload CSV" });
    await expect(uploadButton).toBeDisabled();
    await expect(uploadButton).toHaveCSS("min-height", "44px");
    const refreshButton = page.getByRole("button", { name: "Refresh" });
    await expect(refreshButton).toHaveCSS(
      "background-color",
      "rgb(232, 238, 248)",
    );
    await expect(refreshButton).toHaveCSS("color", "rgb(23, 32, 51)");
    await expectReadable(refreshButton, `${colorScheme} Imports action button`);
    const refreshBoundary = await refreshButton.evaluate((element) => {
      const history = element.closest(".history-card");
      if (!history) throw new Error("Refresh action lost its history surface");
      return {
        border: getComputedStyle(element).borderTopColor,
        surface: getComputedStyle(history).backgroundColor,
      };
    });
    expect(
      contrastRatio(refreshBoundary.border, refreshBoundary.surface),
    ).toBeGreaterThanOrEqual(3);

    const statusVariants = [
      {
        label: "completed",
        surface: "rgb(232, 246, 237)",
        text: "rgb(21, 91, 53)",
        border: "rgb(22, 128, 60)",
      },
      {
        label: "failed",
        surface: "rgb(255, 241, 240)",
        text: "rgb(163, 41, 32)",
        border: "rgb(180, 35, 24)",
      },
      {
        label: "processing",
        surface: "rgb(238, 242, 247)",
        text: "rgb(29, 78, 216)",
        border: "rgb(29, 78, 216)",
      },
    ];
    for (const expectedBadge of statusVariants) {
      const badge = page.getByText(expectedBadge.label, { exact: true });
      await expect(badge).toHaveCSS("background-color", expectedBadge.surface);
      await expect(badge).toHaveCSS("color", expectedBadge.text);
      await expect(badge).toHaveCSS("border-top-color", expectedBadge.border);
      const statusBoundary = await badge.evaluate((element) => {
        const style = getComputedStyle(element);
        const history = element.closest(".history-card");
        if (!history) throw new Error("Status badge lost its history surface");
        return {
          border: style.borderTopColor,
          surface: getComputedStyle(history).backgroundColor,
        };
      });
      expect(
        contrastRatio(statusBoundary.border, statusBoundary.surface),
      ).toBeGreaterThanOrEqual(3);
      await expectReadable(
        badge,
        `${colorScheme} ${expectedBadge.label} badge`,
      );
    }
    const status = page.getByText("completed", { exact: true });

    const dateField = page.getByLabel("Trusted export date (optional)");
    await expect(dateField).toHaveAttribute(
      "id",
      "inventory-source-exported-at",
    );
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
      await expectNoDocumentOverflow(page);
      await expectReadable(
        status,
        `${colorScheme} Imports status at ${width}px`,
      );
    }
  }
});

test("application header styling stays scoped away from Analytics headings", async ({
  page,
}) => {
  await stubApplication(page);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/analytics");
    await expect(page.getByText("Check-in Breakdown")).toBeVisible();
    const appHeader = page.locator(".app-header");
    await expect(appHeader).toHaveCSS("background-color", "rgb(23, 32, 51)");
    await expect(appHeader).toHaveCSS("color", "rgb(255, 255, 255)");
    for (const description of await page
      .locator(".analytics-chart-panel .panel-explanation")
      .all()) {
      await expectReadable(description, `${colorScheme} Analytics description`);
    }

    const menuButton = page.getByRole("button", { name: "Main menu" });
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    const navigation = page.getByRole("navigation", {
      name: "Main navigation",
    });
    await expect(navigation).toBeVisible();
    await navigation.getByRole("link", { name: "Dashboard" }).click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await page.goto("/analytics");
    await page.getByRole("tab", { name: "Drinking Trends" }).click();

    const trendsHeader = page.locator(".drinking-trends-view > header");
    await expect(trendsHeader).toBeVisible();
    await expect(trendsHeader).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expectReadable(
      trendsHeader.getByRole("heading", { name: "Drinking Trends" }),
      `${colorScheme} Drinking Trends heading`,
    );

    const heatmapHeader = page.locator(".weekday-hour-heatmap > header");
    await expect(heatmapHeader).toBeVisible();
    await expect(heatmapHeader).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expectReadable(
      heatmapHeader.locator("#weekday-hour-instructions"),
      `${colorScheme} weekday/hour explanation`,
    );
  }
});
