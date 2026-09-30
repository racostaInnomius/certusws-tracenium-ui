// src/components/Billing/PluginPills.jsx
//
// Lo que incluye el plan, en una fila: una pastilla por plugin del catálogo.
//
// Sustituye a la rejilla desplegable "What's included" (PluginInclusion), que
// ocupaba media pantalla para decir lo que caben en siete etiquetas. El detalle
// no se pierde: cada pastilla lleva un tooltip con el NOMBRE COMPLETO —"SCP" no
// le dice nada a quien no conoce el producto— y su estado para este tenant.
//
// La pastilla es enfocable: el tooltip tiene que llegar también a quien navega
// con teclado, no sólo a quien pasa el ratón.

import { useEffect, useState } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PauseIcon from "@mui/icons-material/Pause";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { getPluginCoverageSummary } from "../../api/overview";
import { FOCUS_RING, ICON, TEXT } from "../../theme/brand";
import StatusPill from "./StatusPill";
import { pluginState } from "./billingModel";

const LOOK = {
  included: { tone: "success", Icon: CheckIcon },
  trial: { tone: "info", Icon: ScheduleIcon },
  paused: { tone: "warning", Icon: PauseIcon },
  locked: { tone: "neutral", Icon: LockOutlinedIcon },
};

function TooltipBody({ plugin, note, coverage }) {
  return (
    <Box sx={{ py: 0.25 }}>
      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 800 }}>
        {plugin.label} — {plugin.title}
      </Typography>
      {note ? <Typography sx={{ fontSize: TEXT.sm }}>{note}</Typography> : null}
      {coverage ? (
        <Typography sx={{ fontSize: TEXT.sm, opacity: 0.85 }}>
          Reporting on {coverage.count} of {coverage.total} devices
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * Una pastilla de plugin con su nombre completo en el tooltip. Enfocable: el
 * tooltip tiene que llegar también a quien navega con teclado.
 *
 * `focusable={false}` dentro de otro control (las opciones del selector de
 * plan): un elemento enfocable dentro de un botón es un control anidado, y el
 * navegador deja la opción SIN nombre. Ahí el nombre completo va en la opción.
 */
export function PluginTag({ plugin, tone = "neutral", Icon = null, note = null, coverage = null, focusable = true }) {
  const name = `${plugin.label} — ${plugin.title}`;
  return (
    <Tooltip arrow title={<TooltipBody plugin={plugin} note={note} coverage={coverage} />}>
      <Box
        component="span"
        tabIndex={focusable ? 0 : undefined}
        aria-label={focusable ? (note ? `${name}: ${note}` : name) : undefined}
        aria-hidden={focusable ? undefined : true}
        sx={{ display: "inline-flex", borderRadius: 999, outline: "none", "&:focus-visible": { boxShadow: FOCUS_RING } }}
      >
        <StatusPill tone={tone} sx={{ py: 0.25, cursor: "help" }}>
          {Icon ? <Icon aria-hidden sx={{ fontSize: ICON.xs }} /> : null}
          {plugin.label}
        </StatusPill>
      </Box>
    </Tooltip>
  );
}

export default function PluginPills({ catalog = [], sub }) {
  const [coverage, setCoverage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getPluginCoverageSummary()
      .then((res) => !cancelled && setCoverage(res || null))
      .catch(() => !cancelled && setCoverage(null));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!catalog.length) return null;

  const total = Number(coverage?.total ?? 0);

  return (
    <Box
      component="ul"
      aria-label="Plugins in your plan"
      sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, listStyle: "none", p: 0, m: 0 }}
    >
      {catalog.map((plugin) => {
        const { state, note } = pluginState(plugin, sub);
        const { tone, Icon } = LOOK[state];
        const found = (coverage?.byPlugin ?? []).find((c) => c.plugin === plugin.key);
        const cov = state === "included" && total > 0 ? { count: Number(found?.count ?? 0), total } : null;
        return (
          <li key={plugin.key}>
            <PluginTag plugin={plugin} tone={tone} Icon={Icon} note={note} coverage={cov} />
          </li>
        );
      })}
    </Box>
  );
}
