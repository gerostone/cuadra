// Service worker de Cuadra: permite instalar la app y abrirla sin conexión.
//
// - App (este sitio, Leaflet y fuentes): primero la red y, si no hay, la copia guardada.
//   Así, con conexión siempre se usa la última versión publicada.
// - Avisos (listings.json de la rama data): igual, primero la red; sin conexión se
//   muestran los últimos descargados.
// - Mapas de OpenStreetMap: no se guardan acá. Su política de uso no permite
//   almacenarlos en cantidad; queda el caché normal del navegador.
const VERSION = 'v3';
const APP = `cuadra-app-${VERSION}`;
const DATA = 'cuadra-avisos';
const SHELL = [
  '/', '/app.css', '/app.js', '/ui.js', '/demo.js', '/manifest.webmanifest', '/icons/icon-192.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('cuadra-app-') && k !== APP).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await cache.match('/')) ?? Response.error();
    return Response.error();
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('tile.openstreetmap.org')) return;          // mapas: sin intervenir
  if (url.hostname === 'raw.githubusercontent.com') { e.respondWith(networkFirst(req, DATA)); return; }
  if (url.origin === location.origin || url.hostname === 'unpkg.com' || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(networkFirst(req, APP));
  }
});
