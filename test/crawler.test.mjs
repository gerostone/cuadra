import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract, extractSinglePair, parsePrice, guessOp, guessType } from '../crawler/extract.mjs';
import { parseRobots, isAllowed } from '../crawler/robots.mjs';

// Fichas mínimas armadas a mano con la misma estructura que cada plataforma.
const URL_ = 'https://inmo.test/propiedad/123-depto-en-venta-palermo';

test('JSON-LD con geo: toma ubicación, precio de la oferta del nodo padre y ambientes de la descripción', () => {
  const html = `<html><head><meta property="og:title" content="Departamento en venta en Palermo">
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"RealEstateListing","name":"Departamento en venta en Palermo, Gorriti 4800",
  "offers":{"@type":"Offer","price":189000,"priceCurrency":"USD"},
  "about":{"@type":"Apartment","description":"Luminoso. 3 ambientes, 68 m2.","address":{"streetAddress":"Gorriti 4800","addressLocality":"Palermo"},
  "geo":{"@type":"GeoCoordinates","latitude":-34.5891,"longitude":-58.431}}}]}</script></head></html>`;
  const { via, listings: [l] } = extract(URL_, html, 'Inmo');
  assert.equal(via, 'jsonld');
  assert.equal(l.op, 'venta');
  assert.equal(l.type, 'Departamento');
  assert.equal(l.price, 189000);
  assert.equal(l.currency, 'USD');
  assert.equal(l.lat, -34.5891);
  assert.equal(l.amb, 3);
  assert.equal(l.m2, 68);
  assert.equal(l.address, 'Gorriti 4800');
});

test('Tokko incrustado y escapado en un atributo: usa el objeto de la propiedad, no el de la sucursal', () => {
  const prop = {
    id: 91903, type: { name: 'Departamento' }, fake_address: 'Thames al 1500', geo_lat: '-34.5870', geo_long: '-58.4290',
    room_amount: 3, roofed_surface: '70', operations: [{ operation_type: 'Venta', prices: [{ currency: 'USD', price: 250000 }] }],
    branch: { name: 'Sucursal Norte', geo_lat: '-34.60', geo_long: '-58.39' },
  };
  const attr = JSON.stringify({ property: prop }).replace(/"/g, '&quot;');
  const html = `<div data-props="${attr}"></div>`;
  const { via, listings: [l] } = extract('https://inmo.test/propiedades-venta-departamento-palermo-91903', html, 'Inmo');
  assert.equal(via, 'tokko');
  assert.equal(l.lat, -34.587);
  assert.equal(l.lng, -58.429);
  assert.equal(l.price, 250000);
  assert.equal(l.id, 'inmo.test_91903_venta');
});

test('Houzez: toma el mapa de la propiedad e ignora el centro por defecto del tema', () => {
  const html = `<html><head><meta property="og:title" content="Departamento en venta en Palermo Soho de 3 ambientes"></head><body class="houzez">
  <script>var houzez_vars = {"default_lat":"-34.5734334","default_long":"-58.4210154"};</script>
  <script>var houzez_single_property_map = {"title":"Depto","price":"<span class=\\"price-prefix\\">USD<\\/span> $398.000","property_type":"Departamento","address":"2100, Thames, Palermo Soho, Buenos Aires","lat":"-34.5848581","lng":"-58.4265045"};</script>
  </body></html>`;
  const { via, listings: [l] } = extract('https://inmo.test/propiedad/depto-palermo-soho', html, 'Inmo');
  assert.equal(via, 'houzez');
  assert.equal(l.lat, -34.5848581);
  assert.equal(l.price, 398000);
  assert.equal(l.currency, 'USD');
  assert.equal(l.address, 'Thames 2100');
  assert.equal(l.amb, 3);
});

test('par único: acepta una sola ubicación y rechaza páginas con varias', () => {
  const one = `<title>Departamento en alquiler en Palermo</title><script>var myLatLng = {lat: -34.5790069, lng: -58.4345771};</script>
    <script>var again = {lat: -34.5790069, lng: -58.4345771};</script><input type="hidden" value="$" id="url_precio_moneda"><input type="hidden" value="800.000" id="url_precio_valor">`;
  const [l] = extractSinglePair('https://inmo.test/propiedad?id=1', one, 'Inmo');
  assert.equal(l.op, 'alquiler');
  assert.equal(l.price, 800000);
  assert.equal(l.currency, 'ARS');
  const two = `<title>Departamento en venta</title><script>a = {lat: -34.57, lng: -58.43}; b = {lat: -34.60, lng: -58.39};</script>`;
  assert.deepEqual(extractSinglePair('https://inmo.test/propiedad/2', two, 'Inmo'), []);
});

test('descarta avisos sin operación o con coordenadas fuera de Argentina', () => {
  const noOp = `<title>Ficha</title><script>x = {lat: -34.57, lng: -58.43}</script>`;
  assert.deepEqual(extract('https://inmo.test/ficha/1', noOp, 'Inmo').listings, []);
  const abroad = `<title>Departamento en venta</title><script>x = {lat: 40.4168, lng: -3.7038}</script>`;
  assert.deepEqual(extract('https://inmo.test/propiedad/1', abroad, 'Inmo').listings, []);
});

test('lee precios en los formatos que usan las inmobiliarias', () => {
  assert.deepEqual(parsePrice('Valor U$s 398.000'), { price: 398000, currency: 'USD' });
  assert.deepEqual(parsePrice('USD $398.000'), { price: 398000, currency: 'USD' });
  assert.deepEqual(parsePrice(' 22.000/USD'), { price: 22000, currency: 'USD' });
  assert.deepEqual(parsePrice('$ 950.000 por mes'), { price: 950000, currency: 'ARS' });
  assert.deepEqual(parsePrice('Consultar precio'), { price: null, currency: null });
  assert.equal(guessOp('Departamento en alquiler temporario'), 'alquiler');
  assert.equal(guessType('PH en venta en Palermo'), 'PH');
});

test('robots.txt: prioriza el grupo de CuadraBot y la regla más específica', () => {
  const { rules, sitemaps } = parseRobots(`User-agent: *\nDisallow: /panel/\nAllow: /panel/publico\n\nUser-agent: OtroBot\nDisallow: /\n\nSitemap: https://inmo.test/sitemap.xml`);
  assert.equal(isAllowed(rules, '/propiedad/1'), true);
  assert.equal(isAllowed(rules, '/panel/privado'), false);
  assert.equal(isAllowed(rules, '/panel/publico'), true);
  assert.deepEqual(sitemaps, ['https://inmo.test/sitemap.xml']);
  const own = parseRobots(`User-agent: *\nAllow: /\n\nUser-agent: CuadraBot\nDisallow: /`);
  assert.equal(isAllowed(own.rules, '/'), false);
});
