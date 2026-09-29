// Extractores de avisos desde la ficha HTML de una inmobiliaria.
// Cada extractor busca la ubicación real de la propiedad y devuelve avisos
// en el formato de Cuadra. Si no encuentra coordenadas de la propiedad, no
// devuelve nada: preferimos no mostrar un pin a mostrarlo en el lugar equivocado.
import { normalizeProperty } from '../lib/tokko.mjs';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#039': "'" };
export const decode = s => String(s ?? '')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e.toLowerCase()] ?? m;
  });
const text = s => decode(String(s ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const num = v => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  // "1.250.000" (miles con punto) o "59,25" (decimal con coma)
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};
// Rango aproximado de Argentina, para descartar coordenadas vacías o de otro lado.
const inArgentina = (lat, lng) => lat < -21 && lat > -56 && lng < -53 && lng > -74;

const meta = (html, prop) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
  const m = html.match(re);
  return m ? decode(m[1] ?? m[2]) : '';
};

export function guessOp(s) {
  const t = String(s).toLowerCase();
  if (/alquiler|alquila|rent/.test(t)) return 'alquiler';
  if (/venta|vende|sale/.test(t)) return 'venta';
  return null;
}
const TYPES = [['Monoambiente', /monoambiente/i], ['PH', /\bph\b/i], ['Departamento', /departamento|depto/i], ['Casa', /\bcasa\b/i],
  ['Local', /\blocal\b/i], ['Oficina', /oficina/i], ['Terreno', /terreno|lote/i], ['Cochera', /cochera/i], ['Galpón', /galp[oó]n/i]];
export const guessType = s => (TYPES.find(([, re]) => re.test(s)) ?? ['Propiedad'])[0];

export function parsePrice(s) {
  const m = String(s).match(/(U\$S|U\$D|USD|US\$|\$)\s?\$?\s?(\d{1,3}(?:\.\d{3})+|\d{4,})/i);
  // Formato "22.000/USD" o "22.000 USD"
  const after = String(s).match(/(\d{1,3}(?:\.\d{3})+|\d{4,})\s*\/?\s*(USD|U\$S|ARS)\b/i);
  if (!m && after) return { price: num(after[1]), currency: /ARS/i.test(after[2]) ? 'ARS' : 'USD' };
  if (!m) return { price: null, currency: null };
  return { price: num(m[2]), currency: m[1] === '$' ? 'ARS' : 'USD' };
}
const guessAmb = s => num((String(s).match(/(\d+)\s*(?:ambientes|amb\b|amb\.)/i) || [])[1]) ?? (/monoambiente/i.test(s) ? 1 : null);
const guessM2 = s => num((String(s).match(/(\d+(?:[.,]\d+)?)\s*(?:m²|m2|mts2?|metros)/i) || [])[1]);

function base(url, html, agent) {
  const title = meta(html, 'og:title') || text((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]);
  const desc = meta(html, 'og:description') || meta(html, 'description');
  const image = meta(html, 'og:image');
  return { title, desc, image, url, agent };
}

function finish(l) {
  if (l.lat === null || l.lng === null || !inArgentina(l.lat, l.lng)) return null;
  if (!l.op) return null;
  return {
    source: 'web', feats: [], mascotas: false, credito: false, banos: 0, antig: null, exp: 0, days: null, phone: '', email: '', zone: '',
    ...l,
    amb: l.amb ?? 0, m2: l.m2 ?? 0, m2tot: l.m2tot ?? l.m2 ?? 0,
    desc: (l.desc || '').slice(0, 600),
    photos: (l.photos || []).filter(p => /^https?:\/\//.test(p)).slice(0, 8),
  };
}

// ---------- 1. JSON de Tokko incrustado (webs hechas con Tokko) ----------
// El JSON suele venir escapado dentro de un atributo o un <script>. Buscamos
// objetos que tengan "operations" y "geo_lat" en el mismo nivel.
function balancedObjectAround(s, idx) {
  // Retrocede hasta el "{" que abre el objeto que contiene idx.
  let depth = 0, start = -1;
  for (let i = idx; i >= 0; i--) {
    const c = s[i];
    if (c === '}') depth++;
    else if (c === '{') { if (depth === 0) { start = i; break; } depth--; }
  }
  if (start < 0) return null;
  let d = 0, inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return s.slice(start, i + 1); }
  }
  return null;
}
export function extractTokko(url, html, agent) {
  const src = decode(html);
  const out = [];
  const seen = new Set();
  for (const m of src.matchAll(/"operations"\s*:\s*\[/g)) {
    const raw = balancedObjectAround(src, m.index);
    if (!raw || seen.has(raw.length)) continue;
    let obj;
    try { obj = JSON.parse(raw); } catch { continue; }
    if (obj.geo_lat === undefined || !Array.isArray(obj.operations)) continue;
    seen.add(raw.length);
    for (const l of normalizeProperty(obj, agent)) {
      const f = finish({ ...l, source: 'web', url, id: `${new URL(url).host}_${obj.id}_${l.op}` });
      if (f) out.push(f);
    }
  }
  return out;
}

// ---------- 2. schema.org con geo (RealEstateListing, Residence, Apartment, etc.) ----------
function* walk(node, parents = []) {
  if (Array.isArray(node)) for (const n of node) yield* walk(n, parents);
  else if (node && typeof node === 'object') {
    yield [node, parents];
    for (const v of Object.values(node)) if (v && typeof v === 'object') yield* walk(v, [node, ...parents]);
  }
}
export function extractJsonLd(url, html, agent) {
  const b = base(url, html, agent);
  const out = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    for (const [n, parents] of walk(data)) {
      const holder = [n, n.location, n.itemOffered, n.about].find(x => x?.geo?.latitude !== undefined);
      if (!holder) continue;
      const geo = holder.geo;
      const description = text(n.description || holder.description);
      const name = text(n.name) || b.title;
      const offer = [n, ...parents].map(x => [].concat(x.offers ?? []).flat()[0]).find(Boolean) ?? {};
      const priceStr = offer.price !== undefined ? `${offer.priceCurrency === 'ARS' ? '$' : 'USD'} ${offer.price}` : name + ' ' + b.desc;
      const { price, currency } = offer.price !== undefined
        ? { price: num(offer.price), currency: offer.priceCurrency || 'USD' }
        : parsePrice(priceStr);
      const addr = n.address ?? holder.address ?? n.location?.address ?? {};
      const f = finish({
        id: `${new URL(url).host}_${new URL(url).pathname}`,
        url, agent,
        op: guessOp(`${name} ${url}`),
        type: guessType(`${name} ${url}`),
        lat: num(geo.latitude), lng: num(geo.longitude),
        address: text(addr.streetAddress) || name,
        zone: text(addr.addressLocality),
        price, currency,
        amb: num(n.numberOfRooms ?? holder.numberOfRooms) ?? guessAmb(`${name} ${description}`),
        banos: num(n.numberOfBathroomsTotal ?? holder.numberOfBathroomsTotal ?? n.numberOfFullBathrooms) ?? 0,
        m2: num(n.floorSize?.value ?? n.floorSize ?? holder.floorSize?.value) ?? guessM2(`${name} ${description}`),
        desc: description || b.desc,
        photos: [].concat(n.image ?? b.image ?? []).map(i => (typeof i === 'string' ? i : i?.url)).filter(Boolean),
      });
      if (f) { out.push(f); break; }
    }
    if (out.length) break;
  }
  return out;
}

// ---------- 3. WordPress con Houzez (y 2clics sobre Houzez) ----------
export function extractHouzez(url, html, agent) {
  if (!/houzez/i.test(html)) return [];
  const b = base(url, html, agent);
  let lat = null, lng = null, address = '';
  // Objeto del mapa de la propiedad: {"address":"...","lat":"-34.58","lng":"-58.42",...}
  const mapObj = html.match(/houzez_single_property_map\s*=\s*(\{[\s\S]*?\});/) ||
    html.match(/\{[^{}]*"address"\s*:\s*"[^"]*"\s*,\s*"lat"\s*:\s*"(-?\d+\.\d+)"\s*,\s*"lng"\s*:\s*"(-?\d+\.\d+)"[^{}]*\}/);
  let o = {};
  if (mapObj) {
    try {
      o = JSON.parse(mapObj[1].startsWith('{') ? mapObj[1] : mapObj[0]);
      lat = num(o.lat); lng = num(o.lng);
      // Houzez guarda "2100, Thames, Palermo Soho, ..." → "Thames 2100"
      const parts = text(o.address).split(',').map(p => p.trim());
      address = /^\d+$/.test(parts[0]) && parts[1] ? `${parts[1]} ${parts[0]}` : parts[0] || '';
    } catch {
      lat = num(mapObj[1]); lng = num(mapObj[2]);
    }
  }
  if (lat === null) {
    const q = html.match(/maps\.google\.[a-z.]+\/?\?q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/i);
    if (q) { lat = num(q[1]); lng = num(q[2]); }
  }
  const priceHtml = (html.match(/class="[^"]*item-price[^"]*"[^>]*>([\s\S]{0,200}?)<\/(?:li|span|div)>/i) || [])[1] || '';
  const { price, currency } = parsePrice(text(o.price) || text(priceHtml) || `${b.title} ${b.desc}`);
  const all = `${b.title} ${b.desc}`;
  return [finish({
    id: `${new URL(url).host}_${new URL(url).pathname}`,
    url, agent,
    op: guessOp(`${b.title} ${url}`),
    type: guessType(`${o.property_type || ''} ${b.title}`),
    lat, lng,
    address: address || b.title,
    price, currency,
    amb: guessAmb(all),
    m2: guessM2(all),
    desc: b.desc,
    photos: b.image ? [b.image] : [],
  })].filter(Boolean);
}

// ---------- 4. Atributos data-lat / data-lng en el mapa de la ficha ----------
export function extractDataAttrs(url, html, agent) {
  const m = html.match(/data-lat(?:itude)?=["'](-?\d+[.,]\d+)["'][^>]*data-(?:lng|lon|long|longitude)=["'](-?\d+[.,]\d+)["']/i);
  if (!m) return [];
  const b = base(url, html, agent);
  const all = `${b.title} ${b.desc}`;
  const { price, currency } = parsePrice(all);
  return [finish({
    id: `${new URL(url).host}_${new URL(url).pathname}`,
    url, agent, op: guessOp(`${b.title} ${url}`), type: guessType(`${b.title} ${url}`),
    lat: num(m[1]), lng: num(m[2]), address: b.title, price, currency,
    amb: guessAmb(all), m2: guessM2(all), desc: b.desc, photos: b.image ? [b.image] : [],
  })].filter(Boolean);
}

// ---------- 5. Un único par lat/lng en toda la página ----------
// Sirve para sitios propios (mapas con {lat: .., lng: ..}). Solo lo aceptamos si
// hay exactamente una ubicación distinta, para no confundirla con la de una sucursal.
export function extractSinglePair(url, html, agent) {
  const src = html.replace(/\\"/g, '"').replace(/"default_(lat|long)"\s*:\s*"[^"]*"/g, '');
  const pairs = new Set();
  const re = /\blat(?:itude)?["']?\s*[:=]\s*["']?(-\d{1,2}\.\d{4,})["']?\s*,\s*["']?(?:lng|lon|long|longitude)["']?\s*[:=]\s*["']?(-\d{1,2}\.\d{4,})/gi;
  for (const m of src.matchAll(re)) pairs.add(`${num(m[1]).toFixed(5)},${num(m[2]).toFixed(5)}`);
  const embed = [...src.matchAll(/!2d(-\d+\.\d+)!3d(-\d+\.\d+)/g)].map(m => `${num(m[2]).toFixed(5)},${num(m[1]).toFixed(5)}`);
  embed.forEach(p => pairs.add(p));
  if (pairs.size !== 1) return [];
  const [lat, lng] = [...pairs][0].split(',').map(Number);
  const b = base(url, html, agent);
  const h1 = text((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
  const all = `${b.title} ${h1} ${b.desc}`;
  // Algunos sitios guardan el precio en inputs ocultos (moneda y valor por separado).
  const hm = html.match(/id="[^"]*precio_moneda"[^>]*|value="([^"]*)"[^>]*id="[^"]*precio_moneda"/i);
  const hv = html.match(/value="([^"]*)"[^>]*id="[^"]*precio_valor"/i);
  const { price, currency } = hv && num(hv[1]) ? { price: num(hv[1]), currency: /u/i.test(hm?.[1] ?? '') ? 'USD' : 'ARS' } : parsePrice(all);
  return [finish({
    id: `${new URL(url).host}_${new URL(url).pathname}${new URL(url).search}`,
    url, agent, op: guessOp(`${b.title} ${h1} ${url}`), type: guessType(`${b.title} ${h1} ${url}`),
    lat, lng, address: (h1 || b.title).split(/[—|-]/)[0].trim(), price, currency,
    amb: guessAmb(all), m2: guessM2(all), desc: b.desc, photos: b.image ? [b.image] : [],
  })].filter(Boolean);
}

// Probamos del más confiable al menos confiable.
export const EXTRACTORS = { tokko: extractTokko, jsonld: extractJsonLd, houzez: extractHouzez, data: extractDataAttrs, single: extractSinglePair };
export function extract(url, html, agent) {
  for (const [name, fn] of Object.entries(EXTRACTORS)) {
    const got = fn(url, html, agent);
    if (got.length) return { via: name, listings: got };
  }
  return { via: null, listings: [] };
}
