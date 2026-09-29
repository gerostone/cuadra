import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract, extractSinglePair, parsePrice, guessOp, guessType, tokkoWebMarkers, tokkoWebCards, tokkoWebListings } from '../crawler/extract.mjs';
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

test('Houzez sin operación en el título: la toma del estado publicado y del data-map', () => {
  const html = `<html><head><title>33 Orientales 215 - Predial</title></head><body class="houzez property_status-venta">
  <div id="houzez-single-listing-map" data-map='{"latitude":"-34.5729135","longitude":"-58.4555977","address":""}'></div>
  <a href="https://inmo.test/estado/venta/" class="label-status">Compra</a><span class="item-price">USD 245.600</span></body></html>`;
  const { via, listings: [l] } = extract('https://inmo.test/propiedad/10505118-2/', html, 'Inmo');
  assert.equal(via, 'houzez');
  assert.equal(l.op, 'venta');
  assert.equal(l.lat, -34.5729135);
});

test('plantilla web de Tokko: cruza tarjetas del listado con los marcadores del mapa', () => {
  const html = `<script>function load_markers(){ add_new_marker('8565374', -34.603976100000000, -58.438102200000010);
    add_new_marker('999', -34.61, -58.40); }</script>
  <ul id="propiedades"><li prop-id="8565374"><a href="/p/8565374-Departamento-en-Venta-en-Villa-Crespo-Warnes--55-">
  <div class="prop-data"><div>68.10 m²</div></div><div class="prop-data2"><div>3</div></div>
  <img class="dest-img" src="https://static.tokkobroker.com/w_pics/8565374_x.jpg" alt=""/>
  <div class="prop-desc"><div class="prop-desc-tipo-ub">Departamento en Venta en Villa Crespo, Capital Federal</div><div class="prop-desc-dir">Warnes 55 </div></div></a>
  <div class="prop-valor-nro" onClick="x()"> USD148.000 <div class='codref'>VAP8565374</div></div></li>
  <li prop-id="777"><a href="/p/777-Casa-en-Alquiler"><div class="prop-desc-tipo-ub">Casa en Alquiler en Palermo</div></a></li></ul>`;
  const markers = tokkoWebMarkers(html);
  assert.equal(markers.size, 2);
  const cards = tokkoWebCards(html, 'https://inmo.test');
  assert.equal(cards.length, 2);
  const out = tokkoWebListings(cards, markers, 'Inmo', 'inmo.test');
  assert.equal(out.length, 1, 'la tarjeta sin marcador se descarta');
  const [l] = out;
  assert.deepEqual([l.op, l.type, l.price, l.currency, l.amb, l.m2, l.address, l.zone], ['venta', 'Departamento', 148000, 'USD', 3, 68.1, 'Warnes 55', 'Villa Crespo']);
  assert.equal(l.lat, -34.6039761);
  assert.equal(l.url, 'https://inmo.test/p/8565374-Departamento-en-Venta-en-Villa-Crespo-Warnes--55-');
});

test('ficha de la plantilla web de Tokko: ubicación del mapa y datos de los ítems', () => {
  const html = `<html><head><title>Lipovich  - Departamento en Venta en Villa Crespo - Ferrari al 200</title>
  <link href="https://static.tokkobroker.com/tfw/css/x.css"></head><body>
  <img src="https://static.tokkobroker.com/w_pics/9571354_abc.jpg">
  <div class='operation-type-div operation-type-div-venta'>VENTA</div><div class='operation-val op-venta'> <span>USD220.000</span></div>
  <div class="ficha_detalle_item"><b>Dirección</b><br/>Ferrari al 200</div><div class="ficha_detalle_item"><b>Ubicación</b><br/>Villa Crespo</div>
  <div class="ficha_detalle_item"><b>Superficie cubierta</b><br/>115 m²</div><div class="ficha_detalle_item"><b>Ambientes</b><br/>4</div>
  <script>var map = L.map(document.getElementById("openstreetmap_box")).setView([-34.6019755, -58.4437046], 15);</script></body></html>`;
  const { via, listings: [l] } = extract('https://inmo.test/p/9571354-Departamento-en-Venta', html, 'Lipovich');
  assert.equal(via, 'tokkoFicha');
  assert.deepEqual([l.op, l.type, l.price, l.currency, l.amb, l.m2, l.address, l.zone], ['venta', 'Departamento', 220000, 'USD', 4, 115, 'Ferrari al 200', 'Villa Crespo']);
  assert.equal(l.lat, -34.6019755);
  assert.deepEqual(l.photos, ['https://static.tokkobroker.com/w_pics/9571354_abc.jpg']);
});

import { cleanAddress } from '../crawler/geocode.mjs';

test('direcciones para geocodificar: limpia el formato de las fichas y descarta lo impreciso', () => {
  assert.equal(cleanAddress('EL TORDO AL 1900'), 'El Tordo 1900');
  assert.equal(cleanAddress('AYOLAS Y SAN JUSTO al 3900'), 'Ayolas 3900');
  assert.equal(cleanAddress('MUNILLA 2288, CASTELAR, BS AS'), 'Munilla 2288');
  assert.equal(cleanAddress('BRANDSEN al 400 - EDIFICIO TOUCHÉ'), 'Brandsen 400');
  assert.equal(cleanAddress('BARRIO CERRADO ALTOS DEL SOL'), null);
  assert.equal(cleanAddress('Recoleta'), null, 'sin altura no se busca');
});

test('ficha de Tokko sin mapa: solo con geocode activado devuelve el aviso para buscar la dirección', () => {
  const html = `<html><head><title>Gomez Silvia Propiedades - Casa en Venta en Ituzaingó - EL TORDO AL 1900</title><link href="https://static.tokkobroker.com/x.css"></head>
  <body><div class='operation-type-div operation-type-div-venta'>VENTA</div><div class='operation-val'> <span>USD95.000</span></div>
  <div class="ficha_detalle_item"><b>Dirección</b><br/>EL TORDO AL 1900</div><div class="ficha_detalle_item"><b>Ubicación</b><br/>Ituzaingó</div></body></html>`;
  const url = 'https://inmo.test/p/8515402-Casa-en-Venta';
  assert.deepEqual(extract(url, html, 'Gomez').listings, []);
  const { via, listings: [l] } = extract(url, html, 'Gomez', { geocode: true });
  assert.equal(via, 'tokkoFicha+direccion');
  assert.equal(l.needsGeocode, true);
  assert.equal(l.lat, null);
  assert.deepEqual([l.op, l.type, l.price, l.address, l.zone], ['venta', 'Casa', 95000, 'EL TORDO AL 1900', 'Ituzaingó']);
});
