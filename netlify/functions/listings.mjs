// GET /api/listings?lat=-34.58&lng=-58.43&r=1500
// Devuelve los avisos de Tokko cerca de un punto. Las API keys viven en la
// variable de entorno TOKKO_API_KEYS (una por inmobiliaria, separadas por coma)
// y nunca salen del servidor.
import { loadInventory, nearby } from '../../lib/tokko.mjs';

const TTL = 10 * 60 * 1000;
let cache = null; // { at, data } — sobrevive entre invocaciones de la misma instancia
let inflight = null;

async function inventory(keys, base) {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  inflight ??= loadInventory(keys, base ? { base } : {}).then(data => {
    cache = { at: Date.now(), data };
    return data;
  }).finally(() => { inflight = null; });
  return inflight;
}

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
});

export default async (req) => {
  const keys = (process.env.TOKKO_API_KEYS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!keys.length) return json({ source: 'demo', listings: [] }, 200, { 'cache-control': 'public, max-age=300' });

  const u = new URL(req.url);
  const lat = parseFloat(u.searchParams.get('lat'));
  const lng = parseFloat(u.searchParams.get('lng'));
  const r = Math.min(3000, Math.max(100, parseFloat(u.searchParams.get('r')) || 1500));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return json({ error: 'Faltan lat y lng válidos.' }, 400);
  }

  try {
    const data = await inventory(keys, process.env.TOKKO_BASE_URL);
    const listings = nearby(data.listings, { lat, lng }, r);
    return json(
      { source: 'tokko', agencies: data.agencies, failedAgencies: data.errors.length, total: data.listings.length, listings },
      200,
      // El cliente redondea lat/lng, así que el CDN puede reutilizar respuestas de la misma zona.
      { 'cache-control': 'public, max-age=120', 'netlify-cdn-cache-control': 'public, s-maxage=600, stale-while-revalidate=600' },
    );
  } catch (e) {
    return json({ error: 'No pudimos traer los avisos de Tokko.', detail: e.message }, 502);
  }
};

export const config = { path: '/api/listings' };
