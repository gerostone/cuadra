// Crawler de Cuadra: recorre los sitios de inmobiliarias listados en sources.json
// y genera listings.json, que la app lee desde la rama `data` del repo.
//
// Reglas de cortesía:
// - Se identifica como CuadraBot con un link al proyecto.
// - Respeta robots.txt en cada pedido.
// - Hace un pedido por vez a cada sitio, con pausa entre pedidos.
// - Si un sitio responde 401/403/429/503, deja de pedirle hasta la próxima corrida.
//
// Uso: node crawler/run.mjs [--data data] [--budget 300] [--only belga,izr] [--refresh]
// Lee y escribe listings.json y state.json en la carpeta --data (por defecto ./data).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseRobots, isAllowed } from './robots.mjs';
import { politeClient, discover, Blocked } from './http.mjs';
import { extract, tokkoWebMarkers, tokkoWebCards, tokkoWebListings } from './extract.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STALE_DAYS = 7;

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const BUDGET = Number(opt('budget', 300));
const ONLY = opt('only', '')?.split(',').filter(Boolean);
// Carpeta de datos: en GitHub Actions es un checkout de la rama `data`.
const DATA = join(ROOT, opt('data', 'data'));
const OUT = join(DATA, 'listings.json');
const STATE = join(DATA, 'state.json');
const REFRESH = args.includes('--refresh'); // vuelve a leer todas las fichas, aunque estén al día

const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return d; } };

async function crawlSource(src, state, now) {
  const get = politeClient();
  const report = { id: src.id, name: src.name, discovered: 0, fetched: 0, extracted: 0, removed: 0, status: 'ok' };
  const mine = state[src.id] ??= {};
  try {
    const robots = await get(`${src.site}/robots.txt`);
    const { rules, sitemaps } = robots.status === 200 ? parseRobots(robots.text) : { rules: [], sitemaps: [] };
    if (!isAllowed(rules, '/')) { report.status = 'robots.txt no permite el acceso'; return report; }

    let urls;
    if (src.type === 'tokko-web') {
      const tw = await discoverTokkoWeb(src, get, rules);
      if (tw.error) { report.status = tw.error; return report; }
      mine[LIST_KEY] = { at: now, via: 'tokko-web', listings: tw.fromList.map(l => ({ ...l, sourceId: src.id })) };
      report.discovered = tw.total;
      report.extracted = tw.fromList.length;
      urls = tw.urls;
    } else {
      const d = await discover(src, get, rules, sitemaps);
      report.discovered = d.urls.length;
      if (!d.found) { report.status = 'sin sitemap'; return report; }
      urls = d.urls;
    }

    // Si el aviso ya no está en el sitemap, lo damos de baja.
    const live = new Set([...urls, LIST_KEY]);
    for (const u of Object.keys(mine)) if (!live.has(u)) { delete mine[u]; report.removed++; }

    const staleBefore = now - STALE_DAYS * 864e5;
    const todo = urls
      .filter(u => REFRESH || !mine[u] || mine[u].at < staleBefore)
      .sort((a, b) => (mine[a]?.at ?? 0) - (mine[b]?.at ?? 0))
      .slice(0, BUDGET);

    for (const u of todo) {
      const r = await get(u);
      report.fetched++;
      if (r.status === 404 || r.status === 410) { delete mine[u]; report.removed++; continue; }
      if (r.status !== 200) continue; // error temporal: se reintenta en la próxima corrida
      const { via, listings } = extract(u, r.text, src.name);
      mine[u] = { at: now, via, listings: listings.map(l => ({ ...l, agent: src.name, sourceId: src.id })) };
      if (listings.length) report.extracted++;
    }
  } catch (e) {
    report.status = e instanceof Blocked ? `bloqueado (${e.message})` : `error: ${e.message}`;
  }
  return report;
}

// Sitios con la plantilla web de Tokko (sin sitemap). El listado /Propiedades se
// pagina con ?o=2,2&p=N. Si una propiedad tiene tarjeta y marcador en el mapa, sale
// del listado; si no, su ficha /p/ID se lee como cualquier otra (con el mismo caché).
const MAX_LIST_PAGES = 60;
const LIST_KEY = '__listado';
async function discoverTokkoWeb(src, get, rules) {
  if (!isAllowed(rules, '/Propiedades')) return { error: 'robots.txt no permite el listado' };
  const first = await get(`${src.site}/Propiedades`);
  if (first.status !== 200) return { error: `listado respondió ${first.status}` };
  const origin = new URL(first.url).origin;
  const markers = tokkoWebMarkers(first.text);
  const cards = new Map(tokkoWebCards(first.text, origin).map(c => [c.id, c]));
  const links = new Map();
  const addLinks = t => { for (const m of t.matchAll(/href="(\/p\/(\d+)[^"]*)"/g)) if (!links.has(m[2])) links.set(m[2], new URL(m[1], origin).href); };
  addLinks(first.text);
  for (let p = 2; p <= MAX_LIST_PAGES; p++) {
    const r = await get(`${origin}/Propiedades?o=2,2&p=${p}`);
    if (r.status !== 200 || r.text.includes('--NoMoreProperties--')) break;
    const before = links.size;
    addLinks(r.text);
    tokkoWebCards(r.text, origin).forEach(c => cards.set(c.id, c));
    if (links.size === before) break;
  }
  const fromList = tokkoWebListings([...cards.values()].filter(c => markers.has(c.id)), markers, src.name, new URL(origin).host);
  const listed = new Set(fromList.map(l => l.id.split('_').at(-1)));
  const urls = [...links].filter(([id]) => !listed.has(id)).map(([, u]) => u).filter(u => isAllowed(rules, new URL(u).pathname));
  return { origin, fromList, urls, total: links.size };
}

// Solo lo que la app necesita, para que el archivo pese poco.
const KEEP = ['id', 'op', 'type', 'amb', 'dorm', 'm2', 'm2tot', 'price', 'currency', 'exp', 'banos', 'antig', 'lat', 'lng',
  'address', 'zone', 'feats', 'mascotas', 'credito', 'desc', 'agent', 'phone', 'photos', 'url', 'temporario', 'sourceId'];
const slim = l => {
  const o = {};
  for (const k of KEEP) if (l[k] !== undefined && l[k] !== null && l[k] !== '' && !(Array.isArray(l[k]) && !l[k].length)) o[k] = l[k];
  o.desc &&= o.desc.slice(0, 300);
  o.photos &&= o.photos.slice(0, 3);
  o.lat = +o.lat.toFixed(6); o.lng = +o.lng.toFixed(6);
  return o;
};

async function main() {
  const sources = (await readJson(join(ROOT, 'crawler/sources.json'), [])).filter(s => !ONLY?.length || ONLY.includes(s.id));
  const state = await readJson(STATE, {});
  const now = Date.now();
  // Un sitio por vez no hace falta: cada sitio tiene su propio ritmo, así que corren en paralelo.
  const reports = await Promise.all(sources.map(s => crawlSource(s, state, now)));

  const byId = new Map();
  for (const pages of Object.values(state)) for (const p of Object.values(pages)) for (const l of p.listings ?? []) byId.set(l.id, slim(l));
  const listings = [...byId.values()];

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(STATE, JSON.stringify(state));
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date(now).toISOString(), agencies: new Set(listings.map(l => l.sourceId)).size, listings }));

  console.table(reports);
  console.log(`${listings.length} avisos con ubicación en ${OUT.replace(ROOT + '/', '')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
