# Locator Assignment Viewer — Help

A browser-based tool for reviewing and manually adjusting store locator/item
assignments across periods, exported from the SLAP optimization model.

## Getting started

Open `index.html`. Click the folder icon in the toolbar and select one or
more exported run JSON or Excel (`.xlsx` / `.xlsm`) files. Each file becomes its own **Run** tab; that
run's **Store** tabs appear once it's selected. The × on a run tab removes
it from the list in this session — it doesn't touch the file on disk.

## Excel import

Excel workbooks can be opened directly; no JSON conversion step is required. The loader reads the required sheets `items`, `stores`, `storelocator`, `periods`, `itemsPlan`, `ItemsAffinity`, and `assigment`, then builds the same internal run structure used by JSON imports. `items` supplies the complete item catalog and visual colors, while `assigment` supplies store/period/locator/part assignments. Period values found in both the `periods` sheet and assignment rows are merged, so a baseline `0` present in assignments is preserved.

The `stores` sheet may specify `itemsPerLocator` independently per store.

## Viewing the floor plan

Every period for the current store renders side by side, scrollable
horizontally. Period cards keep a stable fixed UI width, while the floor-plan SVG
fit scale is recalculated from the current store's own width and height whenever
the store changes or the viewport is resized. Each locator is a rounded rectangle split into one or more
numbered parts (how many, and whether the split is horizontal or vertical,
comes from the source data). Hover any part for its full item details; in Edit
mode, tooltip display can be disabled from Settings.

- **All periods zoom** — the `−` / `%` / `+` / `Fit` controls in the store info
  bar apply one zoom level to every period in the current store.
- **Per-period zoom** — the same controls in each period header adjust only that
  period. Individual period values may differ; the all-period control shows
  `Mixed` when they do.
- **Zoom behavior** — Settings lets you choose **Horizontal only** (locator
  length changes while locator height stays fixed; label size follows zoom without distortion) or
  **Both directions** (the previous behavior, scaling width and height together).
- **Label size** — the A− / % / A+ controls in the store info bar change label size for every period in the current store. Each store remembers its own label size independently.
- **Label content** — Settings lets you show design + color, design only,
  or color only on each part.
- **Search / item filter** — type in the search box, or click a part or a
  legend entry, to isolate one or more items. The store and locator layout
  stay fully visible; only matching parts keep their color, everything else
  fades to empty.
- **"Changed only" filter** (triangle icon) — hides every part except those
  whose item differs from the immediately previous period.
- **"Changes view"** (layers icon) — recolors every occupied part by its
  period-over-period status instead of its real item color:
  - light blue = same item as the previous period
  - light red = different item (including newly assigned)
  - still empty = left as the normal empty style, uncolored

  Period 0 (Baseline) has no earlier period to compare against, so it
  always shows real item colors regardless of this toggle. Recoloring
  updates live as you make edits.

## Editing

Click **Edit mode** to start editing. Only one session (browser tab) can
hold editing rights for a given run at a time — see *Multi-session safety*
below. Once in edit mode:

| Action | Effect |
|---|---|
| Click a part | Filters by that item (same as view mode) |
| Right-click a part | Opens the item picker to change its assignment |
| Drag one part onto another | Swaps their assignments (works across periods too) |
| X icon on an occupied part | Clears that assignment |
| Delete/Backspace while hovering | Clears the hovered assignment |

Edited parts show a light diagonal stripe overlay (toggle in Settings) so
they stay identifiable without hovering.

- **Undo / Redo** (Ctrl+Z / Ctrl+Y) — a swap undoes and redoes as a single
  atomic step, not two separate ones.
- **Discard edits** — reverts the run back to its original, unedited data.
- **Export edited JSON** (Ctrl+S) — downloads the run with your edits
  merged in. Assignment-row fields are written back using the original SQL
  export naming (`LocatorNameCode`, `LocatorPart`, `ItemCode`, `ItemDesc`,
  `ItemDesign`, `ItemColor`, `BackColor`, `FontColor`, `AssignedCapSqm`), so
  the file matches what your pipeline expects; locator geometry stays in
  the tool's own camelCase form, unchanged. Includes `{ runId, sessionId,
  baseVersion, exportedAt }` metadata, and — if enabled in Settings — a
  human-readable log of every change made this session.

## Stability & period comparison

Preserving an item's locator across periods is a core objective of the
underlying model; reassigning it counts as a negative. The store info bar
shows a **Stability** score: the share of locator/part pairs that keep the
same item from one period to the next, always shown alongside a fixed
**baseline** score computed from the original, unedited data, so you can
see whether your edits are helping or hurting.

- An amber warning badge marks any part whose item changed from the
  previous period (toggle in Settings).
- The compare icon in each period's header (not shown on the first period,
  since there's nothing before it) opens a **Period difference** view: two
  small floor-plan thumbnails plus counts of newly assigned, released,
  relocated, and unchanged locators between that period and the one before
  it.
- The small "i" badge on each locator (bottom-left corner) opens its
  **Locator Detail** panel — position, size, every period's part-by-item
  assignment, and a compact change-history chain per part (e.g.
  `Part 2: B1 → D1 → D1`).

## Side panels

Three panels — **Items in view** (the active filter's legend), **Recent
changes** (this session's edit log), and **Information** (load
notices/warnings/errors, plus any change log bundled in a loaded file) —
toggle from the toolbar or the P / H / I shortcuts. They stack in a single
column that only appears once at least one panel is open. Each panel's
header has ▲/▼ buttons to reorder the stack (this order is remembered
across sessions) and a trash icon to clear that panel's own contents.

## Settings

The gear icon opens:

- Locator part label content (design/color/both)
- Whether to show diagonal stripes on edited parts
- Whether to show locator-part tooltips while editing
- Zoom behavior: horizontal-only (locator length changes while height stays fixed; label size follows zoom without distortion) or both directions
- Whether to show change-status warning badges
- Whether exporting edited JSON includes the session's change log
- Mouse-wheel behavior: normal vertical scrolling, or scroll-to-move
  between periods
- Export/import of your saved settings as a file (for backup, or moving to
  another machine/browser)

The reset icon next to it resets all-period / per-period zoom, label size, and
the active filter for the current run only — it does not touch your edits.

## Multi-session safety

Each browser tab gets its own session. Only one session can hold editing
rights for a given run at a time: opening a run someone else is editing
puts you in read-only mode, with an option to take over (which switches
the other session to read-only). Edits, settings, undo history, and the
change log are all kept separately per session, so tabs never silently
overwrite each other's work. If a run has leftover edits from an earlier
session (e.g. a tab that was closed without exporting), you'll be asked
whether to resume those edits, discard them, or leave them alone and just
view read-only.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `E` | Toggle edit mode |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo (edit mode) |
| `Ctrl+S` | Export edited JSON (edit mode) |
| `Delete` / `Backspace` | Clear the hovered part (edit mode) |
| `/` | Focus the search box |
| `+` / `-` / `0` | Zoom all periods in / out / fit |
| `P` / `H` / `I` | Toggle Items / Recent changes / Information panel |
| `,` | Open Settings |
| `?` | Open this Help |
| `Esc` | Close any open modal |

## Project structure

```
locator-viewer/
├── index.html        markup + <link>/<script> tags only
├── style.css          the full stylesheet
├── HELP.md            this document
├── js/
│   ├── state.js        data model, persistence, multi-tab lock system, import/export
│   ├── excel-loader.js  local XLSX reader + workbook-to-run conversion
│   ├── drag.js          part interaction: click/right-click/drag/clear
│   ├── modal.js         item picker, settings, period diff, locator detail, help
│   ├── render.js        everything that builds DOM/SVG from state
│   └── app.js           bootstrap: buttons, inputs, shortcuts, starts render()
└── data/
    └── sample.json      a small demo run (load it via "Load run JSON…")
```

Classic `<script src="...">` tags share one global scope — not ES modules —
so the app keeps working when `index.html` is opened directly as a local
file. Load order in `index.html` matters: `state.js` first, `app.js` last.
