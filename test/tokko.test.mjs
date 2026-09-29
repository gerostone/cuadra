import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeProperty, dedupe, loadInventory, fetchAgencyInventory, nearby } from '../lib/tokko.mjs';

const page = JSON.parse(readFileSync(new URL('./fixtures/tokko-page.json', import.meta.url)));
const [p101, p202, p303, p404] = page.objects;

const fakeFetch = (pages) => {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const offset = Number(new URL(url).searchParams.get('offset'));
    const body = pages[offset] ?? { meta: { total_count: 0 }, objects: [] };
    return { ok: true, status: 200, json: async () => body };
  };
  impl.calls = calls;
  return impl;
};

test('una propiedad con venta y alquiler genera dos avisos', () => {
  const out = normalizeProperty(p101);
  assert.equal(out.length, 2);
  const [venta, alquiler] = out;
  assert.equal(venta.op, 'venta');
  assert.equal(venta.price, 189000);
  assert.equal(venta.currency, 'USD');
  assert.equal(alquiler.op, 'alquiler');
  assert.equal(alquiler.currency, 'ARS');
  assert.equal(alquiler.price, 950000);
  assert.notEqual(venta.id, alquiler.id);
});

test('normaliza campos, usa la dirección pública y limpia HTML', () => {
  const [l] = normalizeProperty(p101);
  assert.equal(l.lat, -34.5891);
  assert.equal(l.lng, -58.431);
  assert.equal(l.address, 'Gorriti al 4800');
  assert.equal(l.amb, 3);
  assert.equal(l.m2, 68);
  assert.equal(l.m2tot, 74);
  assert.equal(l.exp, 185000);
  assert.equal(l.agent, 'Soho Propiedades');
  assert.equal(l.photos[0], 'https://static.tokkobroker.com/pictures/101-1.jpg', 'la portada va primero');
  assert.ok(l.mascotas && l.credito);
  assert.ok(!/[<>]/.test(l.desc), 'sin etiquetas HTML');
  assert.equal(l.desc, 'Luminoso 3 ambientes');
  assert.equal(l.url, 'https://ficha.info/p/101');
});

test('respeta precio oculto y marca alquiler temporario', () => {
  const [l] = normalizeProperty(p303);
  assert.equal(l.op, 'alquiler');
  assert.equal(l.temporario, true);
  assert.equal(l.price, null);
});

test('descarta avisos sin coordenadas', () => {
  assert.deepEqual(normalizeProperty(p404), []);
});

test('junta la misma propiedad publicada por dos inmobiliarias', () => {
  const all = [...normalizeProperty(p101), ...normalizeProperty(p202)];
  const out = dedupe(all);
  const ventas = out.filter(l => l.op === 'venta');
  assert.equal(ventas.length, 1);
  assert.deepEqual(ventas[0].alsoBy, ['Otra Inmobiliaria']);
});

test('pagina hasta completar total_count', async () => {
  const f = fakeFetch({
    0: { meta: { total_count: 300 }, objects: Array.from({ length: 250 }, (_, i) => ({ id: i })) },
    250: { meta: { total_count: 300 }, objects: Array.from({ length: 50 }, (_, i) => ({ id: 250 + i })) },
  });
  const objs = await fetchAgencyInventory('KEY', { fetchImpl: f });
  assert.equal(objs.length, 300);
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[0], /key=KEY/);
});

test('si una inmobiliaria falla, las demás siguen', async () => {
  const impl = async (url) => url.includes('key=MALA')
    ? { ok: false, status: 401, json: async () => ({}) }
    : { ok: true, status: 200, json: async () => page };
  const inv = await loadInventory(['BUENA', 'MALA'], { fetchImpl: impl });
  assert.equal(inv.agencies, 1);
  assert.equal(inv.errors.length, 1);
  assert.ok(inv.listings.length >= 3);
});

test('filtra por radio', () => {
  const all = dedupe(page.objects.flatMap(o => normalizeProperty(o)));
  assert.equal(nearby(all, { lat: -34.5891, lng: -58.431 }, 50).length, 2);
  assert.equal(nearby(all, { lat: -34.5891, lng: -58.431 }, 500).length, all.length);
});

test('descarta links que no son http(s)', () => {
  const [l] = normalizeProperty({ ...p101, public_url: 'javascript:alert(1)', photos: [{ image: 'data:x' }] });
  assert.equal(l.url, null);
  assert.deepEqual(l.photos, []);
});
