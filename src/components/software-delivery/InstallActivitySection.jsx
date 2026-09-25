// src/components/software-delivery/InstallActivitySection.jsx
//
// Cuándo se instaló y cómo acabó: el retrospectivo de la entrega.
//
// ── Por qué NO está en el Dashboard (24-sep) ─────────────────────────────
//
// Estuvo, y ocupaba 271 px de los 1.511 de la página. No porque estuviera mal
// hecho, sino porque contesta otra pregunta: el Dashboard responde «¿qué tengo
// que atender AHORA?» y esto responde «¿cada cuánto entregamos y cómo salió?».
// Un calendario de 90 días no cambia lo que haces hoy.
//
// Vive donde se pregunta: en la pestaña de despliegues, debajo de la lista.
//
// ⚠️ LOS DOS PANELES DESCRIBEN LA LISTA QUE SE ESTÁ VIENDO, filtro incluido.
// Un agregado que cambia bajo un filtro sin avisar es la forma de leer «7
// fallos» creyendo que son de toda la flota.
//
// 🔴 El calendario NO lo hacía (hasta el 25-sep). Pedía la serie del tenant
// entero mientras el desglose de al lado ya venía filtrado, así que con
// «Failed» puesto la pantalla enseñaba «14 installs · 5 succeeded · 9 failed»
// a la izquierda y «13 installs · Failed 13 · 100%» a la derecha. Ninguna de
// las dos estaba mal por dentro; juntas eran una contradicción.
//
// ⚠️ SIGUEN SIN COMPARTIR VENTANA, y eso es a propósito: el desglose cuenta
// todos los despliegues de la lista y el calendario sólo su selector de días.
// Lo que se arregló es que ahora se DICE (`calendarScope`) — a 90 días los dos
// coinciden exactamente, que es la prueba de que describen el mismo conjunto.

import * as React from "react";
import {
  Box,
  Grid,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

import SectionPaper from "../common/SectionPaper";
import CompositionBars from "../common/CompositionBars";
import InstallActivityCalendar from "./InstallActivityCalendar";
import { sumOutcomes } from "./InFlightDeployments";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { getDeploymentTimeseries } from "../../api/softwareDelivery";

/** Los desenlaces con valor propio. Siete categorías no caben en una leyenda. */
export function outcomeItems(deployments) {
  return [
    { label: "Succeeded", value: sumOutcomes(deployments, ["success"]), color: ROLE.positive },
    { label: "Already installed", value: sumOutcomes(deployments, ["already_installed"]), color: BRAND.teal },
    { label: "Reboot required", value: sumOutcomes(deployments, ["reboot_required"]), color: ROLE.caution },
    { label: "Failed", value: sumOutcomes(deployments, ["failed"]), color: ROLE.critical },
    { label: "Rejected", value: sumOutcomes(deployments, ["rejected"]), color: BRAND.gray },
    { label: "Timed out", value: sumOutcomes(deployments, ["timed_out"]), color: BRAND.gray },
    { label: "Signature invalid", value: sumOutcomes(deployments, ["signature_invalid"]), color: ROLE.critical },
  ].filter((i) => i.value > 0);
}

/**
 * Lo que el calendario está dibujando, dicho en voz alta.
 *
 * ⚠️ Los dos paneles de esta sección comparten filtro pero NO ventana: el
 * desglose cuenta todos los despliegues de la lista y el calendario sólo los
 * días que caben en su selector. Que los totales difieran es correcto; que no
 * se diga de dónde sale cada uno, no. Con «Failed» y 30 días la izquierda decía
 * 14 y la derecha 13, sin una palabra que lo explicara.
 */
export function calendarScope(status) {
  const filtered = status && status !== "all";
  return filtered
    ? `Installs from ${status} deployments, one square per day`
    : "One square per day in the window";
}

export default function InstallActivitySection({
  deployments = [],
  status = "all",
  refreshNonce = 0,
}) {
  const [windowKey, setWindowKey] = React.useState("30d");
  const [buckets, setBuckets] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDeploymentTimeseries(windowKey, status === "all" ? null : status)
      .then((res) => {
        if (!cancelled) setBuckets(Array.isArray(res?.buckets) ? res.buckets : []);
      })
      // Read-only: sin actividad el calendario se pinta igual, vacío, que es
      // una respuesta. No hay nada que gritar aquí.
      .catch(() => {
        if (!cancelled) setBuckets([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [windowKey, status, refreshNonce]);

  const items = React.useMemo(() => outcomeItems(deployments), [deployments]);
  const hasChartData = buckets.some(
    (b) => Number(b?.succeeded ?? 0) > 0 || Number(b?.failed ?? 0) > 0
  );

  return (
    <Grid container spacing={2} sx={{ mt: 0 }}>
      <Grid size={{ xs: 12, md: 7 }}>
        <SectionPaper variant="card" sx={{ p: 2 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 1 }}
            flexWrap="wrap"
            gap={1}
          >
            <Box>
              <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>
                When installs happened
              </Typography>
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                {calendarScope(status)}
              </Typography>
            </Box>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={windowKey}
              onChange={(_e, v) => v && setWindowKey(v)}
            >
              <ToggleButton value="7d" sx={{ textTransform: "none", px: 1.5 }}>7d</ToggleButton>
              <ToggleButton value="30d" sx={{ textTransform: "none", px: 1.5 }}>30d</ToggleButton>
              <ToggleButton value="90d" sx={{ textTransform: "none", px: 1.5 }}>90d</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {loading ? (
            <Skeleton variant="rounded" height={140} />
          ) : (
            // ⚠️ El calendario se pinta TAMBIÉN sin actividad: los días vacíos
            // son la respuesta a «¿cada cuánto entregamos?», y un cartel de "no
            // installs" ocupa el mismo sitio diciendo menos.
            <>
              <InstallActivityCalendar buckets={buckets} />
              {!hasChartData ? (
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: 1 }}>
                  {status && status !== "all"
                    ? `No installs from ${status} deployments in this window.`
                    : "Nothing was installed in this window."}
                </Typography>
              ) : null}
            </>
          )}
        </SectionPaper>
      </Grid>

      <Grid size={{ xs: 12, md: 5 }}>
        <CompositionBars
          title="Install outcomes"
          // ⚠️ «listed above» no es adorno: con un filtro activo el desglose
          // describe ESA lista, no toda la flota.
          headerExtra={<Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>across the deployments listed above</Typography>}
          headerExtraPlacement="below"
          items={items}
          totalLabel="installs"
          emptyLabel="No install results yet"
          minHeight={220}
        />
      </Grid>
    </Grid>
  );
}
