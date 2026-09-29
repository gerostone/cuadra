# Cuadra

Web app para recorrer un barrio caminando y ver en el mapa las propiedades en venta y alquiler que tenés cerca. Te avisa cuando pasás a menos de 45 m de una.

- **Frontend:** `public/` sin build: `index.html` (estructura), `app.css` (estilos), `app.js` (mapa, panel, fichas, ubicación), `ui.js` (formatos y filtros, con pruebas en `test/ui.test.mjs`) y `demo.js` (avisos de ejemplo y fachadas ilustradas). Leaflet + OpenStreetMap.
- **Avisos:** `crawler/` recorre los sitios web de las inmobiliarias de `crawler/sources.json` y genera `listings.json` en la rama `data`. La app lo lee desde `raw.githubusercontent.com`; si no puede, muestra avisos de ejemplo.
- **Actualización:** el workflow `.github/workflows/crawl.yml` corre todos los días y commitea en la rama `data`. Netlify no publica esa rama, así que actualizar avisos no consume deploys.
- **Netlify:** solo compila cuando cambia `public/` o `netlify.toml` (regla `ignore`), porque cada deploy de producción consume créditos.

## PWA

- `public/manifest.webmanifest` y `public/sw.js`: la app se puede instalar y abrir sin conexión con los últimos avisos descargados. Los mapas de OpenStreetMap no se guardan (su política no lo permite).
- Íconos en `public/icons/`, generados con `python3 tools/make-icons.py`.
- Si cambian los archivos de la app, subir `VERSION` en `sw.js` para que se descarte la copia vieja.

## Crawler

- Se identifica como `CuadraBot/0.1 (+https://github.com/gerostone/cuadra)`, respeta `robots.txt`, hace un pedido por vez a cada sitio con 1,5 s de pausa y deja de pedirle a un sitio que responde 401/403/429/503.
- Descubre las fichas por los sitemaps de cada sitio y solo vuelve a leer las que tienen más de 7 días.
- Extractores (`crawler/extract.mjs`): JSON de Tokko incrustado, schema.org con `geo`, Houzez, atributos `data-lat` y un único par lat/lng en la página. Si no encuentra la ubicación de la propiedad, descarta la ficha.
- Para evaluar un sitio nuevo: `node crawler/probe.mjs dominio.com.ar`. Si sirve, agregalo a `crawler/sources.json` con el patrón de URL sugerido y probalo con `node crawler/run.mjs --only <id> --budget 5`.
- Si una inmobiliaria pide que no la incluyamos, se la saca de `sources.json`.

## Desarrollo

```bash
npm test                          # pruebas de extractores y robots.txt
git clone -b data https://github.com/gerostone/cuadra.git data  # datos actuales
node crawler/run.mjs --budget 5   # corrida corta del crawler (escribe en data/)
npx -p netlify-cli npm run deploy # pruebas + deploy a producción
```

`deploy` pasa las rutas explícitas a la CLI de Netlify porque, si hay un `package.json` en una carpeta superior, la CLI puede tomar esa carpeta como raíz del proyecto.
