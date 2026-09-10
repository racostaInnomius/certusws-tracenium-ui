// Ubicación: las tres preguntas que comparten la misma evidencia.
//
// Una sola pestaña de Asset Management con tres secciones, y no tres pestañas,
// porque son una funcionalidad:
//
//   * Geofences          — qué sitios se vigilan y con qué radio.
//   * Location history   — dónde estuvo un equipo, o quién estuvo en un sitio,
//                          en una fecha.
//   * Recent transitions — qué veredictos han cambiado.
//
// ⚠️ UNA sola carga para las tres. `listGeofences` devuelve sitios Y
// transiciones en la misma llamada, así que pedirlas por sección consultaría
// dos veces lo mismo y abriría la puerta a que dos secciones del mismo tab
// discrepasen sobre el estado de una cerca.
//
// ⚠️ Y el error se guarda APARTE del dato, en las dos listas. Los estados
// vacíos de aquí dicen cosas como "no hay sitios declarados todavía" o "no se
// ha registrado ninguna transición": presentar un fallo de red con esas frases
// sería afirmar algo sobre la flota que nadie ha comprobado.

import * as React from "react";
import { Box, Tab, Tabs } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import GeofencePanel from "./GeofencePanel";
import LocationExplorer from "./LocationExplorer";
import RecentTransitions from "./RecentTransitions";

const SECCIONES = ["Geofences", "Location history", "Recent transitions"];

export default function LocationWorkbench({ refreshNonce = 0 }) {
  const [seccion, setSeccion] = React.useState(0);

  const [overview, setOverview] = React.useState(null);
  const [overviewError, setOverviewError] = React.useState(null);
  const [devices, setDevices] = React.useState(null);
  const [devicesError, setDevicesError] = React.useState(null);

  // Se incrementa al guardar una cerca, para releer sin recargar la página.
  const [nonceLocal, setNonceLocal] = React.useState(0);
  const [savingId, setSavingId] = React.useState(null);
  const [errorById, setErrorById] = React.useState({});

  React.useEffect(() => {
    let cancelado = false;
    import("../../api/geofences")
      .then((m) => m.listGeofences())
      .then((r) => {
        if (cancelado) return;
        setOverview(r || { sites: [], events: [] });
        setOverviewError(null);
      })
      .catch((e) => {
        if (cancelado) return;
        setOverview(null);
        setOverviewError(e?.message || "load failed");
      });
    return () => {
      cancelado = true;
    };
    // ⚠️ `refreshNonce`: el Refresh de la cabecera tiene que alcanzar a esta
    // pestaña. Una que se lo salta enseña datos viejos con el gesto de haberlos
    // actualizado — ver Assets.refresh.test.
  }, [refreshNonce, nonceLocal]);

  // Los equipos sólo hacen falta para el selector de "Location history", así
  // que se piden cuando esa sección se abre por primera vez. La lista es la NO
  // paginada: la de la tabla trae sólo la página visible y un selector
  // alimentado con eso escondería equipos sin decirlo.
  const necesitaEquipos = seccion === 1;
  React.useEffect(() => {
    if (!necesitaEquipos) return undefined;
    let cancelado = false;
    import("../../api/dashboard")
      .then((m) => m.dashboardApi.getHostLocations())
      .then((r) => {
        if (cancelado) return;
        setDevices(Array.isArray(r?.devices) ? r.devices : []);
        setDevicesError(null);
      })
      .catch((e) => {
        if (cancelado) return;
        setDevices(null);
        setDevicesError(e?.message || "load failed");
      });
    return () => {
      cancelado = true;
    };
  }, [necesitaEquipos, refreshNonce]);

  const guardarCerca = React.useCallback(async (siteId, cambios) => {
    setSavingId(siteId);
    setErrorById((prev) => ({ ...prev, [siteId]: null }));
    try {
      const { saveGeofence } = await import("../../api/geofences");
      const res = await saveGeofence(siteId, cambios);
      if (res?.ok === false) {
        // El backend nombra el campo y explica qué falta ("una cerca necesita
        // pin y radio"). Se muestra tal cual, junto a la cerca, en vez de un
        // aviso genérico que obligue a adivinar cuál de ellas falló.
        setErrorById((prev) => ({ ...prev, [siteId]: res.message || "Could not save." }));
        return;
      }
      setNonceLocal((n) => n + 1);
    } catch (err) {
      setErrorById((prev) => ({
        ...prev,
        [siteId]: err?.body?.message || err?.message || "Could not save.",
      }));
    } finally {
      setSavingId(null);
    }
  }, []);

  const cargandoOverview = overview === null && !overviewError;
  const sites = overview?.sites ?? null;

  return (
    <Box>
      <Tabs
        value={seccion}
        onChange={(_, v) => setSeccion(v)}
        aria-label="Location sections"
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 2,
          minHeight: 40,
          borderBottom: `1px solid ${BRAND.border}`,
          "& .MuiTab-root": {
            textTransform: "none",
            fontWeight: 700,
            fontSize: TEXT.md,
            minHeight: 40,
          },
          "& .MuiTabs-indicator": { bgcolor: BRAND.teal, height: 3, borderRadius: 999 },
        }}
      >
        {SECCIONES.map((s) => (
          <Tab key={s} label={s} />
        ))}
      </Tabs>

      {seccion === 0 ? (
        overviewError ? (
          <Box sx={{ fontSize: TEXT.sm, color: BRAND.alert.error }}>
            Geofences could not be loaded.
          </Box>
        ) : cargandoOverview ? (
          <Box sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>Loading…</Box>
        ) : (
          <GeofencePanel
            sites={sites}
            onSave={guardarCerca}
            savingId={savingId}
            errorById={errorById}
          />
        )
      ) : null}

      {seccion === 1 ? (
        <LocationExplorer
          devices={devices}
          devicesLoading={devices === null && !devicesError}
          devicesError={devicesError}
          sites={sites}
          sitesLoading={cargandoOverview}
          sitesError={overviewError}
          refreshNonce={refreshNonce}
        />
      ) : null}

      {seccion === 2 ? (
        <RecentTransitions
          events={overview?.events ?? null}
          loading={cargandoOverview}
          error={overviewError}
        />
      ) : null}
    </Box>
  );
}
