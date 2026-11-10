# Frontend styling

## Ownership

- `tokens.css` owns semantic colors, focus indicators, chart series, heatmap
  levels, and shared surface shadows. Add tokens only for meanings reused
  across components; chart-series and ordered heatmap colors stay distinct from
  status colors.
- `components.css` owns shared UI primitives, cross-route text/layout helpers,
  shared Recharts presentation, and tooltip presentation.
- Route stylesheets sit beside their page and scope route presentation beneath
  the route root. Keep one-off layout and specialized table or heatmap rules
  with their owning route.
- `styles.css` owns the reset, app shell width and spacing, global focus outline,
  and the light compatibility placeholder surface.

Global styles load from `main.tsx` in token, shared component, then application
order. Route stylesheets load beside their page component.

## Themes

The document and native controls retain the light compatibility palette.
Complete migrated pages opt into the automatic OS light/dark palette with a
`.theme-aware` boundary. `App.tsx` keeps an explicit route allowlist for
Dashboard, Inventory, Locations, Imports, Milestones and detail pages,
Analytics (including Drinking Trends), and the implemented Explorer beer
catalogue. Unfinished Explorer placeholders and wildcard routes remain on the
compatibility palette. The shell header and login/authentication surfaces own
separate boundaries. No manual theme preference is stored.

Chart tooltips render under `body`, outside route boundaries. Their content
owns a `.theme-aware` boundary so tooltip tokens follow the OS preference
without theming the document. Shared Recharts axes, grids, and legends use
semantic chart tokens. A reusable chart interaction hook keeps touch-selected
tooltips visible until another point, an outside tap, or a chart-context
change; mouse hover and keyboard chart navigation remain available.

## Intentional compatibility styling

`.app :where(button:not(.ui-button))` and the corresponding login rule style
native buttons that have not migrated to the shared Button primitive. New
shared controls should use `ui-*` component classes. `.placeholder-panel` is a
light compatibility surface for unfinished and wildcard routes. These rules
remain intentionally scoped and are the remaining legacy presentation rules.

Native `<dialog>.showModal()` provides Inventory modality, focus containment,
Escape behavior, and background inertness in the supported Chromium, Firefox,
and WebKit baseline. The Inventory detail component restores focus to its
invoking control after close; there is no non-modal `open` fallback or custom
Tab trap. Browser coverage for native dialog behavior lives in the responsive
Playwright suite.
