import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtM, walkMin, esc, shortPrice, priceAmount, priceSuffix, fullPrice, expLabel, perM2,
  listingSummary, signLabel, passes, activeFilterCount, DEFAULT_FILTERS, normalizeCaps,
  presentFacts, featureList, sourceLabel, pickRadius, radiusLabel, zoomForRadius, STEPS
} from '../public/ui.js';

const venta = { id: 'v1', op: 'venta', type: 'Departamento', amb: 2, m2: 48, m2tot: 52, price: 130000, currency: 'USD', banos: 1, mascotas: true, credito: false };
const alquiler = { id: 'a1', op: 'alquiler', type: 'PH', amb: 3, m2: 70, price: 650000, currency: 'ARS', exp: 95000, mascotas: false, credito: false };
const filters = (o = {}) => ({ ...DEFAULT_FILTERS, ...o });

test('distancias y minutos a pie', () => {
  assert.equal(fmtM(234), '230 m');
  assert.equal(fmtM(1240), '1,2 km');
  assert.equal(walkMin(10), 1);
  assert.equal(walkMin(400), 5);
});

test('esc escapa todo lo que puede romper el HTML', () => {
  assert.equal(esc(`<b>"x" & 'y'</b>`), '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
  assert.equal(esc(null), '');
});

test('precios', () => {
  assert.equal(priceAmount(venta), 'US$ 130.000');
  assert.equal(priceSuffix(venta), '');
  assert.equal(priceAmount(alquiler), '$ 650.000');
  assert.equal(priceSuffix(alquiler), '/mes');
  assert.equal(priceSuffix({ ...alquiler, temporario: true }), '/mes · temporario');
  assert.equal(fullPrice(alquiler), '$ 650.000/mes');
  assert.equal(shortPrice(venta), 'US$130k');
  assert.equal(shortPrice({ ...venta, price: 1250000 }), 'US$1,25M');
});

test('una propiedad sin precio dice "Consultar" y no "undefined"', () => {
  const p = { ...venta, price: null };
  assert.equal(priceAmount(p), 'Consultar');
  assert.equal(priceSuffix({ ...alquiler, price: null }), '');
  assert.equal(fullPrice(p), 'Precio a consultar');
  assert.equal(shortPrice(p), 'Consultar');
});

test('expensas y precio por m²', () => {
  assert.equal(expLabel(alquiler, ' expensas'), '+ $ 95.000 expensas');
  assert.equal(expLabel({ ...venta, source: 'demo' }, ' expensas'), 'Sin expensas');
  assert.equal(expLabel(venta, ' expensas'), 'Expensas a consultar');
  assert.equal(perM2(venta), 'US$ 2.708/m²');
  assert.equal(perM2(alquiler), '');
  assert.equal(perM2({ ...venta, m2: 0 }), '');
});

test('resumen corto: sin ceros ni undefined', () => {
  assert.equal(listingSummary(venta), '2 amb · 48 m²');
  assert.equal(listingSummary({ type: 'Casa', amb: 0, m2: 0 }), 'Casa');
  assert.equal(listingSummary({ type: 'Local', m2: 30 }), '30 m²');
  assert.equal(signLabel(venta), 'Vende');
  assert.equal(signLabel(alquiler), 'Alquila');
});

test('filtros', () => {
  const favs = new Set(['a1']);
  assert.equal(passes(venta, filters(), favs), true);
  assert.equal(passes(venta, filters({ op: 'alquiler' }), favs), false);
  assert.equal(passes(venta, filters({ amb: 2 }), favs), true);
  assert.equal(passes(venta, filters({ amb: 3 }), favs), false);
  assert.equal(passes({ ...venta, amb: 5 }, filters({ amb: 4 }), favs), true);
  assert.equal(passes(venta, filters({ fav: true }), favs), false);
  assert.equal(passes(alquiler, filters({ fav: true }), favs), true);
  assert.equal(passes(venta, filters({ pets: true }), favs), true);
  assert.equal(passes(alquiler, filters({ pets: true }), favs), false);
  assert.equal(passes(venta, filters({ cred: true }), favs), false);
});

test('"4+" ambientes excluye las propiedades sin dato de ambientes', () => {
  assert.equal(passes({ ...venta, amb: undefined }, filters({ amb: 4 }), new Set()), false);
  assert.equal(passes({ ...venta, amb: 0 }, filters({ amb: 4 }), new Set()), false);
});

test('el contador de filtros no cuenta venta/alquiler', () => {
  assert.equal(activeFilterCount(filters()), 0);
  assert.equal(activeFilterCount(filters({ op: 'venta' })), 0);
  assert.equal(activeFilterCount(filters({ amb: 2, pets: true })), 2);
  assert.equal(activeFilterCount(filters({ amb: 4, fav: true, pets: true, cred: true })), 4);
});

test('normalizeCaps pasa las descripciones en mayúsculas a oraciones', () => {
  assert.equal(
    normalizeCaps('(A REFACCIONAR - A TERMINAR) PH 3 AMBIENTES EN UNA SOLA PLANTA. IDEAL INVERSIÓN.'),
    '(A refaccionar - a terminar) PH 3 ambientes en una sola planta. Ideal inversión.'
  );
  assert.equal(normalizeCaps('EDIFICIO HISTÓRICO DE 4 PISOS - VENTA EN BLOCK'), 'Edificio histórico de 4 pisos - venta en block');
  assert.equal(normalizeCaps('LINDO.\nMUY LUMINOSO'), 'Lindo.\nMuy luminoso');
});

test('normalizeCaps no confunde siglas con el comienzo de palabras con acentos o eñe', () => {
  assert.equal(normalizeCaps('VENDO CABAÑAS EN CABA. ALQUILO PH.'), 'Vendo cabañas en CABA. Alquilo PH.');
  assert.equal(normalizeCaps('CASA CON PHÓTOS'), 'Casa con phótos');
});

test('normalizeCaps no toca textos con mayúsculas normales', () => {
  assert.equal(normalizeCaps('Luminoso PH con TERRAZA propia'), 'Luminoso PH con TERRAZA propia');
  assert.equal(normalizeCaps('Hola'), 'Hola');
  assert.equal(normalizeCaps('123'), '123');
  assert.equal(normalizeCaps(null), '');
  assert.equal(normalizeCaps(''), '');
});

test('presentFacts muestra solo los datos que hay', () => {
  assert.deepEqual(presentFacts(venta), [
    { value: '2', label: 'Amb.' }, { value: '48', label: 'm² cub.' },
    { value: '52', label: 'm² tot.' }, { value: '1', label: 'Baño' }
  ]);
  assert.deepEqual(presentFacts({ amb: 0, m2: 0, m2tot: 0, banos: 0 }), []);
  assert.deepEqual(presentFacts({ m2: 40, m2tot: 40 }), [{ value: '40', label: 'm² cub.' }]);
  assert.deepEqual(presentFacts({ banos: 2, antig: 0 }), [{ value: '2', label: 'Baños' }, { value: 'Nuevo', label: 'A estrenar' }]);
  assert.deepEqual(presentFacts({ antig: 80 }), [{ value: '80', label: 'Años' }]);
});

test('featureList suma mascotas y crédito sin repetir', () => {
  assert.deepEqual(featureList({ feats: ['Balcón', 'Luminoso'], mascotas: true, credito: true }), ['Balcón', 'Luminoso', 'Acepta mascotas', 'Apto crédito']);
  assert.deepEqual(featureList({ feats: ['Apto crédito'], credito: true }), ['Apto crédito']);
  assert.deepEqual(featureList({}), []);
});

test('origen de los avisos', () => {
  assert.equal(sourceLabel('web', 6), '6 inmobiliarias');
  assert.equal(sourceLabel('web', 1), '1 inmobiliaria');
  assert.equal(sourceLabel('demo'), 'ejemplos');
  assert.equal(sourceLabel('pending'), 'cargando…');
});

test('el radio se agranda hasta encontrar al menos 5 avisos', () => {
  assert.deepEqual(STEPS, [500, 1000, 2000, 5000]);
  assert.equal(pickRadius([10, 50, 100, 200, 450, 900]), 500);
  assert.equal(pickRadius([10, 50, 700, 900, 990]), 1000);
  assert.equal(pickRadius([300, 1500, 1800, 1900, 1999]), 2000);
  assert.equal(pickRadius([4000, 4100]), 5000);
  assert.equal(pickRadius([]), 5000);
});

test('etiqueta y zoom de cada radio', () => {
  assert.equal(radiusLabel(500), '5 cuadras');
  assert.equal(radiusLabel(1000), '1 km');
  assert.equal(radiusLabel(2000), '2 km');
  assert.equal(radiusLabel(5000), '5 km');
  assert.deepEqual(STEPS.map(zoomForRadius), [17, 16, 15, 14]);
});
