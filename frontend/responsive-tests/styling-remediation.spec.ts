import { expect, test, type Locator, type Page } from "@playwright/test";

const longBeerName =
  "Imperial Double Dry Hopped Pale Ale with a Remarkably Long Seasonal Release Name That Should Wrap on Narrow Screens";
const longBreweryName =
  "The Independent Brewery with an Exceptionally Long Regional Name and Brewing Company";
const longLocationPath =
  "Cellar → North Storage Room → Top Shelf → Long Term Bottle Conditioning Area";
const longLocationName =
  "Long Term Bottle Conditioning Area with a Name That Wraps on Narrow Screens";
const longLocationAlias =
  "Very Long Storage Alias for Imported Inventory Assignment Matching";
const longStyleName =
  "Imperial IPA with an Exceptionally Long Dry-Hopped Seasonal Release Name";

type LocationFixtureNode = {
  id: number;
  name: string;
  parent_id: number | null;
  description: null;
  path: string;
  aliases: string[];
  alias_details: Array<{
    id: number;
    alias: string;
    managed_by_config: boolean;
  }>;
  rules: Array<{
    id: number;
    pattern: string;
    match_kind: string;
    priority: number;
    managed_by_config: boolean;
  }>;
  managed_by_config: boolean;
  ownership: "database";
  record_count: number;
  total_units: number;
  children: LocationFixtureNode[];
};

function locationNode(
  id: number,
  name: string,
  parentId: number | null,
  path: string,
  children: LocationFixtureNode[] = [],
): LocationFixtureNode {
  return {
    id,
    name,
    parent_id: parentId,
    description: null,
    path,
    aliases: id === 1 ? [longLocationAlias] : [],
    alias_details:
      id === 1
        ? [{ id: 101, alias: longLocationAlias, managed_by_config: false }]
        : [],
    rules: [],
    managed_by_config: false,
    ownership: "database" as const,
    record_count: id === 1 ? 4 : 1,
    total_units: id === 1 ? 8 : 2,
    children,
  };
}

const locationsFixture = {
  locations: [
    locationNode(1, longLocationName, null, longLocationPath, [
      locationNode(2, "Lower Cellar", 1, `${longLocationPath} → Lower Cellar`, [
        locationNode(
          3,
          "North Rack",
          2,
          `${longLocationPath} → Lower Cellar → North Rack`,
          [
            locationNode(
              4,
              "Shelf Four",
              3,
              `${longLocationPath} → Lower Cellar → North Rack → Shelf Four`,
              [
                locationNode(
                  5,
                  "Long-term row",
                  4,
                  `${longLocationPath} → Lower Cellar → North Rack → Shelf Four → Long-term row`,
                  [
                    locationNode(
                      6,
                      "Deep storage",
                      5,
                      `${longLocationPath} → Lower Cellar → North Rack → Shelf Four → Long-term row → Deep storage`,
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ]),
    ]),
  ],
  unresolved: { record_count: 2, total_units: 3 },
};

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

const analyticsResponsiveCheckins = {
  ...checkins,
  start: "2026-01-01",
  end: "2026-12-31",
  summary: {
    total_checkins: 69,
    new_discoveries: 24,
    repeat_checkins: 45,
    distinct_beers: 32,
  },
  buckets: Array.from({ length: 12 }, (_, index) => {
    const start = new Date(Date.UTC(2026, index, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(2026, index + 1, 0))
      .toISOString()
      .slice(0, 10);
    const label = new Date(Date.UTC(2026, index, 1)).toLocaleString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    const newDiscoveries = (index % 3) + 1;
    const repeatCheckins = (index % 5) + 2;
    const previousDiscoveries = Array.from(
      { length: index },
      (_, previousIndex) => (previousIndex % 3) + 1,
    ).reduce((total, value) => total + value, 0);
    const previousCheckins = Array.from(
      { length: index },
      (_, previousIndex) => (previousIndex % 3) + 1 + (previousIndex % 5) + 2,
    ).reduce((total, value) => total + value, 0);
    return {
      key: `2026-${String(index + 1).padStart(2, "0")}`,
      label: `${label} 2026`,
      start,
      end,
      new_discoveries: newDiscoveries,
      repeat_checkins: repeatCheckins,
      total_checkins: newDiscoveries + repeatCheckins,
      cumulative_checkins:
        12 + previousCheckins + newDiscoveries + repeatCheckins,
      cumulative_discoveries: 8 + previousDiscoveries + newDiscoveries,
    };
  }),
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

const analyticsResponsiveTrends = {
  ...drinkingTrends,
  hourly: drinkingTrends.hourly.map((row) => ({
    ...row,
    total: row.total + 1,
    discoveries: row.discoveries + 1,
  })),
};

const dashboardFixture = {
  total_checkins: 2924,
  unique_beers: 2325,
  unique_breweries: 640,
  unique_styles: 209,
  average_personal_rating: 4.5,
  rated_checkins: 1200,
  inventory_units: 183,
  unique_inventory_beers: 172,
  not_confirmed_checked_in: 30,
  match_coverage: { external_id: 100, exact: 42, ambiguous: 10, unmatched: 20 },
  freshness: {
    checkins_last_imported_at: "2026-10-14T10:00:00+00:00",
    inventory_last_imported_at: "2026-10-13T10:00:00+00:00",
    checkins_source_exported_at: null,
    inventory_source_exported_at: null,
  },
  import_deltas: {
    total_checkins: 12,
    unique_beers: 8,
    unique_breweries: null,
    unique_styles: -2,
  },
};

const dashboardCheckinsFixture = (() => {
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(dateParts.find((part) => part.type === "year")?.value);
  const month = Number(dateParts.find((part) => part.type === "month")?.value);
  const day = dateParts.find((part) => part.type === "day")?.value;
  let cumulativeCheckins = 84;
  let cumulativeDiscoveries = 32;
  const buckets = Array.from({ length: 6 }, (_, index) => {
    const startDate = new Date(Date.UTC(year, month - 1 - 5 + index, 1));
    const key = startDate.toISOString().slice(0, 7);
    const label = new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(startDate);
    const newDiscoveries = (index % 3) + 1;
    const repeatCheckins = (index % 4) + 3;
    cumulativeCheckins += newDiscoveries + repeatCheckins;
    cumulativeDiscoveries += newDiscoveries;
    return {
      key,
      label,
      start: `${key}-01`,
      end:
        index === 5 && day
          ? `${year}-${String(month).padStart(2, "0")}-${day}`
          : new Date(Date.UTC(year, month - 1 - 5 + index + 1, 0))
              .toISOString()
              .slice(0, 10),
      new_discoveries: newDiscoveries,
      repeat_checkins: repeatCheckins,
      total_checkins: newDiscoveries + repeatCheckins,
      cumulative_checkins: cumulativeCheckins,
      cumulative_discoveries: cumulativeDiscoveries,
    };
  });
  const start = buckets[0].start;
  const end = buckets[buckets.length - 1].end;
  return {
    ...checkins,
    start,
    end,
    summary: {
      total_checkins: buckets.reduce(
        (sum, bucket) => sum + bucket.total_checkins,
        0,
      ),
      new_discoveries: buckets.reduce(
        (sum, bucket) => sum + bucket.new_discoveries,
        0,
      ),
      repeat_checkins: buckets.reduce(
        (sum, bucket) => sum + bucket.repeat_checkins,
        0,
      ),
      distinct_beers: 32,
    },
    cumulative_baseline_checkins: 84,
    cumulative_baseline_discoveries: 32,
    buckets,
  };
})();

const dashboardMilestone = {
  id: 4,
  name: "Discover 100 New Beers from Independent Breweries",
  metric: "discoveries",
  goal_type: "incremental",
  target: 100,
  calendar_year: null,
  start_date: "2026-01-01",
  deadline_date: "2026-12-31",
  timezone: "Europe/Amsterdam",
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-10-14T00:00:00Z",
  current: 82,
  remaining: 18,
  progress_percent: 82,
  status: "active",
  deadline_outcome: null,
  completed_at: null,
  completed_before_deadline: null,
  required_per_day: null,
  required_per_week: null,
  elapsed_per_day: null,
  elapsed_per_week: null,
  trajectory_difference: null,
};

const longMilestoneName =
  "Discover One Hundred New Beers from Independent Breweries before the End of a Long Seasonal Challenge";
const milestoneFixtures = [
  { ...dashboardMilestone, name: longMilestoneName },
  {
    ...dashboardMilestone,
    id: 5,
    name: "Scheduled tasting goal",
    status: "scheduled",
    current: 0,
    progress_percent: 0,
  },
  {
    ...dashboardMilestone,
    id: 6,
    name: "Overdue tasting goal",
    status: "overdue",
    progress_percent: 45,
  },
  {
    ...dashboardMilestone,
    id: 7,
    name: "Completed tasting goal",
    status: "completed",
    progress_percent: 100,
  },
  {
    ...dashboardMilestone,
    id: 8,
    name: "Period ended tasting goal",
    status: "period_ended",
    progress_percent: 82,
  },
  {
    ...dashboardMilestone,
    id: 9,
    name: "Archived tasting goal",
    status: "archived",
    archived_at: "2026-10-01T00:00:00Z",
  },
];

const longImportFilename =
  "untappd-check-ins-export-with-a-very-long-filename-for-small-screen-wrapping.csv";
const longImportError =
  "The uploaded CSV contains a malformed record with a very long explanation that must wrap inside the history and result cards without widening the page.";
const completedImport = {
  id: 4,
  source_type: "checkins",
  filename: longImportFilename,
  sha256: "test-hash-4",
  started_at: "2026-01-04T12:00:00Z",
  completed_at: "2026-01-04T12:00:05Z",
  status: "completed",
  inserted_count: 8,
  updated_count: 1,
  unchanged_count: 0,
  removed_count: 0,
  rejected_count: 0,
  error_code: null,
  error_summary: null,
  errors: [],
};
const rejectedImport = {
  ...completedImport,
  id: 5,
  source_type: "inventory",
  filename: "stash-export.csv",
  status: "failed",
  rejected_count: 2,
  error_code: "invalid_csv",
  error_summary: longImportError,
  errors: [
    {
      row_number: 18,
      field: "beer_name",
      reason: longImportError,
    },
  ],
};

const dashboardInsights = [
  {
    id: "long-seasonal-insight",
    type: "checkin_trend",
    category: "activity",
    priority: 50,
    title: "Your activity at a glance",
    description:
      "You recorded 20 check-ins this month, compared with 10 last month.",
    href: "/analytics",
    data: { current_count: 20, previous_count: 10, difference: 10 },
  },
];

async function stubApplication(
  page: Page,
  checkinsFixture = checkins,
  drinkingTrendsFixture = drinkingTrends,
  options: { anonymous?: boolean; dashboard?: boolean } = {},
) {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    if (options.anonymous && path === "/api/v1/auth/me") {
      await route.fulfill({
        status: 401,
        json: { detail: "Authentication required" },
      });
      return;
    }
    if (options.anonymous && path === "/api/v1/auth/csrf") {
      await route.fulfill({ status: 200, json: { token: "test-token" } });
      return;
    }
    if (options.anonymous && path === "/api/v1/auth/login") {
      await route.fulfill({
        status: 401,
        json: { detail: "Invalid username or password" },
      });
      return;
    }
    if (path === "/api/v1/milestones" && method === "GET") {
      const archived = url.searchParams.get("archived") === "true";
      await route.fulfill({
        json: {
          milestones: archived
            ? [milestoneFixtures[milestoneFixtures.length - 1]]
            : milestoneFixtures.filter(
                (milestone) => milestone.status !== "archived",
              ),
        },
      });
      return;
    }
    if (path === "/api/v1/milestones/4" && method === "GET") {
      await route.fulfill({ json: milestoneFixtures[0] });
      return;
    }
    if (path === "/api/v1/imports/checkins" && method === "POST") {
      await route.fulfill({ status: 200, json: completedImport });
      return;
    }
    if (path === "/api/v1/imports/inventory" && method === "POST") {
      await route.fulfill({ status: 422, json: rejectedImport });
      return;
    }
    const body: Record<string, unknown> = {
      "/api/v1/auth/me": {
        id: 1,
        username: "styling-test",
        created_at: "2026-01-01T00:00:00Z",
      },
      "/api/v1/health": { status: "ok" },
      "/api/v1/dashboard": dashboardFixture,
      "/api/v1/milestones/summary": {
        active_count: 1,
        completed_count: 0,
        overdue_count: 0,
        milestones: [dashboardMilestone],
      },
      "/api/v1/insights": { insights: dashboardInsights },
      "/api/v1/inventory/styles": [
        { id: 1, name: longStyleName },
        { id: 2, name: "Pilsner" },
        { id: 3, name: "Fruited Sour Ale" },
      ],
      "/api/v1/locations": {
        ...locationsFixture,
      },
      "/api/v1/imports": [
        {
          id: 1,
          source_type: "checkins",
          filename: longImportFilename,
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
          filename: "untappd-stash-export-with-a-long-file-name.csv",
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
          error_summary: longImportError,
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
      "/api/v1/analytics/checkins": options.dashboard
        ? dashboardCheckinsFixture
        : checkinsFixture,
      "/api/v1/analytics/drinking-trends": drinkingTrendsFixture,
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
    if (path === "/api/v1/inventory/1") {
      await route.fulfill({ json: inventoryItems[0] });
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
  const measurement = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const offenders = Array.from(
      document.body.querySelectorAll<HTMLElement>("*"),
    )
      .flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (
          style.display === "none" ||
          rect.width === 0 ||
          rect.right <= viewportWidth + 1
        ) {
          return [];
        }
        return [
          {
            element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.className && typeof element.className === "string" ? `.${element.className.trim().replaceAll(/\s+/g, ".")}` : ""}`,
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            position: style.position,
            overflowX: style.overflowX,
          },
        ];
      })
      .slice(0, 8);
    return {
      overflow: document.documentElement.scrollWidth - viewportWidth,
      viewportWidth,
      documentWidth: document.documentElement.scrollWidth,
      offenders,
    };
  });
  expect(
    measurement.overflow,
    `Horizontal overflow: ${JSON.stringify(measurement)}`,
  ).toBeLessThanOrEqual(1);
}

const buttonVariants = ["primary", "secondary", "danger", "ghost"] as const;

type ButtonVariant = (typeof buttonVariants)[number];

async function installButtonCascadeFixture(
  page: Page,
  surfaceSelector: string,
) {
  await page.locator(surfaceSelector).evaluate((surface) => {
    const fixture = document.createElement("div");
    fixture.id = "button-cascade-fixture";
    fixture.style.cssText =
      "display:flex;flex-wrap:wrap;gap:.5rem;margin-top:1rem";

    for (const variant of ["primary", "secondary", "danger", "ghost"]) {
      const button = document.createElement("button");
      button.id = `cascade-${variant}`;
      button.className = `ui-button ui-button--${variant}`;
      button.textContent = `${variant} action`;
      fixture.append(button);

      const disabledButton = document.createElement("button");
      disabledButton.id = `cascade-disabled-${variant}`;
      disabledButton.className = `ui-button ui-button--${variant}`;
      disabledButton.textContent = `disabled ${variant} action`;
      disabledButton.disabled = true;
      fixture.append(disabledButton);
    }

    const legacyButton = document.createElement("button");
    legacyButton.id = "cascade-legacy-native";
    legacyButton.textContent = "Legacy native action";
    fixture.append(legacyButton);

    const disabledLegacyButton = document.createElement("button");
    disabledLegacyButton.id = "cascade-disabled-legacy-native";
    disabledLegacyButton.textContent = "Disabled legacy native action";
    disabledLegacyButton.disabled = true;
    fixture.append(disabledLegacyButton);

    surface.append(fixture);
  });
}

async function readButtonCascadeStyles(button: Locator) {
  return button.evaluate((element) => {
    const style = getComputedStyle(element);
    const resolveToken = (token: string) => {
      const probe = document.createElement("span");
      probe.style.color = style.getPropertyValue(token).trim();
      (element.parentElement ?? document.body).append(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    };
    const surfaceBackground = () => {
      let parent = element.parentElement;
      while (parent) {
        const background = getComputedStyle(parent).backgroundColor;
        const channels = background.match(/[\d.]+/g) ?? [];
        if (channels.length !== 4 || Number(channels[3]) !== 0) {
          return background;
        }
        parent = parent.parentElement;
      }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    const backgroundChannels = style.backgroundColor.match(/[\d.]+/g) ?? [];

    return {
      background: style.backgroundColor,
      backgroundIsTransparent:
        backgroundChannels.length === 4 && Number(backgroundChannels[3]) === 0,
      foreground: style.color,
      border: style.borderTopColor,
      outline: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      opacity: style.opacity,
      surface: surfaceBackground(),
      actionPrimary: resolveToken("--color-action-primary"),
      actionPrimaryHover: resolveToken("--color-action-primary-hover"),
      actionSecondary: resolveToken("--color-action-secondary"),
      actionDanger: resolveToken("--color-action-danger"),
      actionDangerHover: resolveToken("--color-action-danger-hover"),
      actionDisabled: resolveToken("--color-action-disabled"),
      textPrimary: resolveToken("--color-text-primary"),
      textOnAccent: resolveToken("--color-text-on-accent"),
      textOnDanger: resolveToken("--color-text-on-danger-action"),
      textMuted: resolveToken("--color-text-muted"),
      surfaceHover: resolveToken("--color-surface-hover"),
      borderDisabled: resolveToken("--color-border-disabled"),
      focus: resolveToken("--color-focus"),
      borderStrong: resolveToken("--color-border-strong"),
    };
  });
}

async function expectButtonVariantStyles(
  page: Page,
  context: string,
  variant: ButtonVariant,
) {
  const button = page.locator(`#cascade-${variant}`);
  const expected = {
    primary: {
      background: "actionPrimary",
      foreground: "textOnAccent",
      hover: "actionPrimaryHover",
    },
    secondary: {
      background: "actionSecondary",
      foreground: "textPrimary",
      hover: "surfaceHover",
    },
    danger: {
      background: "actionDanger",
      foreground: "textOnDanger",
      hover: "actionDangerHover",
    },
    ghost: {
      background: "transparent",
      foreground: "textPrimary",
      hover: "surfaceHover",
    },
  }[variant];

  const normal = await readButtonCascadeStyles(button);
  if (variant === "ghost") {
    expect(
      normal.backgroundIsTransparent,
      `${context} ghost button background`,
    ).toBe(true);
  } else {
    expect(normal.background, `${context} ${variant} button background`).toBe(
      normal[expected.background],
    );
  }
  expect(normal.foreground, `${context} ${variant} foreground`).toBe(
    normal[expected.foreground],
  );
  await expectReadable(button, `${context} ${variant} button`);

  if (variant === "secondary") {
    expect(
      contrastRatio(normal.border, normal.surface),
      `${context} secondary button boundary`,
    ).toBeGreaterThanOrEqual(3);
  } else if (variant === "primary" || variant === "danger") {
    expect(
      contrastRatio(normal.background, normal.surface),
      `${context} ${variant} button boundary`,
    ).toBeGreaterThanOrEqual(3);
  }

  await button.hover();
  const hover = await readButtonCascadeStyles(button);
  expect(hover.background, `${context} ${variant} hover background`).toBe(
    hover[expected.hover],
  );
  expect(hover.foreground, `${context} ${variant} hover foreground`).toBe(
    normal[expected.foreground],
  );
  await expectReadable(button, `${context} ${variant} hovered button`);

  if (variant === "secondary") {
    expect(
      contrastRatio(hover.border, hover.surface),
      `${context} hovered secondary button boundary`,
    ).toBeGreaterThanOrEqual(3);
  } else if (variant === "primary" || variant === "danger") {
    expect(
      contrastRatio(hover.background, hover.surface),
      `${context} hovered ${variant} button boundary`,
    ).toBeGreaterThanOrEqual(3);
  }

  await button.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(button).toBeFocused();
  const focused = await readButtonCascadeStyles(button);
  expect(focused.outlineStyle, `${context} ${variant} focus outline`).toBe(
    "solid",
  );
  expect(focused.outlineWidth, `${context} ${variant} focus width`).toBe("3px");
  expect(focused.outline, `${context} ${variant} focus color`).toBe(
    focused.focus,
  );
  expect(
    contrastRatio(focused.outline, focused.surface),
    `${context} ${variant} focus indicator contrast`,
  ).toBeGreaterThanOrEqual(3);

  const disabled = page.locator(`#cascade-disabled-${variant}`);
  await expect(disabled).toBeDisabled();
  const disabledStyles = await readButtonCascadeStyles(disabled);
  expect(disabledStyles.background).toBe(disabledStyles.actionDisabled);
  expect(disabledStyles.foreground).toBe(disabledStyles.textMuted);
  expect(disabledStyles.border).toBe(disabledStyles.borderDisabled);
  expect(disabledStyles.opacity).toBe("1");
  expect(
    contrastRatio(disabledStyles.foreground, disabledStyles.background),
    `${context} disabled ${variant} label contrast`,
  ).toBeGreaterThanOrEqual(3);
}

async function expectLegacyButtonCompatibility(page: Page, context: string) {
  const nativeButton = page.locator("#cascade-legacy-native");
  const nativeStyles = await readButtonCascadeStyles(nativeButton);
  expect(nativeStyles.background, `${context} legacy button background`).toBe(
    nativeStyles.actionPrimary,
  );
  expect(nativeStyles.foreground, `${context} legacy button foreground`).toBe(
    nativeStyles.textOnAccent,
  );
  expect(nativeStyles.opacity, `${context} legacy button opacity`).toBe("1");

  const disabledNative = page.locator("#cascade-disabled-legacy-native");
  await expect(disabledNative).toBeDisabled();
  const disabledStyles = await readButtonCascadeStyles(disabledNative);
  expect(disabledStyles.background).toBe(disabledStyles.actionPrimary);
  expect(disabledStyles.foreground).toBe(disabledStyles.textOnAccent);
  expect(disabledStyles.opacity).toBe("0.5");
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

  const explorer = page.locator(".explorer-page");
  const catalogue = page.locator(".explorer-catalogue");
  const longBeerName =
    "A Long Seasonal IPA with a Name That Wraps on Narrow Screens";

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/explore/beers");
    await expect(page.locator(".app")).toHaveClass(/theme-aware/);
    await expect(page.locator(".explorer-beer-card h4")).toHaveText(
      longBeerName,
    );
    await expect(page.locator(".explorer-beer-card")).toHaveCount(1);
    await explorer.evaluate((element) => {
      const badge = document.createElement("span");
      badge.className =
        "ui-status-badge ui-status-badge--success theme-test-status";
      badge.textContent = "Theme test status";
      element.querySelector(".explorer-catalogue")?.append(badge);
    });
    const themeStatusBadge = page.getByText("Theme test status");
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
    const beerCardSurface = await page
      .locator(".explorer-beer-card")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          colorScheme: style.colorScheme,
          surfaceToken: style.getPropertyValue("--color-surface").trim(),
          background: style.backgroundColor,
        };
      });
    expect(beerCardSurface).toEqual({
      colorScheme: expected.controlScheme,
      surfaceToken: colorScheme === "dark" ? "#172533" : "#ffffff",
      background: expected.surface,
    });
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

test("Imports use the semantic theme and keep controls and history readable", async ({
  page,
}) => {
  await stubApplication(page);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/imports");
    await expect(page.getByRole("heading", { name: "Imports" })).toBeVisible();
    await expect(page.locator(".app")).toHaveClass(/theme-aware/);
    await expect(page.locator(".app")).toHaveCSS("color-scheme", colorScheme);

    const root = page.locator("html");
    await expect(root).toHaveCSS("color-scheme", "light");
    const uploadCard = page.getByRole("region", {
      name: "Untappd check-in CSV",
    });
    await expect(uploadCard).toHaveCSS(
      "background-color",
      colorScheme === "dark" ? "rgb(23, 37, 51)" : "rgb(255, 255, 255)",
    );
    const uploadButton = uploadCard.getByRole("button", { name: "Upload CSV" });
    await expect(uploadButton).toBeDisabled();
    await expect(uploadButton).toHaveCSS("min-height", "44px");
    const refreshButton = page.getByRole("button", { name: "Refresh" });
    await expect(refreshButton).toHaveCSS(
      "background-color",
      colorScheme === "dark" ? "rgb(51, 65, 85)" : "rgb(232, 238, 248)",
    );
    await expect(refreshButton).toHaveCSS(
      "color",
      colorScheme === "dark" ? "rgb(241, 245, 249)" : "rgb(23, 32, 51)",
    );
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

    const statusVariants =
      colorScheme === "light"
        ? [
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
          ]
        : [
            {
              label: "completed",
              surface: "rgb(23, 55, 42)",
              text: "rgb(187, 247, 208)",
              border: "rgb(85, 189, 141)",
            },
            {
              label: "failed",
              surface: "rgb(66, 44, 50)",
              text: "rgb(254, 202, 202)",
              border: "rgb(252, 165, 165)",
            },
            {
              label: "processing",
              surface: "rgb(37, 55, 71)",
              text: "rgb(147, 197, 253)",
              border: "rgb(147, 197, 253)",
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

test("shared Button variants keep token colors across migrated theme contexts", async ({
  page,
}) => {
  await stubApplication(page);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/imports");
    await expect(page.getByRole("heading", { name: "Imports" })).toBeVisible();
    await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
    await expect(page.locator(".app")).toHaveClass(/theme-aware/);
    await expect(page.locator(".app")).toHaveCSS("color-scheme", colorScheme);
    await installButtonCascadeFixture(page, ".history-card");

    const context = `Imports themed route with ${colorScheme} OS preference`;
    await expectLegacyButtonCompatibility(page, context);
    for (const variant of buttonVariants) {
      await expectButtonVariantStyles(page, context, variant);
    }
    await expectNoDocumentOverflow(page);
  }

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/explore/beers");
    const explorer = page.locator(".explorer-page");
    await expect(explorer).toBeVisible();
    await expect(explorer).toHaveCSS(
      "color-scheme",
      colorScheme === "dark" ? "dark" : "light",
    );
    await installButtonCascadeFixture(page, ".explorer-catalogue");

    const context = `Explorer theme-aware route with ${colorScheme} preference`;
    await expectLegacyButtonCompatibility(page, context);
    for (const variant of buttonVariants) {
      await expectButtonVariantStyles(page, context, variant);
    }
    await expectNoDocumentOverflow(page);
  }
});

test("Analytics and Drinking Trends use semantic themes without affecting the shell", async ({
  page,
}) => {
  await stubApplication(page);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/analytics");
    await expect(page.getByText("Check-in Breakdown")).toBeVisible();
    await expect(page.locator(".app")).toHaveClass(/theme-aware/);
    await expect(page.locator(".app")).toHaveCSS("color-scheme", colorScheme);
    await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
    await expect(page.locator(".analytics-chart-panel").first()).toHaveCSS(
      "background-color",
      colorScheme === "dark" ? "rgb(23, 37, 51)" : "rgb(255, 255, 255)",
    );
    const appHeader = page.locator(".app-header");
    await expect(appHeader).toHaveCSS(
      "background-color",
      colorScheme === "dark" ? "rgb(29, 44, 58)" : "rgb(255, 255, 255)",
    );
    await expect(appHeader).toHaveCSS(
      "color",
      colorScheme === "dark" ? "rgb(241, 245, 249)" : "rgb(23, 32, 51)",
    );
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
    await expect(page.locator(".app")).toHaveCSS("color-scheme", colorScheme);
    await expect(page.locator(".drinking-trends-view")).toHaveCSS(
      "background-color",
      colorScheme === "dark" ? "rgb(23, 37, 51)" : "rgb(255, 255, 255)",
    );
    const selectedTrendsTab = page.getByRole("tab", {
      name: "Drinking Trends",
    });
    await expect(selectedTrendsTab).toHaveAttribute("aria-selected", "true");
    await expect(selectedTrendsTab).toHaveCSS(
      "border-bottom-color",
      colorScheme === "dark" ? "rgb(85, 189, 141)" : "rgb(23, 107, 77)",
    );

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

test("Dashboard and shell themes stay readable and responsive", async ({
  page,
}) => {
  await stubApplication(page, checkins, drinkingTrends, { dashboard: true });

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Your beer journey" }),
      ).toBeVisible();
      await expectNoDocumentOverflow(page);

      const dashboardSurface = page.locator(".app");
      await expect(dashboardSurface).toHaveClass(/theme-aware/);
      await expect(dashboardSurface).toHaveCSS(
        "background-color",
        colorScheme === "dark" ? "rgb(16, 25, 35)" : "rgb(245, 247, 251)",
      );
      await expectReadable(
        page.getByRole("heading", { name: "Your beer journey" }),
        `${colorScheme} Dashboard heading at ${width}px`,
      );
      await expectReadable(
        page.locator(".dashboard-primary h2").first(),
        `${colorScheme} Dashboard metric label at ${width}px`,
      );
      await expectReadable(
        page.locator(".featured-milestone h3"),
        `${colorScheme} featured milestone at ${width}px`,
      );
      await expect(page.locator(".dashboard-milestone-status")).toHaveText(
        "In progress",
      );
      await expectReadable(
        page.locator(".dashboard-milestone-status"),
        `${colorScheme} milestone status at ${width}px`,
      );
      await expectReadable(
        page.locator(".dashboard-insight p"),
        `${colorScheme} insight description at ${width}px`,
      );
      const chartBox = await page.locator(".dashboard-chart").boundingBox();
      expect(chartBox).not.toBeNull();
      expect(chartBox!.width).toBeGreaterThan(150);
      expect(chartBox!.height).toBeGreaterThanOrEqual(208);
      const chartAxis = page
        .locator(".dashboard-chart .recharts-cartesian-axis-tick-value")
        .first();
      await expect(chartAxis).toBeVisible();
      await expect(chartAxis).toHaveCSS(
        "fill",
        colorScheme === "dark" ? "rgb(193, 204, 216)" : "rgb(82, 97, 118)",
      );
      await expect(
        page.locator(".dashboard-chart .recharts-cartesian-grid line").first(),
      ).toHaveCSS(
        "stroke",
        colorScheme === "dark" ? "rgb(60, 75, 73)" : "rgb(220, 229, 226)",
      );
      await expect(page.locator(".dashboard-metric-card").first()).toHaveCSS(
        "background-color",
        colorScheme === "dark" ? "rgb(23, 37, 51)" : "rgb(255, 255, 255)",
      );
      await expect(page.locator(".featured-milestone")).toHaveCSS(
        "background-color",
        colorScheme === "dark" ? "rgb(23, 55, 42)" : "rgb(232, 246, 237)",
      );

      const header = page.locator(".app-header");
      await expect(header).toHaveCSS(
        "background-color",
        colorScheme === "dark" ? "rgb(29, 44, 58)" : "rgb(255, 255, 255)",
      );
      const selectedDashboardLink = page.locator(
        '.app-header nav a[aria-current="page"]',
      );
      await expect(selectedDashboardLink).toHaveText("Dashboard");
      await expect(selectedDashboardLink).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(selectedDashboardLink).toHaveCSS(
        "background-color",
        colorScheme === "dark" ? "rgb(37, 55, 71)" : "rgb(238, 242, 247)",
      );

      if (width <= 960) {
        const brand = page.locator(".app-header .brand");
        const menuButton = page.getByRole("button", { name: "Main menu" });
        const [brandBox, toggleBox] = await Promise.all([
          brand.boundingBox(),
          menuButton.boundingBox(),
        ]);
        expect(brandBox).not.toBeNull();
        expect(toggleBox).not.toBeNull();
        expect(
          Math.abs(
            brandBox!.y +
              brandBox!.height / 2 -
              (toggleBox!.y + toggleBox!.height / 2),
          ),
        ).toBeLessThan(2);
        await menuButton.focus();
        await expect(menuButton).toHaveCSS("outline-style", "solid");
        await page.keyboard.press("Enter");
        await expect(menuButton).toHaveAttribute("aria-expanded", "true");
        await expect(
          page.getByRole("navigation", { name: "Main navigation" }),
        ).toBeVisible();
        const accessibleSelectedLink = page
          .getByRole("navigation", { name: "Main navigation" })
          .getByRole("link", { name: "Dashboard" });
        await expect(accessibleSelectedLink).toHaveAttribute(
          "aria-current",
          "page",
        );
        await page.keyboard.press("Tab");
        await expect(selectedDashboardLink).toBeFocused();
        await expect(selectedDashboardLink).toHaveCSS("outline-width", "3px");
        await expect(selectedDashboardLink).toHaveCSS(
          "outline-color",
          colorScheme === "dark" ? "rgb(251, 191, 36)" : "rgb(128, 85, 0)",
        );
        await expect(selectedDashboardLink).toHaveCSS("min-height", "44px");
        await expectNoDocumentOverflow(page);
        await page.keyboard.press("Escape");
        await expect(menuButton).toHaveAttribute("aria-expanded", "false");
      } else {
        await expect(page.getByRole("link", { name: "Imports" })).toBeVisible();
      }

      await page.goto("/analytics");
      await expect(page.getByText("Check-in Breakdown")).toBeVisible();
      await expectNoDocumentOverflow(page);
      await expect(page.locator(".app")).toHaveClass(/theme-aware/);
      await expect(page.locator(".app")).toHaveCSS("color-scheme", colorScheme);
      const legacyMain = page.locator(".app-main");
      await expect(legacyMain).not.toHaveClass(/theme-aware/);
      await expect(legacyMain).toHaveCSS("color-scheme", colorScheme);
      await expect(page.locator(".analytics-chart-panel").first()).toHaveCSS(
        "background-color",
        colorScheme === "dark" ? "rgb(23, 37, 51)" : "rgb(255, 255, 255)",
      );
      await expectReadable(
        page.locator(".analytics-chart-panel h3").first(),
        `${colorScheme} Analytics semantic surface at ${width}px`,
      );
    }
  }
});

test("login surface uses semantic themes, associated labels, and readable errors", async ({
  page,
}) => {
  await stubApplication(page, checkins, drinkingTrends, { anonymous: true });

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Sign in" }),
      ).toBeVisible();
      await expectNoDocumentOverflow(page);

      const loginPage = page.locator(".login-page");
      await expect(loginPage).toHaveClass(/theme-aware/);
      await expect(loginPage).toHaveCSS(
        "background-color",
        colorScheme === "dark" ? "rgb(16, 25, 35)" : "rgb(245, 247, 251)",
      );
      await expect(page.locator(".login-card")).toHaveCSS(
        "background-color",
        colorScheme === "dark" ? "rgb(23, 37, 51)" : "rgb(255, 255, 255)",
      );
      const username = page.getByLabel("Username");
      const password = page.getByLabel("Password");
      await expect(username).toHaveAttribute("id", "login-username");
      await expect(password).toHaveAttribute("id", "login-password");
      await expect(username).toHaveAttribute("name", "username");
      await expect(username).toHaveAttribute("autocomplete", "username");
      await expect(password).toHaveAttribute("name", "password");
      await expect(password).toHaveAttribute(
        "autocomplete",
        "current-password",
      );
      await expect(username).toHaveCSS("min-height", "44px");
      await expect(page.getByRole("button", { name: "Sign in" })).toHaveCSS(
        "min-height",
        "44px",
      );
      await expectReadable(
        page.getByRole("heading", { name: "Sign in" }),
        `${colorScheme} login heading at ${width}px`,
      );
      await expectReadable(
        page.locator(".login-description"),
        `${colorScheme} login description at ${width}px`,
      );
      await username.focus();
      await expect(username).toHaveCSS("outline-style", "solid");
      await expect(username).toHaveCSS(
        "outline-color",
        colorScheme === "dark" ? "rgb(251, 191, 36)" : "rgb(128, 85, 0)",
      );
      await username.fill("styling-test");
      await password.fill("not-a-real-password");
      await page.getByRole("button", { name: "Sign in" }).click();
      const error = page.getByRole("alert");
      await expect(error).toContainText(
        "The username or password is incorrect.",
      );
      await expectReadable(error, `${colorScheme} login error at ${width}px`);
      await expectNoDocumentOverflow(page);
    }
  }
});

test("Analytics charts keep controls, labels, and legends usable across viewports", async ({
  page,
}) => {
  await stubApplication(
    page,
    analyticsResponsiveCheckins,
    analyticsResponsiveTrends,
  );

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto(
      "/analytics?period=custom&start=2026-01-01&end=2026-12-31&granularity=month",
    );
    await expect(page.getByText("Check-in Breakdown")).toBeVisible();
    await expect(page.locator(".app")).toHaveClass(/theme-aware/);
    await expect(page.locator(".app")).toHaveCSS("color-scheme", colorScheme);
    await expect(page.locator("html")).toHaveCSS("color-scheme", "light");

    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({
        width,
        height: width === 1280 ? 800 : 844,
      });
      const overview = page.locator("#analytics-overview-panel");
      const breakdown = overview
        .locator(".analytics-chart-panel")
        .filter({ hasText: "Check-in Breakdown" });
      const trend = overview
        .locator(".analytics-chart-panel")
        .filter({ hasText: "Check-in Trends" });
      await expect
        .poll(async () =>
          breakdown
            .locator(".recharts-wrapper")
            .evaluate((element) => element.getBoundingClientRect().width),
        )
        .toBeLessThanOrEqual(width);
      await expectNoDocumentOverflow(page);
      await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
      await expect(breakdown).toHaveCSS(
        "background-color",
        colorScheme === "dark" ? "rgb(23, 37, 51)" : "rgb(255, 255, 255)",
      );
      await expect(breakdown.locator(".recharts-legend-wrapper")).toBeVisible();
      await expect(
        breakdown.locator(".recharts-legend-item-text").nth(0),
      ).toContainText("New discoveries");
      await expect(
        breakdown.locator(".recharts-legend-item-text").nth(1),
      ).toContainText("Repeat check-ins");
      for (const legend of await breakdown
        .locator(".recharts-legend-item-text")
        .all()) {
        await expectReadable(
          legend,
          `${colorScheme} chart legend at ${width}px`,
        );
      }
      const axisStyle = await breakdown
        .locator(".recharts-cartesian-axis-tick-value")
        .first()
        .evaluate((element) => ({
          fill: getComputedStyle(element).fill,
          background: getComputedStyle(
            element.closest(".analytics-chart-panel")!,
          ).backgroundColor,
        }));
      expect(axisStyle.fill).toBe(
        colorScheme === "dark" ? "rgb(193, 204, 216)" : "rgb(82, 97, 118)",
      );
      expect(
        contrastRatio(axisStyle.fill, axisStyle.background),
      ).toBeGreaterThanOrEqual(4.5);
      await expect(trend.locator(".recharts-legend-wrapper")).toBeVisible();
      const overviewChartBox = await trend
        .locator(".chart-canvas.analytics-overview-chart")
        .boundingBox();
      expect(overviewChartBox?.height).toBeGreaterThanOrEqual(288);
      for (const description of await overview
        .locator(".panel-explanation")
        .all()) {
        await expectReadable(
          description,
          `${colorScheme} Analytics description at ${width}px`,
        );
      }

      const controlBox = await trend.locator(".chart-controls").boundingBox();
      const titleBox = await trend.getByRole("heading").boundingBox();
      expect(controlBox).not.toBeNull();
      expect(titleBox).not.toBeNull();
      expect(controlBox!.y).toBeGreaterThanOrEqual(
        titleBox!.y + titleBox!.height,
      );
      for (const checkboxLabel of await trend
        .locator(".chart-controls label")
        .all()) {
        const box = await checkboxLabel.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }

      await page.getByRole("tab", { name: "Drinking Trends" }).click();
      const hourly = page
        .locator(".distribution-chart")
        .filter({ hasText: "Check-ins by Hour of Day" });
      await expect(hourly).toBeVisible();
      await expect(hourly).toHaveCSS(
        "background-color",
        colorScheme === "dark" ? "rgb(23, 37, 51)" : "rgb(255, 255, 255)",
      );
      const plotBox = await hourly
        .locator(".distribution-canvas")
        .boundingBox();
      expect(plotBox?.width).toBeGreaterThan(0);
      expect(plotBox?.height).toBeGreaterThanOrEqual(260);
      await expectReadable(
        hourly.getByRole("heading", { name: "Check-ins by Hour of Day" }),
        `${colorScheme} hourly chart title at ${width}px`,
      );
      await expectReadable(
        page.locator("#weekday-hour-instructions"),
        `${colorScheme} heatmap explanation at ${width}px`,
      );
      await expect(page.locator(".calendar-scroll")).toHaveCSS(
        "overflow-x",
        "auto",
      );
      await expect(page.locator(".weekday-hour-scroll")).toHaveCSS(
        "overflow-x",
        "auto",
      );
      const calendarZero = page.locator(
        '.calendar-day[data-calendar-date="2026-01-01"]',
      );
      await expect(calendarZero).toHaveAttribute("aria-label", /0 check-ins/);
      await expect(calendarZero).toHaveCSS(
        "background-color",
        colorScheme === "dark" ? "rgb(37, 55, 71)" : "rgb(238, 242, 247)",
      );
      await expect(page.locator(".calendar-legend")).toContainText(
        "Outside period",
      );
      const firstHourlyCell = page.locator(".weekday-hour-cell").first();
      await expect(firstHourlyCell).toHaveAttribute("data-heat-level", "1");
      await expect(firstHourlyCell).toHaveAttribute(
        "aria-label",
        /Monday, 00:00/,
      );
      await expect(firstHourlyCell).toHaveCSS(
        "background-color",
        colorScheme === "dark" ? "rgb(33, 77, 57)" : "rgb(213, 239, 224)",
      );
      const heatmapCell = await page
        .locator(".weekday-hour-cell")
        .first()
        .boundingBox();
      expect(heatmapCell?.width).toBeGreaterThanOrEqual(44);
      expect(heatmapCell?.height).toBeGreaterThanOrEqual(44);
      await hourly.locator("svg.recharts-surface").focus();
      const keyboardTooltip = page
        .locator("body > .recharts-tooltip-wrapper:visible .analytics-tooltip")
        .filter({ hasText: /\d{2}:00/ });
      await expect(keyboardTooltip).toBeVisible();
      await expect(keyboardTooltip).toContainText(/\d{2}:00/);
      await expect(keyboardTooltip).toContainText("Total:");

      if (width <= 390) {
        const tickRects = await hourly
          .locator(".recharts-xAxis .recharts-cartesian-axis-tick-value")
          .evaluateAll((nodes) =>
            nodes
              .map((node) => {
                const rect = node.getBoundingClientRect();
                return { left: rect.left, right: rect.right };
              })
              .sort((a, b) => a.left - b.left),
          );
        for (let index = 1; index < tickRects.length; index += 1) {
          expect(tickRects[index - 1].right).toBeLessThanOrEqual(
            tickRects[index].left + 1,
          );
        }
      }
      await expectNoDocumentOverflow(page);
      await page.getByRole("tab", { name: "Overview" }).click();
    }
  }
});

test("touch taps pin Analytics and Drinking Trends tooltips without breaking hover or scroll", async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Playwright touchscreen input is supported only by Chromium; Firefox and WebKit remain covered by mouse and keyboard chart tests",
  );
  for (const colorScheme of ["light", "dark"] as const) {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:5173",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      colorScheme,
    });
    const page = await context.newPage();
    try {
      await stubApplication(
        page,
        analyticsResponsiveCheckins,
        analyticsResponsiveTrends,
      );
      await page.goto(
        "/analytics?period=custom&start=2026-01-01&end=2026-12-31&granularity=month",
      );
      const tooltip = page.locator(
        "body > .recharts-tooltip-wrapper:visible .analytics-tooltip",
      );
      const tap = async (locator: Locator) => {
        await expect(locator).toBeVisible();
        await locator.evaluate((element) =>
          element.closest(".recharts-responsive-container")?.scrollIntoView({
            block: "center",
          }),
        );
        await expect
          .poll(async () => {
            const box = await locator.boundingBox();
            return !!box && box.width > 0 && box.height > 0;
          })
          .toBe(true);
        const box = await locator.boundingBox();
        expect(box, "chart point has a touch target").not.toBeNull();
        await page.touchscreen.tap(
          box!.x + box!.width / 2,
          box!.y + box!.height / 2,
        );
      };
      const tapOutsideChart = async (chart: Locator) => {
        const box = await chart.boundingBox();
        const viewport = page.viewportSize();
        expect(box).not.toBeNull();
        expect(viewport).not.toBeNull();
        const candidates = [
          [2, 2],
          [2, viewport!.height - 2],
          [viewport!.width - 2, 2],
          [viewport!.width - 2, viewport!.height - 2],
          [viewport!.width / 2, 2],
          [viewport!.width / 2, viewport!.height - 2],
        ];
        const point = candidates.find(
          ([x, y]) =>
            x < box!.x ||
            x > box!.x + box!.width ||
            y < box!.y ||
            y > box!.y + box!.height,
        );
        expect(
          point,
          "a viewport point outside the chart is available",
        ).toBeDefined();
        await page.touchscreen.tap(point![0], point![1]);
      };

      await page.goto("/");
      const dashboardChart = page.locator(".dashboard-chart");
      const dashboardBar = dashboardChart
        .locator(".recharts-bar-rectangle")
        .first();
      await expect(dashboardBar).toBeVisible();
      await tap(dashboardBar);
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("discoveries");
      await expect(tooltip).toHaveCSS(
        "background-color",
        colorScheme === "dark" ? "rgb(11, 18, 26)" : "rgb(23, 32, 51)",
      );
      await tapOutsideChart(dashboardChart);
      await expect(tooltip).toBeHidden();

      await page.goto(
        "/analytics?period=custom&start=2026-01-01&end=2026-12-31&granularity=month",
      );

      const breakdown = page
        .locator(".analytics-chart-panel")
        .filter({ hasText: "Check-in Breakdown" });
      const breakdownBars = breakdown.locator(".recharts-bar-rectangle");
      await expect(breakdownBars.first()).toBeVisible();
      await tap(breakdownBars.nth(0));
      await page.waitForTimeout(1200);
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("Jan 2026");
      await expect(page).not.toHaveURL(/zoom=/);
      await page.mouse.move(8, 8);
      await page.waitForTimeout(100);
      await expect(tooltip).toContainText("Jan 2026");
      await expect(tooltip).toHaveCSS(
        "background-color",
        colorScheme === "dark" ? "rgb(11, 18, 26)" : "rgb(23, 32, 51)",
      );
      const firstPointText = await tooltip.textContent();
      await tap(breakdownBars.nth(4));
      await expect.poll(() => tooltip.textContent()).not.toBe(firstPointText);

      await tapOutsideChart(breakdown.locator(".chart-canvas"));
      await expect(tooltip).toBeHidden();
      await tap(breakdownBars.nth(0));
      await expect(tooltip).toContainText("Jan 2026");
      await page
        .locator(".analytics-filters")
        .getByLabel("Reporting period")
        .selectOption("last_30");
      await expect(tooltip).toBeHidden();

      await page.getByRole("tab", { name: "Drinking Trends" }).click();
      const hourly = page
        .locator(".distribution-chart")
        .filter({ hasText: "Check-ins by Hour of Day" });
      const hourlyBars = hourly.locator(".recharts-bar-rectangle");
      await expect(hourlyBars.first()).toBeVisible();
      await tap(hourlyBars.nth(0));
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("00:00");
      await tap(hourlyBars.nth(2));
      await expect(tooltip).toContainText("02:00");
      await tapOutsideChart(hourly.locator(".distribution-canvas"));
      await expect(tooltip).toBeHidden();
      await tap(hourlyBars.nth(0));
      await expect(tooltip).toContainText("00:00");
      await page
        .locator(".analytics-filters")
        .getByLabel("Reporting period")
        .selectOption("last_90");
      await expect(tooltip).toBeHidden();

      await expect(hourly.locator(".distribution-canvas")).toHaveCSS(
        "touch-action",
        "auto",
      );

      await page.setViewportSize({ width: 1280, height: 800 });
      const hoverBar = page
        .locator(".distribution-chart")
        .filter({ hasText: "Check-ins by Hour of Day" })
        .locator(".recharts-bar-rectangle")
        .first();
      await expect(hoverBar).toBeVisible();
      await hoverBar.scrollIntoViewIfNeeded();
      const hoverBox = await hoverBar.boundingBox();
      expect(hoverBox).not.toBeNull();
      await page.mouse.move(
        hoverBox!.x + hoverBox!.width / 2,
        hoverBox!.y + hoverBox!.height / 2,
      );
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("00:00");
      await page.mouse.move(5, 5);
      await expect(tooltip).toBeHidden();
    } finally {
      await context.close();
    }
  }
});

test("Analytics touch swipe and cancellation leave later chart clicks intact", async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Touch swipe injection uses Chromium CDP",
  );

  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();

  try {
    await stubApplication(
      page,
      analyticsResponsiveCheckins,
      analyticsResponsiveTrends,
    );
    await page.goto(
      "/analytics?period=custom&start=2026-01-01&end=2026-12-31&granularity=month",
    );
    const chart = page
      .locator(".analytics-chart-panel")
      .filter({ hasText: "Check-in Breakdown" });
    const bars = chart.locator(".recharts-bar-rectangle");
    const tooltip = page.locator(
      "body > .recharts-tooltip-wrapper:visible .analytics-tooltip",
    );
    await expect(bars.first()).toBeVisible();
    await chart.scrollIntoViewIfNeeded();
    const box = await bars.first().boundingBox();
    expect(box).not.toBeNull();
    const point = {
      x: box!.x + box!.width / 2,
      y: box!.y + box!.height / 2,
    };
    const cdp = await context.newCDPSession(page);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, ...point }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x: point.x, y: point.y - 160 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(scrollBefore);
    await expect(tooltip).toBeHidden();
    await expect(page).not.toHaveURL(/zoom=/);

    await bars.first().scrollIntoViewIfNeeded();
    const afterSwipeBox = await bars.first().boundingBox();
    expect(afterSwipeBox).not.toBeNull();
    const afterSwipePoint = {
      x: afterSwipeBox!.x + afterSwipeBox!.width / 2,
      y: afterSwipeBox!.y + afterSwipeBox!.height / 2,
    };
    await page.touchscreen.tap(afterSwipePoint.x, afterSwipePoint.y);
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Jan 2026");
    await expect(page).not.toHaveURL(/zoom=/);
    await page.touchscreen.tap(2, 2);
    await expect(tooltip).toBeHidden();

    await bars.first().scrollIntoViewIfNeeded();
    const swipeClickBox = await bars.first().boundingBox();
    expect(swipeClickBox).not.toBeNull();
    const swipeClickPoint = {
      x: swipeClickBox!.x + swipeClickBox!.width / 2,
      y: swipeClickBox!.y + swipeClickBox!.height / 2,
    };
    const secondSwipeScrollBefore = await page.evaluate(() => window.scrollY);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, ...swipeClickPoint }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { id: 1, x: swipeClickPoint.x, y: swipeClickPoint.y - 160 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(secondSwipeScrollBefore);
    await bars.first().click();
    await expect(page).toHaveURL(/zoom=month/);

    await page.reload();
    await expect(bars.first()).toBeVisible();
    await bars.first().scrollIntoViewIfNeeded();
    const cancelBox = await bars.first().boundingBox();
    expect(cancelBox).not.toBeNull();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          id: 1,
          x: cancelBox!.x + cancelBox!.width / 2,
          y: cancelBox!.y + cancelBox!.height / 2,
        },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect(tooltip).toBeHidden();
    await expect(page).not.toHaveURL(/zoom=/);

    await bars.first().scrollIntoViewIfNeeded();
    const clickBox = await bars.first().boundingBox();
    expect(clickBox).not.toBeNull();
    await page.mouse.click(
      clickBox!.x + clickBox!.width / 2,
      clickBox!.y + clickBox!.height / 2,
    );
    await expect(page).toHaveURL(/zoom=month/);
  } finally {
    await context.close();
  }
});

test("Analytics mouse and keyboard drilldown remain available", async ({
  page,
}) => {
  await stubApplication(
    page,
    analyticsResponsiveCheckins,
    analyticsResponsiveTrends,
  );
  await page.goto(
    "/analytics?period=custom&start=2026-01-01&end=2026-12-31&granularity=month",
  );

  const chart = page
    .locator(".analytics-chart-panel")
    .filter({ hasText: "Check-in Breakdown" });
  const firstBar = chart.locator(".recharts-bar-rectangle").first();
  await expect(firstBar).toBeVisible();
  await chart.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => {
      const box = await firstBar.boundingBox();
      return !!box && box.width > 0 && box.height > 0;
    })
    .toBe(true);
  await firstBar.hover();
  await expect(
    page.locator("body > .recharts-tooltip-wrapper:visible .analytics-tooltip"),
  ).toContainText("Jan 2026");
  await firstBar.click();
  await expect(page).toHaveURL(/zoom=month/);

  await page.goto(
    "/analytics?period=custom&start=2026-01-01&end=2026-12-31&granularity=month",
  );
  const openBucket = chart
    .locator(".bucket-actions")
    .getByRole("button", { name: "Jan 2026" })
    .first();
  await expect(openBucket).toBeVisible();
  await openBucket.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/zoom=month/);
});

test("Analytics tooltips stay readable and inside the viewport at chart edges", async ({
  page,
}) => {
  await stubApplication(
    page,
    analyticsResponsiveCheckins,
    analyticsResponsiveTrends,
  );

  const inspectEdgeBar = async (
    bar: Locator,
    expectedText: string,
    viewport: { width: number; height: number },
    context: string,
    colorScheme: "light" | "dark",
    edge?: "top" | "bottom",
  ) => {
    let barBox = await bar.boundingBox();
    await expect
      .poll(async () => {
        barBox = await bar.boundingBox();
        return !!barBox && barBox.width > 0 && barBox.height > 0;
      })
      .toBe(true);
    expect(barBox).not.toBeNull();
    if (edge) {
      const targetY = edge === "top" ? 18 : viewport.height - 18;
      await page.evaluate(
        ({ currentY, targetY }) => window.scrollBy(0, currentY - targetY),
        { currentY: barBox!.y + barBox!.height / 2, targetY },
      );
      await expect
        .poll(async () => {
          barBox = await bar.boundingBox();
          return !!barBox && barBox.width > 0 && barBox.height > 0;
        })
        .toBe(true);
      expect(barBox).not.toBeNull();
    }
    const pointer = {
      x: barBox!.x + barBox!.width / 2,
      y: barBox!.y + barBox!.height / 2,
    };
    await page.mouse.move(pointer.x, pointer.y);
    const tooltip = page
      .locator("body > .recharts-tooltip-wrapper:visible .analytics-tooltip")
      .filter({ hasText: expectedText });
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(expectedText);
    const geometry = await tooltip.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        contentWidth: element.clientWidth,
        contentHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        background: getComputedStyle(element).backgroundColor,
        foreground: getComputedStyle(element).color,
        border: getComputedStyle(element).borderTopColor,
        tooltipToken: getComputedStyle(element)
          .getPropertyValue("--color-chart-tooltip-surface")
          .trim(),
        bodyTooltipToken: getComputedStyle(document.body)
          .getPropertyValue("--color-chart-tooltip-surface")
          .trim(),
        colorScheme: getComputedStyle(element).colorScheme,
        hasThemeBoundary: element.classList.contains("theme-aware"),
        bodyHasThemeBoundary: document.body.classList.contains("theme-aware"),
        wrapperPosition: getComputedStyle(element.parentElement!).position,
        wrapperZIndex: getComputedStyle(element.parentElement!).zIndex,
        portalTarget: element.parentElement?.parentElement === document.body,
        insideClippedCard: element.closest(".distribution-chart") !== null,
      };
    });
    expect(geometry.left, context).toBeGreaterThanOrEqual(0);
    expect(geometry.top, context).toBeGreaterThanOrEqual(0);
    expect(geometry.right, context).toBeLessThanOrEqual(viewport.width + 1);
    expect(geometry.bottom, context).toBeLessThanOrEqual(viewport.height + 1);
    expect(geometry.width, context).toBeLessThanOrEqual(viewport.width - 15);
    expect(geometry.contentWidth, context).toBeGreaterThan(0);
    expect(geometry.scrollWidth, context).toBeLessThanOrEqual(
      geometry.contentWidth + 1,
    );
    expect(geometry.scrollHeight, context).toBeLessThanOrEqual(
      geometry.contentHeight + 1,
    );
    expect(geometry.background, context).toBe(
      colorScheme === "dark" ? "rgb(11, 18, 26)" : "rgb(23, 32, 51)",
    );
    expect(geometry.foreground, context).toBe(
      colorScheme === "dark" ? "rgb(241, 245, 249)" : "rgb(255, 255, 255)",
    );
    expect(geometry.border, context).toBe(
      colorScheme === "dark" ? "rgb(113, 128, 150)" : "rgb(100, 116, 139)",
    );
    expect(geometry.tooltipToken, context).toBe(
      colorScheme === "dark" ? "#0b121a" : "#172033",
    );
    expect(geometry.bodyTooltipToken, context).toBe("#172033");
    expect(geometry.colorScheme, context).toBe(colorScheme);
    expect(geometry.hasThemeBoundary, context).toBe(true);
    expect(geometry.bodyHasThemeBoundary, context).toBe(false);
    expect(geometry.wrapperPosition, context).toBe("fixed");
    expect(Number(geometry.wrapperZIndex), context).toBeGreaterThanOrEqual(30);
    expect(geometry.portalTarget, context).toBe(true);
    expect(geometry.insideClippedCard, context).toBe(false);
    expect(
      pointer.x < geometry.left ||
        pointer.x > geometry.right ||
        pointer.y < geometry.top ||
        pointer.y > geometry.bottom,
      `${context} tooltip should leave the pointer visible`,
    ).toBe(true);
    await expectReadable(tooltip, context);
    await expectNoDocumentOverflow(page);
  };

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto(
      "/analytics?period=custom&start=2026-01-01&end=2026-12-31&granularity=month",
    );
    for (const width of [320, 390, 768, 1280]) {
      const viewport = { width, height: width === 1280 ? 800 : 844 };
      await page.setViewportSize(viewport);
      const breakdown = page
        .locator(".analytics-chart-panel")
        .filter({ hasText: "Check-in Breakdown" });
      await expect
        .poll(async () =>
          breakdown
            .locator(".recharts-wrapper")
            .evaluate((element) => element.getBoundingClientRect().width),
        )
        .toBeLessThanOrEqual(width);
      const bars = breakdown.locator(".recharts-bar-rectangle");
      await expect(bars).toHaveCount(24);
      await breakdown.scrollIntoViewIfNeeded();
      await inspectEdgeBar(
        bars.first(),
        "Jan 2026",
        viewport,
        `${colorScheme} ${width}px first breakdown bucket`,
        colorScheme,
      );
      await inspectEdgeBar(
        bars.last(),
        "Dec 2026",
        viewport,
        `${colorScheme} ${width}px last breakdown bucket`,
        colorScheme,
      );

      await page.getByRole("tab", { name: "Drinking Trends" }).click();
      const hourly = page
        .locator(".distribution-chart")
        .filter({ hasText: "Check-ins by Hour of Day" });
      const hourlyBars = hourly.locator(".recharts-bar-rectangle");
      await expect(hourlyBars).toHaveCount(24);
      await hourly.scrollIntoViewIfNeeded();
      await inspectEdgeBar(
        hourlyBars.first(),
        "00:00",
        viewport,
        `${colorScheme} ${width}px first hourly bucket`,
        colorScheme,
      );
      await inspectEdgeBar(
        hourlyBars.last(),
        "23:00",
        viewport,
        `${colorScheme} ${width}px last hourly bucket`,
        colorScheme,
      );
      if (width === 320 && colorScheme === "light") {
        const shortViewport = { width, height: 360 };
        await page.setViewportSize(shortViewport);
        await hourly.scrollIntoViewIfNeeded();
        await inspectEdgeBar(
          hourlyBars.first(),
          "00:00",
          shortViewport,
          "320px tooltip near the viewport bottom",
          colorScheme,
          "bottom",
        );
        await inspectEdgeBar(
          hourlyBars.last(),
          "23:00",
          shortViewport,
          "320px tooltip near the viewport top",
          colorScheme,
          "top",
        );
        await page.setViewportSize(viewport);
      }
      await page.getByRole("tab", { name: "Overview" }).click();
    }
  }
});

test("Analytics touch tooltips remain positioned at 320px", async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Playwright touchscreen input is supported only by Chromium",
  );
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();

  try {
    await stubApplication(
      page,
      analyticsResponsiveCheckins,
      analyticsResponsiveTrends,
    );
    await page.goto(
      "/analytics?period=custom&start=2026-01-01&end=2026-12-31&granularity=month",
    );

    const breakdown = page
      .locator(".analytics-chart-panel")
      .filter({ hasText: "Check-in Breakdown" });
    await expect(breakdown.locator(".recharts-bar-rectangle")).toHaveCount(24);
    await breakdown.scrollIntoViewIfNeeded();
    const firstBar = breakdown.locator(".recharts-bar-rectangle").first();
    let barBox = await firstBar.boundingBox();
    await expect
      .poll(async () => {
        barBox = await firstBar.boundingBox();
        return !!barBox && barBox.width > 0 && barBox.height > 0;
      })
      .toBe(true);
    expect(barBox).not.toBeNull();

    await page.touchscreen.tap(
      barBox!.x + barBox!.width / 2,
      barBox!.y + barBox!.height / 2,
    );
    const tooltip = page
      .locator("body > .recharts-tooltip-wrapper:visible .analytics-tooltip")
      .filter({ hasText: "Jan 2026" });
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("New discoveries:");

    const tooltipBox = await tooltip.boundingBox();
    expect(tooltipBox).not.toBeNull();
    expect(tooltipBox!.x).toBeGreaterThanOrEqual(0);
    expect(tooltipBox!.y).toBeGreaterThanOrEqual(0);
    expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(321);
    expect(tooltipBox!.y + tooltipBox!.height).toBeLessThanOrEqual(845);
    await expectNoDocumentOverflow(page);
  } finally {
    await context.close();
  }
});

test("month drilldown controls wrap and remain keyboard reachable at 320px", async ({
  page,
}) => {
  await stubApplication(page, analyticsResponsiveCheckins);
  await page.goto(
    "/analytics?period=custom&start=2026-01-01&end=2026-12-31&granularity=month",
  );

  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({
      width,
      height: width === 1280 ? 800 : 844,
    });
    const breakdown = page
      .locator(".analytics-chart-panel")
      .filter({ hasText: "Check-in Breakdown" });
    const buttons = breakdown.locator(".bucket-actions .ui-button");
    await expect(buttons).toHaveCount(12);
    const parent = await breakdown.locator(".bucket-actions").boundingBox();
    expect(parent).not.toBeNull();
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(parent!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(
        parent!.x + parent!.width + 1,
      );
      expect(box!.height).toBeGreaterThanOrEqual(44);
      const textSize = await button.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
      expect(textSize.scrollWidth).toBeLessThanOrEqual(
        textSize.clientWidth + 1,
      );
      expect(textSize.scrollHeight).toBeLessThanOrEqual(
        textSize.clientHeight + 1,
      );
    }
    await expectNoDocumentOverflow(page);
  }

  await page.setViewportSize({ width: 320, height: 844 });
  const breakdown = page
    .locator(".analytics-chart-panel")
    .filter({ hasText: "Check-in Breakdown" });
  const june = breakdown.getByRole("button", { name: "Open Jun 2026" });
  await june.focus();
  await expect(june).toBeFocused();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("zoom"))
    .toBe("month:2026-06");
  const currentMonth = page.locator(
    ".analytics-breadcrumb [aria-current='page']",
  );
  await expect(currentMonth).toHaveText("June");
  await currentMonth.scrollIntoViewIfNeeded();
  const monthBox = await currentMonth.boundingBox();
  expect(monthBox?.y).toBeGreaterThanOrEqual(0);
  expect(monthBox!.y + monthBox!.height).toBeLessThanOrEqual(844);
  await expectNoDocumentOverflow(page);
});

test("Inventory detail dialog is named, modal, focus managed, and scrollable", async ({
  page,
}) => {
  await stubApplication(page);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 768, 1280]) {
      const height = width === 1280 ? 800 : 844;
      await page.setViewportSize({ width, height });
      await page.goto("/inventory");
      await expect(page.locator(".app")).toHaveClass(/theme-aware/);
      await expect(page.locator(".app")).toHaveCSS("color-scheme", colorScheme);
      await expect(page.locator(".inventory-page h2")).toHaveText("Inventory");

      const trigger =
        width <= 700
          ? page.locator(".inventory-cards .ui-button").first()
          : page.locator(".inventory-table tbody .ui-button").first();
      await expect(trigger).toBeVisible();
      await trigger.click();

      const dialog = page.getByRole("dialog", { name: longBeerName });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveCSS("overflow-y", "auto");
      await expectReadable(
        dialog.getByRole("heading", { name: longBeerName }),
        `${colorScheme} Inventory dialog title`,
      );
      await expectReadable(
        dialog.locator(".detail-list dt").first(),
        `${colorScheme} Inventory dialog field label`,
      );
      await expectReadable(
        dialog.locator(".detail-list dd").first(),
        `${colorScheme} Inventory dialog field value`,
      );
      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();
      expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
      expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
      expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(width + 1);
      expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(height + 1);

      const close = dialog.getByRole("button", { name: "Close" });
      await expect(close).toBeVisible();
      await expect(close).toHaveCSS("min-height", "44px");
      await expectReadable(close, `${colorScheme} Inventory dialog close`);
      await expect
        .poll(() =>
          dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        )
        .toBe(true);

      const backgroundControl =
        width <= 960
          ? page.getByRole("button", { name: "Main menu" })
          : page.getByRole("link", { name: "Dashboard" });
      await expect(backgroundControl).toBeVisible();
      await close.focus();
      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        )
        .toBe(true);
      await page.keyboard.press("Shift+Tab");
      await expect
        .poll(() =>
          dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        )
        .toBe(true);
      await close.focus();
      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        )
        .toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await expectNoDocumentOverflow(page);
    }

    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/inventory");
    const landscapeTrigger = page
      .locator(".inventory-table tbody .ui-button")
      .first();
    await landscapeTrigger.click();
    const landscapeDialog = page.getByRole("dialog", { name: longBeerName });
    await expect(landscapeDialog).toHaveCSS("overflow-y", "auto");
    const landscapeBox = await landscapeDialog.boundingBox();
    expect(landscapeBox).not.toBeNull();
    expect(landscapeBox!.x).toBeGreaterThanOrEqual(0);
    expect(landscapeBox!.y).toBeGreaterThanOrEqual(0);
    expect(landscapeBox!.x + landscapeBox!.width).toBeLessThanOrEqual(845);
    expect(landscapeBox!.y + landscapeBox!.height).toBeLessThanOrEqual(391);
    await expect(
      landscapeDialog.getByRole("button", { name: "Close" }),
    ).toBeVisible();
    await expectNoDocumentOverflow(page);
    await page.keyboard.press("Escape");
  }
});

test("Locations preserve hierarchy and wrap long names at every viewport", async ({
  page,
}) => {
  await stubApplication(page);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
      await page.goto("/locations");
      await expect(
        page.getByRole("heading", { name: "Storage locations" }),
      ).toBeVisible();
      await expect(page.locator(".app")).toHaveClass(/theme-aware/);
      await expectNoDocumentOverflow(page);

      const rootLocation = page.locator(
        ".location-tree[data-depth='0'] > li > .location-node > .location-select",
      );
      await expect(rootLocation.locator("strong")).toHaveText(longLocationName);
      await expectReadable(
        rootLocation.locator("strong"),
        `${colorScheme} long location name at ${width}px`,
      );
      const rootBox = await rootLocation.boundingBox();
      expect(rootBox).not.toBeNull();
      expect(rootBox!.height).toBeGreaterThanOrEqual(44);
      expect(rootBox!.x + rootBox!.width).toBeLessThanOrEqual(width + 1);
      await expect(
        page.locator(
          ".location-tree[data-depth='5'] > li > .location-node > .location-select strong",
        ),
      ).toBeVisible();

      const maximumIndent = await page
        .locator(".location-tree[data-depth='5']")
        .evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).paddingInlineStart),
        );
      expect(maximumIndent).toBe(0);

      await rootLocation.click();
      await expect(
        page.getByRole("heading", { name: longLocationName }),
      ).toBeVisible();
      await expectReadable(
        page.locator(".location-detail-panel .muted").first(),
        `${colorScheme} location path at ${width}px`,
      );
      await expect(
        page.getByRole("link", { name: "View inventory" }).last(),
      ).toBeVisible();
      await expectNoDocumentOverflow(page);
    }
  }
});

test("Imports keep long filenames, results, and history local to their surfaces", async ({
  page,
}) => {
  await stubApplication(page);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
      await page.goto("/imports");
      await expect(page.locator(".app")).toHaveClass(/theme-aware/);
      await expectNoDocumentOverflow(page);

      const checkinCard = page.getByRole("region", {
        name: "Untappd check-in CSV",
      });
      const checkinInput = checkinCard.getByLabel("Choose CSV file");
      await checkinInput.setInputFiles({
        name: longImportFilename,
        mimeType: "text/csv",
        buffer: Buffer.from("beer_name,brewery_name\nTest Ale,Test Brewery\n"),
      });
      await expect(checkinCard).toContainText(longImportFilename);
      await expectReadable(
        checkinCard.locator(".selected-file"),
        `${colorScheme} selected import filename at ${width}px`,
      );
      await checkinCard.getByRole("button", { name: "Upload CSV" }).click();
      await expect(checkinCard.getByRole("status")).toContainText(
        "Import complete",
      );

      const stashCard = page.getByRole("region", {
        name: "Untappd stash CSV",
      });
      await stashCard.getByLabel("Choose CSV file").setInputFiles({
        name: "stash-export.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("beer_name\nTest Ale\n"),
      });
      await stashCard
        .getByLabel(
          "I understand this replaces the complete Untappd stash snapshot.",
        )
        .check();
      await stashCard.getByRole("button", { name: "Upload CSV" }).click();
      const rejectedResult = stashCard.locator(".import-result.failed");
      await expect(rejectedResult).toHaveAttribute("role", "alert");
      await expect(rejectedResult).toBeVisible();
      await expect(rejectedResult.locator("p")).toHaveText(longImportError);
      await expectReadable(
        rejectedResult.locator("p"),
        `${colorScheme} import validation message at ${width}px`,
      );

      const history = page.getByRole("region", {
        name: "Import history table",
      });
      await expect(history).toHaveAttribute("tabindex", "0");
      for (const status of ["completed", "failed", "processing"]) {
        const badge = page.locator(".history-card .ui-status-badge").filter({
          hasText: status,
        });
        await expect(badge).toBeVisible();
        await expectReadable(badge, `${colorScheme} ${status} import history`);
      }
      await expectNoDocumentOverflow(page);
    }
  }
});

test("Milestones keep semantic statuses, progress, forms, and long names readable", async ({
  page,
}) => {
  await stubApplication(page);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
      await page.goto("/milestones");
      await expect(page.locator(".app")).toHaveClass(/theme-aware/);
      await expect(
        page.getByRole("heading", { name: "Milestones" }),
      ).toBeVisible();
      await expectNoDocumentOverflow(page);

      const longName = page.locator(".milestone-card h2").filter({
        hasText: longMilestoneName,
      });
      await expect(longName).toBeVisible();
      await expectReadable(
        longName,
        `${colorScheme} milestone name at ${width}px`,
      );
      for (const status of [
        "In progress",
        "Scheduled",
        "Overdue",
        "Completed",
        "Period ended",
      ]) {
        const badge = page
          .locator(".milestone-status")
          .filter({ hasText: status });
        await expect(badge.first()).toBeVisible();
        await expectReadable(
          badge.first(),
          `${colorScheme} ${status} milestone status`,
        );
      }
      const progress = page.locator(".milestone-card progress").first();
      await expect(progress).toBeVisible();
      await expect(progress).toHaveCSS(
        "accent-color",
        colorScheme === "dark" ? "rgb(85, 189, 141)" : "rgb(23, 107, 77)",
      );
      for (const filter of await page
        .getByRole("group", { name: "Filter milestones" })
        .getByRole("button")
        .all()) {
        const box = await filter.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await expectNoDocumentOverflow(page);
    }

    await page
      .getByRole("group", { name: "Filter milestones" })
      .getByRole("button", { name: "Archived" })
      .click();
    await expect(page.locator(".milestone-status")).toHaveCount(1);
    const archivedBadge = page.locator(".milestone-status").first();
    await expect(archivedBadge).toHaveText("Archived");
    await expectReadable(
      archivedBadge,
      `${colorScheme} archived milestone status`,
    );

    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/milestones");
    const createButton = page
      .locator(".milestone-page-heading")
      .getByRole("button", { name: "Create milestone" });
    await createButton.click();
    const dialog = page.getByRole("dialog", { name: "Create milestone" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Name")).toBeFocused();
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.width).toBeLessThanOrEqual(320);
    expect(dialogBox!.height).toBeLessThanOrEqual(640);
    await expectNoDocumentOverflow(page);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(createButton).toBeFocused();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/milestones/4");
  await expect(page.locator(".app")).toHaveClass(/theme-aware/);
  await expect(
    page.getByRole("heading", { name: longMilestoneName }),
  ).toBeVisible();
  await expect(page.locator(".milestone-detail progress")).toBeVisible();
  await expectNoDocumentOverflow(page);
});

test("unfinished Explorer catalogues remain on the compatibility palette", async ({
  page,
}) => {
  await stubApplication(page);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
      await page.goto("/explore/breweries");
      await expect(
        page.getByRole("heading", { name: "Breweries catalogue coming later" }),
      ).toBeVisible();
      await expect(page.locator(".app")).not.toHaveClass(/theme-aware/);
      await expect(page.locator(".explorer-page")).not.toHaveClass(
        /theme-aware/,
      );
      await expect(page.locator(".app")).toHaveCSS("color-scheme", "light");
      await expect(page.locator(".explorer-upcoming")).toHaveCSS(
        "background-color",
        "rgb(238, 242, 247)",
      );
      await expectNoDocumentOverflow(page);
    }
  }
});
