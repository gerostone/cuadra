// Crawler de Cuadra: recorre los sitios de inmobiliarias listados en sources.json
// y genera public/data/listings.json.
//
// Reglas de cortesía:
// - Se identifica como CuadraBot con un link al proyecto.
// - Respeta robots.txt en cada pedido.
// - Hace un pedido por vez a cada sitio, con pausa entre pedidos.
// - Si un sitio responde 401/403/429/503, deja de pedirle hasta la próxima corrida.
//
// Uso: node crawler/run.mjs [--budget 300] [--only belga,izr] [--refresh]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseRobots, isAllowed } from './robots.mjs';
import { extract } from './extract.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/data/listings.json');
const STATE = join(ROOT, 'crawler/state.json');
const UA = 'CuadraBot/0.1 (+https://github.com/gerostone/cuadra)';
const DELAY = 1500;
const STALE_DAYS = 7;
const BLOCK = new Set([401, 403, 429, 503]);

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const BUDGET = Number(opt('budget', 300));
const ONLY = opt('only', '')?.split(',').filter(Boolean);
const REFRESH = args.includes('--refresh'); // vuelve a leer todas las fichas, aunque estén al día

const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return d; } };

class Blocked extends Error {}
function politeClient() {
  let last = 0;
  return async function get(url) {
    const wait = last + DELAY - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    let res;
    try {
      res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
    } catch (e) {
      return { status: 0, text: '', error: e.cause?.code || e.name };
    }
    if (BLOCK.has(res.status)) throw new Blocked(`${res.status} en ${url}`);
    return { status: res.status, url: res.url, text: res.ok ? await res.text() : '' };
  };
}

async function discover(src, get, rules, robotsSitemaps) {
  const re = new RegExp(src.match, 'i');
  const queue = robotsSitemaps.length ? [...robotsSitemaps] : [`${src.site}/sitemap.xml`, `${src.site}/sitemap_index.xml`, `${src.site}/wp-sitemap.xml`];
  const seenMaps = new Set();
  const urls = new Set();
  let found = false;
  while (queue.length && seenMaps.size < 30) {
    const sm = queue.shift();
    if (seenMaps.has(sm)) continue;
    seenMaps.add(sm);
    if (!isAllowed(rules, new URL(sm, src.site).pathname)) continue;
    const r = await get(sm);
    if (r.status !== 200 || !/<(urlset|sitemapindex)/.test(r.text)) continue;
    found = true;
    const locs = [...r.text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+)/g)].map(m => m[1].trim());
    if (/<sitemapindex/.test(r.text)) {
      // Priorizamos los sitemaps de propiedades y salteamos los de blog, páginas y categorías.
      const children = locs.filter(u => !/post-sitemap|page-sitemap|posts-page|taxonom|category|tag|author|blog/i.test(u));
      queue.push(...children.sort((a, b) => /propert|propiedad|inmueble/i.test(b) - /propert|propiedad|inmueble/i.test(a)));
    } else {
      for (const u of locs) {
        let p;
        try { p = new URL(u); } catch { continue; }
        if (re.test(p.pathname) && isAllowed(rules, p.pathname)) urls.add(p.href);
      }
    }
  }
  return { found, urls: [...urls] };
}

async function crawlSource(src, state, now) {
  const get = politeClient();
  const report = { id: src.id, name: src.name, discovered: 0, fetched: 0, extracted: 0, removed: 0, status: 'ok' };
  const mine = state[src.id] ??= {};
  try {
    const robots = await get(`${src.site}/robots.txt`);
    const { rules, sitemaps } = robots.status === 200 ? parseRobots(robots.text) : { rules: [], sitemaps: [] };
    if (!isAllowed(rules, '/')) { report.status = 'robots.txt no permite el acceso'; return report; }

    const { found, urls } = await discover(src, get, rules, sitemaps);
    report.discovered = urls.length;
    if (!found) { report.status = 'sin sitemap'; return report; }

    // Si el aviso ya no está en el sitemap, lo damos de baja.
    const live = new Set(urls);
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
