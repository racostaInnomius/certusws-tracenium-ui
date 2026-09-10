// Dónde estuvo un equipo en una fecha, y quién estuvo en un sitio ese día.
//
// ADR-0018. Las dos preguntas existían ya —la línea de tiempo en el cajón del
// equipo, la asistencia detrás del panel de geocercas del mapa— pero ninguna se
// podía hacer POR FECHA desde un sitio visible, que era la petición original.
// Aquí están juntas porque son la misma tabla mirada por sus dos extremos.
//
// ⚠️ LO QUE ESTA VISTA NO PUEDE PROMETER, Y HAY QUE DECIRLO EN VOZ ALTA.
//
// La frontera de una estancia no puede ser más precisa que la cadencia de
// reporte del equipo — medido: ~1,1 h en un tenant y ~9,7 h en el más grande.
// Por eso se afirman INTERVALOS ("confirmado de X a Y, se fue antes de Z") y
// jamás instantes, y por eso esto NO se llama "Device Tracker": el nombre
// prometería un rastro continuo que el dato no sostiene.
//
// Y una fecha fuera de la retención NO devuelve una lista vacía: dice que ya no
// se guarda. Quien busca por fecha es justo quien no puede distinguir "no
// estuvo" de "ya no lo sé", así que la vista tiene que distinguirlo por él.

import * as React from "react";
import {
  Autocomplete,
  Box,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { dayWindow, buildTrail, episodesToMapEntries } from "./hostHelpers";
import DeviceLocationTimeline from "./DeviceLocationTimeline";
// El mapa es lo que hace legible una lista de estancias: perezoso porque
// arrastra leaflet, y sólo hace falta cuando hay un equipo elegido.
const DeviceLocationHistoryMap = React.lazy(() => import("./DeviceLocationHistoryMap"));
import SiteAttendance from "./SiteAttendance";

/** Hoy en el formato que acepta un <input type="date"> (local, no UTC). */
export function todayInputValue(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function Panel({ title, hint, children }) {
  return (
    <Box
      sx={{
        p: { xs: 1.5, sm: 2 },
        border: `1px solid ${BRAND.border}`,
        borderRadius: 2,
        bgcolor: BRAND.surface,
        height: "100%",
      }}
    >
      <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark, mb: 0.5 }}>
        {title}
      </Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1.5 }}>{hint}</Typography>
      {children}
    </Box>
  );
}

export default function LocationExplorer({
  devices,
  devicesLoading = false,
  devicesError = null,
  sites,
  sitesLoading = false,
  sitesError = null,
  refreshNonce = 0,
}) {
  // ⚠️ Presentacional a propósito. Las listas las carga el contenedor del tab
  // (LocationWorkbench) porque `listGeofences` devuelve sitios Y transiciones
  // en una sola llamada: pedirlas otra vez aquí sería consultar dos veces lo
  // mismo y abrir la puerta a que las dos secciones del mismo tab discrepen.
  const listaEquipos = Array.isArray(devices) ? devices : [];
  const listaSitios = Array.isArray(sites) ? sites : [];

  const [equipo, setEquipo] = React.useState(null);
  const [fechaEquipo, setFechaEquipo] = React.useState(() => todayInputValue());
  const [linea, setLinea] = React.useState(null);
  const [lineaCargando, setLineaCargando] = React.useState(false);
  // ⚠️ El error se guarda APARTE del dato. Una petición que FALLÓ no es un
  // equipo que no estuvo en ningún sitio, y colapsar las dos cosas en una lista
  // vacía ya costó una confusión con el mapa de flota en esta misma página.
  const [lineaError, setLineaError] = React.useState(null);

  const [sitio, setSitio] = React.useState("");
  const [fechaSitio, setFechaSitio] = React.useState(() => todayInputValue());
  const [asistencia, setAsistencia] = React.useState(null);
  const [asistenciaCargando, setAsistenciaCargando] = React.useState(false);
  const [asistenciaError, setAsistenciaError] = React.useState(null);

  const agentId = equipo?.agentId ?? null;
  const [estanciaSel, setEstanciaSel] = React.useState(null);
  const puntos = React.useMemo(
    () => episodesToMapEntries(linea?.episodes), [linea]);

  React.useEffect(() => {
    const ventana = dayWindow(fechaEquipo);
    if (!agentId || !ventana) {
      setLinea(null);
      return undefined;
    }
    let cancelado = false;
    setLineaCargando(true);
    setLineaError(null);
    import("../../api/episodes")
      .then((m) => m.getDeviceTimeline(agentId, ventana))
      .then((r) => {
        if (!cancelado) setLinea(r);
      })
      .catch((e) => {
        if (cancelado) return;
        setLinea(null);
        setLineaError(e?.message || "Could not load this device's stays.");
      })
      .finally(() => {
        if (!cancelado) setLineaCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [agentId, fechaEquipo, refreshNonce]);

  React.useEffect(() => { setEstanciaSel(null); }, [agentId, fechaEquipo]);

  React.useEffect(() => {
    const ventana = dayWindow(fechaSitio);
    if (!sitio || !ventana) {
      setAsistencia(null);
      return undefined;
    }
    let cancelado = false;
    setAsistenciaCargando(true);
    setAsistenciaError(null);
    import("../../api/episodes")
      .then((m) => m.getSiteAttendance(sitio, ventana))
      .then((r) => {
        if (!cancelado) setAsistencia(r);
      })
      .catch((e) => {
        if (cancelado) return;
        setAsistencia(null);
        setAsistenciaError(e?.message || "Could not load this site's attendance.");
      })
      .finally(() => {
        if (!cancelado) setAsistenciaCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [sitio, fechaSitio, refreshNonce]);

  const sitioElegido = listaSitios.find((s) => String(s.id) === String(sitio)) || null;

  return (
    <Box>
      {/* La latencia se declara arriba del todo, no en una nota al pie: es lo
          que separa esta función de lo que su nombre sugiere. */}
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 2 }}>
        Stays are built from the positions devices report when they check in, so a stay&apos;s start
        and end are the first and last times the device was <strong>confirmed</strong> there — not
        the moment it arrived or left. A stay that crosses midnight appears on both days.
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Panel
            title="Where was a device"
            hint="Pick a device and a date to see the places it was confirmed at that day."
          >
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 1.5 }}>
              <Autocomplete
                size="small"
                sx={{ flex: 1, minWidth: 200 }}
                options={listaEquipos}
                loading={devicesLoading}
                value={equipo}
                onChange={(_, next) => setEquipo(next)}
                getOptionLabel={(o) => o?.hostname || o?.agentId || ""}
                isOptionEqualToValue={(a, b) => a?.agentId === b?.agentId}
                renderInput={(params) => <TextField {...params} label="Device" />}
              />
              <TextField
                size="small"
                type="date"
                label="On"
                value={fechaEquipo}
                onChange={(e) => setFechaEquipo(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 170 }}
              />
            </Stack>

            {devicesError ? (
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.error }}>
                {/* Un fallo al cargar la lista no es una flota sin equipos. */}
                The device list could not be loaded, so this picker is incomplete.
              </Typography>
            ) : null}

            {!agentId ? (
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                Select a device to see where it was.
              </Typography>
            ) : lineaError ? (
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.error }}>
                {lineaError}
              </Typography>
            ) : lineaCargando ? (
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>Loading…</Typography>
            ) : linea ? (
              <>
                {puntos.some((p) => p.mappable) ? (
                  <Box sx={{ mb: 1.5 }}>
                    <React.Suspense fallback={null}>
                      <DeviceLocationHistoryMap
                        entries={puntos}
                        selectedId={estanciaSel}
                        onSelect={setEstanciaSel}
                        trail={buildTrail(linea.episodes)}
                        height={260}
                      />
                    </React.Suspense>
                  </Box>
                ) : null}
                <DeviceLocationTimeline
                  episodes={linea.episodes}
                  retentionDays={linea.retentionDays}
                  beyondRetention={linea.beyondRetention}
                  retentionFloor={linea.retentionFloor}
                />
              </>
            ) : null}
          </Panel>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Panel
            title="Who was at a site"
            hint="Pick one of your declared sites and a date to see which devices were confirmed there."
          >
            <TextField
              select
              size="small"
              label="Site"
              value={sitio}
              onChange={(e) => setSitio(e.target.value)}
              disabled={sitesLoading || listaSitios.length === 0}
              sx={{ minWidth: 220, mb: 1.5 }}
            >
              {listaSitios.map((s) => (
                <MenuItem key={s.id} value={String(s.id)}>
                  {s.siteName}
                </MenuItem>
              ))}
            </TextField>

            {sitesError ? (
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.error }}>
                The site list could not be loaded.
              </Typography>
            ) : !sitesLoading && listaSitios.length === 0 ? (
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                {/* ⚠️ Sin sitios declarados esta mitad no puede contestar nada, y
                    decir "nadie estuvo aquí" sería peor que decir por qué. */}
                No sites declared yet. Declare a site in Location sites and its attendance can be
                looked up here.
              </Typography>
            ) : asistenciaError ? (
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.error }}>
                {asistenciaError}
              </Typography>
            ) : sitioElegido ? (
              <SiteAttendance
                siteName={sitioElegido.siteName}
                data={asistencia}
                loading={asistenciaCargando}
                date={fechaSitio}
                onDateChange={setFechaSitio}
              />
            ) : (
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                Select a site to see who was there.
              </Typography>
            )}
          </Panel>
        </Grid>
      </Grid>
    </Box>
  );
}
