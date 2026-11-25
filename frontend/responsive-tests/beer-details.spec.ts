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
  state: "multi" | "single" | "unrated" = "multi",
) {
  const detail = {
    ...beer,
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
  await page.route("https://images.example.test/**", async (route) => {
    if (route.request().url().endsWith("photo.svg"))
      await route.fulfill({ contentType: "image/svg+xml", body: photo });
    else await route.abort();
  });
  await page.route("**/api/v1/**", async (route) => {
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
                  rating: null,
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
                  occurred_at_utc: "2026-11-20T23:30:00Z",
                  rating: 0,
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
        await link.focus();
        await page.keyboard.press("Enter");
      } else await link.click();
      await expect(
        page.getByRole("heading", { name: beer.name }),
      ).toBeVisible();
      await expect(
        page.locator('#main-navigation a[href="/explore/beers"]'),
      ).toHaveAttribute("aria-current", "page");
      await expect(
        page.locator(".beer-rating-chart svg.recharts-surface"),
      ).toBeVisible();
      await expect(page.locator(".recharts-line-dot")).toHaveCount(4);
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
      if ([320, 390, 1280, 1920].includes(width))
        await page.screenshot({
          path: testInfo.outputPath(`beer-detail-${width}-${theme}.png`),
          fullPage: true,
        });
      const profileRequests = counts.detail;
      const pagination = page.getByRole("navigation", {
        name: "Check-in history pagination",
      });
      await pagination.getByRole("button", { name: "Next" }).click();
      await expect(page.getByText("Sparse metadata entry")).toBeVisible();
      await expect(page.getByText("Check-in photo unavailable")).toBeVisible();
      expect(counts.detail).toBe(profileRequests);
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
          page.getByRole("heading", { name: beer.name }),
        ).toBeVisible();
        if (state === "single")
          await expect(page.locator(".recharts-line-dot")).toHaveCount(1);
        else {
          await expect(page.getByText("No rated check-ins yet.")).toBeVisible();
          await expect(page.locator(".beer-rating-chart")).toHaveCount(0);
        }
        await noOverflow(page);
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
