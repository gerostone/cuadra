import { RADIUS, NEAR, dist, fmtM, walkMin, esc, shortPrice, fullPrice, expLabel, perM2, passes, priceAmount, priceSuffix, listingSummary, opLabel, signLabel, activeFilterCount, sourceLabel, presentFacts, featureList, normalizeCaps, STEPS, pickRadius, radiusLabel, zoomForRadius } from './ui.js';
import { CELL, listingsInCell, drawFacade } from './demo.js';

// ---------- Utilidades ----------
const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

// ---------- Fuente de avisos: listings.json de la rama `data` (lo genera el crawler), o ejemplos si no hay ----------
// Se sirve desde GitHub para que actualizar avisos no requiera un deploy en Netlify.
const DATA_URL = 'https://raw.githubusercontent.com/gerostone/cuadra/data/listings.json';
const remote = { mode: 'pending', listings: [], agencies: 0 };
async function loadListings() {
  try {
    const res = await fetch(DATA_URL);
    const data = res.ok ? await res.json() : null;
    if (data?.listings?.length) Object.assign(remote, { mode: 'web', listings: data.listings, agencies: data.agencies });
    else remote.mode = 'demo';
  } catch {
    remote.mode = 'demo';
  }
  lastIds = null; render();
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
  sel: null, walking: false, walkTarget: null, follow: true, notified: new Set(),
  explore: false, realPos: null, radius: RADIUS
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
map.on('moveend', () => { if (state.pos) renderMarkers(); });
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
    g => {
      state.realPos = { lat: g.coords.latitude, lng: g.coords.longitude, acc: g.coords.accuracy, real: true };
      if (!state.walking && !state.explore) setPos(g.coords.latitude, g.coords.longitude, g.coords.accuracy, true);
    },
    () => fallback('No pudimos acceder a tu ubicación.'),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
  );
}
function fallback(msg) {
  if (state.pos) return;
  // Sin GPS, el punto de Palermo es "tu ubicación": a ese lugar vuelve ◎ después de explorar otra zona.
  state.realPos = { lat: -34.5889, lng: -58.4306, acc: 15, real: false };
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
let lastIds = null; // null obliga a redibujar la lista (una lista vacía también es '')
const byId = new Map();
let lastAround = [];
const MAX_PINS = 400;
// Avisos dentro de lo que se ve del mapa, para que al recorrerlo aparezcan todos,
// no solo los cercanos a tu ubicación.
function viewportListings() {
  const b = map.getBounds().pad(0.1);
  const inView = p => b.contains([p.lat, p.lng]) && passes(p, state, state.favs);
  if (remote.mode === 'web') return remote.listings.filter(inView);
  if (remote.mode === 'demo' && map.getZoom() >= 15) {
    const c = map.getCenter();
    return listingsAround({ lat: c.lat, lng: c.lng }, c.distanceTo(b.getNorthEast())).map(o => o.p).filter(inView);
  }
  return [];
}
function renderMarkers() {
  const set = new Map(lastAround.map(o => [o.p.id, o.p]));
  const c = map.getCenter();
  viewportListings()
    .sort((x, y) => c.distanceTo([x.lat, x.lng]) - c.distanceTo([y.lat, y.lng]))
    .slice(0, MAX_PINS)
    .forEach(p => set.set(p.id, p));
  for (const [id, mk] of markers) if (!set.has(id)) { layer.removeLayer(mk); markers.delete(id); }
  for (const p of set.values()) {
    byId.set(p.id, p);
    const cls = `pin ${p.op}${p.approx ? ' approx' : ''}${state.favs.has(p.id) ? ' fav' : ''}${state.seen.has(p.id) ? ' seen' : ''}${state.sel === p.id ? ' sel' : ''}`;
    let mk = markers.get(p.id);
    if (!mk) {
      mk = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: cls, html: `<div>${shortPrice(p)}</div>`, iconSize: [0, 0] }), keyboard: true, title: `${p.type} en ${p.op}, ${p.address}` });
      mk.on('click', () => { select(p.id); openSheet(p); });
      mk.addTo(layer); markers.set(p.id, mk);
    } else if (mk.cls !== cls) {
      mk.setIcon(L.divIcon({ className: cls, html: `<div>${shortPrice(p)}</div>`, iconSize: [0, 0] }));
    }
    mk.cls = cls;
  }
}
function render() {
  if (!state.pos) return;
  let radius = RADIUS, around;
  if (remote.mode === 'web') {
    const all = listingsAround(state.pos, STEPS.at(-1) * 1.6).filter(o => passes(o.p, state, state.favs));
    radius = pickRadius(all.map(o => o.d));
    around = all.filter(o => o.d <= radius * 1.6);
  } else around = listingsAround(state.pos, RADIUS * 1.6).filter(o => passes(o.p, state, state.favs));
  if (radius !== state.radius) {
    state.radius = radius; radiusCircle.setRadius(radius);
    if (state.follow) map.setView(state.pos, zoomForRadius(radius));
  }
  for (const { p } of around) byId.set(p.id, p);
  const inRadius = around.filter(o => o.d <= radius);
  lastAround = around;
  renderMarkers();
  // avisos cercanos
  for (const { p, d } of inRadius) {
    // Con ubicación aproximada no avisamos "estás pasando": el pin puede estar a una cuadra.
    if (d < NEAR && !p.approx && !state.notified.has(p.id)) {
      state.notified.add(p.id);
      state.seen.add(p.id); store.set('cuadra.seen', [...state.seen]);
      passingAlert(p, d);
    }
  }
  // estado
  renderStatus();
  renderDock(inRadius, radius);
}
function renderDock(inRadius, radius) {
  if (remote.mode === 'pending') { $('#countLabel').textContent = 'Cargando avisos…'; return; } // queda el esqueleto
  const n = inRadius.length;
  $('#count').textContent = n;
  $('#countLabel').innerHTML = `${state.explore ? 'en esta zona' : 'cerca tuyo'}<br>a ${radiusLabel(radius)} · ${sourceLabel(remote.mode, remote.agencies)}`;
  $('#filtersApply').textContent = n === 1 ? 'Ver 1 propiedad' : `Ver ${n} propiedades`;
  const top = inRadius.slice(0, 24);
  $('#empty').hidden = top.length > 0;
  if (!top.length) renderEmpty(radius);
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
// Sin avisos cerca: decimos dónde está el más cercano y ofrecemos ir a verlo.
function renderEmpty(radius) {
  $('#emptyClear').hidden = state.op === 'todo' && !activeFilterCount(state);
  $('#emptyExplore').hidden = true;
  if (remote.mode !== 'web') { $('#emptyText').textContent = `No hay propiedades con esos filtros a ${radiusLabel(radius)}.`; return; }
  const nearest = remote.listings.filter(p => passes(p, state, state.favs)).map(p => ({ p, d: dist(state.pos, p) })).sort((a, b) => a.d - b.d)[0];
  if (!nearest) { $('#emptyText').textContent = 'Ningún aviso cumple esos filtros. Probá aflojarlos.'; return; }
  const where = nearest.p.zone || nearest.p.address;
  $('#emptyText').innerHTML = `Todavía no tenemos avisos a menos de ${radiusLabel(STEPS.at(-1))}. El más cercano está a <b>${fmtM(nearest.d)}</b>${where ? `, en ${esc(where)}` : ''}.`;
  $('#emptyExplore').hidden = false;
  $('#emptyExplore').onclick = () => exploreTo(nearest.p);
}
// Lleva el mapa (y "tu" posición) a otra zona; el botón de ubicación vuelve a la real.
function exploreTo(p) {
  if (state.walking) toggleWalk();
  state.explore = true; state.follow = true; state.notified.clear();
  trail.setLatLngs([]);
  setPos(p.lat, p.lng, 15, false);
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
  b.onclick = () => { select(p.id); openSheet(p); };
  return b;
}
function trailLength() { const ll = trail.getLatLngs(); let s = 0; for (let i = 1; i < ll.length; i++) s += dist(ll[i - 1], ll[i]); return s; }
function renderStatus() {
  const live = state.real && !state.walking && !state.explore;
  $('#liveDot').hidden = !live;
  $('#status').textContent = state.explore ? 'Explorando · ◎ para volver' : state.walking ? `Modo paseo · ${fmtM(trailLength())}`
    : live ? `En vivo · ${fmtM(trailLength())}` : 'Palermo · aproximada';
}
function select(id) {
  state.sel = id; render();
  document.querySelector(`.card[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Diálogos (hoja de filtros y ficha) ----------
const desktop = matchMedia('(min-width: 900px)');
// En escritorio la hoja de filtros queda fija dentro del panel y la ficha se abre en el panel; en el teléfono son hojas sobre el mapa.
function placeLayout() {
  closeDialog(false);
  const fs = $('#filtersSheet'), sh = $('#sheet');
  // Venta/alquiler va arriba de la lista en escritorio y abajo en el teléfono: lo movemos para que el orden de Tab siga al visual.
  if (desktop.matches) {
    $('#dockList').before($('#opSeg'), fs); $('#dock').append(sh);
    fs.hidden = false; fs.setAttribute('role', 'group'); fs.removeAttribute('aria-modal'); sh.removeAttribute('aria-modal');
  } else {
    $('#dockList').after($('#opSeg')); document.body.append(fs, sh);
    fs.hidden = true; fs.setAttribute('role', 'dialog'); fs.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-modal', 'true');
  }
  setDock(desktop.matches ? 'expanded' : 'peek');
}
let openDlg = null;
function openDialog(el, { soft = false } = {}) {
  closeDialog(false);
  const inPanel = desktop.matches;
  openDlg = { el, back: document.activeElement, modal: !inPanel, dockBefore: $('#dock').dataset.state };
  el.hidden = false;
  if (inPanel) {
    $('#dock').classList.add('detail'); document.body.classList.add('detail-open');
    el.querySelector('.sheet-scroll')?.scrollTo(0, 0);
  } else {
    $('#scrim').hidden = false; $('#scrim').classList.toggle('soft', soft);
    setDock('hidden');
  }
  const first = [...el.querySelectorAll('[data-autofocus]')].find(x => x.offsetParent !== null) || el.querySelector('button, a[href]');
  first?.focus();
}
function closeDialog(restore = true) {
  if (!openDlg) return;
  const { el, back, dockBefore } = openDlg; openDlg = null;
  el.hidden = true; $('#scrim').hidden = true;
  $('#dock').classList.remove('detail'); document.body.classList.remove('detail-open');
  // Volvemos al estado en que estaba el panel: si venías de la lista completa, seguís ahí y en la misma posición.
  if (!desktop.matches) setDock(dockBefore === 'expanded' ? 'expanded' : 'peek');
  if (restore) focusBack(back, el.dataset.id);
}
// La lista se vuelve a dibujar al seleccionar o guardar, así que el botón que abrió la ficha puede ya no existir:
// en ese caso el foco vuelve a la tarjeta nueva de la misma propiedad.
function focusBack(back, id) {
  const el = back?.isConnected && back !== document.body ? back : id && document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  el?.focus();
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
  if (s === 'peek') $('#dockList').scrollTop = 0;
}
function toggleDock() { if (!desktop.matches) setDock($('#dock').dataset.state === 'expanded' ? 'peek' : 'expanded'); }
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
desktop.addEventListener('change', placeLayout);
placeLayout();

// ---------- Ficha ----------
function openSheet(p) {
  state.seen.add(p.id); store.set('cuadra.seen', [...state.seen]);
  const d = state.pos ? dist(state.pos, p) : 0;
  const fav = state.favs.has(p.id), facts = presentFacts(p), feats = featureList(p), m2 = perM2(p);
  const contact = p.source === 'demo' ? 'Aviso de ejemplo generado para esta demo'
    : [p.phone, p.email].filter(Boolean).map(c => `<span class="contact">${esc(c)}</span>`).join(' · ')
      + (p.alsoBy?.length ? `<br>También la publica: ${p.alsoBy.map(esc).join(', ')}` : '');
  const sh = $('#sheet');
  sh.dataset.id = p.id;
  sh.setAttribute('aria-label', `${p.type} en ${opLabel(p)}, ${p.address}`);
  sh.innerHTML = `<div class="sheet-scroll">
      <div class="hero">${p.photos?.length ? `<img src="${esc(p.photos[0])}" alt="Foto de ${esc(p.address)}">` : '<canvas></canvas>'}
        <span class="grab" aria-hidden="true"></span>
        <button type="button" class="back" data-close data-autofocus>← Volver</button>
        <button type="button" class="icon-btn close" data-close data-autofocus aria-label="Cerrar">×</button>
        <span class="sign tag ${p.op}">${signLabel(p)}</span></div>
      <div class="inner">
        <div><p class="det-price">${esc(priceAmount(p))}<small>${priceSuffix(p)}</small></p>
          <p class="det-sub">${expLabel(p, ' de expensas')}${m2 ? ` · ${m2}` : ''}${p.days != null ? ` · publicado hace ${p.days} ${p.days === 1 ? 'día' : 'días'}` : ''}</p></div>
        <div><p class="det-where">${esc(p.address)}${p.piso ? ', ' + esc(p.piso) : ''}</p>
          <p class="det-sub">${esc(p.type)}${p.zone ? ' en ' + esc(p.zone) : ''} · a ${fmtM(d)}, ${walkMin(d)} min caminando</p>
          ${p.approx ? '<p class="det-sub">Ubicación aproximada: la inmobiliaria no publica el mapa y la ubicamos por la dirección.</p>' : ''}</div>
        ${facts.length ? `<div class="facts">${facts.map(f => `<div><b>${esc(f.value)}</b>${esc(f.label)}</div>`).join('')}</div>` : ''}
        ${feats.length ? `<div class="feats">${feats.map(f => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
        ${p.desc ? `<div><p class="desc">${esc(normalizeCaps(p.desc))}</p><button type="button" class="more" hidden>Leer más</button></div>` : ''}
        <div class="agent"><b>${esc(p.agent)}</b>${contact}</div>
      </div>
    </div>
    <div class="actbar">
      <button type="button" class="btn ghost save" id="favBtn" aria-pressed="${fav}" aria-label="Guardar">${fav ? '♥' : '♡'}</button>
      ${p.url ? `<a class="btn ghost" target="_blank" rel="noopener" href="${esc(p.url)}">Ver aviso</a>` : ''}
      <a class="btn main" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${p.approx ? encodeURIComponent(`${p.address}, ${p.zone}`) : `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`}">Cómo llegar</a>
    </div>`;
  openDialog(sh, { soft: true });
  requestAnimationFrame(() => {
    const cv = sh.querySelector('.hero canvas'); if (cv) drawFacade(cv, p);
    const desc = sh.querySelector('.desc');
    if (desc && desc.scrollHeight > desc.clientHeight + 2) sh.querySelector('.more').hidden = false;
  });
  sh.querySelector('.more')?.addEventListener('click', e => {
    const open = sh.querySelector('.desc').classList.toggle('open');
    e.currentTarget.textContent = open ? 'Leer menos' : 'Leer más';
  });
  sh.querySelector('#favBtn').onclick = e => {
    if (state.favs.has(p.id)) state.favs.delete(p.id); else state.favs.add(p.id);
    store.set('cuadra.favs', [...state.favs]);
    const on = state.favs.has(p.id);
    e.currentTarget.textContent = on ? '♥' : '♡'; e.currentTarget.setAttribute('aria-pressed', on);
    render();
  };
  sheetGesture(sh);
  focusPin(p);
}
// Arrastrar la foto hacia abajo cierra la ficha.
function sheetGesture(sh) {
  const hero = sh.querySelector('.hero');
  let y0 = null, dy = 0;
  hero.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || !openDlg?.modal) return;
    y0 = e.clientY; dy = 0; hero.setPointerCapture(e.pointerId); sh.classList.add('dragging');
  });
  hero.addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = `translateY(${dy}px)`; });
  const end = () => { if (y0 == null) return; y0 = null; sh.classList.remove('dragging'); sh.style.transform = ''; if (dy > 80) closeDialog(); };
  hero.addEventListener('pointerup', end); hero.addEventListener('pointercancel', end);
}
// Centra el pin en la parte del mapa que se ve: arriba de la ficha en el teléfono, a la derecha del panel en escritorio.
function focusPin(p) {
  state.follow = false;
  const shift = desktop.matches ? [-190, 0] : [0, map.getSize().y / 2 - 75];
  map.panTo(map.unproject(map.project([p.lat, p.lng]).add(shift)), { animate: true });
}

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
  el.onclick = () => { if (swiped) return; hideAlert(); select(p.id); openSheet(p); };
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
  syncFilterControls(); lastIds = null; render();
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
  syncFilterControls(); lastIds = null; render();
}
$('#emptyClear').onclick = () => clearFilters(true);
$('#walkBtn').onclick = toggleWalk;
$('#locBtn').onclick = () => {
  state.follow = true;
  if (state.explore && state.realPos) {
    state.explore = false; trail.setLatLngs([]);
    setPos(state.realPos.lat, state.realPos.lng, state.realPos.acc, state.realPos.real);
  } else if (state.explore) { state.explore = false; render(); }
  if (state.pos) map.setView(state.pos, zoomForRadius(state.radius));
};

loadListings();
startGeo();
setTimeout(() => fallback('Tardamos en encontrar tu ubicación.'), 8000);
