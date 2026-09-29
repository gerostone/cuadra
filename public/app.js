import { RADIUS, NEAR, dist, fmtM, walkMin, esc, cur, shortPrice, fullPrice, expLabel, perM2, passes } from './ui.js';
import { CELL, listingsInCell, drawFacade } from './demo.js';

// ---------- Utilidades ----------
const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const dash = v => v ? v : '—';

// ---------- Fuente de avisos: /data/listings.json (lo genera el crawler), o ejemplos si está vacío ----------
const remote = { mode: 'pending', listings: [], agencies: 0 };
async function loadListings() {
  try {
    const res = await fetch('/data/listings.json', { cache: 'no-cache' });
    const data = res.ok ? await res.json() : null;
    if (data?.listings?.length) Object.assign(remote, { mode: 'web', listings: data.listings, agencies: data.agencies });
    else remote.mode = 'demo';
  } catch {
    remote.mode = 'demo';
  }
  lastIds = ''; render();
}
function listingsAround(pos, radius) {
  if (remote.mode === 'pending') return [];
  if (remote.mode === 'web') return remote.listings.map(p => ({ p, d: dist(pos, p) })).filter(o => o.d <= radius).sort((a, b) => a.d - b.d);
  const span = Math.ceil(radius / (CELL * 111320 * Math.cos(pos.lat * Math.PI / 180))) + 1;
  const cx = Math.floor(pos.lng / CELL), cy = Math.floor(pos.lat / CELL);
  const all = [];
  for (let dx = -span; dx <= span; dx++) for (let dy = -span; dy <= span; dy++) all.push(...listingsInCell(cx + dx, cy + dy));
  return all.map(p => ({ p, d: dist(pos, p) })).filter(o => o.d <= radius).sort((a, b) => a.d - b.d);
}


// ---------- Estado ----------
const state = {
  pos: null, real: false, op: 'todo', amb: 0, fav: false, pets: false, cred: false,
  favs: new Set(store.get('cuadra.favs', [])), seen: new Set(store.get('cuadra.seen', [])),
  sel: null, walking: false, walkTarget: null, follow: true, notified: new Set()
};

// ---------- Mapa ----------
const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([-34.5889, -58.4306], 17);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© OpenStreetMap', className: dark ? 'tiles-dark' : 'tiles'
}).addTo(map);
const meMarker = L.marker([0, 0], { icon: L.divIcon({ className: 'me', html: '<div></div>', iconSize: [0, 0] }), interactive: false, zIndexOffset: 1000 });
const accCircle = L.circle([0, 0], { radius: 20, color: '#e0342b', weight: 1, fillOpacity: .08, interactive: false });
const radiusCircle = L.circle([0, 0], { radius: RADIUS, color: '#1b2124', weight: 1, dashArray: '4 6', fill: false, opacity: .35, interactive: false });
const trail = L.polyline([], { color: '#e0342b', weight: 4, opacity: .55, dashArray: '1 8', lineCap: 'round' }).addTo(map);
const layer = L.layerGroup().addTo(map);
const markers = new Map();
map.on('dragstart', () => { state.follow = false; });
map.on('click', e => { if (state.walking) { state.walkTarget = e.latlng; toast('Caminando hacia ese punto…'); } });

// ---------- Ubicación ----------
function setPos(lat, lng, acc, real) {
  const first = !state.pos;
  const prev = state.pos;
  state.pos = { lat, lng }; state.real = real;
  meMarker.setLatLng(state.pos).addTo(map);
  accCircle.setLatLng(state.pos).setRadius(acc || 15).addTo(map);
  radiusCircle.setLatLng(state.pos).addTo(map);
  if (!prev || dist(prev, state.pos) > 3) trail.addLatLng(state.pos);
  if (first) map.setView(state.pos, 17); else if (state.follow) map.panTo(state.pos, { animate: true, duration: .5 });
  render();
}
function startGeo() {
  if (!('geolocation' in navigator)) return fallback('Tu navegador no comparte ubicación.');
  navigator.geolocation.watchPosition(
    g => { if (!state.walking) setPos(g.coords.latitude, g.coords.longitude, g.coords.accuracy, true); },
    () => fallback('No pudimos acceder a tu ubicación.'),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
  );
}
function fallback(msg) {
  if (state.pos) return;
  setPos(-34.5889, -58.4306, 15, false);
  toast(`${msg} Te ubicamos en Palermo. Tocá <b>Simular caminata</b> para recorrer el barrio.`, 6000);
}

// ---------- Simulación de caminata ----------
let walkTimer = null, heading = Math.random() * Math.PI * 2;
function toggleWalk() {
  state.walking = !state.walking;
  $('#walkBtn').setAttribute('aria-pressed', state.walking);
  if (state.walking) {
    state.follow = true;
    toast('Modo paseo: caminás solo por el barrio. Tocá el mapa para elegir hacia dónde.');
    walkTimer = setInterval(step, 400);
  } else { clearInterval(walkTimer); state.walkTarget = null; }
}
function step() {
  if (!state.pos) return;
  const m = 1.4 * 0.4 * 6; // 6x velocidad de caminata
  if (state.walkTarget) {
    const d = dist(state.pos, state.walkTarget);
    if (d < m) { state.walkTarget = null; }
    else heading = Math.atan2(state.walkTarget.lat - state.pos.lat, (state.walkTarget.lng - state.pos.lng) * Math.cos(state.pos.lat * Math.PI / 180));
  } else if (Math.random() < .06) {
    heading += (Math.random() < .5 ? 1 : -1) * Math.PI / 2; // doblar en la esquina
  }
  const dLat = Math.sin(heading) * m / 111320;
  const dLng = Math.cos(heading) * m / (111320 * Math.cos(state.pos.lat * Math.PI / 180));
  setPos(state.pos.lat + dLat, state.pos.lng + dLng, 8, false);
}

// ---------- Render ----------
let lastIds = '';
const byId = new Map();
function render() {
  if (!state.pos) return;
  const around = listingsAround(state.pos, RADIUS * 1.6).filter(o => passes(o.p, state, state.favs));
  for (const { p } of around) byId.set(p.id, p);
  const inRadius = around.filter(o => o.d <= RADIUS);
  // marcadores (un poco más allá del radio para que el mapa no se vea vacío)
  const keep = new Set(around.map(o => o.p.id));
  for (const [id, mk] of markers) if (!keep.has(id)) { layer.removeLayer(mk); markers.delete(id); }
  for (const { p } of around) {
    const cls = `pin ${p.op}${state.favs.has(p.id) ? ' fav' : ''}${state.seen.has(p.id) ? ' seen' : ''}${state.sel === p.id ? ' sel' : ''}`;
    let mk = markers.get(p.id);
    if (!mk) {
      mk = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: cls, html: `<div>${shortPrice(p)}</div>`, iconSize: [0, 0] }), keyboard: true, title: `${p.type} en ${p.op}, ${p.address}` });
      mk.on('click', () => { select(p.id, true); openSheet(p); });
      mk.addTo(layer); markers.set(p.id, mk);
    } else if (mk.cls !== cls) {
      mk.setIcon(L.divIcon({ className: cls, html: `<div>${shortPrice(p)}</div>`, iconSize: [0, 0] }));
    }
    mk.cls = cls;
  }
  // avisos cercanos
  for (const { p, d } of inRadius) {
    if (d < NEAR && !state.notified.has(p.id)) {
      state.notified.add(p.id);
      state.seen.add(p.id); store.set('cuadra.seen', [...state.seen]);
      toast(`Estás pasando por <b>${esc(p.address)}</b>: ${esc(p.type.toLowerCase())} en ${p.op} · ${fullPrice(p)}`, 5000, p);
    }
  }
  // estado
  $('#status').innerHTML = state.walking
    ? `<b>Modo paseo</b> · ${fmtM(trailLength())} recorridos`
    : state.real ? `<b>Ubicación en vivo</b> · ${fmtM(trailLength())} recorridos` : `<b>Palermo, CABA</b> · ubicación aproximada`;
  $('#count').textContent = inRadius.length;
  const src = remote.mode === 'web' ? `de ${remote.agencies} ${remote.agencies === 1 ? 'inmobiliaria' : 'inmobiliarias'}` : remote.mode === 'demo' ? '· ejemplos' : '· cargando…';
  $('#countLabel').textContent = `${inRadius.length === 1 ? 'propiedad' : 'propiedades'} a ${RADIUS} m ${src}`;
  // tarjetas
  const top = inRadius.slice(0, 24);
  const ids = top.map(o => o.p.id + (state.favs.has(o.p.id) ? '*' : '') + (state.sel === o.p.id ? '!' : '')).join(',');
  const cards = $('#cards');
  $('#empty').hidden = top.length > 0;
  $('#empty').textContent = remote.mode === 'web' && !listingsAround(state.pos, RADIUS).length
    ? 'Todavía no tenemos avisos de inmobiliarias en esta zona. Caminá hacia otro barrio o volvé más adelante.'
    : 'No hay propiedades con esos filtros en esta zona. Caminá unas cuadras o aflojá los filtros.';
  if (ids !== lastIds) {
    lastIds = ids;
    cards.innerHTML = '';
    for (const { p, d } of top) {
      const b = document.createElement('button');
      b.className = 'card' + (state.sel === p.id ? ' sel' : ''); b.dataset.id = p.id;
      const thumb = p.photos?.length ? `<img src="${esc(p.photos[0])}" alt="" loading="lazy">` : '<canvas></canvas>';
      b.innerHTML = `<div class="thumb">${thumb}</div><div class="body">
        <span class="tag ${p.op}">${p.op === 'venta' ? 'Venta' : 'Alquiler'}</span>
        <span class="price">${fullPrice(p)}</span>
        <span class="sub">${expLabel(p, ' expensas')}</span>
        <span class="addr">${state.favs.has(p.id) ? '♥ ' : ''}${esc(p.address)}</span>
        <span class="sub">${esc(p.type)}${p.amb ? ` · ${p.amb} amb.` : ''}${p.m2 ? ` · ${p.m2} m²` : ''}</span>
        <span class="dist" data-d>${fmtM(d)} · ${walkMin(d)} min a pie</span></div>`;
      b.onclick = () => { select(p.id, true); openSheet(p); };
      cards.appendChild(b);
      const cv = b.querySelector('canvas'); if (cv) drawFacade(cv, p);
    }
  } else {
    // solo actualizar distancias
    top.forEach(({ d }, i) => { const el = cards.children[i]?.querySelector('[data-d]'); if (el) el.textContent = `${fmtM(d)} · ${walkMin(d)} min a pie`; });
  }
}
function trailLength() { const ll = trail.getLatLngs(); let s = 0; for (let i = 1; i < ll.length; i++) s += dist(ll[i - 1], ll[i]); return s; }
function select(id, pan) {
  state.sel = id; render();
  const card = document.querySelector(`.card[data-id="${id}"]`);
  card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  const p = byId.get(id);
  if (pan && p) { state.follow = false; map.panTo([p.lat, p.lng]); }
}

// ---------- Ficha ----------
function openSheet(p) {
  state.seen.add(p.id); store.set('cuadra.seen', [...state.seen]);
  const d = state.pos ? dist(state.pos, p) : 0;
  const fav = state.favs.has(p.id);
  const sh = $('#sheet');
  sh.dataset.id = p.id;
  sh.innerHTML = `
    <div class="hero">${p.photos?.length ? `<img src="${esc(p.photos[0])}" alt="Foto de ${esc(p.address)}">` : '<canvas></canvas>'}<button class="close" aria-label="Cerrar">×</button>
      <div class="sign tag ${p.op}">${p.op === 'venta' ? 'Vende' : 'Alquila'}</div></div>
    <div class="inner">
      <div><h2>${fullPrice(p)}</h2>
        <div class="exp">${expLabel(p, ' de expensas')}${perM2(p) ? ` · ${perM2(p)}` : ''}</div></div>
      <div><div class="where">${esc(p.address)}${p.piso ? ', ' + esc(p.piso) : ''}</div>
        <div class="exp">${esc(p.type)}${p.zone ? ' en ' + esc(p.zone) : ''} · a ${fmtM(d)} de vos, ${walkMin(d)} min caminando${p.days != null ? ` · publicado hace ${p.days} ${p.days === 1 ? 'día' : 'días'}` : ''}</div></div>
      <div class="facts">
        <div><b>${dash(p.amb)}</b><span>Amb.</span></div>
        <div><b>${dash(p.m2)}</b><span>m² cub.</span></div>
        <div><b>${dash(p.m2tot)}</b><span>m² tot.</span></div>
        <div><b>${p.antig === 0 ? 'Nuevo' : dash(p.antig)}</b><span>${p.antig === 0 ? 'A estrenar' : 'Años'}</span></div>
      </div>
      <div class="feats">${[...new Set([...(p.feats || []), ...(p.mascotas ? ['Acepta mascotas'] : []), ...(p.credito ? ['Apto crédito'] : [])])].map(f => `<span>${esc(f)}</span>`).join('')}${p.banos ? `<span>${p.banos} ${p.banos > 1 ? 'baños' : 'baño'}</span>` : ''}</div>
      ${p.desc ? `<p class="desc">${esc(p.desc)}</p>` : ''}
      <div class="agent"><div><b>${esc(p.agent)}</b>${p.source === 'demo' ? 'Aviso de ejemplo generado para esta demo'
        : [p.phone, p.email].filter(Boolean).map(c => `<span class="contact">${esc(c)}</span>`).join(' · ')
          + (p.alsoBy?.length ? `<br>También la publica: ${p.alsoBy.map(esc).join(', ')}` : '')}</div></div>
      <div class="actions">
        <button class="btn ghost" id="favBtn">${fav ? '♥ Guardada' : '♡ Guardar'}</button>
        ${p.url ? `<a class="btn ghost" style="text-align:center;text-decoration:none" target="_blank" rel="noopener" href="${esc(p.url)}">Ver aviso</a>` : ''}
        <a class="btn" style="text-align:center;text-decoration:none" target="_blank" rel="noopener"
           href="https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${p.lat.toFixed(6)},${p.lng.toFixed(6)}">Cómo llegar</a>
      </div>
    </div>`;
  sh.hidden = false; $('#sheetBg').hidden = false;
  requestAnimationFrame(() => { const cv = sh.querySelector('canvas'); if (cv) drawFacade(cv, p); });
  sh.querySelector('.close').onclick = closeSheet;
  sh.querySelector('#favBtn').onclick = e => {
    if (state.favs.has(p.id)) state.favs.delete(p.id); else state.favs.add(p.id);
    store.set('cuadra.favs', [...state.favs]);
    e.target.textContent = state.favs.has(p.id) ? '♥ Guardada' : '♡ Guardar';
    render();
  };
  sh.querySelector('.close').focus();
}
function closeSheet() { $('#sheet').hidden = true; $('#sheetBg').hidden = true; }
$('#sheetBg').onclick = closeSheet;
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

// Si una foto no carga, mostramos la fachada ilustrada.
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.closest('.thumb, .hero')) return;
  const id = img.closest('[data-id]')?.dataset.id ?? $('#sheet').dataset.id;
  const cv = document.createElement('canvas'); img.replaceWith(cv);
  const p = byId.get(id); if (p) drawFacade(cv, p);
}, true);

// ---------- Toast ----------
let toastT;
function toast(html, ms = 3500, p) {
  const w = $('#toastWrap'); w.innerHTML = '';
  const t = document.createElement(p ? 'button' : 'div'); t.className = 'toast'; t.innerHTML = html;
  if (p) t.onclick = () => { w.innerHTML = ''; select(p.id, true); openSheet(p); };
  w.appendChild(t);
  clearTimeout(toastT); toastT = setTimeout(() => { w.innerHTML = ''; }, ms);
  if (p && navigator.vibrate) try { navigator.vibrate(60); } catch {}
}

// ---------- Filtros ----------
function segment(id, attr, key, parse) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    state[key] = parse(b.dataset[attr]); lastIds = ''; render();
  });
}
segment('#opSeg', 'op', 'op', v => v);
segment('#ambSeg', 'amb', 'amb', Number);
for (const [id, key] of [['#favChip', 'fav'], ['#petChip', 'pets'], ['#credChip', 'cred']]) {
  $(id).onclick = () => { state[key] = !state[key]; $(id).setAttribute('aria-pressed', state[key]); lastIds = ''; render(); };
}
$('#walkBtn').onclick = toggleWalk;
$('#locBtn').onclick = () => { state.follow = true; if (state.pos) map.setView(state.pos, 17); };

loadListings();
startGeo();
setTimeout(() => fallback('Tardamos en encontrar tu ubicación.'), 8000);
