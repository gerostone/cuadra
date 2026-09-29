// Avisos de ejemplo (deterministas por zona, para cuando no hay datos del crawler) y fachadas ilustradas para las fichas sin foto.
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash2 = (x, y) => { let h = 2166136261 ^ x; h = Math.imul(h ^ y, 16777619); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); return h ^ (h >>> 15); };
const pick = (r, a) => a[Math.floor(r() * a.length)];
const hashStr = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

// ---------- Generador de avisos (datos de ejemplo, deterministas por zona) ----------
export const CELL = 0.0012; // ~130 m
const STREETS = ['Av. Corrientes','Gorriti','Honduras','Thames','Malabia','Armenia','Gurruchaga','Costa Rica','Nicaragua','Soler','Charcas','Guatemala','Paraguay','Av. Scalabrini Ortiz','Julián Álvarez','Serrano','Uriarte','Fitz Roy','Humboldt','Bonpland','Av. Córdoba','Cabrera','El Salvador','Jufré','Aguirre','Acevedo','Murillo','Av. Warnes','Loyola','Vera','Padilla','Castillo'];
const TYPES = [['Departamento', .62], ['PH', .2], ['Casa', .1], ['Monoambiente', .08]];
const FEATS = ['Balcón','Terraza propia','Patio','Luminoso','Cochera','Amenities','Parrilla','Lavadero','A estrenar','Frente','Contrafrente','Pileta','Laundry','Seguridad 24 h','Cocina integrada','Placard en dormitorios'];
const AGENTS = ['Inmobiliaria Del Barrio','Propiedades Gorriti','Estudio Soler Bienes Raíces','Palermo Viejo Propiedades','Dueño directo','Casa Nueva Negocios Inmobiliarios'];
const DESCS = [
  'Muy luminoso, con vista abierta y ventilación cruzada. Pisos de madera en todos los ambientes. A dos cuadras del subte y rodeado de cafés.',
  'Reciclado a nuevo con materiales de primera. Cocina separada con lavadero incorporado. Edificio con encargado y bajas expensas.',
  'Planta baja al frente con patio propio. Ideal para quien busca tranquilidad sin alejarse del movimiento del barrio.',
  'En edificio de categoría con amenities: SUM, parrilla y solárium. Balcón corrido con orientación norte.',
  'PH en primer piso por escalera, sin expensas. Terraza propia con parrilla. Techos altos y mucha personalidad.',
  'Frente a plaza, sobre cuadra arbolada. Dormitorios con placard, baño completo con ventilación natural.'
];
const cache = new Map();
export function listingsInCell(cx, cy) {
  const key = cx + ':' + cy;
  if (cache.has(key)) return cache.get(key);
  const r = mulberry(hash2(cx, cy));
  const n = r() < .62 ? 0 : r() < .85 ? 1 : 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const op = r() < .55 ? 'venta' : 'alquiler';
    let x = r(), type = TYPES[0][0];
    for (const [t, w] of TYPES) { if (x < w) { type = t; break; } x -= w; }
    let amb = type === 'Monoambiente' ? 1 : type === 'Casa' ? 3 + Math.floor(r() * 3) : 1 + Math.floor(r() * 4);
    if (type !== 'Monoambiente' && amb === 1) amb = 2;
    const m2 = Math.round((amb === 1 ? 28 : amb * 22 + 10) * (0.85 + r() * .45) * (type === 'Casa' ? 1.5 : 1));
    const m2tot = Math.round(m2 * (1 + (type === 'Departamento' ? r() * .15 : r() * .6)));
    const price = op === 'venta'
      ? Math.round(m2 * (1900 + r() * 1500) / 1000) * 1000
      : Math.round(m2 * (9000 + r() * 6000) / 10000) * 10000;
    const exp = type === 'PH' || type === 'Casa' ? 0 : Math.round((50000 + m2 * 1500 * (0.6 + r())) / 1000) * 1000;
    const feats = [...FEATS].sort(() => r() - .5).slice(0, 3 + Math.floor(r() * 3));
    out.push({
      id: `${cx}_${cy}_${i}`, op, type, amb, m2, m2tot, price, exp,
      banos: amb >= 4 ? 2 : 1, antig: r() < .15 ? 0 : Math.floor(r() * 60),
      lat: (cy + .1 + r() * .8) * CELL, lng: (cx + .1 + r() * .8) * CELL,
      street: pick(r, STREETS), num: 100 + Math.floor(r() * 5800),
      piso: type === 'Departamento' || type === 'Monoambiente' ? `${1 + Math.floor(r() * 12)}° ${pick(r, ['A','B','C','D'])}` : type === 'PH' ? pick(r, ['PB','1° por escalera','Al fondo']) : '',
      feats, mascotas: r() < .5, credito: op === 'venta' && r() < .45,
      desc: type === 'PH' ? DESCS[4] : pick(r, DESCS.filter((_, i) => i !== 4)), agent: pick(r, AGENTS), days: 1 + Math.floor(r() * 40),
      hue: Math.floor(r() * 360), seed: Math.floor(r() * 1e9)
    });
  }
  for (const o of out) Object.assign(o, { address: `${o.street} ${o.num}`, source: 'demo', photos: [], url: null, currency: o.op === 'venta' ? 'USD' : 'ARS' });
  cache.set(key, out);
  return out;
}

// ---------- Fachadas ilustradas ----------
export function drawFacade(cv, p) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth || 92, h = cv.clientHeight || 132;
  cv.width = w * dpr; cv.height = h * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  const r = mulberry(p.seed ?? hashStr(p.id));
  const hue = p.hue ?? hashStr(p.id + 'h') % 360;
  c.fillStyle = `hsl(${200 + r() * 20} 60% ${78 + r() * 10}%)`; c.fillRect(0, 0, w, h);
  const wall = `hsl(${hue} ${18 + r() * 25}% ${62 + r() * 20}%)`;
  const top = h * (p.type === 'Casa' || p.type === 'PH' ? .32 : .08);
  c.fillStyle = wall; c.fillRect(w * .06, top, w * .88, h - top);
  c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(w * .06, top, w * .88, 4);
  const cols = w > 150 ? 5 : 3, rows = Math.max(2, Math.floor((h - top) / 34));
  const cw = w * .88 / cols;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const wx = w * .06 + x * cw + cw * .2, wy = top + 12 + y * ((h - top - 24) / rows);
    const ww = cw * .6, wh = Math.min(22, (h - top) / rows - 10);
    c.fillStyle = r() < .3 ? '#f6dd8a' : `hsl(210 25% ${22 + r() * 18}%)`; c.fillRect(wx, wy, ww, wh);
    if (r() < .35) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(wx - 3, wy + wh, ww + 6, 3); }
  }
  // árbol de vereda
  c.fillStyle = `hsl(${100 + r() * 30} 35% ${32 + r() * 10}%)`;
  c.beginPath(); c.arc(w * (r() < .5 ? .15 : .85), h * .72, w * .2, 0, 7); c.fill();
  c.fillStyle = '#9aa0a3'; c.fillRect(0, h - 8, w, 8);
  // cartel
  c.fillStyle = p.op === 'venta' ? '#1d4fd8' : '#e2a400';
  c.fillRect(w * .5 - 18, top + (h - top) * .45, 36, 18);
  c.fillStyle = p.op === 'venta' ? '#fff' : '#2a1f00'; c.font = '800 9px Barlow Condensed, sans-serif'; c.textAlign = 'center';
  c.fillText(p.op === 'venta' ? 'VENDE' : 'ALQUILA', w * .5, top + (h - top) * .45 + 12.5);
}
