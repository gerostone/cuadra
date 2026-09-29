// Conector a Tokko Broker: trae el inventario de cada inmobiliaria,
// lo normaliza al formato de Cuadra y junta avisos duplicados.
// Docs: https://developers.tokkobroker.com/docs/atributos

export const TOKKO_BASE = 'https://www.tokkobroker.com/api/v1';
const PAGE = 250;
const MAX_PAGES = 40;

const num = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const clean = s => String(s ?? '')
  .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function haversine(a, b) {
  const R = 6371000, t = Math.PI / 180;
  const dLat = (b.lat - a.lat) * t, dLng = (b.lng - a.lng) * t;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function opKind(name) {
  const n = String(name ?? '').toLowerCase();
  if (n.includes('venta') || n.includes('sale')) return 'venta';
  if (n.includes('alquiler') || n.includes('rent')) return 'alquiler';
  return null;
}

const hasTag = (tags, re) => tags.some(t => re.test(t));
const httpUrl = u => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

// Un aviso de Tokko puede tener varias operaciones (venta y alquiler a la vez):
// devolvemos un aviso de Cuadra por operación.
export function normalizeProperty(raw, agencyFallback = '') {
  const lat = num(raw.geo_lat), lng = num(raw.geo_long);
  if (lat === null || lng === null || (lat === 0 && lng === 0)) return [];

  const tags = (raw.tags ?? []).map(t => clean(t?.name)).filter(Boolean);
  const photos = [...(raw.photos ?? [])]
    .sort((a, b) => (b.is_front_cover ? 1 : 0) - (a.is_front_cover ? 1 : 0) || (a.order ?? 0) - (b.order ?? 0))
    .map(p => httpUrl(p.image || p.original || p.thumb))
    .filter(Boolean);
  const type = clean(raw.type?.name) || 'Propiedad';
  const rooms = num(raw.room_amount);
  const suites = num(raw.suite_amount);
  // En Argentina se cuentan ambientes; Tokko guarda ambientes en room_amount
  // y dormitorios en suite_amount. Si no hay ambientes, estimamos dormitorios + 1.
  const amb = rooms ?? (suites !== null ? suites + 1 : null);
  const created = raw.created_at ? Date.parse(raw.created_at) : NaN;
  const agency = clean(raw.branch?.name) || agencyFallback;
  const showPrice = raw.web_price !== false;

  const base = {
    source: 'tokko',
    tokkoId: raw.id,
    type,
    amb: amb ?? 0,
    dorm: suites,
    m2: num(raw.roofed_surface) ?? num(raw.surface) ?? 0,
    m2tot: num(raw.total_surface) ?? num(raw.surface) ?? 0,
    exp: num(raw.expenses) ?? 0,
    banos: num(raw.bathroom_amount) ?? 0,
    antig: num(raw.age),
    lat, lng,
    address: clean(raw.fake_address) || clean(raw.address) || clean(raw.location?.name),
    zone: clean(raw.location?.name),
    title: clean(raw.publication_title),
    feats: tags.slice(0, 8),
    mascotas: hasTag(tags, /mascota/i),
    credito: hasTag(tags, /cr[eé]dito/i),
    desc: clean(raw.description || raw.rich_description).slice(0, 1200),
    agent: agency,
    phone: clean(raw.branch?.phone),
    email: clean(raw.branch?.email),
    photos: photos.slice(0, 12),
    url: httpUrl(raw.public_url),
    days: Number.isFinite(created) ? Math.max(0, Math.floor((Date.now() - created) / 864e5)) : null,
  };

  const out = [];
  for (const op of raw.operations ?? []) {
    const kind = opKind(op.operation_type);
    if (!kind) continue;
    // Preferimos USD en venta y ARS en alquiler, que es como se publica en Argentina.
    const prices = (op.prices ?? []).filter(p => num(p.price) > 0);
    const wanted = kind === 'venta' ? 'USD' : 'ARS';
    const pr = prices.find(p => p.currency === wanted) ?? prices[0];
    out.push({
      ...base,
      id: `tk_${raw.id}_${kind}`,
      op: kind,
      temporario: /tempor/i.test(op.operation_type ?? ''),
      price: showPrice && pr ? num(pr.price) : null,
      currency: pr?.currency ?? wanted,
    });
  }
  return out;
}

// Misma propiedad publicada por dos inmobiliarias: misma operación, a menos de
// 25 m, mismos ambientes, superficie parecida y precio a menos de 3%.
export function dedupe(listings) {
  const kept = [];
  for (const l of listings) {
    const twin = kept.find(k =>
      k.op === l.op && k.amb === l.amb && k.currency === l.currency &&
      haversine(k, l) < 25 &&
      (!k.m2 || !l.m2 || Math.abs(k.m2 - l.m2) / Math.max(k.m2, l.m2) < 0.1) &&
      (k.price === null || l.price === null || Math.abs(k.price - l.price) / Math.max(k.price, l.price) < 0.03));
    if (twin) {
      twin.alsoBy = [...new Set([...(twin.alsoBy ?? []), l.agent].filter(a => a && a !== twin.agent))];
      if (!twin.photos.length && l.photos.length) twin.photos = l.photos;
    } else kept.push({ ...l });
  }
  return kept;
}

export async function fetchAgencyInventory(key, { fetchImpl = fetch, base = TOKKO_BASE } = {}) {
  const objects = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${base}/property/?format=json&lang=es_ar&limit=${PAGE}&offset=${page * PAGE}&key=${encodeURIComponent(key)}`;
    const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Tokko respondió ${res.status}`);
    const data = await res.json();
    const batch = data.objects ?? [];
    objects.push(...batch);
    const total = data.meta?.total_count ?? 0;
    if (!batch.length || objects.length >= total) break;
  }
  return objects;
}

export async function loadInventory(keys, opts = {}) {
  const results = await Promise.allSettled(keys.map(k => fetchAgencyInventory(k, opts)));
  const listings = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') for (const raw of r.value) listings.push(...normalizeProperty(raw, `Inmobiliaria ${i + 1}`));
    else errors.push({ agency: i + 1, error: r.reason?.message ?? String(r.reason) });
  });
  return { listings: dedupe(listings), agencies: results.filter(r => r.status === 'fulfilled').length, errors };
}

export function nearby(listings, center, radius) {
  return listings.filter(l => haversine(center, l) <= radius);
}
