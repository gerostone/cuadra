import { RADIUS, NEAR, dist, fmtM, walkMin, esc, shortPrice, fullPrice, expLabel, perM2, passes, priceAmount, priceSuffix, listingSummary, opLabel, signLabel, activeFilterCount, sourceLabel } from './ui.js';
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
map.on('click', e => { if (state.walking) { state.walkTarget = e.latlng; info('Caminando hacia ese punto…', 2500); } });

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
  info(`${msg} Te ubicamos en Palermo. Tocá <b>Simular caminata</b> para recorrer el barrio.`, 6000);
}

// ---------- Simulación de caminata ----------
let walkTimer = null, heading = Math.random() * Math.PI * 2;
function toggleWalk() {
  state.walking = !state.walking;
  $('#walkBtn').setAttribute('aria-pressed', state.walking);
  if (state.walking) {
    state.follow = true;
    info('Modo paseo: caminás solo por el barrio. Tocá el mapa para elegir hacia dónde.');
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
      passingAlert(p, d);
    }
  }
  // estado
  renderStatus();
  renderDock(inRadius);
}
function renderDock(inRadius) {
  if (remote.mode === 'pending') { $('#countLabel').textContent = 'Cargando avisos…'; return; } // queda el esqueleto
  const n = inRadius.length;
  $('#count').textContent = n;
  $('#countLabel').innerHTML = `cerca tuyo<br>a 5 cuadras · ${sourceLabel(remote.mode, remote.agencies)}`;
  $('#filtersApply').textContent = n === 1 ? 'Ver 1 propiedad' : `Ver ${n} propiedades`;
  const top = inRadius.slice(0, 24);
  $('#empty').hidden = top.length > 0;
  if (!top.length) {
    const noData = remote.mode === 'web' && !listingsAround(state.pos, RADIUS).length;
    $('#emptyText').textContent = noData
      ? 'Todavía no tenemos avisos de inmobiliarias en esta zona. Caminá hacia otro barrio o volvé más adelante.'
      : 'No hay propiedades con esos filtros a 5 cuadras.';
    $('#emptyClear').hidden = noData || (state.op === 'todo' && !activeFilterCount(state));
  }
  const ids = top.map(o => o.p.id + (state.favs.has(o.p.id) ? '*' : '') + (state.sel === o.p.id ? '!' : '')).join(',');
  const cards = $('#cards');
  if (ids !== lastIds) {
    lastIds = ids;
    cards.replaceChildren(...top.map(({ p, d }) => cardEl(p, d)));
    cards.querySelectorAll('canvas').forEach(cv => drawFacade(cv, byId.get(cv.closest('[data-id]').dataset.id)));
  } else {
    // solo actualizar distancias
    top.forEach(({ d }, i) => { const el = cards.children[i]?.querySelector('[data-d]'); if (el) el.textContent = `${fmtM(d)} · ${walkMin(d)} min`; });
  }
}
function cardEl(p, d) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'card' + (state.sel === p.id ? ' sel' : ''); b.dataset.id = p.id;
  const thumb = p.photos?.length ? `<img src="${esc(p.photos[0])}" alt="" loading="lazy">` : '<canvas></canvas>';
  b.innerHTML = `<span class="thumb">${thumb}</span><span class="card-body">
      <span class="tag ${p.op}">${signLabel(p)}</span>
      <span class="card-price">${esc(priceAmount(p))}<small>${priceSuffix(p)}</small></span>
      <span class="card-meta">${esc(listingSummary(p))} · <span data-d>${fmtM(d)} · ${walkMin(d)} min</span></span>
      <span class="card-addr">${state.favs.has(p.id) ? '♥ ' : ''}${esc(p.address)}</span>
    </span><span class="card-go" aria-hidden="true">Ver</span>`;
  b.onclick = () => { select(p.id, true); openSheet(p); };
  return b;
}
function trailLength() { const ll = trail.getLatLngs(); let s = 0; for (let i = 1; i < ll.length; i++) s += dist(ll[i - 1], ll[i]); return s; }
function renderStatus() {
  const live = state.real && !state.walking;
  $('#liveDot').hidden = !live;
  $('#status').textContent = state.walking ? `Modo paseo · ${fmtM(trailLength())}`
    : live ? `En vivo · ${fmtM(trailLength())}` : 'Palermo · aproximada';
}
function select(id, pan) {
  state.sel = id; render();
  const card = document.querySelector(`.card[data-id="${id}"]`);
  card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  const p = byId.get(id);
  if (pan && p) { state.follow = false; map.panTo([p.lat, p.lng]); }
}

// ---------- Diálogos (hoja de filtros y ficha) ----------
let openDlg = null;
function openDialog(el, { soft = false } = {}) {
  closeDialog(false);
  openDlg = { el, back: document.activeElement, modal: true };
  el.hidden = false;
  $('#scrim').hidden = false; $('#scrim').classList.toggle('soft', soft);
  setDock('hidden');
  const first = [...el.querySelectorAll('[data-autofocus]')].find(x => x.offsetParent !== null) || el.querySelector('button, a[href]');
  first?.focus();
}
function closeDialog(restore = true) {
  if (!openDlg) return;
  const { el, back } = openDlg; openDlg = null;
  el.hidden = true; $('#scrim').hidden = true;
  setDock('peek');
  if (restore && back?.isConnected) back.focus();
}
addEventListener('keydown', e => {
  if (!openDlg) return;
  if (e.key === 'Escape') { e.preventDefault(); closeDialog(); return; }
  if (e.key !== 'Tab' || !openDlg.modal) return;
  const f = [...openDlg.el.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
document.addEventListener('click', e => { if (openDlg && e.target.closest('[data-close]')) closeDialog(); });
$('#scrim').onclick = () => closeDialog();
$('#filtersBtn').onclick = () => openDialog($('#filtersSheet'));
$('#filtersApply').onclick = () => closeDialog();
$('#filtersClear').onclick = () => clearFilters(false);

// ---------- Panel inferior ----------
// Tres estados: peek (la más cercana), expanded (lista completa) y hidden (con una hoja abierta).
let dockDragged = false;
function setDock(s) {
  const dock = $('#dock');
  dock.dataset.state = s; document.body.dataset.dock = s;
  $('#dockGrab').setAttribute('aria-expanded', s === 'expanded');
  $('#dockGrab').setAttribute('aria-label', s === 'expanded' ? 'Achicar la lista' : 'Ver la lista completa');
  if (s !== 'expanded') $('#dockList').scrollTop = 0;
}
function toggleDock() { setDock($('#dock').dataset.state === 'expanded' ? 'peek' : 'expanded'); }
// Los botones del mapa se acomodan arriba del panel achicado.
function syncDockHeight() {
  const dock = $('#dock');
  if (dock.dataset.state === 'peek') document.documentElement.style.setProperty('--dock-h', dock.offsetHeight + 'px');
}
new ResizeObserver(syncDockHeight).observe($('#dock'));
function dockGesture(el) {
  let y0 = null, dy = 0;
  el.addEventListener('pointerdown', e => {
    if (e.target.closest('button') && e.target.closest('button') !== $('#dockGrab')) return; // Filtros tiene su propio click
    y0 = e.clientY; dy = 0; dockDragged = false;
    el.setPointerCapture(e.pointerId); $('#dock').classList.add('dragging');
  });
  el.addEventListener('pointermove', e => {
    if (y0 == null) return;
    dy = e.clientY - y0;
    if (Math.abs(dy) > 8) dockDragged = true;
    const expanded = $('#dock').dataset.state === 'expanded';
    $('#dock').style.transform = `translateY(${expanded ? Math.max(0, dy) : Math.max(-40, Math.min(0, dy))}px)`;
  });
  const end = () => {
    if (y0 == null) return;
    const dock = $('#dock'), s = dock.dataset.state;
    dock.classList.remove('dragging'); dock.style.transform = '';
    if (dy < -40 && s === 'peek') setDock('expanded');
    else if (dy > 40 && s === 'expanded') setDock('peek');
    y0 = null;
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
dockGesture($('#dockGrab'));
dockGesture($('.dock-head'));
$('#dockGrab').addEventListener('click', () => { if (!dockDragged) toggleDock(); });
$('.dock-head').addEventListener('click', e => { if (!dockDragged && !e.target.closest('button')) toggleDock(); });
setDock('peek');

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

// ---------- Aviso de arriba ----------
// "Estás pasando" usa el color del cartel de la propiedad; los mensajes informativos, el oscuro del panel.
let alertT;
function showAlert(el, ms) {
  $('#alertWrap').replaceChildren(el);
  document.body.classList.add('has-alert');
  clearTimeout(alertT); alertT = setTimeout(hideAlert, ms);
}
function hideAlert() {
  clearTimeout(alertT);
  $('#alertWrap').replaceChildren();
  document.body.classList.remove('has-alert');
}
function info(html, ms = 4000) {
  const el = document.createElement('div');
  el.className = 'alert info'; el.innerHTML = `<p>${html}</p>`;
  showAlert(el, ms);
}
function passingAlert(p, d) {
  const el = document.createElement('button');
  el.type = 'button'; el.className = `alert ${p.op}`;
  el.innerHTML = `<span class="alert-body">
      <small>Estás pasando · a ${fmtM(d)}</small>
      <span class="alert-price">${esc(priceAmount(p))}<span>${priceSuffix(p)}</span></span>
      <span class="alert-sub">${esc(p.address)} · ${esc(listingSummary(p))} · ${opLabel(p)}</span>
    </span><span class="alert-go" aria-hidden="true">Ver</span>`;
  // Deslizar hacia arriba lo descarta.
  let y0 = null, swiped = false;
  el.addEventListener('pointerdown', e => { y0 = e.clientY; swiped = false; });
  el.addEventListener('pointerup', e => { if (y0 != null && e.clientY - y0 < -30) { swiped = true; hideAlert(); } y0 = null; });
  el.onclick = () => { if (swiped) return; hideAlert(); select(p.id, true); openSheet(p); };
  showAlert(el, 8000);
  if (navigator.vibrate) try { navigator.vibrate(60); } catch {}
}

// ---------- Filtros ----------
// Cualquier botón con data-op, data-amb o data-flag cambia el filtro, esté en el panel, en la hoja de filtros o en la barra.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-op], [data-amb], [data-flag]');
  if (!b) return;
  if (b.dataset.op) state.op = b.dataset.op;
  else if (b.dataset.amb) state.amb = Number(b.dataset.amb);
  else state[b.dataset.flag] = !state[b.dataset.flag];
  syncFilterControls(); lastIds = ''; render();
});
function syncFilterControls() {
  document.querySelectorAll('[data-op]').forEach(b => b.setAttribute('aria-pressed', b.dataset.op === state.op));
  document.querySelectorAll('[data-amb]').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.amb) === state.amb));
  document.querySelectorAll('[data-flag]').forEach(b => b.setAttribute('aria-pressed', !!state[b.dataset.flag]));
  const n = activeFilterCount(state);
  $('#filtersBadge').textContent = n; $('#filtersBadge').hidden = !n;
}
function clearFilters(all) {
  Object.assign(state, { amb: 0, fav: false, pets: false, cred: false }, all ? { op: 'todo' } : {});
  syncFilterControls(); lastIds = ''; render();
}
$('#emptyClear').onclick = () => clearFilters(true);
$('#walkBtn').onclick = toggleWalk;
$('#locBtn').onclick = () => { state.follow = true; if (state.pos) map.setView(state.pos, 17); };

loadListings();
startGeo();
setTimeout(() => fallback('Tardamos en encontrar tu ubicación.'), 8000);
