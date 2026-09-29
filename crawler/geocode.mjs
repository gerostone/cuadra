// Geocodificación de direcciones con Nominatim (OpenStreetMap), para inmobiliarias
// que no publican el mapa de sus propiedades.
//
// Política de uso de Nominatim: https://operations.osmfoundation.org/policies/nominatim/
// - Máximo un pedido por segundo, con un User-Agent que identifica la app.
// - Guardar los resultados: cada dirección se busca una sola vez (también las no encontradas,
//   que se reintentan recién a los 30 días).
import { politeClient } from './http.mjs';

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const RETRY_MISS_DAYS = 30;
// Solo aceptamos resultados a nivel de edificio o calle: un pin en el centro de la
// ciudad o del barrio engañaría más de lo que ayuda.
const PRECISE = new Set(['house', 'building', 'residential', 'apartments', 'road', 'street', 'living_street', 'tertiary',
  'secondary', 'primary', 'unclassified', 'pedestrian', 'service', 'house_number']);

// "EL TORDO AL 1900" → "El Tordo 1900"; "AYOLAS Y SAN JUSTO al 3900" → "Ayolas 3900".
export function cleanAddress(address) {
  let a = String(address ?? '')
    .replace(/\s+-\s+.*$/, '')             // "BRANDSEN al 400 - EDIFICIO TOUCHÉ"
    .replace(/,.*$/, '')                    // "MUNILLA 2288, CASTELAR, BS AS"
    .replace(/\b(piso|dpto|depto|uf|pb)\b.*$/i, '')
    .trim();
  if (/barrio cerrado|country|b\.?\s?c\.?\b/i.test(a)) return null;
  const num = (a.match(/(?:\bal\s+)?(\d{1,5})\b/i) || [])[1];
  let street = a.replace(/\bal\s+\d+.*$/i, '').replace(/\b\d{1,5}\b.*$/, '').trim();
  street = street.replace(/\s+y\s+.*$/i, '').trim();  // intersección: nos quedamos con la primera calle
  if (!street || street.length < 3) return null;
  street = street.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
  return num ? `${street} ${num}` : null; // sin altura, el resultado sería el medio de la calle
}

// Diagonal de la caja que devuelve Nominatim, en metros.
function boxSize(bb) {
  if (!Array.isArray(bb) || bb.length !== 4) return Infinity;
  const [s, n, w, e] = bb.map(Number);
  const dy = (n - s) * 111320, dx = (e - w) * 111320 * Math.cos(((n + s) / 2) * Math.PI / 180);
  return Math.hypot(dx, dy);
}
const MAX_ROAD_M = 800;

export function geocoder(cache) {
  const get = politeClient(1100);
  async function lookup(q) {
    const hit = cache[q];
    if (hit && (hit.lat !== undefined || Date.now() - hit.at < RETRY_MISS_DAYS * 864e5)) return hit.lat !== undefined ? hit : null;
    const r = await get(`${ENDPOINT}?format=jsonv2&limit=1&countrycodes=ar&q=${encodeURIComponent(q)}`);
    let best = null;
    try { best = r.status === 200 ? JSON.parse(r.text)[0] : null; } catch { best = null; }
    const kind = best?.addresstype || best?.type;
    // Una calle sin la altura exacta solo sirve si el tramo es corto.
    const isRoad = best?.category === 'highway' || kind === 'road';
    const ok = best && (PRECISE.has(best.type) || PRECISE.has(kind) || best.category === 'building' || best.category === 'place' && best.type === 'house')
      && (!isRoad || boxSize(best.boundingbox) <= MAX_ROAD_M);
    cache[q] = ok ? { lat: +(+best.lat).toFixed(6), lng: +(+best.lon).toFixed(6), type: kind, at: Date.now() } : { at: Date.now() };
    return ok ? cache[q] : null;
  }
  return async function geocode(address, zone) {
    const street = cleanAddress(address);
    if (!street || !zone) return null;
    const found = await lookup(`${street}, ${zone}, Buenos Aires, Argentina`);
    if (found) return found;
    // "Castelar Norte", "Ituzaingó Sur": OpenStreetMap suele conocer solo la localidad.
    const simple = zone.replace(/\s+(norte|sur|centro|este|oeste)$/i, '');
    return simple !== zone ? lookup(`${street}, ${simple}, Buenos Aires, Argentina`) : null;
  };
}
