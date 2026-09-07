// src/components/Reports/GenericJsonPreview.jsx
//
// Vista previa para los tipos que NO tienen una a medida.
//
// `FleetHealthPreview` sabe qué significan los campos de su informe y por eso
// pinta KPIs y una tendencia. Eso no se puede generalizar: un CBOM y un pack de
// evidencia no comparten forma, y un componente que intentara adivinarla
// acabaría enseñando basura con confianza.
//
// Lo que SÍ se puede dar para cualquiera es lo que contesta la pregunta que
// trae aquí al operador —"¿esto es lo que creo que es, antes de generarlo,
// mandarlo o firmarlo?"—: de qué tamaño es, qué colecciones trae y con cuántos
// elementos, y el propio JSON para mirarlo. Es honesto sobre lo que sabe: no
// inventa un titular que no puede calcular.
//
// El JSON se pide POR EL MOTOR con `?preview=1`, así que mirar no deja fila en
// `report_runs` — ese ledger es de los ficheros que SALEN.

import * as React from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  IconButton, Stack, Typography,
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { previewReport } from "../../api/reports";
import { BRAND, TEXT } from "../../theme/brand";

/** Cuántos elementos trae cada colección de primer nivel. */
function resumirColecciones(data) {
  if (!data || typeof data !== "object") return [];
  const out = [];
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) out.push([k, v.length]);
    else if (v && typeof v === "object" && Array.isArray(v.items)) out.push([k, v.items.length]);
  }
  return out;
}

export default function GenericJsonPreview({ open, onClose, reportKey, reportLabel, formats = [], onGenerate, generating = "" }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open || !reportKey) return;
    let vivo = true;
    setLoading(true);
    setError("");
    previewReport(reportKey)
      .then((r) => vivo && setData(r ?? null))
      .catch((e) => {
        if (!vivo) return;
        setError(e?.message || "Could not load the preview.");
        setData(null);
      })
      .finally(() => vivo && setLoading(false));
    return () => { vivo = false; };
  }, [open, reportKey]);

  const colecciones = React.useMemo(() => resumirColecciones(data), [data]);
  const texto = React.useMemo(() => (data ? JSON.stringify(data, null, 2) : ""), [data]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark }} noWrap>{reportLabel}</Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>Preview — nothing is generated yet</Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ color: BRAND.gray }}>
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

        {loading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={26} sx={{ color: BRAND.teal }} />
          </Stack>
        ) : !data ? (
          <Typography sx={{ color: BRAND.gray, py: 4, textAlign: "center" }}>No preview data.</Typography>
        ) : (
          <>
            {/* Qué trae y cuánto. Es lo que distingue "el informe está vacío"
                de "el informe no se pudo construir", que sin esto se leen
                igual. */}
            {colecciones.length ? (
              <Stack direction="row" spacing={0.75} sx={{ mb: 2, flexWrap: "wrap", rowGap: 0.75 }}>
                {colecciones.map(([nombre, n]) => (
                  <Chip key={nombre} size="small" variant="outlined" label={`${nombre}: ${n}`} />
                ))}
              </Stack>
            ) : null}

            <Box
              component="pre"
              aria-label="Report preview JSON"
              sx={{
                m: 0, p: 1.5, maxHeight: 380, overflow: "auto",
                bgcolor: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 2,
                fontSize: TEXT.xs, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}
            >
              {texto.length > 20000 ? `${texto.slice(0, 20000)}\n\n… truncated for display` : texto}
            </Box>

            {/* Generar pasa por la página, que es la única que ejecuta — y por
                tanto el único sitio donde queda registrada la ejecución. */}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", sm: "center" }}
              spacing={1}
              sx={{ mt: 2 }}
            >
              <Typography variant="caption" sx={{ color: BRAND.gray }}>
                Generating records the run in this tenant&apos;s report history, with the file&apos;s SHA-256.
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                {formats.map((f) => (
                  <Button
                    key={f}
                    size="small"
                    variant={f === "pdf" ? "contained" : "outlined"}
                    startIcon={<DownloadOutlinedIcon />}
                    disabled={Boolean(generating)}
                    onClick={() => onGenerate?.(f)}
                    aria-label={`Generate ${f.toUpperCase()}`}
                    sx={{ textTransform: "none" }}
                  >
                    {generating === f ? "…" : f.toUpperCase()}
                  </Button>
                ))}
              </Stack>
            </Stack>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
