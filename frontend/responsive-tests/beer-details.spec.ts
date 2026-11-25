import { expect, test, type Page } from "@playwright/test";

const beer = {
  id: 1,
  name: "A Very Long Beer Name With An ExtraordinarilyLongUnbrokenReleaseNameToExerciseWrapping",
  brewery: {
    id: 2,
    name: "A Brewery With A Very Long Name",
    city: "Amsterdam",
    state: "Noord-Holland",
    country: "Netherlands",
  },
  style: {
    id: 3,
    name: "Stout - Imperial / Double Pastry With A Long Style Name",
  },
  abv: 12.5,
  ibu: 0,
  photo_url: "https://images.example.test/broken.jpg",
  checkin_count: 26,
  rated_checkin_count: 4,
  personal_average_rating: 3.125,
  highest_rating: 5,
  lowest_rating: 0,
  first_checked_in_at: "2025-01-01T12:00:00Z",
  last_checked_in_at: "2026-11-20T23:30:00Z",
  rating_history: [
    { id: 1, occurred_at_utc: "2025-01-01T12:00:00Z", rating: 0 },
    { id: 2, occurred_at_utc: "2026-08-01T12:00:00Z", rating: 3.5 },
    { id: 3, occurred_at_utc: "2026-11-20T18:00:00Z", rating: 4 },
    { id: 4, occurred_at_utc: "2026-11-20T23:30:00Z", rating: 5 },
  ],
  untappd_url: "https://untappd.com/beer/4509",
};
const photo = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#293d49"/><rect x="236" y="75" width="168" height="300" rx="18" fill="#daa520"/><rect x="255" y="150" width="130" height="110" fill="#faf3dc"/><text x="320" y="210" text-anchor="middle" font-family="sans-serif" font-size="20">Synthetic beer</text></svg>`;
async function stub(
  page: Page,
  state: "multi" | "single" | "unrated" | "coincident" = "multi",
) {
  const detail = {
    ...beer,
    ...(state === "coincident"
      ? {
          rating_history: beer.rating_history.map((p) => ({
            ...p,
            occurred_at_utc: beer.rating_history[0].occurred_at_utc,
          })),
        }
      : {}),
    ...(state === "single"
      ? {
          rated_checkin_count: 1,
          personal_average_rating: 0,
          highest_rating: 0,
          lowest_rating: 0,
          rating_history: [beer.rating_history[0]],
        }
      : state === "unrated"
        ? {
            rated_checkin_count: 0,
            personal_average_rating: null,
            highest_rating: null,
            lowest_rating: null,
            rating_history: [],
          }
        : {}),
  };
  const counts = { detail: 0 };
  await page
    .context()
    .route("https://images.example.test/**", async (route) => {
      if (route.request().url().endsWith("photo.svg"))
        await route.fulfill({ contentType: "image/svg+xml", body: photo });
      else await route.abort();
    });
  await page.context().route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const pageNumber = Number(url.searchParams.get("page") ?? 1);
    const sort = url.searchParams.get("sort") ?? "newest";
    const responses: Record<string, unknown> = {
      "/api/v1/auth/me": {
        id: 1,
        username: "synthetic",
        created_at: "2026-01-01T00:00:00Z",
      },
      "/api/v1/health": { status: "ok" },
      "/api/v1/explore/filter-bounds": { abv_max: 20 },
      "/api/v1/explore/filter-options/breweries": {
        items: [beer.brewery],
        has_more: false,
      },
      "/api/v1/explore/filter-options/styles": {
        items: [beer.style],
        has_more: false,
      },
      "/api/v1/explore/beers": {
        items: [beer],
        page: 1,
        page_size: 25,
        total: 1,
        total_pages: 1,
      },
      "/api/v1/explore/beers/1": detail,
      "/api/v1/explore/beers/1/checkins": {
        page: pageNumber,
        page_size: 25,
        total: 26,
        total_pages: 2,
        items:
          pageNumber === 2
            ? [
                {
                  id: 1,
                  occurred_at_utc: "2025-01-01T12:00:00Z",
                  rating: state === "single" ? 0 : null,
                  comment: "Sparse metadata entry",
                  serving_type: null,
                  purchase_venue: null,
                  venue: null,
                  photo_url: "https://images.example.test/broken-photo.jpg",
                  untappd_url: null,
                },
              ]
            : [
                {
                  id: 4,
                  occurred_at_utc:
                    sort === "oldest"
                      ? "2025-01-01T12:00:00Z"
                      : "2026-11-20T23:30:00Z",
                  rating:
                    state === "unrated" || state === "single"
                      ? null
                      : sort === "oldest"
                        ? 0
                        : 5,
                  comment: `${sort === "oldest" ? "Oldest first" : "Newest first"}\nA long imported comment with meaningful line breaks.\n${"VeryLongUnbrokenComment".repeat(8)}\n<script>Plain text, never HTML</script>`,
                  serving_type: "Bottle",
                  purchase_venue: "A Bottle Shop Somewhere Else",
                  venue: {
                    id: 5,
                    name: "The Check-in Taproom With A Long Name",
                    city: "Haarlem",
                    state: "Noord-Holland",
                    country: "Netherlands",
                  },
                  photo_url: "https://images.example.test/photo.svg",
                  untappd_url: "https://untappd.com/c/976151023",
                },
              ],
      },
    };
    if (path === "/api/v1/explore/beers/1") counts.detail++;
    await route.fulfill({
      status: path in responses ? 200 : 404,
      json: responses[path] ?? { detail: "Not found" },
    });
  });
  return counts;
}
async function readyPhotos(page: Page) {
  const photo = page.locator(".beer-checkin-photo");
  if (await photo.count()) {
    await photo.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        photo.evaluate((node) => {
          const image = node as HTMLImageElement;
          return image.complete && image.naturalWidth > 0;
        }),
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
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
const widths = [320, 375, 390, 428, 768, 1280, 1440, 1920, 2560];
for (const theme of ["light", "dark"] as const) {
  for (const width of widths) {
    test(`beer detail navigation, geometry and history ${width}px ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      const counts = await stub(page);
      const query =
        "?search=beer&sort=rating_desc&brewery_id=2&style_id=3&abv_min=0&rating_min=0&first_tried_from=2020-01-01&last_tried_to=2026-12-31&page_size=25&future=keep";
      await page.goto(`/explore/beers${query}`);
      const link = page.locator(
        width <= 700 ? ".explorer-beer-card" : ".explorer-beer-link",
      );
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", /\/explore\/beers\/1\?/);
      if (width > 700) {
        expect(await page.locator(".explorer-beer-table th").count()).toBe(7);
        if (width === 1280) {
          const breweryCell = page
            .locator(".explorer-beer-table tbody td")
            .nth(1);
          await breweryCell.scrollIntoViewIfNeeded();
          const box = (await breweryCell.boundingBox())!;
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        } else {
          await link.focus();
          await page.keyboard.press("Enter");
        }
      } else await link.click();
      await expect(
        page.getByRole("heading", { name: beer.name, level: 1, exact: true }),
      ).toBeVisible();
      await expect(
        page.locator('#main-navigation a[href="/explore/beers"]'),
      ).toHaveAttribute("aria-current", "page");
      await expect(
        page.locator(".beer-rating-chart svg.recharts-surface"),
      ).toBeVisible();
      await expect(page.locator(".recharts-line-dot")).toHaveCount(4);
      await expect(
        page.locator(".recharts-xAxis .recharts-cartesian-axis-tick"),
      ).toHaveCount(2);
      await expect(page.locator(".beer-checkin-photo")).toBeVisible();
      await expect(
        page.getByRole("img", { name: /artwork unavailable/ }),
      ).toBeVisible();
      await expect(
        page.getByText("Check-in venue", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Purchased at", { exact: true }),
      ).toBeVisible();
      await noOverflow(page);
      const stats = await page
        .locator(".beer-personal-stats > div")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const box = node.getBoundingClientRect();
            return { x: box.x, y: box.y };
          }),
        );
      expect(stats).toHaveLength(6);
      expect(new Set(stats.map((box) => Math.round(box.y))).size).toBe(
        width <= 700 ? 3 : width <= 1100 ? 2 : 1,
      );
      const chart = (await page.locator(".beer-rating-section").boundingBox())!;
      const history = (await page.locator(".beer-history").boundingBox())!;
      if (width > 1100) {
        expect(history.x).toBeGreaterThan(chart.x + chart.width);
        expect(history.width).toBeGreaterThan(chart.width);
      } else expect(history.y).toBeGreaterThan(chart.y);
      if ([320, 390, 1280, 1920].includes(width)) {
        await readyPhotos(page);
        await page.screenshot({
          path: testInfo.outputPath(`beer-detail-${width}-${theme}.png`),
          fullPage: true,
        });
      }
      const profileRequests = counts.detail;
      const pagination = page.getByRole("navigation", {
        name: "Check-in history pagination",
      });
      await pagination.getByRole("button", { name: "Next" }).click();
      await expect(page.getByText("Sparse metadata entry")).toBeVisible();
      await expect(page.getByText("Check-in photo unavailable")).toBeVisible();
      const unavailablePhoto = (await page
        .locator(".beer-photo-unavailable")
        .boundingBox())!;
      expect(
        Math.abs(unavailablePhoto.height - unavailablePhoto.width * 0.75),
      ).toBeLessThanOrEqual(1);
      expect(counts.detail).toBe(profileRequests);
      if ([390, 1280].includes(width))
        await page.screenshot({
          path: testInfo.outputPath(`beer-sparse-${width}-${theme}.png`),
          fullPage: true,
        });
      await page.reload();
      await expect(page.getByText("Sparse metadata entry")).toBeVisible();
      await page.getByLabel("History order").selectOption("oldest");
      await expect(page.locator(".beer-checkin-comment")).toContainText(
        "Oldest first",
      );
      await expect(page).toHaveURL(/page=1&sort=oldest/);
      await page.goBack();
      await expect(page.getByText("Sparse metadata entry")).toBeVisible();
      await page.goForward();
      await expect(page.getByLabel("History order")).toHaveValue("oldest");
      await page.getByRole("link", { name: /Back to Beer Explorer/ }).click();
      await expect(page).toHaveURL(
        new RegExp(
          `/explore/beers${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        ),
      );
      await expect(page.locator(".explorer-controls input")).toHaveValue(
        "beer",
      );
      await noOverflow(page);
    });
  }
  for (const state of ["single", "unrated"] as const) {
    for (const width of [320, 1280]) {
      test(`beer detail ${state} chart screenshot ${width}px ${theme}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 850 });
        await page.emulateMedia({ colorScheme: theme });
        await stub(page, state);
        await page.goto("/explore/beers/1");
        await expect(
          page.getByRole("heading", { name: beer.name, level: 1, exact: true }),
        ).toBeVisible();
        if (state === "single")
          await expect(page.locator(".recharts-line-dot")).toHaveCount(1);
        else {
          await expect(page.getByText("No rated check-ins yet.")).toBeVisible();
          await expect(page.locator(".beer-rating-chart")).toHaveCount(0);
        }
        await noOverflow(page);
        await readyPhotos(page);
        await page.screenshot({
          path: testInfo.outputPath(`beer-${state}-${width}-${theme}.png`),
          fullPage: true,
        });
      });
    }
  }
}

test("beer rating tooltips use temporal spacing, touch taps and keyboard in short landscape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await stub(page);
  await page.goto("/explore/beers/1");
  const chart = page.locator(".beer-rating-chart");
  await chart.scrollIntoViewIfNeeded();
  const dots = page.locator(".recharts-line-dot");
  await expect(dots).toHaveCount(4);
  const positions = await dots.evaluateAll((nodes) =>
    nodes.map((n) => Number(n.getAttribute("cx"))),
  );
  expect(positions[1] - positions[0]).toBeGreaterThan(
    (positions[3] - positions[2]) * 20,
  );
  await dots.first().hover();
  await expect(page.locator(".analytics-tooltip")).toContainText("0.00");
  const tooltip = (await page.locator(".analytics-tooltip").boundingBox())!;
  expect(tooltip.x).toBeGreaterThanOrEqual(0);
  expect(tooltip.x + tooltip.width).toBeLessThanOrEqual(844);
  expect(tooltip.y).toBeGreaterThanOrEqual(0);
  expect(tooltip.y + tooltip.height).toBeLessThanOrEqual(390);
  const region = page.locator("[data-chart-bucket='3']");
  const box = (await region.boundingBox())!;
  const init = {
    pointerType: "touch",
    pointerId: 7,
    isPrimary: true,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
    bubbles: true,
  };
  await region.dispatchEvent("pointerdown", init);
  await region.dispatchEvent("pointerup", init);
  await expect(page.locator(".analytics-tooltip")).toContainText("5.00");
  await page
    .locator(".beer-profile")
    .dispatchEvent("pointerdown", { ...init, clientX: 1, clientY: 1 });
  await expect(page.locator(".analytics-tooltip")).toHaveCount(0);
  await chart.locator(".recharts-surface").focus();
  await page.keyboard.press("ArrowRight");
  await page.getByText("View rating history as text").click();
  await expect(page.locator(".beer-rating-data li")).toHaveCount(4);
  await noOverflow(page);
});

test("beer catalogue links open details in a new tab", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await stub(page);
  await page.goto("/explore/beers?future=preserved");
  const popupPromise = context.waitForEvent("page");
  await page
    .locator(".explorer-beer-link")
    .click({ modifiers: ["ControlOrMeta"] });
  const popup = await popupPromise;
  await expect(
    popup.getByRole("heading", { name: beer.name, level: 1, exact: true }),
  ).toBeVisible();
  await expect(
    popup.getByRole("link", { name: /Back to Beer Explorer/ }),
  ).toHaveAttribute("href", "/explore/beers?future=preserved");
  await expect(page).toHaveURL(/\/explore\/beers\?future=preserved$/);
  await popup.close();
});

test("beer chart supports real touchscreen taps and viewport-safe tooltips", async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName === "firefox",
    "Playwright Firefox has no hasTouch context; pointer and keyboard coverage runs separately.",
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  try {
    await stub(page, "coincident");
    await page.goto("/explore/beers/1");
    const chart = page.locator(".beer-rating-chart");
    await chart.scrollIntoViewIfNeeded();
    const region = page.locator("[data-chart-bucket='0']");
    await expect(region).toHaveCount(1);
    const box = (await region.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator(".analytics-tooltip")).toContainText("0.00");
    await expect(page.locator(".analytics-tooltip li")).toHaveText([
      "0.00",
      "3.50",
      "4.00",
      "5.00",
    ]);
    const tooltip = (await page.locator(".analytics-tooltip").boundingBox())!;
    expect(tooltip.x).toBeGreaterThanOrEqual(0);
    expect(tooltip.x + tooltip.width).toBeLessThanOrEqual(390);
    await page.touchscreen.tap(5, 5);
    await expect(page.locator(".analytics-tooltip")).toHaveCount(0);
    await noOverflow(page);
  } finally {
    await context.close();
  }
});

for (const width of [700, 701, 1100, 1101]) {
  test(`beer detail exact layout breakpoint ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 390 });
    await stub(page);
    await page.goto("/explore/beers/1");
    await expect(
      page.getByRole("heading", { name: beer.name, level: 1, exact: true }),
    ).toBeVisible();
    const chart = (await page.locator(".beer-rating-section").boundingBox())!;
    const history = (await page.locator(".beer-history").boundingBox())!;
    if (width <= 1100) expect(history.y).toBeGreaterThan(chart.y);
    else expect(history.x).toBeGreaterThan(chart.x + chart.width);
    await noOverflow(page);
  });
}

test("beer chart retains distinct observations at coincident timestamps", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stub(page, "coincident");
  await page.goto("/explore/beers/1");
  const dots = page.locator(".recharts-line-dot");
  await expect(dots).toHaveCount(4);
  expect(
    new Set(
      await dots.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("cx")),
      ),
    ).size,
  ).toBe(1);
  await expect(
    page.locator(".recharts-xAxis .recharts-cartesian-axis-tick"),
  ).toHaveCount(1);
  await page.getByText("View rating history as text").click();
  await expect(page.locator(".beer-rating-data li")).toHaveCount(4);
  await noOverflow(page);
});

for (const width of [390, 1280]) {
  for (const theme of ["light", "dark"] as const) {
    test(`beer history delayed pagination retains geometry and focus ${width}px ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const counts = await stub(page);
      let delay = false;
      let awaiting = false;
      let fail = false;
      let release = () => {};
      await page.route(
        /\/api\/v1\/explore\/beers\/1\/checkins(?:\?|$)/,
        async (route) => {
          const params = new URL(route.request().url()).searchParams;
          const currentPage = Number(params.get("page") ?? 1);
          const sort = params.get("sort") ?? "newest";
          const shouldFail = fail;
          if (delay) {
            awaiting = true;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            awaiting = false;
          }
          if (shouldFail) {
            await route.fulfill({
              status: 503,
              json: { detail: "Synthetic failure" },
            });
            return;
          }
          await route.fulfill({
            json: {
              page: currentPage,
              page_size: 25,
              total: 26,
              total_pages: 2,
              items: Array.from(
                { length: currentPage === 1 ? 4 : 1 },
                (_, index) => ({
                  id: currentPage * 100 + index,
                  occurred_at_utc: "2026-11-20T23:30:00Z",
                  rating: index === 0 ? 0 : null,
                  comment: `${sort} page ${currentPage} entry ${index}\n${"A lengthy imported comment with preserved line breaks.\n".repeat(15)}`,
                  serving_type: "Bottle",
                  venue: null,
                  purchase_venue: "Bottle shop",
                  photo_url: "https://images.example.test/photo.svg",
                  untappd_url: null,
                }),
              ),
            },
          });
        },
      );
      await page.goto("/explore/beers/1");
      await expect(page.locator(".beer-checkin-entry")).toHaveCount(4);
      const profileRequests = counts.detail;
      const list = page.locator(".beer-checkin-list");
      const next = page.getByRole("button", { name: "Next", exact: true });
      await next.scrollIntoViewIfNeeded();
      await next.focus();
      const height = (await list.boundingBox())!.height;
      const scroll = await page.evaluate(() => window.scrollY);
      delay = true;
      await page.keyboard.press("Enter");
      await expect(
        page.getByText("Loading page 2…", { exact: true }),
      ).toBeVisible();
      await expect(next).toBeDisabled();
      await expect(page.getByLabel("History order")).toBeDisabled();
      await expect(list).toHaveAttribute("aria-hidden", "true");
      expect(
        Math.abs((await list.boundingBox())!.height - height),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs((await page.evaluate(() => window.scrollY)) - scroll),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: testInfo.outputPath(`history-pending-${width}-${theme}.png`),
      });
      await expect.poll(() => awaiting).toBe(true);
      delay = false;
      release();
      await expect(page.locator(".beer-checkin-comment").first()).toContainText(
        "newest page 2",
      );
      const heading = page.getByRole("heading", { name: "Check-in history" });
      await expect(heading).toBeFocused();
      const position = (await heading.boundingBox())!;
      expect(position.y).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeLessThan(422);
      await expect
        .poll(() =>
          page
            .locator(".beer-checkin-photo")
            .evaluate(
              (node) =>
                (node as HTMLImageElement).complete &&
                (node as HTMLImageElement).naturalWidth > 0,
            ),
        )
        .toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`history-page-two-${width}-${theme}.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Previous", exact: true }).click();
      await expect(page.locator(".beer-checkin-entry")).toHaveCount(4);
      await expect(heading).toBeFocused();
      delay = true;
      await page.getByLabel("History order").selectOption("oldest");
      await expect(page.getByText("Loading history page 1…")).toBeAttached();
      await expect(
        page.getByRole("button", { name: "Next", exact: true }),
      ).toBeDisabled();
      await expect.poll(() => awaiting).toBe(true);
      delay = false;
      release();
      await expect(page.locator(".beer-checkin-comment").first()).toContainText(
        "oldest page 1",
      );
      await expect(heading).toBeFocused();
      fail = true;
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText(
        "temporarily unavailable",
      );
      await expect(
        page.getByRole("button", { name: "Previous", exact: true }),
      ).toBeEnabled();
      fail = false;
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(page.locator(".beer-checkin-comment").first()).toContainText(
        "oldest page 2",
      );
      await expect(heading).toBeFocused();
      await page.getByRole("button", { name: "Previous", exact: true }).click();
      await expect(page.locator(".beer-checkin-entry")).toHaveCount(4);
      delay = true;
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(
        page.getByText("Loading page 2…", { exact: true }),
      ).toBeVisible();
      await expect.poll(() => awaiting).toBe(true);
      const releaseStale = release;
      delay = false;
      await page.goBack();
      await expect(page.locator(".beer-checkin-comment").first()).toContainText(
        "oldest page 1",
      );
      const staleResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/checkins?") &&
          new URL(response.url()).searchParams.get("page") === "2",
      );
      releaseStale();
      await (await staleResponse).finished();
      await expect(page).toHaveURL(/page=1/);
      await expect(page.locator(".beer-checkin-entry")).toHaveCount(4);
      expect(counts.detail).toBe(profileRequests);
      await noOverflow(page);
    });
  }
}

for (const width of [390, 1280]) {
  test(`beer catalogue scroll restoration follows history entries ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await stub(page);
    let delayed = false;
    let catalogueAwaiting = false;
    let release = () => {};
    await page.route(/\/api\/v1\/explore\/beers(?:\?|$)/, async (route) => {
      if (delayed) {
        catalogueAwaiting = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        catalogueAwaiting = false;
      }
      await route.fulfill({
        json: {
          items: Array.from({ length: 20 }, (_, index) => ({
            ...beer,
            id: index === 19 ? 1 : index + 2,
            name: `${beer.name} ${index}`,
          })),
          page: 1,
          page_size: 25,
          total: 20,
          total_pages: 1,
        },
      });
    });
    const query = "?search=beer&sort=name_desc&page=1&page_size=25&future=keep";
    await page.goto(`/explore/beers${query}`);
    const link = page
      .locator(width <= 700 ? ".explorer-beer-card" : ".explorer-beer-link")
      .last();
    await link.scrollIntoViewIfNeeded();
    const saved = await page.evaluate(() => window.scrollY);
    expect(saved).toBeGreaterThan(500);
    await link.click();
    await expect(
      page.getByRole("heading", { name: beer.name, level: 1, exact: true }),
    ).toBeVisible();
    delayed = true;
    await page.getByRole("link", { name: /Back to Beer Explorer/ }).click();
    await expect(page.getByText("Loading beers…")).toBeVisible();
    await expect.poll(() => catalogueAwaiting).toBe(true);
    delayed = false;
    release();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(saved, 0);
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: beer.name, level: 1, exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(saved, 0);
    await page.goForward();
    await expect(
      page.getByRole("heading", { name: beer.name, level: 1, exact: true }),
    ).toBeVisible();
    await page.goForward();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(saved, 0);
    // Fresh navigation uses a new entry, even if it later selects the old query.
    await page.goto("/");
    if (width <= 700)
      await page.getByRole("button", { name: "Main menu" }).click();
    await page.locator('#main-navigation a[href="/explore/beers"]').click();
    await expect(link).toBeAttached();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.goto(`/explore/beers${query}`);
    await expect(link).toBeAttached();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.addInitScript(() => {
      Object.defineProperty(window, "sessionStorage", {
        get() {
          throw new Error("Storage unavailable");
        },
      });
    });
    await page.goto("/explore/beers/1");
    await expect(
      page.getByRole("heading", { name: beer.name, level: 1, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Back to Beer Explorer/ }),
    ).toHaveAttribute("href", "/explore/beers");
    await page.getByRole("link", { name: /Back to Beer Explorer/ }).click();
    await expect(link).toBeAttached();
    await noOverflow(page);
  });
}

for (const width of [320, 1280]) {
  for (const theme of ["light", "dark"] as const) {
    test(`beer coincident timestamp tooltip lists every observation ${width}px ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme });
      await stub(page, "coincident");
      const points = [
        { id: 4, occurred_at_utc: "2026-11-20T18:30:00Z", rating: 4.25 },
        { id: 2, occurred_at_utc: "2026-11-20T18:30:00Z", rating: 0 },
        { id: 3, occurred_at_utc: "2026-11-20T18:30:00Z", rating: 4.25 },
        { id: 5, occurred_at_utc: "2026-11-20T18:30:00Z", rating: 4.5 },
      ];
      if (width === 1280)
        points.push({
          id: 1,
          occurred_at_utc: "2025-01-01T12:00:00Z",
          rating: 3,
        });
      await page.route(/\/api\/v1\/explore\/beers\/1$/, (route) =>
        route.fulfill({
          json: {
            ...beer,
            checkin_count: Math.max(beer.checkin_count, points.length),
            rated_checkin_count: points.length,
            personal_average_rating:
              points.reduce((sum, point) => sum + point.rating, 0) /
              points.length,
            highest_rating: Math.max(...points.map((p) => p.rating)),
            lowest_rating: Math.min(...points.map((p) => p.rating)),
            rating_history: points,
          },
        }),
      );
      await page.goto("/explore/beers/1");
      const chart = page.locator(".beer-rating-chart");
      await chart.scrollIntoViewIfNeeded();
      await expect(page.locator("[data-chart-bucket]")).toHaveCount(
        width === 1280 ? 2 : 1,
      );
      const region = page.locator(
        `[data-chart-bucket='${width === 1280 ? 1 : 0}']`,
      );
      const bounds = (await region.boundingBox())!;
      const pointer = {
        pointerType: "touch",
        pointerId: 44,
        isPrimary: true,
        clientX: bounds.x + bounds.width / 2,
        clientY: bounds.y + bounds.height / 2,
        bubbles: true,
      };
      await region.dispatchEvent("pointerdown", pointer);
      await region.dispatchEvent("pointerup", pointer);
      const tooltip = page.locator(".analytics-tooltip");
      await expect(tooltip).toContainText("4 rated check-ins:");
      await expect(tooltip.locator("li")).toHaveText([
        "0.00",
        "4.25",
        "4.25",
        "4.50",
      ]);
      const box = (await tooltip.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
      await page.screenshot({
        path: testInfo.outputPath(`coincident-tooltip-${width}-${theme}.png`),
      });
      await page
        .locator(".beer-profile")
        .dispatchEvent("pointerdown", { ...pointer, clientX: 1, clientY: 1 });
      await page.locator(".recharts-line-dot").last().hover();
      await expect(tooltip.locator("li")).toHaveText([
        "0.00",
        "4.25",
        "4.25",
        "4.50",
      ]);
      await chart.locator(".recharts-surface").focus();
      await page.keyboard.press("ArrowRight");
      await expect(tooltip).toContainText("4 rated check-ins:");
      await page.getByText("View rating history as text").click();
      await expect(page.locator(".beer-rating-data li")).toHaveCount(
        points.length,
      );
      await noOverflow(page);
    });
  }
}

test("beer large coincident tooltip stays inside a short viewport and remains scrollable", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 390 });
  await stub(page, "coincident");
  await page.route(/\/api\/v1\/explore\/beers\/1$/, (route) =>
    route.fulfill({
      json: {
        ...beer,
        rating_history: Array.from({ length: 40 }, (_, id) => ({
          id,
          occurred_at_utc: "2026-11-20T18:30:00Z",
          rating: id % 6,
        })),
      },
    }),
  );
  await page.goto("/explore/beers/1");
  await page.locator(".beer-rating-chart").scrollIntoViewIfNeeded();
  const region = page.locator("[data-chart-bucket='0']");
  const bounds = (await region.boundingBox())!;
  const pointer = {
    pointerType: "touch",
    pointerId: 55,
    isPrimary: true,
    clientX: bounds.x + bounds.width / 2,
    clientY: bounds.y + bounds.height / 2,
    bubbles: true,
  };
  await region.dispatchEvent("pointerdown", pointer);
  await region.dispatchEvent("pointerup", pointer);
  const tooltip = page.locator(".analytics-tooltip");
  await expect(tooltip.locator("li")).toHaveCount(40);
  const box = (await tooltip.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(390);
  const content = tooltip.locator(".beer-rating-tooltip-content");
  await content.dispatchEvent("pointerdown", pointer);
  await content.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(tooltip.locator("li").last()).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("coincident-tooltip-large-320.png"),
  });
});
