# Cuadra UI Redesign (Vereda + Cartel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Cuadra's current UI with the approved "Vereda" layout (bottom dock, big targets, proximity alert as the main element) using the "Cartel" colors and type, on phone and desktop, in light and dark mode.

**Architecture:** Still a static site with no build step, served from `public/`. The 640-line `index.html` is split into markup (`index.html`), styles (`app.css`), the app module (`app.js`), pure presentation helpers (`ui.js`, unit-tested with `node --test`) and the demo listing generator plus facade illustrations (`demo.js`). The UI is rebuilt one piece at a time: alert, dock, filters sheet, detail sheet, desktop, then dark mode, accessibility and a verification pass. The data, location, walk and favorites logic stays as it is.

**Tech Stack:** Vanilla JS ES modules, Leaflet 1.9.4 (global `L` from unpkg), OpenStreetMap tiles, Google Fonts (Barlow Condensed, Figtree), Node 20+ `node:test` for unit tests, Netlify static hosting.

**Spec:** `docs/superpowers/specs/2026-09-29-vereda-cartel-redesign-design.md`

**Two deviations from the spec, both about file names:**
- The browser modules are `.js`, not `.mjs`. The local preview server (`python3 -m http.server`) may serve `.mjs` with the wrong MIME type. `package.json` has `"type": "module"`, so Node still treats `.js` files as ES modules in tests.
- The demo generator and facade drawing go in their own `demo.js` so that `app.js` stays focused.

## Global Constraints

- No build step and no npm runtime dependencies. Everything the browser loads lives under `public/` or comes from unpkg (Leaflet) and Google Fonts.
- UI copy is in Spanish (Argentina), matching the existing strings. Code comments are in Spanish, as in the existing code.
- Every interactive target is at least 44×44 px.
- Proximity alert price at least 28 px (the design uses 30 px). Text contrast at least WCAG AA.
- Colors: `--venta #1d4fd8` (white text), `--alquiler #e2a400` (text `#2a1f00`), `--me #e0342b`, `--ink #1b2124`, `--ink-2 #262e31`. Sign fills stay `#1d4fd8` in dark mode too; `--venta-text` is `#5b8bff` in dark mode, for blue text and focus rings on surfaces.
- Type: Barlow Condensed 800 for prices, counts and sign labels (30 px alert, 24 px list cards, 34 px detail); Figtree for everything else.
- Behavior that must not change: `/data/listings.json` loading with the demo fallback, the demo generator, geolocation and its Palermo fallback, the walk simulation, favorites (`cuadra.favs`) and seen (`cuadra.seen`) in localStorage, `RADIUS = 500` m, `NEAR = 45` m.
- Breakpoint: `min-width: 900px` means desktop. The mobile dock and sheets max out at 560 px wide, centered.
- `prefers-reduced-motion: reduce` disables every animation and transition.
- Commit messages in Spanish, in the repo's existing style, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Listings with missing fields** (797 crawled listings: 241 have no `amb`, 137 no `m2`, 611 no `banos`, 19 no `price`). Cards, the alert and the detail must never show `undefined`, `0 amb`, `0 m²` or `—`; they fall back to the type, "Consultar", or omit the item. *Pinned by the `listingSummary`, `priceAmount` and `presentFacts` tests in Task 1.*
2. **The "4+" ambientes filter with unknown `amb`.** Today `p.amb < 4` is `false` for `undefined`, so listings without `amb` wrongly pass "4+". They must be excluded. *Pinned by the `passes` test in Task 1.*
3. **Agency descriptions in ALL CAPS** with accents, leading punctuation and acronyms (`(A REFACCIONAR…) PH 3 AMBIENTES…`) become sentence case and keep `PH`. Mixed-case text and empty/`null` text pass through untouched. *Pinned by the `normalizeCaps` tests in Task 1.*
4. **HTML injection through crawled text** (address, agency, description, phone, photo URL) rendered with `innerHTML`. Every interpolated field goes through `esc()`. Listing IDs contain `/` and `.`, so selectors built from them use `CSS.escape`. *Pinned by the `esc` test in Task 1 and the selector code in Task 6; reviewers should grep new template strings for unescaped `${p.`.*
5. **Resizing or rotating across the 900 px breakpoint with a sheet open** must move the filters and detail between the mobile sheets and the desktop panel without a stuck scrim, a hidden dock or lost filters. *Pinned by the browser check in Task 7, Step 5.*

---

## File map

| File | Responsibility | Created in |
|---|---|---|
| `public/ui.js` | Pure helpers: formatting, filters, text cleanup, facts. No DOM, no Leaflet. | Task 1 |
| `test/ui.test.mjs` | Unit tests for `ui.js` | Task 1 |
| `public/demo.js` | Demo listing generator and `drawFacade` (canvas) | Task 2 |
| `test/demo.test.mjs` | Smoke test that the demo generator imports and is deterministic | Task 2 |
| `public/app.css` | All styles | Task 2, rewritten section by section in Tasks 3–8 |
| `public/app.js` | Map, state, rendering, alert, dock, dialogs, geolocation, walk mode | Task 2, extended in Tasks 3–7 |
| `public/index.html` | Markup only | Task 2, extended in Tasks 3–7 |
| `README.md` | Frontend file list | Task 8 |

**Local preview:** the worktree has no `.claude/launch.json` (`.claude` is gitignored). Before the first browser check, create `/Users/Gero/Documents/cuadra-redesign/.claude/launch.json`:

```json
{"version":"0.0.1","configurations":[{"name":"cuadra-redesign","runtimeExecutable":"sh","runtimeArgs":["-c","python3 -m http.server ${PORT:-5179} --directory public"],"port":5179,"autoPort":true}]}
```

Start it with the preview tool (`preview_start {name: "cuadra-redesign"}`) and check phone width with `resize_window {preset: "mobile"}`. The app falls back to Palermo after 8 s when location isn't available; the walk button (🚶) simulates walking.

---

### Task 1: Pure presentation helpers (`ui.js`) with tests

**Files:**
- Create: `public/ui.js`
- Test: `test/ui.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces (all named exports of `public/ui.js`):
  - `RADIUS: 500`, `NEAR: 45`
  - `dist(a: {lat,lng}, b: {lat,lng}): number` (meters)
  - `fmtM(m: number): string`, `walkMin(m: number): number`, `esc(s: any): string`
  - `cur(p): 'US$'|'$'`, `compact(n): string`, `shortPrice(p): string`
  - `priceAmount(p): string` (for example `'US$ 130.000'`, or `'Consultar'`), `priceSuffix(p): '' | '/mes' | '/mes · temporario'`, `fullPrice(p): string`
  - `expLabel(p, suffix: string): string`, `perM2(p): string` (`''` when not applicable)
  - `opLabel(p): 'venta'|'alquiler'`, `signLabel(p): 'Vende'|'Alquila'`, `listingSummary(p): string`
  - `DEFAULT_FILTERS: {op:'todo', amb:0, fav:false, pets:false, cred:false}` (frozen)
  - `passes(p, f: filters, favs: Set<string>): boolean`, `activeFilterCount(f): number`
  - `normalizeCaps(text): string`, `presentFacts(p): Array<{value: string, label: string}>`, `featureList(p): string[]`
  - `sourceLabel(mode: 'pending'|'web'|'demo', agencies?: number): string`

- [ ] **Step 1: Write the failing tests**

Create `test/ui.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtM, walkMin, esc, shortPrice, priceAmount, priceSuffix, fullPrice, expLabel, perM2,
  listingSummary, signLabel, passes, activeFilterCount, DEFAULT_FILTERS, normalizeCaps,
  presentFacts, featureList, sourceLabel
} from '../public/ui.js';

const venta = { id: 'v1', op: 'venta', type: 'Departamento', amb: 2, m2: 48, m2tot: 52, price: 130000, currency: 'USD', banos: 1, mascotas: true, credito: false };
const alquiler = { id: 'a1', op: 'alquiler', type: 'PH', amb: 3, m2: 70, price: 650000, currency: 'ARS', exp: 95000, mascotas: false, credito: false };
const filters = (o = {}) => ({ ...DEFAULT_FILTERS, ...o });

test('distancias y minutos a pie', () => {
  assert.equal(fmtM(234), '230 m');
  assert.equal(fmtM(1240), '1,2 km');
  assert.equal(walkMin(10), 1);
  assert.equal(walkMin(400), 5);
});

test('esc escapa todo lo que puede romper el HTML', () => {
  assert.equal(esc(`<b>"x" & 'y'</b>`), '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
  assert.equal(esc(null), '');
});

test('precios', () => {
  assert.equal(priceAmount(venta), 'US$ 130.000');
  assert.equal(priceSuffix(venta), '');
  assert.equal(priceAmount(alquiler), '$ 650.000');
  assert.equal(priceSuffix(alquiler), '/mes');
  assert.equal(priceSuffix({ ...alquiler, temporario: true }), '/mes · temporario');
  assert.equal(fullPrice(alquiler), '$ 650.000/mes');
  assert.equal(shortPrice(venta), 'US$130k');
  assert.equal(shortPrice({ ...venta, price: 1250000 }), 'US$1,25M');
});

test('una propiedad sin precio dice "Consultar" y no "undefined"', () => {
  const p = { ...venta, price: null };
  assert.equal(priceAmount(p), 'Consultar');
  assert.equal(priceSuffix({ ...alquiler, price: null }), '');
  assert.equal(fullPrice(p), 'Precio a consultar');
  assert.equal(shortPrice(p), 'Consultar');
});

test('expensas y precio por m²', () => {
  assert.equal(expLabel(alquiler, ' expensas'), '+ $ 95.000 expensas');
  assert.equal(expLabel({ ...venta, source: 'demo' }, ' expensas'), 'Sin expensas');
  assert.equal(expLabel(venta, ' expensas'), 'Expensas a consultar');
  assert.equal(perM2(venta), 'US$ 2.708/m²');
  assert.equal(perM2(alquiler), '');
  assert.equal(perM2({ ...venta, m2: 0 }), '');
});

test('resumen corto: sin ceros ni undefined', () => {
  assert.equal(listingSummary(venta), '2 amb · 48 m²');
  assert.equal(listingSummary({ type: 'Casa', amb: 0, m2: 0 }), 'Casa');
  assert.equal(listingSummary({ type: 'Local', m2: 30 }), '30 m²');
  assert.equal(signLabel(venta), 'Vende');
  assert.equal(signLabel(alquiler), 'Alquila');
});

test('filtros', () => {
  const favs = new Set(['a1']);
  assert.equal(passes(venta, filters(), favs), true);
  assert.equal(passes(venta, filters({ op: 'alquiler' }), favs), false);
  assert.equal(passes(venta, filters({ amb: 2 }), favs), true);
  assert.equal(passes(venta, filters({ amb: 3 }), favs), false);
  assert.equal(passes({ ...venta, amb: 5 }, filters({ amb: 4 }), favs), true);
  assert.equal(passes(venta, filters({ fav: true }), favs), false);
  assert.equal(passes(alquiler, filters({ fav: true }), favs), true);
  assert.equal(passes(venta, filters({ pets: true }), favs), true);
  assert.equal(passes(alquiler, filters({ pets: true }), favs), false);
  assert.equal(passes(venta, filters({ cred: true }), favs), false);
});

test('"4+" ambientes excluye las propiedades sin dato de ambientes', () => {
  assert.equal(passes({ ...venta, amb: undefined }, filters({ amb: 4 }), new Set()), false);
  assert.equal(passes({ ...venta, amb: 0 }, filters({ amb: 4 }), new Set()), false);
});

test('el contador de filtros no cuenta venta/alquiler', () => {
  assert.equal(activeFilterCount(filters()), 0);
  assert.equal(activeFilterCount(filters({ op: 'venta' })), 0);
  assert.equal(activeFilterCount(filters({ amb: 2, pets: true })), 2);
  assert.equal(activeFilterCount(filters({ amb: 4, fav: true, pets: true, cred: true })), 4);
});

test('normalizeCaps pasa las descripciones en mayúsculas a oraciones', () => {
  assert.equal(
    normalizeCaps('(A REFACCIONAR - A TERMINAR) PH 3 AMBIENTES EN UNA SOLA PLANTA. IDEAL INVERSIÓN.'),
    '(A refaccionar - a terminar) PH 3 ambientes en una sola planta. Ideal inversión.'
  );
  assert.equal(normalizeCaps('EDIFICIO HISTÓRICO DE 4 PISOS - VENTA EN BLOCK'), 'Edificio histórico de 4 pisos - venta en block');
  assert.equal(normalizeCaps('LINDO.\nMUY LUMINOSO'), 'Lindo.\nMuy luminoso');
});

test('normalizeCaps no toca textos con mayúsculas normales', () => {
  assert.equal(normalizeCaps('Luminoso PH con TERRAZA propia'), 'Luminoso PH con TERRAZA propia');
  assert.equal(normalizeCaps('Hola'), 'Hola');
  assert.equal(normalizeCaps('123'), '123');
  assert.equal(normalizeCaps(null), '');
  assert.equal(normalizeCaps(''), '');
});

test('presentFacts muestra solo los datos que hay', () => {
  assert.deepEqual(presentFacts(venta), [
    { value: '2', label: 'Amb.' }, { value: '48', label: 'm² cub.' },
    { value: '52', label: 'm² tot.' }, { value: '1', label: 'Baño' }
  ]);
  assert.deepEqual(presentFacts({ amb: 0, m2: 0, m2tot: 0, banos: 0 }), []);
  assert.deepEqual(presentFacts({ m2: 40, m2tot: 40 }), [{ value: '40', label: 'm² cub.' }]);
  assert.deepEqual(presentFacts({ banos: 2, antig: 0 }), [{ value: '2', label: 'Baños' }, { value: 'Nuevo', label: 'A estrenar' }]);
  assert.deepEqual(presentFacts({ antig: 80 }), [{ value: '80', label: 'Años' }]);
});

test('featureList suma mascotas y crédito sin repetir', () => {
  assert.deepEqual(featureList({ feats: ['Balcón', 'Luminoso'], mascotas: true, credito: true }), ['Balcón', 'Luminoso', 'Acepta mascotas', 'Apto crédito']);
  assert.deepEqual(featureList({ feats: ['Apto crédito'], credito: true }), ['Apto crédito']);
  assert.deepEqual(featureList({}), []);
});

test('origen de los avisos', () => {
  assert.equal(sourceLabel('web', 6), '6 inmobiliarias');
  assert.equal(sourceLabel('web', 1), '1 inmobiliaria');
  assert.equal(sourceLabel('demo'), 'ejemplos');
  assert.equal(sourceLabel('pending'), 'cargando…');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../public/ui.js'` (the existing crawler and tokko tests still pass).

- [ ] **Step 3: Implement `public/ui.js`**

```js
// Funciones puras de presentación y filtros. Sin DOM ni Leaflet: las usa app.js y las prueba test/ui.test.mjs.
export const RADIUS = 500; // m: lo que cuenta como "cerca tuyo"
export const NEAR = 45;    // m: distancia del aviso "estás pasando"

const nf = new Intl.NumberFormat('es-AR');

export const dist = (a, b) => { const R = 6371000, t = Math.PI / 180; const dLat = (b.lat - a.lat) * t, dLng = (b.lng - a.lng) * t;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
export const fmtM = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
export const walkMin = m => Math.max(1, Math.round(m / 80));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Precios ----------
export const cur = p => (p.currency || (p.op === 'venta' ? 'USD' : 'ARS')) === 'USD' ? 'US$' : '$';
export const compact = n => n >= 1e6 ? (n / 1e6).toFixed(2).replace('.', ',') + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(Math.round(n));
export const shortPrice = p => p.price == null ? 'Consultar' : `${cur(p)}${compact(p.price)}`;
export const priceAmount = p => p.price == null ? 'Consultar' : `${cur(p)} ${nf.format(p.price)}`;
export const priceSuffix = p => p.price == null || p.op !== 'alquiler' ? '' : p.temporario ? '/mes · temporario' : '/mes';
export const fullPrice = p => p.price == null ? 'Precio a consultar' : priceAmount(p) + priceSuffix(p);
// Los avisos de ejemplo saben si no tienen expensas; los reales, si no las publican, no lo sabemos.
export const expLabel = (p, suffix) => p.exp ? `+ $ ${nf.format(p.exp)}${suffix}` : p.source === 'demo' ? 'Sin expensas' : 'Expensas a consultar';
export const perM2 = p => p.op === 'venta' && p.price && p.m2 ? `${cur(p)} ${nf.format(Math.round(p.price / p.m2))}/m²` : '';

// ---------- Textos cortos ----------
export const opLabel = p => p.op === 'venta' ? 'venta' : 'alquiler';
export const signLabel = p => p.op === 'venta' ? 'Vende' : 'Alquila';
export const listingSummary = p => [p.amb && `${p.amb} amb`, p.m2 && `${p.m2} m²`].filter(Boolean).join(' · ') || p.type;
export const sourceLabel = (mode, agencies = 0) => mode === 'web' ? `${agencies} ${agencies === 1 ? 'inmobiliaria' : 'inmobiliarias'}`
  : mode === 'demo' ? 'ejemplos' : 'cargando…';

// ---------- Filtros ----------
export const DEFAULT_FILTERS = Object.freeze({ op: 'todo', amb: 0, fav: false, pets: false, cred: false });
export function passes(p, f, favs) {
  if (f.op !== 'todo' && p.op !== f.op) return false;
  if (f.amb && (f.amb === 4 ? !(p.amb >= 4) : p.amb !== f.amb)) return false;
  if (f.fav && !favs.has(p.id)) return false;
  if (f.pets && !p.mascotas) return false;
  if (f.cred && !p.credito) return false;
  return true;
}
// Venta/alquiler queda a la vista en el panel, así que no cuenta.
export const activeFilterCount = f => (f.amb ? 1 : 0) + (f.fav ? 1 : 0) + (f.pets ? 1 : 0) + (f.cred ? 1 : 0);

// ---------- Ficha ----------
// Muchas inmobiliarias publican todo en mayúsculas: si más del 60 % de las letras lo están, lo pasamos a oraciones.
const ACRONYMS = /\b(ph|sum|caba|usd)\b/g;
export function normalizeCaps(text) {
  const s = String(text ?? '');
  const letters = s.match(/\p{L}/gu) || [];
  const upper = letters.filter(ch => ch !== ch.toLowerCase()).length;
  if (!letters.length || upper / letters.length <= 0.6) return s;
  return s.toLowerCase()
    .replace(/(^|[.!?]\s+|\n)([^\p{L}\n]*)(\p{L})/gu, (m, pre, gap, ch) => pre + gap + ch.toUpperCase())
    .replace(ACRONYMS, w => w.toUpperCase());
}
export function presentFacts(p) {
  const out = [];
  if (p.amb) out.push({ value: String(p.amb), label: 'Amb.' });
  if (p.m2) out.push({ value: String(p.m2), label: 'm² cub.' });
  if (p.m2tot && p.m2tot !== p.m2) out.push({ value: String(p.m2tot), label: 'm² tot.' });
  if (p.banos) out.push({ value: String(p.banos), label: p.banos === 1 ? 'Baño' : 'Baños' });
  if (p.antig === 0) out.push({ value: 'Nuevo', label: 'A estrenar' });
  else if (p.antig > 0) out.push({ value: String(p.antig), label: 'Años' });
  return out;
}
export const featureList = p => [...new Set([...(p.feats || []), ...(p.mascotas ? ['Acepta mascotas'] : []), ...(p.credito ? ['Apto crédito'] : [])])];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. All `ui` tests plus the existing crawler and tokko tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add public/ui.js test/ui.test.mjs
git commit -m "Agregar funciones de presentación y filtros con pruebas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Split `index.html` into markup, styles and modules (no visible change)

**Files:**
- Create: `public/app.css`, `public/app.js`, `public/demo.js`, `test/demo.test.mjs`
- Modify: `public/index.html` (remove the inline `<style>` at lines 10–207 and the inline `<script>` at lines 256–637)

**Interfaces:**
- Consumes: from `ui.js`: `RADIUS, NEAR, dist, fmtM, walkMin, esc, cur, shortPrice, fullPrice, expLabel, perM2, passes`.
- Produces: `public/demo.js` exports `CELL: number`, `listingsInCell(cx: number, cy: number): Listing[]`, `drawFacade(cv: HTMLCanvasElement, p: Listing): void`. `app.js` keeps the flat `state` object (`state.op`, `state.amb`, `state.fav`, `state.pets`, `state.cred`, `state.favs`, `state.seen`, `state.sel`, …), so `passes(p, state, state.favs)` works unchanged.

Line numbers below refer to `public/index.html` as it is at the start of this task (639 lines, commit `2284157`). Steps 5 and 6 edit the file and shift those numbers, so always extract from the committed version, for example `git show HEAD:public/index.html | sed -n '283,331p'`.

- [ ] **Step 1: Write the failing demo smoke test**

Create `test/demo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listingsInCell, CELL } from '../public/demo.js';

test('los avisos de ejemplo son deterministas y caen dentro de su celda', () => {
  const all = [];
  for (let cx = -48710; cx < -48690; cx++) all.push(...listingsInCell(cx, -28824));
  assert.ok(all.length > 0);
  assert.deepEqual(listingsInCell(-48700, -28824), listingsInCell(-48700, -28824));
  for (const p of all) {
    assert.ok(p.op === 'venta' || p.op === 'alquiler');
    assert.equal(p.source, 'demo');
    assert.ok(p.lat >= -28824 * CELL && p.lat <= -28823 * CELL);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../public/demo.js'`.

- [ ] **Step 3: Create `public/demo.js`**

Start the file with this header and imports-free comment:

```js
// Avisos de ejemplo (deterministas por zona, para cuando no hay datos del crawler) y fachadas ilustradas para las fichas sin foto.
```

Then move these lines from `public/index.html` verbatim, in this order:
- lines 264–266 (`mulberry`, `hash2`, `pick`)
- line 273 (`hashStr`)
- lines 283–331 (the `// ---------- Generador de avisos…` section through the end of `listingsInCell`)
- lines 356–386 (the `// ---------- Fachadas ilustradas` section, `drawFacade`)

Then add `export` in front of exactly three declarations: `const CELL = 0.0012;` becomes `export const CELL = 0.0012;`, `function listingsInCell(` becomes `export function listingsInCell(`, and `function drawFacade(` becomes `export function drawFacade(`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, including `los avisos de ejemplo son deterministas…`.

- [ ] **Step 5: Create `public/app.css`**

Move lines 11–206 (everything between `<style>` and `</style>`) from `public/index.html` into `public/app.css` verbatim. In `public/index.html`, replace lines 10–207 with:

```html
<link rel="stylesheet" href="app.css">
```

- [ ] **Step 6: Create `public/app.js`**

Start the file with:

```js
import { RADIUS, NEAR, dist, fmtM, walkMin, esc, cur, shortPrice, fullPrice, expLabel, perM2, passes } from './ui.js';
import { CELL, listingsInCell, drawFacade } from './demo.js';
```

Then move the body of the inline script (lines 258–635, the code inside `(() => {` … `})();`, without the wrapper lines 257 and 636) and make these edits:
1. Delete the lines that now live in `ui.js` or `demo.js`: 264–266, 267–268 (`dist`), 269–270 (`fmtM`, `walkMin`), 271 (`nf`), 272 (`esc`), 273 (`hashStr`), 274–278 (`cur`, `compact`, `shortPrice`, `fullPrice`), 280–281 (comment and `expLabel`), 283–331 (generator), 356–386 (`drawFacade`). Keep `$`, `store` and `dash`.
2. Line 389: change `const RADIUS = 500, NEAR = 45;` to nothing (delete it; both come from `ui.js`).
3. Delete the local `passes` function (lines 464–471) and change the first line of `render()` (line 476) to:
   ```js
   const around = listingsAround(state.pos, RADIUS * 1.6).filter(o => passes(o.p, state, state.favs));
   ```
4. In `openSheet` (line 561), replace
   `${p.op === 'venta' && p.price && p.m2 ? ` · ${cur(p)} ${nf.format(Math.round(p.price / p.m2))}/m²` : ''}`
   with
   `${perM2(p) ? ` · ${perM2(p)}` : ''}`.

In `public/index.html`, replace the Leaflet script tag and the inline script (original lines 255–637) with:

```html
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script type="module" src="app.js"></script>
```

(Module scripts run after the page is parsed and after the classic Leaflet script, so the global `L` is available.)

- [ ] **Step 7: Check the page in the browser**

Create the worktree's `.claude/launch.json` (see "Local preview" above), start `cuadra-redesign`, open it at `mobile` width and wait 9 s.
Expected: the same UI as before the split: map, price pins, card carousel, filter row. `read_console_messages {onlyErrors: true}` shows nothing. Tap a card: the detail opens with a price per m² on sale listings. Tap 🚶: the walk starts and proximity toasts appear.

- [ ] **Step 8: Run the tests and commit**

Run: `npm test`
Expected: PASS.

```bash
git add public/index.html public/app.css public/app.js public/demo.js test/demo.test.mjs
git commit -m "Separar la app en HTML, CSS y módulos sin cambiar el comportamiento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tokens, status pill and proximity alert

**Files:**
- Modify: `public/index.html` (header, toast container)
- Modify: `public/app.css` (`:root` tokens, "Barra superior" section, "Toast" section)
- Modify: `public/app.js` (status rendering, `toast` → `info` / `passingAlert`)

**Interfaces:**
- Consumes: `priceAmount, priceSuffix, listingSummary, opLabel, fmtM, esc` from `ui.js`.
- Produces (in `app.js`): `info(html: string, ms = 4000): void`, `passingAlert(p, d: number): void`, `hideAlert(): void`, `renderStatus(): void`. Tasks 4–7 call `info` wherever the old code called `toast` without a listing.

- [ ] **Step 1: Update the tokens**

In `public/app.css`, inside the first `:root { … }` block, add after `--me: #e0342b;`:

```css
  --ink: #1b2124;        /* panel inferior y avisos informativos, oscuro en los dos temas */
  --ink-2: #262e31;      /* tarjetas y controles dentro del panel */
  --venta-text: #1d4fd8; /* azul para texto y foco sobre superficies */
```

In both dark blocks (`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` and `:root[data-theme="dark"] { … }`), replace `--venta: #5b8bff;` with `--venta-text: #5b8bff;`, so the sign blue stays `#1d4fd8` with white text in dark mode.

Change the focus rule `button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--venta); outline-offset: 2px; }` to:

```css
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, .leaflet-marker-icon:focus-visible { outline: 2px solid var(--venta-text); outline-offset: 2px; }
```

- [ ] **Step 2: Replace the header markup**

In `public/index.html`, replace

```html
  <div class="brandrow">
    <div class="brand"><i></i>Cuadra</div>
    <div class="status" id="status" aria-live="polite">Buscando tu ubicación…</div>
  </div>
```

with

```html
  <div class="pill"><i class="mark" aria-hidden="true"></i><b>Cuadra</b><span class="live" id="liveDot" hidden></span><span id="status">Buscando tu ubicación…</span></div>
```

(No `aria-live` on `#status`: in walk mode the distance changes every 400 ms and a screen reader would read it nonstop. Announcements go through `#alertWrap`.)

Then replace `<div id="toastWrap"></div>` with

```html
<div id="alertWrap" aria-live="polite"></div>
```

- [ ] **Step 3: Replace the header and toast styles**

In `public/app.css`, replace the `.top { … }` rule and the `.brandrow`, `.brand`, `.brand i`, `.status`, `.status b` rules (the start of the "Barra superior" section, through `.status b`) with:

```css
.top {
  position: fixed; top: 0; left: 0; right: 0; z-index: 10;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 12px 0;
  display: flex; flex-direction: column; gap: 10px; pointer-events: none;
}
.top > * { pointer-events: auto; }
.pill {
  align-self: flex-start; max-width: 100%; height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 14px 0 12px;
  background: var(--surface); border-radius: 14px; box-shadow: var(--shadow); font-size: 13px; color: var(--muted); white-space: nowrap;
}
.pill b { font: 800 20px/1 var(--display); letter-spacing: .03em; text-transform: uppercase; color: var(--fg); margin-right: 2px; }
.mark { flex: none; width: 9px; height: 20px; border-radius: 2px; background: linear-gradient(var(--venta) 50%, var(--alquiler) 50%); }
.live { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #1f9d55; }
.has-alert .pill { visibility: hidden; }
```

Replace the whole "Toast" section (from `/* ---------- Toast ---------- */` through `@keyframes drop …`) with:

```css
/* ---------- Aviso (estás pasando / mensajes) ---------- */
#alertWrap { position: fixed; z-index: 20; top: calc(env(safe-area-inset-top, 0px) + 10px); left: 10px; right: 10px; max-width: 560px; margin: 0 auto; pointer-events: none; }
.alert {
  pointer-events: auto; width: 100%; border: 0; border-radius: 18px; padding: 12px 12px 12px 16px; box-shadow: 0 8px 24px rgba(0,0,0,.3);
  display: flex; align-items: center; gap: 12px; text-align: left; touch-action: none; animation: drop .28s cubic-bezier(.2,.8,.2,1);
}
.alert.venta { background: var(--venta); color: #fff; }
.alert.alquiler { background: var(--alquiler); color: var(--alquiler-ink); }
.alert.info { background: var(--ink); color: #fff; font-size: 14px; }
.alert.info p { margin: 0; }
.alert-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.alert small { font-weight: 800; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.alert-price { font: 800 30px/1 var(--display); font-variant-numeric: tabular-nums; }
.alert-price span { font: 600 13px var(--body); margin-left: 2px; }
.alert-sub { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.alert-go { flex: none; width: 48px; height: 48px; border-radius: 14px; background: rgba(0,0,0,.16); display: grid; place-items: center; font-weight: 800; font-size: 14px; }
@keyframes drop { from { transform: translateY(-16px); opacity: 0; } }
```

- [ ] **Step 4: Replace `toast` with `info` and `passingAlert` in `app.js`**

Add `priceAmount, priceSuffix, listingSummary, opLabel` to the `ui.js` import. Replace the whole `// ---------- Toast ----------` section (`let toastT;` and `function toast(…) { … }`) with:

```js
// ---------- Aviso de arriba ----------
// "Estás pasando" usa el color del cartel de la propiedad; los mensajes informativos, el oscuro del panel.
let alertT;
function showAlert(el, ms) {
  $('#alertWrap').replaceChildren(el);
  document.body.classList.add('has-alert');
  clearTimeout(alertT); alertT = setTimeout(hideAlert, ms);
}
function hideAlert() {
  clearTimeout(alertT);
  $('#alertWrap').replaceChildren();
  document.body.classList.remove('has-alert');
}
function info(html, ms = 4000) {
  const el = document.createElement('div');
  el.className = 'alert info'; el.innerHTML = `<p>${html}</p>`;
  showAlert(el, ms);
}
function passingAlert(p, d) {
  const el = document.createElement('button');
  el.type = 'button'; el.className = `alert ${p.op}`;
  el.innerHTML = `<span class="alert-body">
      <small>Estás pasando · a ${fmtM(d)}</small>
      <span class="alert-price">${esc(priceAmount(p))}<span>${priceSuffix(p)}</span></span>
      <span class="alert-sub">${esc(p.address)} · ${esc(listingSummary(p))} · ${opLabel(p)}</span>
    </span><span class="alert-go" aria-hidden="true">Ver</span>`;
  // Deslizar hacia arriba lo descarta.
  let y0 = null, swiped = false;
  el.addEventListener('pointerdown', e => { y0 = e.clientY; swiped = false; });
  el.addEventListener('pointerup', e => { if (y0 != null && e.clientY - y0 < -30) { swiped = true; hideAlert(); } y0 = null; });
  el.onclick = () => { if (swiped) return; hideAlert(); select(p.id, true); openSheet(p); };
  showAlert(el, 8000);
  if (navigator.vibrate) try { navigator.vibrate(60); } catch {}
}
```

Replace the remaining `toast(` calls:
- In `fallback`: `toast(`${msg} Te ubicamos en Palermo. Tocá <b>Simular caminata</b> para recorrer el barrio.`, 6000);` becomes `info(`${msg} Te ubicamos en Palermo. Tocá <b>Simular caminata</b> para recorrer el barrio.`, 6000);`
- In `toggleWalk`: `toast('Modo paseo: …');` becomes `info('Modo paseo: caminás solo por el barrio. Tocá el mapa para elegir hacia dónde.');`
- In the map click handler: `toast('Caminando hacia ese punto…');` becomes `info('Caminando hacia ese punto…', 2500);`
- In `render()`, replace the line `toast(`Estás pasando por <b>${esc(p.address)}</b>: …`, 5000, p);` with `passingAlert(p, d);`

- [ ] **Step 5: Render the status in the pill**

In `render()`, replace the three lines under `// estado` that set `$('#status').innerHTML = …` with `renderStatus();` and add this function next to `trailLength`:

```js
function renderStatus() {
  const live = state.real && !state.walking;
  $('#liveDot').hidden = !live;
  $('#status').textContent = state.walking ? `Modo paseo · ${fmtM(trailLength())}`
    : live ? `En vivo · ${fmtM(trailLength())}` : 'Palermo · aproximada';
}
```

- [ ] **Step 6: Check in the browser**

Reload at `mobile` width and wait 9 s.
Expected: the pill reads `CUADRA  Palermo · aproximada` without truncation. The fallback message appears as a dark alert at the top, and the pill is hidden while it shows. Tap 🚶 and wait until you pass a listing: a yellow (rent) or blue (sale) alert shows "Estás pasando · a N m", the price at 30 px, the address and the summary. Tapping it opens the detail. A second pass lets you check swiping up dismisses it (use `left_click_drag` from y≈60 to y≈10). No console errors.

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/app.css public/app.js
git commit -m "Agregar pastilla de estado y aviso de proximidad con el color del cartel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Dark dock with peek and expanded states

**Files:**
- Modify: `public/index.html` (replace `<section class="bottom">`, move `#opSeg`, add `data-flag` to chips)
- Modify: `public/app.css` (scope old segment rules, replace "Carrusel inferior", delete the old desktop media query, map controls)
- Modify: `public/app.js` (filter wiring, `renderDock`, `cardEl`, dock state and gestures)

**Interfaces:**
- Consumes: `priceAmount, priceSuffix, listingSummary, signLabel, activeFilterCount, sourceLabel, walkMin, fmtM, esc` from `ui.js`; `drawFacade` from `demo.js`.
- Produces (in `app.js`): `setDock(s: 'peek'|'expanded'|'hidden'): void`, `toggleDock(): void`, `syncFilterControls(): void`, `clearFilters(all: boolean): void`, `renderDock(inRadius: Array<{p, d}>): void`. Filter buttons anywhere in the page work through `data-op`, `data-amb` or `data-flag="fav"|"pets"|"cred"` plus `aria-pressed`.

- [ ] **Step 1: Replace the dock markup**

In `public/index.html`, delete the `<div class="seg" id="opSeg">…</div>` block from the header. Change the three chips to use `data-flag` (keep their text):

```html
    <button class="chip" data-flag="fav" aria-pressed="false">♥ Guardadas</button>
    <button class="chip" data-flag="pets" aria-pressed="false">Acepta mascotas</button>
    <button class="chip" data-flag="cred" aria-pressed="false">Apto crédito</button>
```

Replace the whole `<section class="bottom" …>…</section>` with:

```html
<section class="dock" id="dock" data-state="peek" aria-label="Propiedades cerca tuyo">
  <button class="dock-grab" id="dockGrab" type="button" aria-expanded="false" aria-controls="dockList" aria-label="Ver la lista completa"><span></span></button>
  <div class="dock-head">
    <p class="dock-count"><b id="count">–</b><span id="countLabel">Buscando tu ubicación…</span></p>
    <button class="dock-filters" id="filtersBtn" type="button" hidden>Filtros<i id="filtersBadge" hidden>0</i></button>
  </div>
  <div class="dock-list" id="dockList">
    <div class="cards" id="cards">
      <div class="card skeleton" aria-hidden="true"><span class="thumb"></span><span class="card-body"><span class="sk"></span><span class="sk short"></span></span></div>
    </div>
    <div class="empty" id="empty" hidden><p id="emptyText"></p><button type="button" class="btn-light" id="emptyClear" hidden>Limpiar filtros</button></div>
  </div>
  <div class="seg" id="opSeg" role="group" aria-label="Operación">
    <button type="button" data-op="todo" aria-pressed="true">Todo</button>
    <button type="button" data-op="venta" aria-pressed="false">Venta</button>
    <button type="button" data-op="alquiler" aria-pressed="false">Alquiler</button>
  </div>
</section>
```

(`#filtersBtn` stays `hidden` until Task 5 wires it.)

- [ ] **Step 2: Update the styles**

In `public/app.css`, scope the old segment rules to the header filter row, which still exists until Task 5. Replace the five rules starting with `.seg {`, `.seg button {`, `.seg button[aria-pressed="true"][data-op="venta"]`, `.seg button[aria-pressed="true"][data-op="alquiler"]` and `.seg button[aria-pressed="true"][data-op="todo"], …` with:

```css
.filters .seg { display: flex; background: var(--surface); border-radius: 999px; box-shadow: var(--shadow); padding: 3px; flex: none; }
.filters .seg button { border: 0; background: none; padding: 7px 14px; border-radius: 999px; font-weight: 600; font-size: 13px; white-space: nowrap; }
.filters .seg button[aria-pressed="true"] { background: var(--fg); color: var(--bg); }
```

In the "Botones flotantes" section, replace the `.fabs` rule and change `border-radius: 50%` to `border-radius: 16px` in the `.fab` rule:

```css
.fabs { position: fixed; right: 12px; z-index: 10; display: flex; flex-direction: column; gap: 10px; bottom: calc(env(safe-area-inset-bottom, 0px) + var(--dock-h, 220px) + 24px); transition: bottom .22s; }
body[data-dock="expanded"] .fabs, body[data-dock="hidden"] .fabs { display: none; }
```

Replace the whole "Carrusel inferior" section (from `/* ---------- Carrusel inferior ---------- */` through the `.empty { … }` rule) with:

```css
/* ---------- Panel inferior ---------- */
.dock {
  position: fixed; left: 10px; right: 10px; bottom: calc(env(safe-area-inset-bottom, 0px) + 12px); z-index: 12; max-width: 560px; margin: 0 auto;
  background: var(--ink); color: #fff; border-radius: 24px; padding: 2px 14px 14px; box-shadow: 0 10px 30px rgba(0,0,0,.3);
  display: flex; flex-direction: column; transition: transform .22s cubic-bezier(.2,.8,.2,1);
}
.dock.dragging { transition: none; }
.dock[data-state="hidden"] { transform: translateY(calc(100% + 24px)); pointer-events: none; }
.dock-grab { align-self: center; width: 64px; height: 24px; border: 0; background: none; display: grid; place-items: center; touch-action: none; }
.dock-grab span { width: 36px; height: 5px; border-radius: 3px; background: rgba(255,255,255,.35); }
.dock-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; touch-action: none; cursor: pointer; }
.dock-count { margin: 0; display: flex; align-items: center; gap: 8px; }
.dock-count b { font: 800 36px/1 var(--display); font-variant-numeric: tabular-nums; }
.dock-count span { font-size: 12px; line-height: 1.3; color: rgba(255,255,255,.72); }
.dock-filters { min-height: 44px; border: 0; border-radius: 12px; background: var(--ink-2); color: #fff; padding: 0 14px; font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 6px; }
.dock-filters i { font-style: normal; background: #fff; color: var(--ink); border-radius: 9px; min-width: 18px; padding: 1px 6px; font-size: 11px; font-weight: 800; }
.dock-list { overflow: hidden; }
.dock[data-state="expanded"] .dock-list { overflow-y: auto; max-height: calc(85dvh - 150px); overscroll-behavior: contain; }
.dock[data-state="peek"] .card:not(:first-child) { display: none; }
.cards { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.card { width: 100%; border: 0; background: var(--ink-2); color: #fff; border-radius: 16px; padding: 10px; display: flex; align-items: center; gap: 12px; text-align: left; }
.card.sel { box-shadow: inset 0 0 0 2px #fff; }
.thumb { position: relative; display: block; flex: none; width: 60px; height: 60px; border-radius: 10px; overflow: hidden; background: #3a4447; }
.thumb canvas, .thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.card-price { font: 800 24px/1.05 var(--display); font-variant-numeric: tabular-nums; }
.card-price small { font: 600 12px var(--body); margin-left: 2px; opacity: .8; }
.card-meta, .card-addr { font-size: 12px; color: rgba(255,255,255,.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-go { flex: none; min-width: 48px; height: 44px; padding: 0 12px; border-radius: 12px; background: #fff; color: var(--ink); display: grid; place-items: center; font-weight: 800; font-size: 13px; }
.sk { display: block; width: 70%; height: 14px; border-radius: 6px; background: rgba(255,255,255,.12); }
.sk.short { width: 40%; margin-top: 8px; }
.tag { align-self: flex-start; font: 800 11px/1 var(--display); letter-spacing: .08em; text-transform: uppercase; padding: 3px 5px 2px; border-radius: 3px; }
.tag.venta { background: var(--venta); color: #fff; }
.tag.alquiler { background: var(--alquiler); color: var(--alquiler-ink); }
.empty { padding: 4px 2px 12px; font-size: 14px; color: rgba(255,255,255,.8); }
.empty p { margin: 0 0 10px; }
.btn-light { min-height: 44px; border: 0; border-radius: 12px; background: #fff; color: var(--ink); font-weight: 800; padding: 0 16px; }
.dock .seg { display: flex; gap: 6px; }
.dock .seg button { flex: 1; min-height: 44px; border: 0; border-radius: 12px; background: var(--ink-2); color: #fff; font-weight: 700; font-size: 13px; }
.dock .seg button[aria-pressed="true"] { background: #fff; color: var(--ink); }
.dock .seg button[aria-pressed="true"][data-op="venta"] { background: var(--venta); color: #fff; }
.dock .seg button[aria-pressed="true"][data-op="alquiler"] { background: var(--alquiler); color: var(--alquiler-ink); }
```

Change `.leaflet-bottom.leaflet-right { bottom: calc(env(safe-area-inset-bottom, 0px) + 180px); }` to:

```css
.leaflet-bottom.leaflet-right { bottom: calc(env(safe-area-inset-bottom, 0px) + var(--dock-h, 220px) + 14px); }
```

Delete the whole `@media (min-width: 900px) { … }` block at the end of the file. Task 7 writes the new desktop layout.

- [ ] **Step 3: Wire the filters through data attributes**

In `public/app.js`, add `priceAmount, priceSuffix, listingSummary, signLabel, activeFilterCount, sourceLabel` to the `ui.js` import (merge with the existing names). Replace the whole `// ---------- Filtros ----------` block (the `segment` function, its two calls and the chip `for` loop) with:

```js
// ---------- Filtros ----------
// Cualquier botón con data-op, data-amb o data-flag cambia el filtro, esté en el panel, en la hoja de filtros o en la barra.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-op], [data-amb], [data-flag]');
  if (!b) return;
  if (b.dataset.op) state.op = b.dataset.op;
  else if (b.dataset.amb) state.amb = Number(b.dataset.amb);
  else state[b.dataset.flag] = !state[b.dataset.flag];
  syncFilterControls(); lastIds = ''; render();
});
function syncFilterControls() {
  document.querySelectorAll('[data-op]').forEach(b => b.setAttribute('aria-pressed', b.dataset.op === state.op));
  document.querySelectorAll('[data-amb]').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.amb) === state.amb));
  document.querySelectorAll('[data-flag]').forEach(b => b.setAttribute('aria-pressed', !!state[b.dataset.flag]));
  const n = activeFilterCount(state);
  $('#filtersBadge').textContent = n; $('#filtersBadge').hidden = !n;
}
function clearFilters(all) {
  Object.assign(state, { amb: 0, fav: false, pets: false, cred: false }, all ? { op: 'todo' } : {});
  syncFilterControls(); lastIds = ''; render();
}
$('#emptyClear').onclick = () => clearFilters(true);
```

Keep the two lines after it (`$('#walkBtn').onclick = …` and `$('#locBtn').onclick = …`).

- [ ] **Step 4: Render the dock**

In `render()`, delete everything from `$('#count').textContent = inRadius.length;` to the end of the `// tarjetas` if/else (the old count, label, empty text and card-building code, through the closing `}` of the `else` block). Put this call in its place:

```js
  renderDock(inRadius);
```

Add these functions after `render()`:

```js
function renderDock(inRadius) {
  if (remote.mode === 'pending') { $('#countLabel').textContent = 'Cargando avisos…'; return; } // queda el esqueleto
  const n = inRadius.length;
  $('#count').textContent = n;
  $('#countLabel').innerHTML = `cerca tuyo<br>a 5 cuadras · ${sourceLabel(remote.mode, remote.agencies)}`;
  const top = inRadius.slice(0, 24);
  $('#empty').hidden = top.length > 0;
  if (!top.length) {
    const noData = remote.mode === 'web' && !listingsAround(state.pos, RADIUS).length;
    $('#emptyText').textContent = noData
      ? 'Todavía no tenemos avisos de inmobiliarias en esta zona. Caminá hacia otro barrio o volvé más adelante.'
      : 'No hay propiedades con esos filtros a 5 cuadras.';
    $('#emptyClear').hidden = noData || (state.op === 'todo' && !activeFilterCount(state));
  }
  const ids = top.map(o => o.p.id + (state.favs.has(o.p.id) ? '*' : '') + (state.sel === o.p.id ? '!' : '')).join(',');
  const cards = $('#cards');
  if (ids !== lastIds) {
    lastIds = ids;
    cards.replaceChildren(...top.map(({ p, d }) => cardEl(p, d)));
    cards.querySelectorAll('canvas').forEach(cv => drawFacade(cv, byId.get(cv.closest('[data-id]').dataset.id)));
  } else {
    // solo actualizar distancias
    top.forEach(({ d }, i) => { const el = cards.children[i]?.querySelector('[data-d]'); if (el) el.textContent = `${fmtM(d)} · ${walkMin(d)} min`; });
  }
}
function cardEl(p, d) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'card' + (state.sel === p.id ? ' sel' : ''); b.dataset.id = p.id;
  const thumb = p.photos?.length ? `<img src="${esc(p.photos[0])}" alt="" loading="lazy">` : '<canvas></canvas>';
  b.innerHTML = `<span class="thumb">${thumb}</span><span class="card-body">
      <span class="tag ${p.op}">${signLabel(p)}</span>
      <span class="card-price">${esc(priceAmount(p))}<small>${priceSuffix(p)}</small></span>
      <span class="card-meta">${esc(listingSummary(p))} · <span data-d>${fmtM(d)} · ${walkMin(d)} min</span></span>
      <span class="card-addr">${state.favs.has(p.id) ? '♥ ' : ''}${esc(p.address)}</span>
    </span><span class="card-go" aria-hidden="true">Ver</span>`;
  b.onclick = () => { select(p.id, true); openSheet(p); };
  return b;
}
```

- [ ] **Step 5: Dock states and drag gesture**

Add this section to `app.js` just before `// ---------- Ficha ----------`:

```js
// ---------- Panel inferior ----------
// Tres estados: peek (la más cercana), expanded (lista completa) y hidden (con una hoja abierta).
let dockDragged = false;
function setDock(s) {
  const dock = $('#dock');
  dock.dataset.state = s; document.body.dataset.dock = s;
  $('#dockGrab').setAttribute('aria-expanded', s === 'expanded');
  $('#dockGrab').setAttribute('aria-label', s === 'expanded' ? 'Achicar la lista' : 'Ver la lista completa');
  if (s !== 'expanded') $('#dockList').scrollTop = 0;
}
function toggleDock() { setDock($('#dock').dataset.state === 'expanded' ? 'peek' : 'expanded'); }
// Los botones del mapa se acomodan arriba del panel achicado.
function syncDockHeight() {
  const dock = $('#dock');
  if (dock.dataset.state === 'peek') document.documentElement.style.setProperty('--dock-h', dock.offsetHeight + 'px');
}
new ResizeObserver(syncDockHeight).observe($('#dock'));
function dockGesture(el) {
  let y0 = null, dy = 0;
  el.addEventListener('pointerdown', e => {
    if (e.target.closest('button') && e.target.closest('button') !== $('#dockGrab')) return; // Filtros tiene su propio click
    y0 = e.clientY; dy = 0; dockDragged = false;
    el.setPointerCapture(e.pointerId); $('#dock').classList.add('dragging');
  });
  el.addEventListener('pointermove', e => {
    if (y0 == null) return;
    dy = e.clientY - y0;
    if (Math.abs(dy) > 8) dockDragged = true;
    const expanded = $('#dock').dataset.state === 'expanded';
    $('#dock').style.transform = `translateY(${expanded ? Math.max(0, dy) : Math.max(-40, Math.min(0, dy))}px)`;
  });
  const end = () => {
    if (y0 == null) return;
    const dock = $('#dock'), s = dock.dataset.state;
    dock.classList.remove('dragging'); dock.style.transform = '';
    if (dy < -40 && s === 'peek') setDock('expanded');
    else if (dy > 40 && s === 'expanded') setDock('peek');
    y0 = null;
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
dockGesture($('#dockGrab'));
dockGesture($('.dock-head'));
$('#dockGrab').addEventListener('click', () => { if (!dockDragged) toggleDock(); });
$('.dock-head').addEventListener('click', e => { if (!dockDragged && !e.target.closest('button')) toggleDock(); });
setDock('peek');
```

- [ ] **Step 6: Check in the browser**

Reload at `mobile` width and wait 9 s.
Expected:
- Before location resolves, the dock shows `–`, "Buscando tu ubicación…" and a skeleton card.
- After the fallback it shows the count, "cerca tuyo / a 5 cuadras · 6 inmobiliarias", one card (tag, 24 px price, summary, distance, address, white "Ver"), and Todo / Venta / Alquiler at 44 px. The 🚶 and ◎ buttons sit just above the dock.
- Tap the handle: the list expands to about 85% of the height, scrolls, and the map buttons hide. Drag the handle down (`left_click_drag`) to go back to peek. Drag the head up to expand.
- Tap "Venta": the button turns blue and only sale listings remain. With the header chips (still there until Task 5), turn on "Apto crédito" and "4+" until nothing matches: the empty state shows "No hay propiedades con esos filtros a 5 cuadras." and "Limpiar filtros", which resets everything.
- No horizontal page scroll: `javascript_tool` → `document.documentElement.scrollWidth <= innerWidth` is `true`. No console errors.

- [ ] **Step 7: Run the tests and commit**

Run: `npm test`
Expected: PASS.

```bash
git add public/index.html public/app.css public/app.js
git commit -m "Reemplazar el carrusel por un panel inferior con lista desplegable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Filters sheet and dialog helper

**Files:**
- Modify: `public/index.html` (remove the header filter row, add the scrim and filters sheet, unhide `#filtersBtn`)
- Modify: `public/app.css` (remove `.filters` and `.chip` rules, add "Botones" and "Hoja de filtros" sections)
- Modify: `public/app.js` (dialog helper, filters wiring, "Ver N propiedades" count)

**Interfaces:**
- Consumes: `setDock`, `syncFilterControls`, `clearFilters`, `renderDock` from Task 4.
- Produces (in `app.js`): `openDialog(el: HTMLElement, opts?: { soft?: boolean }): void`, `closeDialog(restore = true): void`, and module-level `openDlg: null | { el, back, modal }`. Task 6 uses these for the detail sheet, and Task 7 replaces both functions with versions that know about the desktop panel. Markup ids: `#scrim`, `#filtersSheet`, `#filtersApply`, `#filtersClear`. CSS classes `.btn`, `.btn.ghost` and `.icon-btn` are shared with Task 6.

- [ ] **Step 1: Markup**

In `public/index.html`, delete the whole `<div class="filters" role="toolbar" aria-label="Filtros">…</div>` from the header (only the pill remains inside `<header class="top">`). Remove the `hidden` attribute from `<button class="dock-filters" id="filtersBtn" …>`. After the closing `</section>` of the dock, add:

```html
<div class="scrim" id="scrim" hidden></div>
<section class="fsheet" id="filtersSheet" role="dialog" aria-modal="true" aria-labelledby="filtersTitle" hidden>
  <header class="fsheet-head"><h2 id="filtersTitle">Filtros</h2><button type="button" class="icon-btn" data-close data-autofocus aria-label="Cerrar filtros">×</button></header>
  <fieldset class="fgroup"><legend>Ambientes</legend>
    <div class="seg light">
      <button type="button" data-amb="0" aria-pressed="true">Todos</button>
      <button type="button" data-amb="1" aria-pressed="false">1</button>
      <button type="button" data-amb="2" aria-pressed="false">2</button>
      <button type="button" data-amb="3" aria-pressed="false">3</button>
      <button type="button" data-amb="4" aria-pressed="false">4+</button>
    </div>
  </fieldset>
  <fieldset class="fgroup"><legend>Mostrar solo</legend>
    <button type="button" class="toggle" data-flag="fav" aria-pressed="false"><span>Guardadas</span><i aria-hidden="true"></i></button>
    <button type="button" class="toggle" data-flag="pets" aria-pressed="false"><span>Acepta mascotas</span><i aria-hidden="true"></i></button>
    <button type="button" class="toggle" data-flag="cred" aria-pressed="false"><span>Apto crédito</span><i aria-hidden="true"></i></button>
  </fieldset>
  <footer class="fsheet-foot"><button type="button" class="btn ghost" id="filtersClear">Limpiar</button><button type="button" class="btn" id="filtersApply">Ver propiedades</button></footer>
</section>
```

- [ ] **Step 2: Styles**

In `public/app.css`, delete from the "Barra superior" section the rules `.filters { … }`, `.filters::-webkit-scrollbar { … }`, the three `.filters .seg…` rules from Task 4, `.chip { … }` and `.chip[aria-pressed="true"] { … }`. In the "Ficha" section, delete the `.btn { … }` and `.btn.ghost { … }` rules (the old detail keeps working with the new ones below). Append:

```css
/* ---------- Botones ---------- */
.btn {
  flex: 1; min-height: 50px; border: 0; border-radius: 14px; padding: 0 16px; font-weight: 800; font-size: 15px;
  background: var(--fg); color: var(--bg); display: grid; place-items: center; text-align: center; text-decoration: none;
}
.btn.ghost { background: transparent; border: 2px solid var(--fg); color: var(--fg); }
.icon-btn { flex: none; width: 44px; height: 44px; border: 0; border-radius: 12px; background: var(--bg); color: var(--fg); font-size: 22px; line-height: 1; display: grid; place-items: center; }

/* ---------- Hoja de filtros ---------- */
.scrim { position: fixed; inset: 0; z-index: 30; background: rgba(10, 14, 16, .45); animation: fade .2s; }
.scrim.soft { background: rgba(10, 14, 16, .18); }
@keyframes fade { from { opacity: 0; } }
.fsheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 31; max-width: 560px; max-height: 90dvh; overflow-y: auto; margin: 0 auto;
  background: var(--surface); color: var(--fg); border-radius: 24px 24px 0 0; box-shadow: var(--shadow);
  padding: 10px 16px calc(env(safe-area-inset-bottom, 0px) + 16px); animation: up .28s cubic-bezier(.2,.8,.2,1);
}
.fsheet-head { display: flex; align-items: center; justify-content: space-between; }
.fsheet-head h2 { margin: 0; font: 800 28px/1 var(--display); letter-spacing: .02em; text-transform: uppercase; }
.fgroup { border: 0; margin: 16px 0 0; padding: 0; min-width: 0; }
.fgroup legend { padding: 0; margin-bottom: 8px; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.seg.light { display: flex; gap: 6px; }
.seg.light button { flex: 1; min-height: 44px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); font-weight: 700; }
.seg.light button[aria-pressed="true"] { background: var(--fg); color: var(--bg); border-color: var(--fg); }
.toggle { width: 100%; min-height: 52px; padding: 0 2px; display: flex; align-items: center; justify-content: space-between; border: 0; border-bottom: 1px solid var(--line); background: none; font-size: 15px; font-weight: 600; text-align: left; }
.toggle i { position: relative; flex: none; width: 44px; height: 26px; border-radius: 13px; background: var(--line); transition: background .15s; }
.toggle i::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: transform .15s; }
.toggle[aria-pressed="true"] i { background: var(--fg); }
.toggle[aria-pressed="true"] i::after { transform: translateX(18px); }
.fsheet-foot { display: flex; gap: 10px; margin-top: 20px; }
```

(`@keyframes up` already exists in the "Ficha" section until Task 6, which redefines it.)

- [ ] **Step 3: Dialog helper and wiring**

In `public/app.js`, add this section just before `// ---------- Panel inferior ----------`:

```js
// ---------- Diálogos (hoja de filtros y ficha) ----------
let openDlg = null;
function openDialog(el, { soft = false } = {}) {
  closeDialog(false);
  openDlg = { el, back: document.activeElement, modal: true };
  el.hidden = false;
  $('#scrim').hidden = false; $('#scrim').classList.toggle('soft', soft);
  setDock('hidden');
  const first = [...el.querySelectorAll('[data-autofocus]')].find(x => x.offsetParent !== null) || el.querySelector('button, a[href]');
  first?.focus();
}
function closeDialog(restore = true) {
  if (!openDlg) return;
  const { el, back } = openDlg; openDlg = null;
  el.hidden = true; $('#scrim').hidden = true;
  setDock('peek');
  if (restore && back?.isConnected) back.focus();
}
addEventListener('keydown', e => {
  if (!openDlg) return;
  if (e.key === 'Escape') { e.preventDefault(); closeDialog(); return; }
  if (e.key !== 'Tab' || !openDlg.modal) return;
  const f = [...openDlg.el.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
document.addEventListener('click', e => { if (openDlg && e.target.closest('[data-close]')) closeDialog(); });
$('#scrim').onclick = () => closeDialog();
$('#filtersBtn').onclick = () => openDialog($('#filtersSheet'));
$('#filtersApply').onclick = () => closeDialog();
$('#filtersClear').onclick = () => clearFilters(false);
```

At the end of `renderDock`, just after `$('#countLabel').innerHTML = …;` (before `const top = …`), add:

```js
  $('#filtersApply').textContent = n === 1 ? 'Ver 1 propiedad' : `Ver ${n} propiedades`;
```

- [ ] **Step 4: Check in the browser**

Reload at `mobile` width and wait 9 s.
Expected:
- The header shows only the pill.
- Tap "Filtros": the sheet opens from the bottom, the map dims, the dock hides and focus is on ×. Tap "2", then "Acepta mascotas": both show pressed, the button reads "Ver N propiedades" with a live count, and after closing the dock badge shows `2`.
- "Limpiar" resets ambientes and the toggles but not Venta/Alquiler. Escape, ×, tapping the dim area and "Ver N" all close it and focus returns to "Filtros".
- Tab from the last button wraps to ×. No console errors.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.css public/app.js
git commit -m "Mover los filtros a una hoja con contador de filtros activos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Listing detail sheet

**Files:**
- Modify: `public/index.html` (remove `#sheetBg`, update `#sheet`)
- Modify: `public/app.css` (replace the "Ficha" section)
- Modify: `public/app.js` (`openSheet`, `select`, `focusPin`, `sheetGesture`; remove `closeSheet`, `dash` and the old Escape handler)

**Interfaces:**
- Consumes: `openDialog(el, { soft })`, `closeDialog()` from Task 5; `priceAmount, priceSuffix, expLabel, perM2, opLabel, signLabel, presentFacts, featureList, normalizeCaps, walkMin, fmtM, esc, dist` from `ui.js`; `drawFacade` from `demo.js`.
- Produces (in `app.js`): `openSheet(p): void`, `select(id: string): void` (no pan argument any more), `focusPin(p): void` (Task 7 replaces it with a desktop-aware version). The markup has `.back[data-close][data-autofocus]` in the hero, hidden on mobile and shown by Task 7's desktop CSS.

- [ ] **Step 1: Markup**

In `public/index.html`, replace

```html
<div class="sheet-bg" id="sheetBg" hidden></div>
<article class="sheet" id="sheet" hidden aria-modal="true" role="dialog"></article>
```

with

```html
<article class="sheet" id="sheet" role="dialog" aria-modal="true" hidden></article>
```

- [ ] **Step 2: Styles**

In `public/app.css`, replace the whole "Ficha" section (from `/* ---------- Ficha ---------- */` up to the start of the "Botones" section) with:

```css
/* ---------- Ficha ---------- */
.sheet {
  position: fixed; left: 0; right: 0; bottom: 0; top: calc(env(safe-area-inset-top, 0px) + 150px); z-index: 31; max-width: 560px; margin: 0 auto;
  background: var(--surface); color: var(--fg); border-radius: 24px 24px 0 0; box-shadow: 0 -8px 30px rgba(0,0,0,.25);
  display: flex; flex-direction: column; overflow: hidden; animation: up .28s cubic-bezier(.2,.8,.2,1); transition: transform .2s;
}
.sheet[hidden] { display: none; }
.sheet.dragging { transition: none; }
@keyframes up { from { transform: translateY(40px); opacity: .4; } }
.sheet-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.hero { position: relative; height: 180px; background: var(--bg); touch-action: none; }
.hero canvas, .hero img { display: block; width: 100%; height: 100%; object-fit: cover; }
.hero .grab { position: absolute; top: 8px; left: 50%; width: 36px; height: 5px; margin-left: -18px; border-radius: 3px; background: rgba(255,255,255,.85); box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.hero .close { position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,.55); color: #fff; }
.hero .sign { position: absolute; left: 16px; bottom: -16px; font: 800 20px/1 var(--display); padding: 7px 10px 5px; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,.2); }
.back { display: none; }
.inner { padding: 30px 16px 20px; display: flex; flex-direction: column; gap: 14px; }
.det-price { margin: 0; font: 800 34px/1 var(--display); font-variant-numeric: tabular-nums; }
.det-price small { font: 600 14px var(--body); margin-left: 3px; }
.det-sub { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
.det-where { margin: 0; font-size: 16px; font-weight: 700; }
.facts { display: flex; gap: 6px; }
.facts div { flex: 1; padding: 8px 4px; border-radius: 12px; background: var(--bg); text-align: center; font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
.facts b { display: block; font: 800 22px/1.1 var(--display); color: var(--fg); font-variant-numeric: tabular-nums; letter-spacing: 0; text-transform: none; }
.feats { display: flex; flex-wrap: wrap; gap: 6px; }
.feats span { border: 1px solid var(--line); border-radius: 999px; padding: 5px 10px; font-size: 13px; }
.desc { margin: 0; max-width: 62ch; font-size: 15px; line-height: 1.55; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; }
.desc.open { display: block; }
.more { min-height: 44px; padding: 0; border: 0; background: none; font-weight: 700; color: var(--venta-text); }
.agent { border-top: 1px solid var(--line); padding-top: 14px; font-size: 13px; color: var(--muted); }
.agent b { display: block; color: var(--fg); font-size: 14px; }
.agent .contact { user-select: all; color: var(--fg); }
.actbar { display: flex; gap: 8px; padding: 10px 12px calc(env(safe-area-inset-bottom, 0px) + 12px); border-top: 1px solid var(--line); background: var(--surface); }
.actbar .save { flex: none; width: 50px; padding: 0; font-size: 20px; }
.actbar .main { flex: 1.4; }
```

- [ ] **Step 3: Rewrite `openSheet` and remove the old sheet code**

In `public/app.js`, add `priceAmount, priceSuffix, perM2, opLabel, signLabel, presentFacts, featureList, normalizeCaps` to the `ui.js` import if they aren't there yet. Delete `const dash = …`. Replace the whole `// ---------- Ficha ----------` section, from `function openSheet(p) {` through `addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });` (this removes `closeSheet`, the `#sheetBg` handler and the old Escape handler), with:

```js
// ---------- Ficha ----------
function openSheet(p) {
  state.seen.add(p.id); store.set('cuadra.seen', [...state.seen]);
  const d = state.pos ? dist(state.pos, p) : 0;
  const fav = state.favs.has(p.id), facts = presentFacts(p), feats = featureList(p), m2 = perM2(p);
  const contact = p.source === 'demo' ? 'Aviso de ejemplo generado para esta demo'
    : [p.phone, p.email].filter(Boolean).map(c => `<span class="contact">${esc(c)}</span>`).join(' · ')
      + (p.alsoBy?.length ? `<br>También la publica: ${p.alsoBy.map(esc).join(', ')}` : '');
  const sh = $('#sheet');
  sh.dataset.id = p.id;
  sh.setAttribute('aria-label', `${p.type} en ${opLabel(p)}, ${p.address}`);
  sh.innerHTML = `<div class="sheet-scroll">
      <div class="hero">${p.photos?.length ? `<img src="${esc(p.photos[0])}" alt="Foto de ${esc(p.address)}">` : '<canvas></canvas>'}
        <span class="grab" aria-hidden="true"></span>
        <button type="button" class="back" data-close data-autofocus>← Volver</button>
        <button type="button" class="icon-btn close" data-close data-autofocus aria-label="Cerrar">×</button>
        <span class="sign tag ${p.op}">${signLabel(p)}</span></div>
      <div class="inner">
        <div><p class="det-price">${esc(priceAmount(p))}<small>${priceSuffix(p)}</small></p>
          <p class="det-sub">${expLabel(p, ' de expensas')}${m2 ? ` · ${m2}` : ''}${p.days != null ? ` · publicado hace ${p.days} ${p.days === 1 ? 'día' : 'días'}` : ''}</p></div>
        <div><p class="det-where">${esc(p.address)}${p.piso ? ', ' + esc(p.piso) : ''}</p>
          <p class="det-sub">${esc(p.type)}${p.zone ? ' en ' + esc(p.zone) : ''} · a ${fmtM(d)}, ${walkMin(d)} min caminando</p></div>
        ${facts.length ? `<div class="facts">${facts.map(f => `<div><b>${esc(f.value)}</b>${esc(f.label)}</div>`).join('')}</div>` : ''}
        ${feats.length ? `<div class="feats">${feats.map(f => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
        ${p.desc ? `<div><p class="desc">${esc(normalizeCaps(p.desc))}</p><button type="button" class="more" hidden>Leer más</button></div>` : ''}
        <div class="agent"><b>${esc(p.agent)}</b>${contact}</div>
      </div>
    </div>
    <div class="actbar">
      <button type="button" class="btn ghost save" id="favBtn" aria-pressed="${fav}" aria-label="Guardar">${fav ? '♥' : '♡'}</button>
      ${p.url ? `<a class="btn ghost" target="_blank" rel="noopener" href="${esc(p.url)}">Ver aviso</a>` : ''}
      <a class="btn main" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${p.lat.toFixed(6)},${p.lng.toFixed(6)}">Cómo llegar</a>
    </div>`;
  openDialog(sh, { soft: true });
  requestAnimationFrame(() => {
    const cv = sh.querySelector('.hero canvas'); if (cv) drawFacade(cv, p);
    const desc = sh.querySelector('.desc');
    if (desc && desc.scrollHeight > desc.clientHeight + 2) sh.querySelector('.more').hidden = false;
  });
  sh.querySelector('.more')?.addEventListener('click', e => {
    const open = sh.querySelector('.desc').classList.toggle('open');
    e.currentTarget.textContent = open ? 'Leer menos' : 'Leer más';
  });
  sh.querySelector('#favBtn').onclick = e => {
    if (state.favs.has(p.id)) state.favs.delete(p.id); else state.favs.add(p.id);
    store.set('cuadra.favs', [...state.favs]);
    const on = state.favs.has(p.id);
    e.currentTarget.textContent = on ? '♥' : '♡'; e.currentTarget.setAttribute('aria-pressed', on);
    render();
  };
  sheetGesture(sh);
  focusPin(p);
}
// Arrastrar la foto hacia abajo cierra la ficha.
function sheetGesture(sh) {
  const hero = sh.querySelector('.hero');
  let y0 = null, dy = 0;
  hero.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || !openDlg?.modal) return;
    y0 = e.clientY; dy = 0; hero.setPointerCapture(e.pointerId); sh.classList.add('dragging');
  });
  hero.addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = `translateY(${dy}px)`; });
  const end = () => { if (y0 == null) return; y0 = null; sh.classList.remove('dragging'); sh.style.transform = ''; if (dy > 80) closeDialog(); };
  hero.addEventListener('pointerup', end); hero.addEventListener('pointercancel', end);
}
// Centra el pin en la franja de mapa que queda visible arriba de la ficha.
function focusPin(p) {
  state.follow = false;
  const target = map.project([p.lat, p.lng]).add([0, map.getSize().y / 2 - 75]);
  map.panTo(map.unproject(target), { animate: true });
}
```

- [ ] **Step 4: Simplify `select` and its callers**

Replace the `select` function with:

```js
function select(id) {
  state.sel = id; render();
  document.querySelector(`.card[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
```

Change the three callers from `select(p.id, true); openSheet(p);` to `select(p.id); openSheet(p);`: the marker click in `render()`, `b.onclick` in `cardEl`, and `el.onclick` in `passingAlert`.

- [ ] **Step 5: Check in the browser**

Reload at `mobile` width and wait 9 s.
Expected:
- Tap the dock card: the sheet rises, leaving about 150 px of map on top with the selected pin inside that strip. The dock and map buttons hide.
- For a crawled listing: the photo, a sign overlapping the hero, a 34 px price, and only real facts (open a listing with no `amb` and confirm there's no "—" tile). An ALL-CAPS description shows in sentence case, clamped to 4 lines with "Leer más" when longer.
- The action bar stays pinned while the content scrolls.
- ♡ toggles to ♥, the card gains "♥ ", and it survives a reload.
- Escape, ×, tapping the map strip and dragging the photo down (`left_click_drag` from y≈200 to y≈400) all close it. Focus returns to the card.
- Tap 🚶 until a demo listing opens: it says "Aviso de ejemplo generado para esta demo" and shows the facade. No console errors.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/app.css public/app.js
git commit -m "Rehacer la ficha: solo datos presentes, textos en mayúsculas legibles y acciones fijas abajo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Desktop layout (≥ 900 px)

**Files:**
- Modify: `public/app.css` (append the desktop media query)
- Modify: `public/app.js` (`desktop` media query, `placeLayout`, desktop-aware `openDialog`, `closeDialog`, `focusPin`, `toggleDock`)

**Interfaces:**
- Consumes: everything from Tasks 4–6.
- Produces: `desktop: MediaQueryList` and `placeLayout(): void` in `app.js`. On desktop `#filtersSheet` lives inside `#dock` (before `#dockList`) and `#sheet` is the last child of `#dock`; on mobile both are direct children of `<body>`. The `.dock.detail` and `body.detail-open` classes mark an open detail on desktop.

- [ ] **Step 1: Desktop styles**

Append to `public/app.css`:

```css
/* ---------- Escritorio: el panel pasa a la izquierda con filtros y lista; la ficha se abre adentro ---------- */
@media (min-width: 900px) {
  .top { right: auto; width: 380px; padding: 16px 16px 0; z-index: 13; }
  .dock {
    top: 0; bottom: 0; left: 0; right: auto; width: 380px; max-width: none; margin: 0; border-radius: 0;
    padding: 76px 16px 16px; box-shadow: 4px 0 24px rgba(0,0,0,.2); transform: none !important; pointer-events: auto !important;
  }
  .dock-grab, .dock-filters { display: none; }
  .dock-head { order: 1; cursor: default; }
  .dock .seg { order: 2; margin-bottom: 14px; }
  .dock .fsheet { order: 3; }
  .dock-list { order: 4; flex: 1; min-height: 0; overflow-y: auto !important; max-height: none !important; }
  .dock .card { display: flex !important; }
  .dock .fsheet {
    position: static; display: block; max-width: none; max-height: none; margin: 0; padding: 0 0 12px; overflow: visible;
    background: none; color: #fff; border-radius: 0; box-shadow: none; animation: none;
  }
  .dock .fsheet-head, .dock #filtersApply { display: none; }
  .dock .fgroup { margin: 0 0 12px; }
  .dock .fgroup legend { color: rgba(255,255,255,.6); }
  .dock .seg.light button { background: var(--ink-2); border-color: transparent; color: #fff; }
  .dock .seg.light button[aria-pressed="true"] { background: #fff; color: var(--ink); }
  .dock .toggle { min-height: 44px; color: #fff; border-color: rgba(255,255,255,.12); font-size: 14px; }
  .dock .toggle i { background: #3a4447; }
  .dock .toggle[aria-pressed="true"] i { background: #fff; }
  .dock .toggle[aria-pressed="true"] i::after { background: var(--ink); }
  .dock .fsheet-foot { margin-top: 8px; }
  .dock #filtersClear { flex: none; min-height: 44px; border-color: rgba(255,255,255,.4); color: #fff; }
  .dock.detail { padding: 0; }
  .dock.detail > :not(.sheet) { display: none !important; }
  .detail-open .top { display: none; }
  .dock .sheet { position: static; order: 5; flex: 1; min-height: 0; max-width: none; margin: 0; border-radius: 0; box-shadow: none; animation: none; transform: none !important; }
  .dock .hero { touch-action: auto; }
  .dock .hero .grab, .dock .hero .close { display: none; }
  .dock .back {
    display: flex; align-items: center; position: absolute; top: 12px; left: 12px; min-height: 44px; padding: 0 14px;
    border: 0; border-radius: 12px; background: rgba(0,0,0,.6); color: #fff; font-weight: 700;
  }
  .fabs { right: 16px; bottom: 24px; }
  body[data-dock] .fabs { display: flex; }
  .leaflet-bottom.leaflet-right { bottom: 0; }
  #alertWrap { left: calc(380px + (100vw - 380px) / 2); right: auto; width: min(420px, calc(100vw - 420px)); transform: translateX(-50%); }
  .scrim { display: none; }
}
```

- [ ] **Step 2: Desktop-aware layout and dialogs**

In `public/app.js`, add at the top of the `// ---------- Diálogos …` section:

```js
const desktop = matchMedia('(min-width: 900px)');
// En escritorio la hoja de filtros queda fija dentro del panel y la ficha se abre en el panel; en el teléfono son hojas sobre el mapa.
function placeLayout() {
  closeDialog(false);
  const fs = $('#filtersSheet'), sh = $('#sheet');
  if (desktop.matches) {
    $('#dockList').before(fs); $('#dock').append(sh);
    fs.hidden = false; fs.setAttribute('role', 'group'); fs.removeAttribute('aria-modal');
  } else {
    document.body.append(fs, sh);
    fs.hidden = true; fs.setAttribute('role', 'dialog'); fs.setAttribute('aria-modal', 'true');
  }
  setDock(desktop.matches ? 'expanded' : 'peek');
}
```

Replace `openDialog` and `closeDialog` with:

```js
function openDialog(el, { soft = false } = {}) {
  closeDialog(false);
  const inPanel = desktop.matches;
  openDlg = { el, back: document.activeElement, modal: !inPanel };
  el.hidden = false;
  if (inPanel) {
    $('#dock').classList.add('detail'); document.body.classList.add('detail-open');
    el.querySelector('.sheet-scroll')?.scrollTo(0, 0);
  } else {
    $('#scrim').hidden = false; $('#scrim').classList.toggle('soft', soft);
    setDock('hidden');
  }
  const first = [...el.querySelectorAll('[data-autofocus]')].find(x => x.offsetParent !== null) || el.querySelector('button, a[href]');
  first?.focus();
}
function closeDialog(restore = true) {
  if (!openDlg) return;
  const { el, back } = openDlg; openDlg = null;
  el.hidden = true; $('#scrim').hidden = true;
  $('#dock').classList.remove('detail'); document.body.classList.remove('detail-open');
  if (!desktop.matches) setDock('peek');
  if (restore && back?.isConnected) back.focus();
}
```

Replace `focusPin` with:

```js
// Centra el pin en la parte del mapa que se ve: arriba de la ficha en el teléfono, a la derecha del panel en escritorio.
function focusPin(p) {
  state.follow = false;
  const shift = desktop.matches ? [-190, 0] : [0, map.getSize().y / 2 - 75];
  map.panTo(map.unproject(map.project([p.lat, p.lng]).add(shift)), { animate: true });
}
```

Replace `toggleDock` with:

```js
function toggleDock() { if (!desktop.matches) setDock($('#dock').dataset.state === 'expanded' ? 'peek' : 'expanded'); }
```

At the end of the `// ---------- Panel inferior ----------` section, replace the final `setDock('peek');` with:

```js
desktop.addEventListener('change', placeLayout);
placeLayout();
```

(`placeLayout` goes after the panel code because it calls `setDock`, and after the dialog section because it calls `closeDialog`. Both are function declarations, so hoisting covers it; `desktop` is declared in the dialog section, which sits above the panel section.)

- [ ] **Step 3: Check desktop in the browser**

`resize_window {width: 1280, height: 800}` and reload. Wait 9 s.
Expected:
- A dark 380 px left panel with the pill at the top, then the count, Todo / Venta / Alquiler, the filters inline (Ambientes and the three toggles, plus "Limpiar") and a scrollable list of every card. The map fills the rest, and the map buttons sit bottom right.
- Click a card: the detail replaces the panel content with "← Volver" on the photo, the map stays fully visible, and the selected pin sits centered in the map area right of the panel.
- "← Volver" and Escape return to the list. A proximity alert (walk mode) appears centered over the map, at most 420 px wide.

- [ ] **Step 4: Check tablet**

`resize_window {preset: "tablet"}` and reload.
Expected: the mobile layout, with the dock and sheets centered at 560 px wide.

- [ ] **Step 5: Check crossing the breakpoint with sheets open (Review Focus #5)**

At 1280 px, open a detail, then `resize_window {preset: "mobile"}`.
Expected: the detail closes, the dock is back in peek with the same filters, and there's no scrim or blank area.
At mobile width, open the filters sheet, turn on "Apto crédito", then `resize_window {width: 1280, height: 800}`.
Expected: the filters are inline in the panel with "Apto crédito" still on, and there's no scrim.
Return to mobile and reload: `document.body.dataset.dock === 'peek'`. No console errors in any step.

- [ ] **Step 6: Commit**

```bash
git add public/app.css public/app.js
git commit -m "Diseño de escritorio: panel izquierdo con filtros, lista y ficha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Dark mode, reduced motion, accessibility pass, README

**Files:**
- Modify: `public/app.css` (dark-mode dock edge)
- Modify: `README.md` (frontend line)

**Interfaces:**
- Consumes: the finished UI from Tasks 3–7.
- Produces: nothing new. This is the final verification gate.

- [ ] **Step 1: Separate the dark dock from the dark map**

Append to `public/app.css`:

```css
/* ---------- Tema oscuro: el panel también es oscuro, así que lo separamos del mapa con un borde ---------- */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .dock, :root:not([data-theme="light"]) .alert.info { box-shadow: 0 0 0 1px rgba(255,255,255,.1), 0 10px 30px rgba(0,0,0,.5); }
}
:root[data-theme="dark"] .dock, :root[data-theme="dark"] .alert.info { box-shadow: 0 0 0 1px rgba(255,255,255,.1), 0 10px 30px rgba(0,0,0,.5); }
```

- [ ] **Step 2: Check the contrast of the color pairs**

Run:

```bash
node -e '
const L=h=>{const c=h.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const R=(a,b)=>{const[x,y]=[L(a),L(b)].sort((m,n)=>n-m);return((x+.05)/(y+.05)).toFixed(2)};
for(const[f,b,n]of[["ffffff","1d4fd8","white on venta"],["2a1f00","e2a400","ink on alquiler"],["ffffff","1b2124","white on ink"],["c2c4c5","262e31","72% white on ink-2"],["5b8bff","1b2124","venta-text on dark surface"],["5d676b","ffffff","muted on surface"]])console.log(n,R(f,b))'
```

Expected: every ratio ≥ 4.5, except that large text (the 30 px alert price and the 24 px card price) only needs ≥ 3. If `72% white on ink-2` comes out below 4.5, raise `.card-meta, .card-addr` and `.dock-count span` from `rgba(255,255,255,.72)` to `rgba(255,255,255,.8)` and run the check again with `d4d5d6`.

- [ ] **Step 3: Check dark mode in the browser**

`resize_window {preset: "mobile", colorScheme: "dark"}` and reload. Wait 9 s.
Expected: dimmed dark map tiles, and the dock visibly separated from the map by its thin edge. Pins and sign tags keep blue `#1d4fd8` with white text and yellow with dark text. Filters and detail sheets use the dark surface with light text, and "Leer más" is the lighter blue. Take a screenshot. Then `resize_window {colorScheme: "light"}`.

- [ ] **Step 4: Check reduced motion**

Run in `javascript_tool`:

```js
[...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } })
  .some(r => r.media?.mediaText.includes('prefers-reduced-motion') && r.cssText.includes('animation: none'))
```

Expected: `true`. The existing `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }` rule covers the new alert, dock, sheets and toggles. Confirm the rule is still in `app.css`.

- [ ] **Step 5: Keyboard-only pass at desktop width**

At 1280 px, reload, click once on the pill to set a starting point, then press Tab repeatedly (`computer {action: "key", text: "Tab"}`), taking a screenshot every few presses.
Expected: a visible focus ring on every control in order (Todo / Venta / Alquiler, ambientes, toggles, Limpiar, cards). Enter on a card opens the detail with focus on "← Volver". Escape closes it and focus returns to the card.
At mobile width, open the detail with Enter on the dock card. Tab cycles only inside the sheet, and Escape returns focus to the card.

- [ ] **Step 6: Final scenario sweep at mobile width**

Reload at `mobile` and go through the spec's scenarios, checking the console for errors after each:
1. The first load falls back to Palermo, and the dark alert explains it.
2. Walk mode: at least one rent (yellow) and one sale (blue) proximity alert.
3. Dock: peek → expand → drag back.
4. Filters: badge count, "Ver N propiedades".
5. Empty state and "Limpiar filtros".
6. Detail of a crawled listing with missing facts and ALL-CAPS text; detail of a demo listing.
7. Save, reload, still saved.
8. `document.documentElement.scrollWidth <= innerWidth` is `true`.

Take a final screenshot at mobile and at desktop.

- [ ] **Step 7: Update the README**

In `README.md`, replace the line

```markdown
- **Frontend:** `public/index.html` (Leaflet + OpenStreetMap, sin build).
```

with

```markdown
- **Frontend:** `public/` sin build: `index.html` (estructura), `app.css` (estilos), `app.js` (mapa, panel, fichas, ubicación), `ui.js` (formatos y filtros, con pruebas en `test/ui.test.mjs`) y `demo.js` (avisos de ejemplo y fachadas ilustradas). Leaflet + OpenStreetMap.
```

- [ ] **Step 8: Run the tests and commit**

Run: `npm test`
Expected: PASS, 0 failures.

```bash
git add public/app.css README.md
git commit -m "Tema oscuro del panel, verificación final y README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
