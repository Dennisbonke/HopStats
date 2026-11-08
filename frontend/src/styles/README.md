# Frontend styling

- `tokens.css` is the single source for reusable semantic colors and surface
  depth. Name tokens by purpose, not by hue, and add one only when it expresses
  a meaning that can be reused.
- `components.css` holds shared React component styles. Use explicit component
  classes for shared primitives; `.app :where(button)` remains a transitional
  compatibility rule for unmigrated native buttons.
- `../styles.css` is the legacy application stylesheet. Keep its remaining
  element-level rules to resets and document-level defaults. Shared component
  rules need a component scope; route rules need a route scope. For example,
  table sizing and cell behavior are scoped to the Imports history, Inventory,
  Explorer, and weekday/hour tables instead of applying to every table.
  Migrate page rules as those pages are worked on instead of moving the whole
  file at once.
- Put route-specific styles beside their page component (for example,
  `pages/Inventory.css`) and import them from that page.
- The root palette and native controls stay light for compatibility. A page or
  complete surface opts into the shared automatic light/dark palette by adding
  `.theme-aware` to its root and using semantic tokens for both foregrounds and
  backgrounds. Dark tokens are applied only inside that boundary when the
  operating system requests dark mode. Do not opt in a component that still
  relies on un-themed light backgrounds.
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
  `.app :where(button)` rule is transitional styling for unmigrated controls.

Stylesheets are imported once from `main.tsx`, in token, shared component, then
legacy application order. Keep that order and avoid importing styles back into
`tokens.css` or `components.css`.
