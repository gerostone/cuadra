# Cuadra UI redesign: "Vereda" layout with "Cartel" colors

Date: 2026-09-29
Status: draft for review
Mockups: `.superpowers/brainstorm/*/content/directions.html` and `vereda-cartel.html` (local, not committed)

## 1. Intent

**Who:** people actively looking for a place to rent or buy, walking a neighborhood they're considering.

**What they need:** while walking, one-handed and often in bright sun, they should notice a nearby listing without staring at the phone, judge it in a glance (price, size, how far), and save it or get directions. At home or on a desktop, they should be able to scan and compare what they saw.

**Direction chosen:** the layout and ergonomics of the "Vereda" mockup (all controls at the bottom within thumb reach, big targets, the proximity alert as the main element) with the colors and type of the "Cartel" mockup (blue *Vende*, yellow *Alquila*, red "you are here", Barlow Condensed for prices).

**Success criteria**
- Every control is reachable and tappable at 375 px width: nothing hidden off-screen, every target at least 44×44 px.
- A proximity alert is readable at arm's length: price at least 28 px, text contrast at least WCAG AA.
- From the map, opening a listing and starting directions takes at most 2 taps.
- Listing detail shows no empty "—" placeholders and no ALL-CAPS paragraphs.
- The same screens work at 375, 768 and 1280 px, in light and dark mode, and with reduced motion.

**What stays the same:** data loading (`/data/listings.json` with demo fallback), the demo listing generator, geolocation and its fallback, the walk simulation, favorites and "seen" in localStorage, the 500 m radius and the 45 m alert distance, and the illustrated facade when there's no photo. This is a presentation-layer rewrite, not a data change.

## 2. Visual system

**Color tokens** (kept from today, one addition):

| Token | Light | Dark | Use |
|---|---|---|---|
| `--venta` | `#1d4fd8` | `#1d4fd8` (white text on `#5b8bff` would fail AA) | Sale pins, tags, alerts |
| `--venta-text` (new) | `#1d4fd8` | `#5b8bff` | Blue text and focus rings on surfaces |
| `--alquiler` | `#e2a400` | `#f2bc2c` | Rent pins, tags, alerts |
| `--alquiler-ink` | `#2a1f00` | same | Text on yellow |
| `--me` | `#e0342b` | same | "You are here", trail |
| `--ink` | `#1b2124` | `#1b2124` | Dock background (dark in both themes) |
| `--ink-2` (new) | `#262e31` | `#262e31` | Cards and controls inside the dock |
| `--surface` / `--fg` / `--muted` / `--line` | as today | as today | Detail sheet, top pill, map controls |

Text on blue is white, and text on yellow is `--alquiler-ink`. Both combinations must pass AA at their sizes; I'll check them during implementation.

**Type:** Barlow Condensed 800 for prices, counts and sign labels. Figtree for everything else. Price sizes: 30 px in the alert, 24 px in list cards, 34 px in the detail view.

**Shape:** 24 px radius on the dock and detail sheet, 16 px on cards and floating buttons, 12–14 px on controls inside the dock. The map is desaturated as today so the pins stand out.

## 3. Mobile layout (< 900 px)

Four layers over a full-screen map, top to bottom:

### 3.1 Top pill
Left-aligned, 44 px tall: the logo mark, "CUADRA", and the location status ("en vivo" with a green dot, "modo paseo · 1,2 km", or "Palermo · ubicación aproximada"). It stays short enough never to truncate at 375 px. It's hidden while a proximity alert is showing, since the alert takes the same slot.

### 3.2 Proximity alert
It slides in at the top when you pass within 45 m of a listing (same trigger as today). The background is the listing's sign color. Content: "Estás pasando · a 30 m", the price (large), and "address · amb · operation". It has a 44 px "Ver" button, and the whole alert is tappable. It hides itself after 8 s, and swiping it up dismisses it. It's announced through `aria-live="polite"` and vibrates as today.

The same slot, in the dark ink color, also carries informational messages: location fallback, walk-mode hints, and "caminando hacia ese punto…". These replace today's toast.

### 3.3 Map controls
Two 48 px buttons on the right, just above the dock: center on me, and simulate a walk (pressed state when active). They move up with the dock.

### 3.4 Dock (dark bottom panel)
Always in the dark ink color. It has three states:

- **Peek (default):** header ("12 cerca tuyo · a 5 cuadras", plus a "Filtros" button with a badge showing how many are active), the nearest listing as a card with a 44 px "Ver" button, and the Todo / Venta / Alquiler segmented control (44 px tall).
- **Expanded:** you drag the handle up or tap the header. It grows to about 85% of the height with a scrollable list of up to 24 listings, sorted by distance. Each card has the photo or facade, sign tag, price, "amb · m² · distance", and a heart if it's saved.
- **Hidden:** while the detail or filters sheet is open.

Dragging uses pointer events with snap points. With reduced motion it switches states without animating. Tapping a card or its pin opens the detail. When a pin is selected, the map scrolls the matching card into view.

**Empty state:** "No hay propiedades con esos filtros a 5 cuadras", plus a "Limpiar filtros" button if any are on. If there's no data for the area at all, it keeps today's "todavía no tenemos avisos en esta zona" message. **Loading:** "Buscando tu ubicación…" with a skeleton card.

### 3.5 Filters sheet
Opens from "Filtros". It holds Ambientes as a segmented control (Todos, 1, 2, 3, 4+), and Guardadas, Acepta mascotas and Apto crédito as 44 px toggles. The footer has "Limpiar" and a primary button, "Ver N propiedades", with a live count. The badge counts active secondary filters (ambientes ≠ Todos, guardadas, mascotas, crédito). Sale/rent stays in the dock and isn't counted.

### 3.6 Listing detail sheet
It rises over the map, leaving the top ~150 px visible, and the map pans so the selected pin sits in that strip.

- **Hero:** photo, or the illustrated facade; drag handle; *Vende*/*Alquila* sign overlapping the bottom edge.
- **Price** (34 px), then "expensas + publicado hace N días", then the address with floor, then "type in zone · N m, N min caminando".
- **Facts:** only the ones present (amb, m² cub., m² tot., baños, antigüedad), as small tiles. If none are present, the row is omitted.
- **Features** as chips (including mascotas, crédito, baños).
- **Description:** if it's mostly uppercase (more than 60% of letters), it's converted to sentence case. It's clamped to 4 lines with "Leer más".
- **Agency and contact,** plus "También la publica…", as today.
- **Sticky action bar:** save (50 px heart), "Ver aviso" (only if there's a URL), and "Cómo llegar" (primary, walking directions in Google Maps).

Closing: drag down, the close button, Escape, or tapping the visible map strip. It behaves as a dialog: focus moves into it, Tab stays inside, and focus returns to the card or pin that opened it.

## 4. Desktop layout (≥ 900 px)

- **Left panel** (380 px, full height, dark ink): the top pill content, the Todo / Venta / Alquiler control, filters shown inline (no filters sheet), and the scrollable list.
- The **detail** replaces the list inside the panel, with a "← Volver" button. The map stays fully visible, and the selected pin is centered in the map area.
- The **proximity alert** appears at the top center of the map area, max 420 px wide.
- The **map controls** move to the bottom right of the map.

Tablet (768 px) uses the mobile layout. The dock is centered with a max width of 560 px.

## 5. Dark mode

The map tiles are inverted and dimmed as today, and the dock stays dark ink. The detail sheet and top pill use the dark `--surface`. Pins, tags and alerts keep their sign colors. It follows `prefers-color-scheme`, and `data-theme` still overrides it.

## 6. Accessibility

- 44 px minimum targets; visible focus rings (2 px, offset) on everything interactive.
- The detail and filter sheets are modal dialogs with a focus trap, Escape to close, and focus restored on close.
- The dock toggle is a button with `aria-expanded`. Segmented controls keep `aria-pressed`.
- The proximity alert uses `aria-live="polite"`. Pins keep their keyboard access and descriptive titles.
- `prefers-reduced-motion`: no slide or pulse animations; state changes are instant.

## 7. Code structure

`public/index.html` is 640 lines today and would roughly double. I'll split it, still with no build step:

- `public/index.html`: markup only.
- `public/app.css`: tokens, layout, components.
- `public/app.js`: an ES module with the map, state, rendering, sheets, dock drag and geolocation (moved from the inline script, behavior unchanged).
- `public/ui.mjs`: pure helpers with no DOM or Leaflet: price and distance formatting, `activeFilterCount(state)`, `passes(listing, state)`, `normalizeCaps(text)`, `presentFacts(listing)`. `app.js` imports them, and Node tests can too.

Netlify serves `public/` as today, so deployment doesn't change.

## 8. Testing

- **Unit** (`test/ui.test.mjs`, run by `npm test`): formatting, the filter count, filter matching, the all-caps normalization threshold and output, and `presentFacts` dropping missing values.
- **In the browser** (checked in the preview at each step): 375 and 1280 px, plus 768 px, in light and dark mode, with reduced motion. Scenarios: the first load falls back to Palermo; walk mode fires an alert for rent and one for sale; dock peek / expand / drag; filters with count and "Ver N"; empty state with "Limpiar filtros"; detail with a real crawled listing (missing facts, all-caps text) and with a demo listing; save persists after reload; Escape and focus return; keyboard-only pass.
- No console errors, and no horizontal page scroll at 375 px.

## 9. Out of scope

- Direction hints ("a tu derecha"); these need the compass permission. Possible follow-up.
- New data fields, crawler changes, a different map or tile provider.
- PWA, offline support, push notifications.
- Photo galleries (the detail still shows the first photo).
