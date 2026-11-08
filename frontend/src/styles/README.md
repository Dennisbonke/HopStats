# Frontend styling

- `tokens.css` is the single source for reusable semantic colors. Name tokens by
  purpose, not by hue, and add a token only when more than one style can use it.
- `components.css` holds shared React component styles. Keep shared button
  styling under `.app` and component variants under their classes, as with
  `.app-header` and `.secondary-button`.
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

Stylesheets are imported once from `main.tsx`, in token, shared component, then
legacy application order. Keep that order and avoid importing styles back into
`tokens.css` or `components.css`.
