// Evalúa si conviene sumar un sitio al crawler, con las mismas reglas de cortesía.
// Uso: node crawler/probe.mjs lacrozepropiedades.com www.gaed.com.ar ...
//
// Para cada sitio informa: si robots.txt lo permite, si tiene sitemap, cuántas
// fichas encuentra, qué extractor funciona con 3 fichas de muestra y un patrón
// de URL sugerido para sources.json.
import { parseRobots, isAllowed } from './robots.mjs';
import { politeClient, discover, Blocked } from './http.mjs';
import { extract } from './extract.mjs';

// Patrón amplio para encontrar fichas en un sitio que todavía no conocemos.
const GENERIC = '/(propiedad|propiedades|property|inmueble|inmuebles|ficha|p)/[^/]*\\d|propiedades-(venta|alquiler)-|/\\d{5,}-';

async function probe(host) {
  const site = /^https?:\/\//.test(host) ? host.replace(/\/$/, '') : `https://${host}`;
  const get = politeClient();
  const row = { site };
  try {
    const home = await get(site + '/');
    if (home.status === 0) return { ...row, result: `no responde (${home.error})` };
    const origin = new URL(home.url).origin;
    row.site = origin;
    const rb = await get(`${origin}/robots.txt`);
    const { rules, sitemaps } = rb.status === 200 ? parseRobots(rb.text) : { rules: [], sitemaps: [] };
    if (!isAllowed(rules, '/')) return { ...row, result: 'robots.txt no permite el acceso' };
    const { found, urls } = await discover({ site: origin, match: GENERIC }, get, rules, sitemaps);
    row.sitemap = found;
    row.fichas = urls.length;
    if (!urls.length) return { ...row, result: found ? 'sitemap sin fichas reconocibles' : 'sin sitemap' };
    // Muestra repartida: principio, medio y final del sitemap.
    const sample = [urls[0], urls[Math.floor(urls.length / 2)], urls.at(-1)].filter((u, i, a) => a.indexOf(u) === i);
    const got = [];
    for (const u of sample) {
      const r = await get(u);
      const { via, listings } = r.status === 200 ? extract(u, r.text, host) : { via: null, listings: [] };
      got.push({ path: new URL(u).pathname.slice(0, 60), via, op: listings[0]?.op, price: listings[0]?.price, lat: listings[0]?.lat });
    }
    row.muestra = got;
    row.extraidas = `${got.filter(g => g.via).length}/${got.length}`;
    // Patrón sugerido: el primer segmento en común de las fichas.
    const seg = new URL(urls[0]).pathname.split('/').filter(Boolean)[0] ?? '';
    row.match = /^\d/.test(seg) ? '/\\d{5,}-' : `/${seg.replace(/[-_]?\d.*$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
    row.result = got.some(g => g.via) ? 'sirve' : 'no pude extraer ubicación';
  } catch (e) {
    row.result = e instanceof Blocked ? `bloquea al bot (${e.message.split(' ')[0]})` : `error: ${e.message}`;
  }
  return row;
}

const hosts = process.argv.slice(2);
if (!hosts.length) { console.error('Uso: node crawler/probe.mjs dominio1 dominio2 ...'); process.exit(1); }
const rows = await Promise.all(hosts.map(probe));
for (const r of rows) console.log(JSON.stringify(r));
