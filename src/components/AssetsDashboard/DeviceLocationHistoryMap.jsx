// Todas las posiciones guardadas de UN equipo, sobre un mapa.
//
// Hermano de DeviceLocationMap (que plotea una sola) y de FleetLocationMap (que
// plotea una por equipo). Se carga en su propio chunk perezoso por la misma
// razón que aquéllos: Leaflet y su CSS son peso muerto en la inmensa mayoría de
// aperturas del drawer, donde nadie toca el mapa. Vite comparte el chunk de
// Leaflet entre los tres, así que abrir éste no vuelve a descargar la librería.
//
// ⚠️ LO QUE ESTE MAPA NO DIBUJA: una línea que una las posiciones.
//
// Es lo primero que pide el ojo y es exactamente lo que los datos no soportan.
// Cada fila guarda `firstSeenAt` y `lastSeenAt` de una CLAVE, no de una visita,
// y esos rangos SE SOLAPAN entre filas — en un equipo real la primera fila va
// del 13-ago al 08-sep y contiene a casi todas las demás. Unir pines
// consecutivos dibujaría un recorrido que nunca ocurrió, con la misma
// autoridad visual que un GPS de verdad. Una polilínea honesta necesita
// episodios de visita, que es una tabla que no existe.
//
// Lo mismo con los círculos de precisión: se dibuja el de la posición
// seleccionada y sólo ése. Diez círculos de entre 23 y 500 m simultáneos son
// una mancha, y una mancha sugiere una certidumbre que no tenemos.

import { useEffect, useMemo, useRef } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { MapContainer, TileLayer, Marker, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

/**
 * Los iconos por defecto de Leaflet se resuelven como URLs relativas al
 * bundler, que Vite no reescribe: el montaje de serie pinta imágenes rotas. Un
 * divIcon deja todo en CSS y permite que el pin lleve el color de marca.
 *
 * `activo` es la posición seleccionada en la lista. `reciente` es la más nueva
 * del historial. Las demás van huecas — el mismo vocabulario que ya usa
 * DeviceLocationMap para una posición que el equipo reportó pero no ha
 * refrescado: el sitio sigue siendo donde dijo, sólo que no podemos afirmar que
 * esté ahí AHORA.
 */
function pinIcon({ activo, reciente, hits }) {
  const color = reciente ? ROLE.positive : BRAND.teal;
  // El peso visual sigue a hit_count: el sitio principal se lee de un vistazo
  // sin tener que leer la tabla. Acotado para que un 200 no tape el mapa.
  const base = Math.min(22, 12 + Math.round(Math.log2(Math.max(1, hits)) * 2));
  const size = activo ? base + 6 : base;
  return L.divIcon({
    className: "",
    html: `<span style="
      display:block;width:${size}px;height:${size}px;border-radius:50%;
      background:${reciente || activo ? color : "transparent"};
      border:${activo ? 4 : 3}px solid ${activo ? BRAND.dark : color};
      box-shadow:0 0 0 1px rgba(0,0,0,.3);
    "></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Encuadra TODAS las posiciones, no sólo la seleccionada.
 *
 * Se recalcula sólo cuando cambia el conjunto de posiciones: reencuadrar al
 * seleccionar una fila haría saltar el mapa en cada hover, y el objetivo de
 * acoplar lista y mapa es justo lo contrario — que el operador pueda recorrer
 * la lista y ver dónde cae cada una sin perder el contexto.
 */
function Encuadrar({ posiciones }) {
  const map = useMap();
  const clave = posiciones.map((p) => `${p.lat},${p.lon}`).join("|");

  useEffect(() => {
    if (!map || !posiciones.length) return;
    if (posiciones.length === 1) {
      map.setView([posiciones[0].lat, posiciones[0].lon], 15);
      return;
    }
    map.fitBounds(
      L.latLngBounds(posiciones.map((p) => [p.lat, p.lon])),
      { padding: [40, 40], maxZoom: 15 }
    );
    // `clave` es el conjunto de coordenadas: cambia cuando cambian las
    // posiciones, no cuando cambia la selección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, clave]);

  return null;
}

export default function DeviceLocationHistoryMap({
  entries,
  selectedId,
  onSelect,
  height = 300,
}) {
  const containerRef = useRef(null);

  const posiciones = useMemo(
    () => (Array.isArray(entries) ? entries.filter((e) => e.mappable) : []),
    [entries]
  );

  if (!posiciones.length) return null;

  // La más reciente del historial: la lista llega ordenada por lastSeenAt DESC,
  // así que es la primera que se puede plotear.
  const recienteId = posiciones[0].id;
  const seleccionada = posiciones.find((p) => p.id === selectedId) || null;
  const total = Array.isArray(entries) ? entries.length : 0;

  return (
    <Box ref={containerRef} sx={{ mt: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: "wrap", rowGap: 0.5 }}>
        {/* ⚠️ La cobertura se DECLARA. El mapa es siempre un subconjunto: las
            posiciones derivadas de la subred o de la IP no tienen coordenadas,
            y un mapa con 6 pines de 10 posiciones se lee como el historial
            completo si nadie dice lo contrario. */}
        <Chip
          size="small"
          label={
            posiciones.length === total
              ? `${total} position${total === 1 ? "" : "s"}`
              : `${posiciones.length} of ${total} positions mappable`
          }
          sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.tealSoft, color: BRAND.tealText }}
        />
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          {posiciones.length === total
            ? "Every stored position this device reported."
            : "The rest were derived from the network range, which has no coordinates."}
        </Typography>
      </Stack>

      <Box
        sx={{
          height,
          borderRadius: 1,
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          "& .leaflet-container": { height: "100%", width: "100%", zIndex: 0 },
        }}
      >
        <MapContainer center={[posiciones[0].lat, posiciones[0].lon]} zoom={13} scrollWheelZoom={false} attributionControl>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {posiciones.map((p) => (
            <Marker
              key={p.id}
              position={[p.lat, p.lon]}
              icon={pinIcon({
                activo: p.id === selectedId,
                reciente: p.id === recienteId,
                hits: p.hitCount,
              })}
              eventHandlers={{ click: () => onSelect?.(p.id === selectedId ? null : p.id) }}
            />
          ))}

          {/* Sólo el de la seleccionada, y sólo si la lectura declaró una
              precisión: un círculo inventado sobrestimaría lo bien que
              conocemos la posición. */}
          {seleccionada && seleccionada.accuracyM > 0 ? (
            <Circle
              center={[seleccionada.lat, seleccionada.lon]}
              radius={seleccionada.accuracyM}
              pathOptions={{
                color: BRAND.dark,
                fillColor: BRAND.dark,
                fillOpacity: 0.1,
                weight: 1,
              }}
            />
          ) : null}

          <Encuadrar posiciones={posiciones} />
        </MapContainer>
      </Box>
    </Box>
  );
}
