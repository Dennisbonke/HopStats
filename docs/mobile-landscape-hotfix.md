# Mobile landscape layout hotfix

This application-wide hotfix follows M10.3 and does not implement M10.4.

## Root cause and theme

Before the fix, `:root` used the light canvas tokens while dark overrides lived
only on `.theme-aware` components. Header and page could therefore be dark while
the surrounding document stayed light. The viewport also lacked
`viewport-fit=cover`, allowing Safari to constrain the layout to its safe area.
These verified code paths explain the reported theme mismatch and are consistent
with the physical gutters; emulation cannot establish the exact physical Safari
rendering. Browser chrome itself remains browser controlled.

The viewport now requests edge-to-edge coverage and preserves ordinary zoom.
The existing `prefers-color-scheme` token system now includes the document root.
HTML, body, root and application canvas use the same theme background. System
appearance changes update them together and direct reloads use that preference.
There is no stored app theme selector to initialize or migrate.

## Safe-area ownership

`--safe-top/right/bottom/left` wrap `env(safe-area-inset-*, 0px)`. They also provide
a CSS-only test seam for asymmetric simulated insets. No device-specific margins
or JavaScript safe-area measurement is used.

Header background spans the viewport; header content owns top and lateral
insets. Main content owns lateral and bottom insets. These are sibling boundaries,
not nested padding. Existing 80rem desktop reading widths remain. Login and
session loading own their viewport padding. Overlays own their own insets rather
than inheriting main padding. The filter sheet has separate safe header, scrolling
body and footer regions. Milestone and Inventory dialogs remain internally
scrollable; milestone form actions can be reached by scrolling the complete form.
Chart tooltip placement uses the same safe boundaries. Explorer's existing
visualViewport keyboard fitting remains the sole JS sheet-height calculation.

## Responsive strategy and route audit

Compact mode is `(max-width: 960px) and (orientation: landscape) and
(max-height: 500px)`. The width ceiling retains the normal desktop treatment;
1024×600 and taller tablets keep normal spacing. Width-only portrait rules remain.
The header uses a 44px menu target with compact padding, and the successful
backend status moves to an accessible header indicator. Loading and failure
badges remain in main content. Expanded navigation scrolls within dynamic viewport
height, with a `vh` fallback.

Explorer uses the card/filter-sheet model at <=700px OR in compact mode. Its CSS
and matchMedia expression agree; crossing into a desktop layout closes the sheet,
restores focus and releases its existing body lock. Portrait/landscape transitions
that remain mobile preserve the open sheet and draft. Search, sorting, Search and
Filters share a wrapping row in compact mode. Tabs retain 44px targets. Redundant
Explorer introductions and catalogue subheadings are omitted only in compact
mode. Active chips and every filter group remain available.

Shared page heading spacing and main top padding are reduced. Dashboard and
Milestones overview omit their introductory copy, retain statistics and actions,
and reduce grid gaps. At 700–960px in compact mode, primary Dashboard statistics
and Milestone counts share a single row; Dashboard cards use less padding while
retaining their text sizes and intrinsic content height. Narrower windows retain
two columns. Milestone detail instructions remain visible. Beer detail
retains back navigation, stats, history pagination/focus, photos, long comments
and scroll restoration. Its chart is 200px high in compact mode; chart selection
and coincident timestamp bucketing are unchanged. Dashboard and Analytics chart
canvases are capped at 14rem in compact mode.

Inventory (including its native detail dialog), Locations, Imports, Analytics
Overview/Drinking Trends, milestone detail/creation, login and session states were
inspected. Their existing wrapping grids, contained table/chart scrolling and
forms remain in use. Shared shell padding benefits all routes. Inventory dialog
and login get lateral safe padding. Upcoming Explorer sections remain upcoming.

## Automated acceptance and artifacts

The new Playwright suite covers 568×240, 667×260, 740×320, 844×280, 844×390,
932×430 and 1024×600 in both themes on Chromium, Firefox and WebKit. Existing
portrait/tablet/desktop and M10.3 coverage remains. Geometry checks verify:

- Canvas width and theme agreement across document/body/root/app, no page overflow.
- Compact header <=60px (44px target plus padding/border), main padding <=12px.
- Explorer's first result begins before 240px at 844×280, and toolbar buttons
  remain fully visible with >=43px measured height (44px allowing rounding).
- Scrolling navigation exposes Sign out; sheet Close and Apply remain in view.
- Asymmetric 44/12 and 12/44 safe values apply once to Explorer's content bounds.
- Theme changes, direct reload, open-sheet rotation, applied URL state, returning
  to portrait/desktop, dialog scrolling/rotation, and release of body locks.
- Rating tooltip containment after chart resize and selection.

The CI responsive job runs the complete Playwright suite exactly once across
Chromium, Firefox and WebKit, using one Vite server. A single
`responsive-playwright-artifacts` upload retains all generated screenshots,
traces and test results, including on failure. Standalone targeted invocations
remain available for development but are not repeated in ordinary CI.

Ordinary screenshots cover catalogue, beer profile/chart, Dashboard, Analytics,
Milestones, Inventory, Locations, Imports, menu, filter sheet, form, simulated
safe areas and portrait/desktop layouts. Temporary baseline extraction and
before/after comparison code have been removed; the previously reviewed
comparison artifacts remain linked in PR #78. No functional or geometry tests
were removed. Browser emulation and synthetic CSS insets are not physical iPhone
acceptance. All six normal CI jobs remain required. The suite collects 486
responsive cases (60 landscape cases), alongside 196 frontend unit tests
and 190 backend tests. The reduction of three cases removes only the screenshot
comparison test's instance in each browser.

On this production Pi, browser/Docker checks are deferred to CI per AGENTS.md.
The initial full local frontend run was stopped after worker-concurrency timeouts;
targeted App/Explorer/detail tests pass with one worker (67 tests). Local backend
lint/format pass; targeted pytest was stopped after making no progress through
the first test in the restricted session. Complete backend/frontend tests and
Docker validation run in CI. Final run counts/results and artifact links belong
in the PR after CI completes.

## Physical iPhone Safari checklist (pending)

- [ ] Rotate portrait → landscape in both directions → portrait without reload.
- [ ] Repeat in dark and light appearance; change appearance in landscape and
      reload directly into landscape. Check document gutters/overscroll colors.
- [ ] Open/scroll/close navigation, including Sign out reachability and focus.
- [ ] Navigate Dashboard, Milestones, Explorer, Inventory; inspect Analytics,
      Locations and Imports. Useful content should appear sooner in landscape.
- [ ] Search, sort and filter beers; inspect counts/chips and URL state.
- [ ] Open sheet, scroll through every filter group, edit, Apply/Cancel; rotate
      with the sheet open and with the native keyboard showing. No stuck lock.
- [ ] Open beer detail; use rating tooltips including coincident timestamps,
      inspect stats, photos and long comments, paginate history and check focus.
- [ ] Return to catalogue and check scroll restoration and filters/sort.
- [ ] Create/edit a milestone and open Inventory detail; reach close/actions,
      check focus trapping/restoration, rotate with dialogs open.
- [ ] Repeat with Safari chrome expanded/collapsed; notch, rounded corners and
      home indicator must stay clear of meaningful controls in both directions.
- [ ] Recheck accepted portrait layouts and normal tablet/desktop layouts.

Physical desktop acceptance of M10.3 remains pending separately. Do not merge,
deploy or begin M10.4 before independent review and acceptance.
