// Cliente HTTP cortés y descubrimiento de fichas por sitemap, compartidos por
// el crawler (run.mjs) y la herramienta para evaluar sitios nuevos (probe.mjs).
import { isAllowed } from './robots.mjs';

export const UA = 'CuadraBot/0.1 (+https://github.com/gerostone/cuadra)';
export const DELAY = 1500;
const BLOCK = new Set([401, 403, 429, 503]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export class Blocked extends Error {}
// Un cliente = un ritmo. Sitios alojados en la misma infraestructura comparten cliente.
export function politeClient(delay = DELAY) {
  let last = 0;
  return async function get(url) {
    const wait = last + delay - Date.now();
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

export async function discover(src, get, rules, robotsSitemaps) {
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

