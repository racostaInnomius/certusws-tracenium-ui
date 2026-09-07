// src/components/software-delivery/IntakeUploadDialog.jsx
//
// Upload an installer for the AI intake pipeline. The operator picks a binary
// (.msi/.exe/.pkg/.deb/…) and optionally supplies hints (name/vendor/version)
// and a declared SHA-256 to check the upload against. The dialog is dumb — the
// parent performs the upload via api/softwareDelivery.uploadIntake.

import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Box,
  Typography,
} from "@mui/material";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { BRAND, TEXT } from "../../theme/brand";

const SHA256_RE = /^[0-9a-f]{64}$/i;

/**
 * El techo del servidor, para poder rechazar ANTES de subir.
 *
 * ⚠️ Duplica `DEFAULT_MAX_UPLOAD_BYTES` de intake-upload.ts a propósito, y la
 * alternativa era peor: sin esto, un MSI de 260 MiB se sube entero —minutos de
 * espera— para que el servidor lo rechace al final. Si allí se cambia, aquí
 * también; el mensaje nombra el límite para que el desajuste se note.
 */
export const MAX_UPLOAD_BYTES = 314_572_800; // 300 MiB

export function tooLargeMessage(size, limit = MAX_UPLOAD_BYTES) {
  if (!size || size <= limit) return null;
  const mib = (n) => `${Math.round(n / 1048576)} MiB`;
  return `That file is ${mib(size)}; the intake limit is ${mib(limit)}.`;
}

function emptyHints() {
  return { name: "", vendor: "", version: "", declaredSha256: "" };
}

export default function IntakeUploadDialog({ open, submitting, onClose, onSubmit }) {
  const [file, setFile] = React.useState(null);
  const [hints, setHints] = React.useState(emptyHints);
  const [error, setError] = React.useState(null);
  const [hintsOpen, setHintsOpen] = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    setFile(null);
    setHints(emptyHints());
    setError(null);
    setHintsOpen(false);
  }, [open]);

  const update = (patch) => setHints((p) => ({ ...p, ...patch }));

  const handleSubmit = () => {
    if (!file) {
      setError("Choose an installer file to upload.");
      return;
    }
    const tooLarge = tooLargeMessage(file.size);
    if (tooLarge) {
      setError(tooLarge);
      return;
    }
    const sha = hints.declaredSha256.trim();
    if (sha && !SHA256_RE.test(sha)) {
      setError("Declared SHA-256 must be a 64-char hex string (or left blank).");
      return;
    }
    onSubmit?.(file, {
      name: hints.name.trim() || undefined,
      vendor: hints.vendor.trim() || undefined,
      version: hints.version.trim() || undefined,
      declaredSha256: sha || undefined,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>Upload installer for AI intake</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray }}>
            The file is verified (signature + threat-intel) before anything else, then AI proposes a
            silent-install configuration for your review. Nothing is distributed until you approve it.
          </Typography>

          <Box>
            <input
              ref={inputRef}
              type="file"
              hidden
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                setFile(picked);
                // Se avisa al ELEGIR, no al enviar: enterarse de que no cabe
                // después de esperar la subida es la peor versión del mismo
                // mensaje.
                setError(picked ? tooLargeMessage(picked.size) : null);
              }}
            />
            <Button
              onClick={() => inputRef.current?.click()}
              startIcon={<UploadFileOutlinedIcon />}
              variant="outlined"
              sx={{ textTransform: "none", color: BRAND.dark, borderColor: BRAND.border }}
            >
              {file ? "Change file" : "Choose file…"}
            </Button>
            {file ? (
              <Typography sx={{ mt: 1, fontSize: TEXT.md, color: BRAND.dark, fontWeight: 600 }}>
                {file.name}{" "}
                <span style={{ color: BRAND.gray, fontWeight: 400 }}>
                  ({Math.max(1, Math.round(file.size / 1024)).toLocaleString()} KB)
                </span>
              </Typography>
            ) : null}
          </Box>

          {/* ⚠️ PLEGADO, Y NO ES COSMÉTICA.
              Estos campos eran lo segundo que veías, así que se rellenaban — y
              luego el extractor los pisaba, porque el rótulo ya decía
              "extracted values win". Con el MSI de Chrome se tecleó
              "Chrome Enterprise / Google" y el fichero traía dentro
              "Google Chrome / Google LLC / 152.0.7977.83": trabajo tirado.
              Los formatos con metadatos (MSI, DEB, RPM, PKG) no los necesitan;
              siguen aquí para cuando el binario no trae nada. */}
          <Box
            component="button"
            type="button"
            onClick={() => setHintsOpen((v) => !v)}
            aria-expanded={hintsOpen}
            sx={{
              display: "flex", alignItems: "center", gap: 0.5, border: 0, p: 0,
              bgcolor: "transparent", cursor: "pointer", color: BRAND.gray,
              fontSize: TEXT.sm, fontWeight: 700, textAlign: "left",
            }}
          >
            <ExpandMoreIcon
              fontSize="small"
              sx={{ transform: hintsOpen ? "none" : "rotate(-90deg)", transition: "transform .15s" }}
            />
            Name, vendor and version are read from the file
          </Box>
          {!hintsOpen ? (
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: -1.5 }}>
              Open this only to override them, or to declare a SHA-256 to check the upload against.
            </Typography>
          ) : null}
          {/* Plegado NO se renderiza, en vez de esconderse con display:none: un
              campo invisible pero presente sigue siendo algo que las
              herramientas encuentran y que un test puede dar por visible. El
              estado vive en `hints`, así que al reabrir sigue lo tecleado. */}
          {hintsOpen ? (
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "1fr 1fr" }}>
            <TextField size="small" label="Name" value={hints.name} onChange={(e) => update({ name: e.target.value })} />
            <TextField size="small" label="Vendor" value={hints.vendor} onChange={(e) => update({ vendor: e.target.value })} />
            <TextField size="small" label="Version" value={hints.version} onChange={(e) => update({ version: e.target.value })} />
            <TextField
              size="small"
              label="Declared SHA-256"
              value={hints.declaredSha256}
              onChange={(e) => update({ declaredSha256: e.target.value })}
              inputProps={{ style: { fontFamily: "monospace", fontSize: TEXT.sm } }}
            />
          </Box>
          ) : null}

          {error ? (
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: BRAND.alert?.errorSoft,
                color: BRAND.alert?.error,
                fontSize: TEXT.md,
                fontWeight: 600,
              }}
            >
              {error}
            </Box>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: "none", color: BRAND.gray }}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !file}
          variant="contained"
          sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
        >
          {submitting ? "Uploading…" : "Upload & analyze"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
