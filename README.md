# Cuadra

Web app para recorrer un barrio caminando y ver en el mapa las propiedades en venta y alquiler que tenés cerca. Te avisa cuando pasás a menos de 45 m de una.

- **Frontend:** `public/index.html` (Leaflet + OpenStreetMap, sin build).
- **Avisos:** `crawler/` recorre los sitios web de las inmobiliarias de `crawler/sources.json` y genera `public/data/listings.json`, que la app lee directo. Si el archivo está vacío, la app muestra avisos de ejemplo.
- **Actualización:** el workflow `.github/workflows/crawl.yml` corre todos los días y commitea los cambios; Netlify publica solo.

## Crawler

- Se identifica como `CuadraBot/0.1 (+https://github.com/gerostone/cuadra)`, respeta `robots.txt`, hace un pedido por vez a cada sitio con 1,5 s de pausa y deja de pedirle a un sitio que responde 401/403/429/503.
- Descubre las fichas por los sitemaps de cada sitio y solo vuelve a leer las que tienen más de 7 días.
- Extractores (`crawler/extract.mjs`): JSON de Tokko incrustado, schema.org con `geo`, Houzez, atributos `data-lat` y un único par lat/lng en la página. Si no encuentra la ubicación de la propiedad, descarta la ficha.
- Para sumar una inmobiliaria, agregala a `crawler/sources.json` con el patrón de URL de sus fichas y probala con `node crawler/run.mjs --only <id> --budget 5`.
- Si una inmobiliaria pide que no la incluyamos, se la saca de `sources.json`.

## Desarrollo

```bash
npm test                          # pruebas de extractores y robots.txt
node crawler/run.mjs --budget 5   # corrida corta del crawler
npx -p netlify-cli npm run deploy # pruebas + deploy a producción
```

`deploy` pasa las rutas explícitas a la CLI de Netlify porque, si hay un `package.json` en una carpeta superior, la CLI puede tomar esa carpeta como raíz del proyecto.
