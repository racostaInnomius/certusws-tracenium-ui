// src/components/Reports/GenerateReportDialog.jsx
//
// Generar un informe, en el orden en que se decide: primero QUÉ, luego qué
// hacer con ello.
//
// El catálogo ponía un botón por formato (CSV · JSON · PDF) y, al lado,
// "Email" — cuatro botones que no son cuatro acciones. El formato es una
// propiedad del fichero que vas a pedir, y mandar por correo es algo que se
// decide sobre un fichero que YA existe: ofrecerlo antes obliga a generar dos
// veces o a adivinar.
//
// Aquí son tres pasos y un solo botón por paso:
//
//   choose  → en qué formato (sólo si hay más de uno)
//   running → generando
//   done    → el fichero existe: descargarlo o mandarlo
//
// El componente NO decide: la página le dice en qué paso está y qué hacer en
// cada uno. Así el paso intermedio de los tipos que piden alcance (el diálogo
// de parámetros) encaja entre `choose` y `running` sin que esto se entere.

import * as React from "react";
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, Stack, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
// El mismo formateo de tamaño que usa el historial: dos sitios que dicen
// "cuánto pesa este informe" no pueden decirlo de dos maneras.
import { formatBytes } from "./reportSchedules";
import { BRAND, TEXT } from "../../theme/brand";

export default function GenerateReportDialog({
  open,
  type,
  phase = "choose",
  result = null,
  error = "",
  canEmail = false,
  onGenerate,
  onDownload,
  onEmail,
  onClose,
}) {
  const formats = React.useMemo(
    () => (Array.isArray(type?.formats) ? type.formats : []),
    [type]
  );
  const [format, setFormat] = React.useState("");

  // Al abrir sobre otro informe, el formato vuelve al primero que ofrezca ese
  // tipo. Sin esto se arrastraba el del anterior y podía no existir aquí.
  React.useEffect(() => {
    if (open) setFormat(formats[0] || "");
  }, [open, formats]);

  if (!type) return null;

  const pideParams = Boolean(type.params?.length);

  return (
    <Dialog open={Boolean(open)} onClose={phase === "running" ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark }} noWrap>{type.label}</Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            {phase === "done" ? "Generated — it's in the report history" : "Generate a report"}
          </Typography>
        </Box>
        {/* Sin botón de cerrar mientras genera: la petición sigue en marcha y
            un aspa que no cancela nada miente sobre lo que hace. */}
        {phase === "running" ? null : (
          <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ color: BRAND.gray }}>
            <CloseOutlinedIcon fontSize="small" />
          </IconButton>
        )}
      </DialogTitle>

      <DialogContent>
        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

        {phase === "running" ? (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }}>
            <CircularProgress size={26} sx={{ color: BRAND.teal }} />
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>Generating…</Typography>
          </Stack>
        ) : phase === "done" ? (
          <Box sx={{ py: 1 }}>
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, fontWeight: 700, wordBreak: "break-all" }}>
              {result?.filename}
            </Typography>
            {result?.bytes ? (
              <Typography variant="caption" sx={{ color: BRAND.gray }}>{formatBytes(result.bytes)}</Typography>
            ) : null}
            {/* Archivado o no, se dice — porque cambia lo que puede hacer
                quien cierre el diálogo. Antes las corridas interactivas no se
                guardaban en ningún sitio: cerrar sin descargar perdía el
                fichero y mandarlo obligaba a REGENERAR, o sea otra fila en el
                ledger con otro hash. Ahora se archivan (las 3 últimas por
                tipo), así que el historial las devuelve. */}
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: 1.5 }}>
              {result?.archivado
                ? "Archived — you can download or email this exact copy from History later."
                : "This copy isn't archived — download it now or it has to be generated again."}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ py: 1 }}>
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: formats.length > 1 ? 1.5 : 0 }}>
              {pideParams
                ? "You'll be asked for the scope next."
                : "The run is recorded in this tenant's report history with its SHA-256."}
            </Typography>

            {/* Un solo formato no es una pregunta. */}
            {formats.length > 1 ? (
              <>
                <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: BRAND.dark, mb: 0.75 }} id="formato-salida">
                  Output format
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={format}
                  onChange={(_e, v) => { if (v) setFormat(v); }}
                  aria-labelledby="formato-salida"
                  sx={{ flexWrap: "wrap" }}
                >
                  {formats.map((f) => (
                    <ToggleButton
                      key={f}
                      value={f}
                      sx={{
                        textTransform: "none",
                        px: 2,
                        "&.Mui-selected": { bgcolor: BRAND.tealSoft, color: BRAND.tealText },
                      }}
                    >
                      {f.toUpperCase()}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </>
            ) : formats.length === 1 ? (
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: 1 }}>
                Output format: <strong>{formats[0].toUpperCase()}</strong>
              </Typography>
            ) : null}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {phase === "done" ? (
          <>
            {canEmail ? (
              <Button
                startIcon={<MailOutlineIcon />}
                onClick={() => onEmail?.(result)}
                sx={{ textTransform: "none", mr: "auto" }}
              >
                Email it
              </Button>
            ) : null}
            <Button onClick={onClose} sx={{ textTransform: "none" }}>Close</Button>
            <Button
              variant="contained"
              startIcon={<DownloadOutlinedIcon />}
              onClick={() => onDownload?.(result)}
              sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
            >
              Download
            </Button>
          </>
        ) : phase === "running" ? null : (
          <>
            <Button onClick={onClose} sx={{ textTransform: "none" }}>Cancel</Button>
            <Button
              variant="contained"
              startIcon={<PlayArrowOutlinedIcon />}
              disabled={formats.length > 0 && !format}
              onClick={() => onGenerate?.(format)}
              sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
            >
              {pideParams ? "Continue" : "Generate"}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
