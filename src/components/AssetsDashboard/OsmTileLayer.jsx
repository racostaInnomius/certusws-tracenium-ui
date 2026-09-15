// src/components/AssetsDashboard/OsmTileLayer.jsx
//
// La capa de mapa de OpenStreetMap que comparten los tres mapas de Asset
// Management (flota, ubicación de un equipo, historial). Una sola definición:
// eran tres copias de la misma URL, y las tres se rompieron a la vez.
//
// ⚠️ 2026-09-15 — los mapas mostraban «Access blocked · App is not following the
// tile usage policy» en cada baldosa. Causa, medida con curl:
//   · portal.tracenium.com responde con `Referrer-Policy: same-origin` (lo pone
//     Azure Static Web Apps; no está en staticwebapp.config.json);
//   · con esa política el navegador NO manda `Referer` a tile.openstreetmap.org;
//   · y OSM, sin Referer, sirve una imagen de «bloqueado» con estado 200 (6 987
//     bytes) en lugar de la baldosa (15 165 bytes con Referer).
// La política de uso de OSM exige identificar la aplicación con Referer.
//
// Arreglo acotado: sólo las baldosas mandan el ORIGEN
// (`strict-origin-when-cross-origin` → `Referer: https://portal.tracenium.com/`,
// sin ruta ni query). Cambiar la política global del portal afectaría a todos
// los enlaces salientes para arreglar una sola cosa.
//
// Y sin subdominios `{s}` (a./b./c.): OSM los retiró y pide el host único.

import { TileLayer } from "react-leaflet";

export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const OSM_TILE_REFERRER_POLICY = "strict-origin-when-cross-origin";

export default function OsmTileLayer() {
  return <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} referrerPolicy={OSM_TILE_REFERRER_POLICY} />;
}
