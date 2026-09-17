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
import { BRAND, TEXT } from "../../theme/brand";
import SiteAttendance from "./SiteAttendance";
import { lastDaysRange, rangeWindow } from "./hostHelpers";
import { sitiosConPin } from "./geofenceMap";

// Leaflet en su propio chunk, como el resto de mapas de Asset Management.
const GeofenceSitesMap = React.lazy(() => import("./GeofenceSitesMap"));

/** Una muestra de la leyenda: el mismo pin y el mismo trazo que el mapa. */
function Muestra({ label, color, hollow }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box
        component="span"
        sx={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          bgcolor: hollow ? BRAND.surface : color,
          border: `2px ${hollow ? "dashed" : "solid"} ${color}`,
        }}
      />
      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{label}</Typography>
    </Stack>
  );
}

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
  // ⚠️ La asistencia se pide SÓLO al abrirla. Es una consulta por sitio y
  // fecha, y cargarla para cada sitio al pintar el panel gastaría una consulta
  // por sitio en cada apertura del mapa para algo que casi nadie mira.
  const [asistenciaAbierta, setAsistenciaAbierta] = React.useState(false);
  const [rango, setRango] = React.useState(() => lastDaysRange(1));
  const [asistencia, setAsistencia] = React.useState(null);
  const [cargando, setCargando] = React.useState(false);

  React.useEffect(() => {
    if (!asistenciaAbierta) return undefined;
    const ventana = rangeWindow(rango.from, rango.to);
    if (!ventana) return undefined;
    let cancelado = false;
    setCargando(true);
    import("../../api/episodes")
      .then((m) => m.getSiteAttendance(site.id, ventana))
      .then((d) => { if (!cancelado) setAsistencia(d); })
      .catch(() => { if (!cancelado) setAsistencia(null); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [asistenciaAbierta, rango.from, rango.to, site.id]);

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
      id={`geofence-site-${site.id}`}
      sx={{
        p: 1.5,
        scrollMarginTop: 16,
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
              <Recuento label="inside" value={site.inside} color={BRAND.alert.successText} />
              <Recuento label="outside" value={site.outside} color={BRAND.alert.errorText} />
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

        {/* La pregunta que el drawer no puede contestar: va de un SITIO y una
            fecha, no de un equipo. */}
        <Button
          size="small"
          variant="text"
          onClick={() => setAsistenciaAbierta((v) => !v)}
          aria-expanded={asistenciaAbierta}
          sx={{ textTransform: "none" }}
        >
          {asistenciaAbierta ? "Hide who was here" : "Who was here"}
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

      {/* ⚠️ Tres razones distintas para no aconsejar, y piden acciones
          distintas del operador. Un mensaje único ("no hay radio sugerido") las
          taparía las tres.

          `too_scattered` salió de producción: un sitio con seis lecturas, dos
          de ellas a 4,7 km, hacía que la primera versión aconsejara 4.800 m —
          media ciudad presentada como un sitio. */}
      {!sinPin && sugerido === null ? (
        <Typography
          sx={{
            fontSize: TEXT.sm,
            mt: 1,
            color:
              site.suggestionReason === "too_scattered"
                ? BRAND.alert.warningText
                : "text.secondary",
          }}
        >
          {site.suggestionReason === "too_scattered"
            ? `The positions reported near this pin spread over kilometres, so this is not one site — it looks like several places, or the pin is in the wrong spot. Fix the pin or split the site before setting a radius.`
            : site.suggestionReason === "too_few_readings"
            ? `Only ${site.observedReadings} position${
                site.observedReadings === 1 ? "" : "s"
              } reported near this site so far — too few to measure a radius from. The suggestion appears once there are enough.`
            : "No positions have been reported near this site yet, so there is no measured radius to suggest."}
        </Typography>
      ) : null}

      {encendida && site.lastEvaluatedAt === null ? (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 1 }}>
          Switched on, but no device has reported a position since. Devices are evaluated when
          they check in, not continuously.
        </Typography>
      ) : null}

      {error ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.errorText, mt: 1 }}>{error}</Typography>
      ) : null}

      {asistenciaAbierta ? (
        <SiteAttendance
          siteName={site.siteName}
          data={asistencia}
          loading={cargando}
          from={rango.from}
          to={rango.to}
          onRangeChange={setRango}
        />
      ) : null}
    </Box>
  );
}

// ⚠️ Ya NO pinta las transiciones: viven en su propia sección del mismo tab
// (RecentTransitions), donde caben con hostname, fecha y el rótulo correcto.
// Aquí eran diez líneas al pie de la configuración, y el rótulo mentía.
export default function GeofencePanel({ sites, onSave, savingId, errorById = {} }) {
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
  const sinPin = lista.length - sitiosConPin(lista).length;

  // Un clic en el pin lleva a la tarjeta donde se configura ese sitio.
  const irASitio = (id) => {
    document.getElementById(`geofence-site-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

      {sinPin < lista.length ? (
        <Box sx={{ mb: 1.5 }}>
          <React.Suspense
            fallback={<Box sx={{ height: 300, borderRadius: 2, bgcolor: BRAND.surfaceMuted }} />}
          >
            <GeofenceSitesMap sites={lista} onSelect={irASitio} />
          </React.Suspense>
          <Stack direction="row" spacing={2} sx={{ mt: 0.75, flexWrap: "wrap", rowGap: 0.5 }}>
            <Muestra label="Monitoring" color={BRAND.teal} />
            <Muestra label="Off" color={BRAND.dark} hollow />
            {/* ⚠️ Sin radio guardado no hay círculo: el sugerido es un consejo,
                no un área vigilada. */}
            <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
              Circles show the saved radius · click a pin to jump to its settings
            </Typography>
            {sinPin > 0 ? (
              <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
                {sinPin} site{sinPin === 1 ? "" : "s"} without a map pin not shown
              </Typography>
            ) : null}
          </Stack>
        </Box>
      ) : null}

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

    </Box>
  );
}
