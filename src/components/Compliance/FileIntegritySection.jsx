// src/components/Compliance/FileIntegritySection.jsx
//
// ADR-0027 — la integridad de ficheros de UN equipo, en su ficha de Security
// Compliance: qué se vigila, cuándo se leyó y qué cambió.
//
// Se carga al desplegar, como el diff de hallazgos: la mayoría de las visitas
// a la ficha no la necesitan.
//
// ⚠️ Cuatro situaciones que no se pueden pintar igual como «0 cambios»: el
// tenant no declaró nada, el equipo nunca informó, no se pudo leer, y se leyó
// y no cambió nada.

import * as React from "react";
import { Alert, Box, Chip, Collapse, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import { BRAND, ICON, TEXT, TEXT_MUTED } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import { formatDate, formatRelative } from "../../utils/format";
import { getDeviceFileIntegrity } from "../../api/fileIntegrity";
import { fileIntegrityStatus } from "./fileIntegrityStatus";

const CHANGE_LABEL = { file_added: "Appeared", file_removed: "Removed", file_changed: "Changed" };
const CHANGE_SEVERITY = { file_added: "medium", file_removed: "high", file_changed: "high" };
const PURPOSE_LABEL = { system: "System", audit_logs: "Audit logs", application: "Application" };
const short = (h) => (h ? `${h.slice(0, 12)}…` : "—");

export default function FileIntegritySection({ agentId }) {
  const [expanded, setExpanded] = React.useState(false);
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!expanded || data || !agentId) return undefined;
    let alive = true;
    setLoading(true);
    getDeviceFileIntegrity(agentId)
      .then((res) => alive && setData(res))
      .catch((err) => alive && setError(err?.body?.message || err?.message || "Failed to load file integrity"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [expanded, data, agentId]);

  const status = fileIntegrityStatus(data);
  const scan = data?.scan;

  return (
    <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 1.5 }} data-testid="file-integrity-section">
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, cursor: "pointer" }} onClick={() => setExpanded((v) => !v)}>
        <FactCheckOutlinedIcon sx={{ color: BRAND.teal, fontSize: ICON.md }} />
        <Typography sx={{ fontWeight: 700, color: BRAND.dark, fontSize: TEXT.md, flex: 1 }}>File integrity</Typography>
        <IconButton size="small" aria-label={expanded ? "Collapse file integrity" : "Expand file integrity"}>
          {expanded ? <ExpandLessOutlinedIcon fontSize="small" /> : <ExpandMoreOutlinedIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ mt: 1 }}>
          {loading ? <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>Loading…</Typography> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {data ? (
            <>
              <Alert severity={status.tone === "warning" ? "warning" : status.tone === "attention" ? "warning" : "info"} sx={{ mb: 1 }}>
                {status.text}
                {scan?.reportedAt ? ` · last read ${formatRelative(scan.reportedAt)}` : ""}
              </Alert>

              {data.sets?.length ? (
                <Stack spacing={0.5} sx={{ mb: 1 }}>
                  {data.sets.map((s) => (
                    <Box key={s.setId} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>{s.label || s.setId}</Typography>
                      <Chip size="small" label={PURPOSE_LABEL[s.purpose] ?? s.purpose} sx={{ height: 18, fontSize: TEXT.xs }} />
                      <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                        {s.files} file{s.files === 1 ? "" : "s"}
                        {s.unhashed > 0 ? ` · ${s.unhashed} too large to hash` : ""}
                      </Typography>
                    </Box>
                  ))}
                  {scan && (scan.unreadable > 0 || scan.truncated) ? (
                    <Typography sx={{ fontSize: TEXT.xs, color: severityMeta("medium").fg }}>
                      {scan.unreadable > 0 ? `${scan.unreadable} could not be read. ` : ""}
                      {scan.truncated ? "The read stopped at the file limit, so some files were not checked." : ""}
                    </Typography>
                  ) : null}
                </Stack>
              ) : null}

              {data.recentChanges?.length ? (
                <Stack spacing={0.5}>
                  {data.recentChanges.map((c, i) => {
                    const sev = severityMeta(CHANGE_SEVERITY[c.change] ?? "medium");
                    return (
                      <Box key={`${c.path}-${c.occurredAt}-${i}`} sx={{ display: "flex", gap: 1, alignItems: "baseline", flexWrap: "wrap" }}>
                        <Chip size="small" label={CHANGE_LABEL[c.change] ?? c.change} sx={{ height: 18, fontSize: TEXT.xs, fontWeight: 700, bgcolor: sev.bg, color: sev.fg }} />
                        <Typography sx={{ fontSize: TEXT.xs, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: BRAND.dark, wordBreak: "break-all" }}>{c.path}</Typography>
                        <Tooltip title={`Before: ${c.previousSha256 ?? "—"}\nAfter: ${c.sha256 ?? "—"}`}>
                          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                            {short(c.previousSha256)} → {short(c.sha256)}
                          </Typography>
                        </Tooltip>
                        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>{formatDate(c.occurredAt)}</Typography>
                      </Box>
                    );
                  })}
                </Stack>
              ) : null}
            </>
          ) : null}
        </Box>
      </Collapse>
    </Paper>
  );
}
