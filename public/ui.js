// Funciones puras de presentación y filtros. Sin DOM ni Leaflet: las usa app.js y las prueba test/ui.test.mjs.
export const RADIUS = 500; // m: lo que cuenta como "cerca tuyo"
export const NEAR = 45;    // m: distancia del aviso "estás pasando"
// Con avisos reales el radio se agranda hasta encontrar al menos MIN_NEAR avisos.
export const STEPS = [500, 1000, 2000, 5000];
export const MIN_NEAR = 5;
export const pickRadius = (distances, steps = STEPS, min = MIN_NEAR) => steps.find(r => distances.filter(d => d <= r).length >= min) ?? steps.at(-1);
export const radiusLabel = m => m < 1000 ? `${Math.round(m / 100)} cuadras` : `${String(m / 1000).replace('.', ',')} km`;
export const zoomForRadius = m => ({ 500: 17, 1000: 16, 2000: 15, 5000: 14 })[m] ?? 14;

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
// Límites Unicode: \b solo conoce letras ASCII, así que en "cabañas" la ñ contaría como fin de palabra.
const ACRONYMS = /(?<![\p{L}\p{N}])(ph|sum|caba|usd)(?![\p{L}\p{N}])/gu;
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
