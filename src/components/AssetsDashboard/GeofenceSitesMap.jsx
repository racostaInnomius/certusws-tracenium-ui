// Los sitios de las geocercas, en un mapa: dónde está cada pin y qué área cubre
// su radio guardado.
//
// Hermano de FleetLocationMap y DeviceLocationMap, con su mismo pin y su misma
// capa de teselas (OsmTileLayer — sin ella OSM sirve "Access blocked").
// Se carga en su propio chunk: Leaflet no tiene por qué pesar en quien nunca
// abre la pestaña.

import { Fragment, useEffect, useMemo } from "react";
import { Box } from "@mui/material";
import { MapContainer, Marker, Circle, Tooltip, useMap } from "react-leaflet";
import OsmTileLayer from "./OsmTileLayer";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BRAND } from "../../theme/brand";
import { estiloSitio, limitesSitios, sitiosConPin } from "./geofenceMap";

// Una cerca apagada: pin hueco y oscuro. El gris de marca (#BEBEBE) desaparece
// sobre las teselas claras de OSM.
function pinIcon(color, hollow = false) {
  return L.divIcon({
    className: "",
    html: `<span style="
      display:block;width:14px;height:14px;border-radius:50%;
      background:${hollow ? "#fff" : color};border:3px solid ${hollow ? color : "#fff"};
      box-shadow:0 0 0 1px rgba(0,0,0,.3);
    "></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

/**
 * Encuadra los sitios cuando cambian sus pines o sus radios.
 *
 * Un radio guardado agranda el círculo, y re-encuadrar tras un "Save radius"
 * es la respuesta a lo que el operador acaba de hacer — no arrastra la vista
 * mientras nadie toca nada.
 */
function Encuadre({ bounds, clave }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, clave]);
  return null;
}

export default function GeofenceSitesMap({ sites, onSelect, height = 300 }) {
  const conPin = useMemo(() => sitiosConPin(sites), [sites]);
  const bounds = useMemo(() => limitesSitios(conPin), [conPin]);
  const clave = conPin.map((s) => `${s.id}:${s.lat}:${s.lon}:${s.radiusM ?? ""}`).join("|");

  if (!bounds) return null;

  return (
    <Box
      sx={{
        height,
        borderRadius: 2,
        overflow: "hidden",
        border: `1px solid ${BRAND.border}`,
        "& .leaflet-container": { height: "100%", width: "100%", zIndex: 0 },
      }}
    >
      <MapContainer bounds={bounds} scrollWheelZoom={false} attributionControl>
        <OsmTileLayer />
        {conPin.map((s) => {
          const { monitoring, radiusM } = estiloSitio(s);
          const color = monitoring ? BRAND.teal : BRAND.dark;
          return (
            <Fragment key={s.id}>
              {radiusM ? (
                <Circle
                  center={[s.lat, s.lon]}
                  radius={radiusM}
                  // Una cerca apagada conserva su radio, pero no vigila: se
                  // dibuja sólo el contorno, discontinuo.
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: monitoring ? 0.15 : 0,
                    weight: monitoring ? 2 : 1.5,
                    dashArray: monitoring ? undefined : "6 6",
                  }}
                />
              ) : null}
              <Marker
                position={[s.lat, s.lon]}
                icon={pinIcon(color, !monitoring)}
                title={s.siteName}
                eventHandlers={onSelect ? { click: () => onSelect(s.id) } : undefined}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  {`${s.siteName} · ${
                    radiusM ? `${radiusM} m` : "no radius"
                  } · ${monitoring ? "monitoring" : "off"}`}
                </Tooltip>
              </Marker>
            </Fragment>
          );
        })}
        <Encuadre bounds={bounds} clave={clave} />
      </MapContainer>
    </Box>
  );
}
