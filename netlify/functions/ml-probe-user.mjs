// Diagnóstico temporal: prueba la búsqueda con un token de usuario (authorization_code).
// /api/ml/callback sin ?code redirige a Mercado Libre para autorizar; con ?code
// canjea el token, prueba la búsqueda y devuelve solo códigos de respuesta.
// El token no se guarda ni se devuelve. Se borra junto con ml-probe.
const API = 'https://api.mercadolibre.com';
const REDIRECT = 'https://cuadra-barrio-15523.netlify.app/api/ml/callback';

export default async (req) => {
  const id = process.env.ML_CLIENT_ID || '7766328177008518', secret = process.env.ML_CLIENT_SECRET;
  const code = new URL(req.url).searchParams.get('code');
  if (!code) {
    return Response.redirect(`https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${id}&redirect_uri=${encodeURIComponent(REDIRECT)}`, 302);
  }
  const tr = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: id, client_secret: secret, code, redirect_uri: REDIRECT }),
  });
  const tj = await tr.json().catch(() => ({}));
  const out = { token: { status: tr.status, ok: !!tj.access_token, error: tj.error, message: tj.message } };
  if (tj.access_token) {
    const auth = { authorization: `Bearer ${tj.access_token}`, accept: 'application/json' };
    for (const [name, url] of Object.entries({
      area: `${API}/sites/MLA/search?category=MLA1459&item_location=lat:-34.595_-34.583,lon:-58.440_-58.420&limit=5`,
      category: `${API}/sites/MLA/search?category=MLA1459&limit=5`,
    })) {
      const r = await fetch(url, { headers: auth });
      const j = await r.json().catch(() => ({}));
      const f = j.results?.[0];
      out[name] = { status: r.status, error: j.error, total: j.paging?.total, firstLocation: f?.location, firstKeys: f && Object.keys(f) };
    }
  }
  return Response.json(out, { headers: { 'cache-control': 'no-store' } });
};

export const config = { path: '/api/ml/callback' };
