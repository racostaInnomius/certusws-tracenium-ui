// Geocercas: qué sitios se vigilan, qué ven, y por qué a veces no ven nada.
//
// Vive encima del mapa de flota porque es donde ya se contesta "dónde están mis
// equipos". Una cerca es un sitio con radio, así que se configura aquí mismo:
// el consejo del radio sólo sirve si está pegado al campo donde se teclea.
//
// ⚠️ EL AVISO DEL RADIO ES LA RAZÓN DE SER DE ESTE PANEL.
//
// La regla de "dentro" es `distancia + precisión < radio`. Medida contra las 303
// posiciones reales de la flota da CERO coincidencias con un radio de 100 m: el
// 100% de las posiciones vienen de trilateración Wi-Fi (precisión de 23 a
// 500 m) y la distancia de una lectura al pin de su sitio da p50 103 m y p90
// 318 m, porque un sitio es un edificio y no un punto.
//
// El operador que teclea "100" para su oficina NO recibe un error. Recibe una
// cerca que no confirma a nadie, nunca — que se lee como un producto averiado.
// El backend calcula el radio que esa telemetría sí soporta y este panel lo
// dice antes y después de guardar.

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

/** Cuántos equipos, y en qué estado. Cero es un número, no una ausencia. */
function Recuento({ label, value, color }) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="baseline">
      <Typography sx={{ fontSize: TEXT.base, fontWeight: 800, color }}>{value}</Typography>
      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{label}</Typography>
    </Stack>
  );
}

function Cerca({ site, onSave, saving, error }) {
  const [radio, setRadio] = React.useState(site.radiusM ?? "");
  React.useEffect(() => setRadio(site.radiusM ?? ""), [site.radiusM]);

  const encendida = site.geofenceStatus === "monitoring";
  const sinPin = site.lat === null || site.lat === undefined;
  const sugerido = site.suggestedRadiusM;

  // El radio que se está tecleando AHORA, no el guardado: el aviso tiene que
  // aparecer mientras se escribe, no después de guardar algo inservible.
  const radioNum = Number(radio);
  const radioEnEdicionEsPequeno =
    Number.isFinite(radioNum) && radioNum > 0 && sugerido !== null && radioNum < sugerido;

  return (
    <Box
      sx={{
        p: 1.5,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 2,
        bgcolor: BRAND.surface,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 180 }}>
          <Typography sx={{ fontSize: TEXT.base, fontWeight: 700, color: BRAND.dark }}>
            {site.siteName}
            {site.city ? (
              <Typography component="span" sx={{ fontSize: TEXT.md, color: "text.secondary", ml: 1 }}>
                {site.city}
              </Typography>
            ) : null}
          </Typography>
          {encendida ? (
            <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
              <Recuento label="inside" value={site.inside} color={ROLE.positive} />
              <Recuento label="outside" value={site.outside} color={BRAND.alert.error} />
              {/* ⚠️ "Indeterminate" se muestra SIEMPRE, aunque sea cero. Es el
                  estado que dice "la medición no alcanza", y esconderlo haría
                  creer que la cerca tiene una opinión sobre todos los equipos. */}
              <Recuento label="unclear" value={site.indeterminate} color={BRAND.gray} />
            </Stack>
          ) : null}
        </Box>

        <TextField
          size="small"
          label="Radius"
          value={radio}
          onChange={(e) => setRadio(e.target.value)}
          disabled={saving || sinPin}
          sx={{ width: 130 }}
          slotProps={{
            input: {
              endAdornment: (
                <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>m</Typography>
              ),
            },
          }}
          placeholder={sugerido ? String(sugerido) : "—"}
        />

        <Stack direction="row" spacing={0.5} alignItems="center">
          <Switch
            size="small"
            checked={encendida}
            disabled={saving || sinPin}
            onChange={(e) =>
              onSave(site.id, {
                radiusM: radio === "" ? null : Number(radio),
                geofenceStatus: e.target.checked ? "monitoring" : "off",
              })
            }
            // MUI 7: el aria-label del input va por slotProps, no por
            // inputProps — con inputProps el switch queda sin nombre accesible.
            slotProps={{ input: { "aria-label": `Monitor ${site.siteName}` } }}
          />
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
            {encendida ? "Monitoring" : "Off"}
          </Typography>
        </Stack>

        <Button
          size="small"
          disabled={saving || sinPin || String(site.radiusM ?? "") === String(radio)}
          onClick={() => onSave(site.id, { radiusM: radio === "" ? null : Number(radio) })}
          sx={{ textTransform: "none" }}
        >
          Save radius
        </Button>
      </Stack>

      {/* ── Lo que hay que decir, por orden de urgencia ─────────────────── */}

      {sinPin ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 1 }}>
          This site has no map pin, so it cannot be a geofence. Add coordinates to it in Location
          sites first.
        </Typography>
      ) : null}

      {!sinPin && (radioEnEdicionEsPequeno || site.radiusTooSmall) ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.warningText, mt: 1 }}>
          {/* Se dice lo que PASARÍA, no "valor inválido": el número es legal, y
              el problema es que la telemetría de este sitio no lo soporta. */}
          A {radioEnEdicionEsPequeno ? radioNum : site.radiusM} m radius is smaller than this
          site's own readings support — positions here land a median of{" "}
          {site.observedAccuracyM ?? "?"} m accuracy and up to{" "}
          {site.observedP90DistanceM ?? "?"} m from the pin. No device would ever be confirmed
          inside. Suggested: {sugerido} m.
        </Typography>
      ) : null}

      {!sinPin && sugerido === null ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 1 }}>
          {/* Sin lecturas no se puede aconsejar, y proponer un número inventado
              tendría la misma autoridad visual que uno medido. */}
          No positions have been reported near this site yet, so there is no measured radius to
          suggest.
        </Typography>
      ) : null}

      {encendida && site.lastEvaluatedAt === null ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 1 }}>
          Switched on, but no device has reported a position since. Devices are evaluated when
          they check in, not continuously.
        </Typography>
      ) : null}

      {error ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.error, mt: 1 }}>{error}</Typography>
      ) : null}
    </Box>
  );
}

export default function GeofencePanel({ sites, events, onSave, savingId, errorById = {} }) {
  const lista = Array.isArray(sites) ? sites : [];

  if (lista.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>
          No sites yet. A geofence is a site with a radius — declare a site with a map pin in
          Location sites and it can be monitored here.
        </Typography>
      </Box>
    );
  }

  const activas = lista.filter((s) => s.geofenceStatus === "monitoring").length;

  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: "wrap", rowGap: 0.5 }}>
        <Typography
          sx={{
            fontSize: TEXT.xs,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "text.secondary",
          }}
        >
          Geofences
        </Typography>
        <Chip
          size="small"
          label={`${activas} of ${lista.length} monitored`}
          sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.tealSoft, color: BRAND.tealText }}
        />
      </Stack>

      {/* ⚠️ La latencia se DECLARA. Un producto llamado "geofencing" sugiere
          tiempo real, y esto evalúa cuando el equipo reporta — que en esta flota
          es del orden de una o dos veces al día. Callarlo sería vender otra
          cosa. */}
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1.5 }}>
        Evaluated when a device checks in, not continuously — a device that stops reporting keeps
        its last state instead of leaving the fence. Two consecutive readings are needed before a
        change is recorded.
      </Typography>

      <Stack spacing={1}>
        {lista.map((s) => (
          <Cerca
            key={s.id}
            site={s}
            onSave={onSave}
            saving={savingId === s.id}
            error={errorById[s.id]}
          />
        ))}
      </Stack>

      {Array.isArray(events) && events.length > 0 ? (
        <Box sx={{ mt: 2 }}>
          <Typography
            sx={{
              fontSize: TEXT.xs,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "text.secondary",
              mb: 1,
            }}
          >
            Recent transitions
          </Typography>
          <Stack spacing={0.5}>
            {events.slice(0, 10).map((e) => (
              <Stack key={e.id} direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: "wrap" }}>
                <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
                  {e.siteName}
                </Typography>
                <Chip
                  size="small"
                  label={e.toState === "inside" ? "entered" : "left"}
                  sx={{
                    height: 18,
                    fontSize: TEXT.xs,
                    fontWeight: 700,
                    bgcolor: e.toState === "inside" ? "rgba(46,125,50,.12)" : BRAND.alert.errorSoft,
                    color: e.toState === "inside" ? ROLE.positive : BRAND.alert.error,
                  }}
                />
                <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
                  {/* El método viaja con el evento: "por red" y "por
                      coordenadas" no merecen la misma confianza. */}
                  {e.agentId} · by {e.method === "network" ? "network" : "coordinates"}
                  {e.distanceM !== null && e.distanceM !== undefined ? ` · ${e.distanceM} m` : ""}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      ) : null}
    </Box>
  );
}
