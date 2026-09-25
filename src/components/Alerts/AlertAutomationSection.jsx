// src/components/Alerts/AlertAutomationSection.jsx
//
// ADR-0034 F2 — «esto ya lo atendió un playbook», en el cajón de la alerta.
//
// Existe para que nadie repita a mano un arreglo que la automatización ya
// hizo. Si ningún playbook tocó esta alerta, no ocupa sitio: no se pinta.

import * as React from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { formatRelative } from "../../utils/format";
import { listPlaybookRunsForAlert } from "../../api/playbooks";
import { ACTION_LABEL, DECISION_LABEL, MODE_LABEL, skipReasonLabel } from "./playbookModel";

export default function AlertAutomationSection({ sourceEventId }) {
  const [runs, setRuns] = React.useState([]);

  React.useEffect(() => {
    if (!sourceEventId) return undefined;
    let alive = true;
    listPlaybookRunsForAlert(sourceEventId)
      .then((res) => alive && setRuns(Array.isArray(res?.runs) ? res.runs : []))
      // Sin permiso, sin la función desplegada o sin respuesta: no se dice nada.
      .catch(() => alive && setRuns([]));
    return () => {
      alive = false;
    };
  }, [sourceEventId]);

  if (runs.length === 0) return null;

  return (
    <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 2 }} data-testid="alert-automation">
      <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 0.5 }}>
        Automation
      </Typography>
      <Stack spacing={0.75}>
        {runs.map((r, i) => (
          <Box key={`${r.playbookId}-${i}`}>
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
              <b>{r.name}</b> · {DECISION_LABEL[r.decision] ?? r.decision} · {MODE_LABEL[r.mode] ?? r.mode} · {formatRelative(r.createdAt)}
            </Typography>
            {r.skipReason ? <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{skipReasonLabel(r.skipReason)}</Typography> : null}
            {(r.actions ?? []).map((a, j) => (
              <Typography key={j} sx={{ fontSize: TEXT.xs, color: BRAND.gray, pl: 1 }}>
                {ACTION_LABEL[a.kind] ?? a.kind}: {a.status}
                {a.detail ? ` — ${a.detail}` : ""}
              </Typography>
            ))}
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
