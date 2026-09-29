# Cuadra

Web app para recorrer un barrio caminando y ver en el mapa las propiedades en venta y alquiler que tenés cerca. Te avisa cuando pasás a menos de 45 m de una.

- **Frontend:** `public/index.html` (Leaflet + OpenStreetMap, sin build).
- **Avisos:** `netlify/functions/listings.mjs` expone `GET /api/listings?lat=&lng=&r=` y usa el conector a Tokko Broker de `lib/tokko.mjs`.
- **Sin keys configuradas** la app muestra avisos de ejemplo.

## Configuración

En Netlify, definí `TOKKO_API_KEYS` con las API keys de Tokko de cada inmobiliaria, separadas por coma. Cada inmobiliaria la obtiene en Tokko en *Mi empresa > Permisos*. Las keys quedan en el servidor y no llegan al navegador.

## Desarrollo

```bash
npm test                          # pruebas del conector
npx -p netlify-cli npm run deploy # pruebas + deploy a producción
```

`deploy` pasa las rutas explícitas a la CLI de Netlify porque, si hay un `package.json` en una carpeta superior, la CLI puede tomar esa carpeta como raíz del proyecto.
