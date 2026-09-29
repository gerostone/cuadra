// Diagnóstico temporal de la API de Mercado Libre: pide un token de app
// (client_credentials) y prueba la búsqueda de inmuebles. Nunca devuelve el token.
// Se borra cuando el conector esté andando.
const API = 'https://api.mercadolibre.com';

export default async () => {
  const id = process.env.ML_CLIENT_ID || '7766328177008518', secret = process.env.ML_CLIENT_SECRET;
  if (!id || !secret) return Response.json({ error: 'Falta ML_CLIENT_SECRET en las variables de entorno de Netlify' }, { status: 500 });

  const out = {};
  const tr = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  });
  const tj = await tr.json().catch(() => ({}));
  out.token = { status: tr.status, ok: !!tj.access_token, expires_in: tj.expires_in, scope: tj.scope, error: tj.error, message: tj.message };
  if (!tj.access_token) return Response.json(out);

  const auth = { authorization: `Bearer ${tj.access_token}`, accept: 'application/json' };
  const tries = {
    area: `${API}/sites/MLA/search?category=MLA1459&item_location=lat:-34.595_-34.583,lon:-58.440_-58.420&limit=5`,
    category: `${API}/sites/MLA/search?category=MLA1459&limit=5`,
    query: `${API}/sites/MLA/search?q=departamento%20palermo&limit=5`,
  };
  for (const [name, url] of Object.entries(tries)) {
    const r = await fetch(url, { headers: auth });
    const j = await r.json().catch(() => ({}));
    const first = j.results?.[0];
    out[name] = {
      status: r.status, error: j.error, message: j.message,
      total: j.paging?.total, count: j.results?.length,
      firstKeys: first && Object.keys(first),
      firstLocation: first?.location,
      firstAttrs: first?.attributes?.map(a => `${a.id}=${a.value_name}`).slice(0, 30),
      sample: first && { id: first.id, title: first.title, price: first.price, currency: first.currency_id, category: first.category_id, permalink: first.permalink },
    };
  }
  if (out.area?.sample?.id || out.category?.sample?.id) {
    const itemId = out.area?.sample?.id || out.category.sample.id;
    const r = await fetch(`${API}/items/${itemId}`, { headers: auth });
    const j = await r.json().catch(() => ({}));
    out.item = { status: r.status, keys: Object.keys(j), location: j.location, geolocation: j.geolocation, pictures: j.pictures?.length };
  }
  return Response.json(out, { headers: { 'cache-control': 'no-store' } });
};

export const config = { path: '/api/ml/probe' };
