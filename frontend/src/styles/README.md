# Frontend styling

- `tokens.css` is the single source for reusable semantic colors and surface
  depth. Name tokens by purpose, not by hue, and add one only when it expresses
  a meaning that can be reused.
- `components.css` holds shared React component styles. Use explicit component
  classes for shared primitives; `.app :where(button:not(.ui-button))` remains a
  transitional compatibility rule for unmigrated native buttons.
  Cross-route layout and text utilities (`.page-heading`, `.section-heading`,
  `.muted`, `.panel-explanation`, and `.button-link`) also live here.
- Modal backdrops share the semantic `--color-overlay` token.
- `../styles.css` is the legacy application stylesheet. Shared component rules
  need a component scope; route rules need a route scope. Analytics still owns
  its compatibility styles there until PR 7. Keep these selectors scoped under
  `.analytics-page` and migrate them with that route instead of moving the whole
  file at once. Table sizing and cell behavior belong to their owning route.
- Put route-specific styles beside their page component (for example,
  `pages/Inventory.css`) and import them from that page.
- Dashboard and login presentation rules live beside their page components in
  `pages/Dashboard.css` and `pages/Login.css`; use tokens there so complete
  surfaces inherit both palettes.
- The root palette and native controls stay light for compatibility. A page or
  complete surface opts into the shared automatic light/dark palette by adding
  `.theme-aware` to its root and using semantic tokens for both foregrounds and
  backgrounds. Dark tokens are applied only inside that boundary when the
  operating system requests dark mode. Do not opt in a component that still
  relies on un-themed light backgrounds.
- The shell header and authentication views own separate `.theme-aware`
  boundaries. `App.tsx` keeps an explicit allowlist for complete route surfaces:
  Dashboard, Inventory, Locations, Imports, Milestones (including detail
  pages), and the implemented Explorer beer catalogue. Analytics and wildcard
  or unfinished routes stay on the root light compatibility palette. Keep a
  route off the list until its full visible surface is migrated.
- Explorer's implemented beer catalogue inherits the route theme from the
  allowlisted `/explore/beers` route. The Breweries and Styles placeholders
  remain on the compatibility palette; do not add a broad `/explore/*` theme
  match while those child routes are unfinished.
- Existing routes may keep their scoped `prefers-color-scheme` rules until
  migrated together. New shared primitives should use semantic tokens and
  inherit the nearest `.theme-aware` palette.
- Put reusable controls and surfaces in `components/ui/` when their behavior,
  accessibility wiring, and visual variants should stay consistent across
  routes. Keep one-off layout or presentation rules beside the route.
- Name component variants by purpose (for example `primary`, `muted`, or
  `success`), and keep their visual rules under component classes in
  `components.css`. Shared components should use semantic tokens for colors,
  borders, focus, and surfaces; add a token only when it has a reusable
  meaning.
- Use `className` for small route layout adjustments, not to replace a
  component variant or redefine its core appearance. Give focus-visible states
  a clear token-based indicator and give disabled controls an explicit
  readable style.
- Shared primitives inherit the nearest token context. They keep the root
  light palette on compatibility routes and use the automatic light/dark
  palette only inside `.theme-aware`. Migrate a complete route surface before
  opting it into dark colors.
- Avoid broad element selectors for shared visuals. Component CSS belongs to
  `.ui-*` classes; route CSS should be scoped to that route. The remaining
  `.app :where(button:not(.ui-button))` rule is transitional styling for
  unmigrated controls and deliberately excludes shared buttons.

Global stylesheets are imported from `main.tsx`, in token, shared component,
then legacy application order. Route stylesheets are imported beside their
page component and stay inside a route class. Keep the global order and avoid
importing styles back into `tokens.css` or `components.css`.
