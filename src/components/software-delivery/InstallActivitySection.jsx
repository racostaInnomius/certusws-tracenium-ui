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
// ⚠️ EL DESGLOSE DESCRIBE LA LISTA QUE SE ESTÁ VIENDO, filtro incluido. Con
// «failed» activo cuenta sólo los desenlaces de esos despliegues, y por eso lo
// dice en el subtítulo: un agregado que cambia bajo un filtro sin avisar es la
// forma de leer «7 fallos» creyendo que son de toda la flota.

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

export default function InstallActivitySection({ deployments = [], refreshNonce = 0 }) {
  const [windowKey, setWindowKey] = React.useState("30d");
  const [buckets, setBuckets] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDeploymentTimeseries(windowKey)
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
  }, [windowKey, refreshNonce]);

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
                One square per day in the window
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
                  Nothing was installed in this window.
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
