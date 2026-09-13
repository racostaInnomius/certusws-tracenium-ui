// src/components/software-delivery/VirusTotalDialogs.jsx
//
// ADR-0022 — los dos diálogos de la subida a VirusTotal.
//
//   · VirusTotalConsentDialog — condición 2: consentimiento EXPLÍCITO antes de
//     compartir el binario. Dos casillas, las dos obligatorias.
//   · PendingReputationApproveDialog — condición 3: aprobar sin esperar el
//     análisis, a sabiendas.
//
// ⚠️ El texto de consentimiento describe el VirusTotal PÚBLICO (clave gratuita).
// Con análisis privado (plan de pago) el fichero no se comparte y este texto
// deja de ser cierto: al cambiarlo, cambia también VT_PUBLIC_UPLOAD_CONSENT_VERSION
// en el backend, que es lo que registra bajo qué texto se subió cada fichero.

import * as React from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

export function VirusTotalConsentDialog({ open, filename, submitting, error, onClose, onConfirm }) {
  const [shared, setShared] = React.useState(false);
  const [rights, setRights] = React.useState(false);

  // Cada apertura empieza sin marcar: un consentimiento que se queda marcado de
  // la vez anterior no es un consentimiento para ESTE fichero.
  React.useEffect(() => {
    if (open) {
      setShared(false);
      setRights(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>Submit file to VirusTotal?</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>
            VirusTotal has no record of <strong>{filename}</strong>. To get a score, the file itself has to be
            uploaded — not just its hash.
          </Typography>
          <Alert severity="warning">
            With the public VirusTotal service, uploaded files are shared with the VirusTotal community and its
            security partners, and deletion is not guaranteed. Installers can contain internal URLs, configuration
            or credentials — check before sharing.
          </Alert>
          <FormControlLabel
            control={<Checkbox checked={shared} onChange={(e) => setShared(e.target.checked)} />}
            label={
              <Typography sx={{ fontSize: TEXT.md }}>
                I understand this file will be shared with VirusTotal and its partners, and may not be deletable.
              </Typography>
            }
          />
          <FormControlLabel
            control={<Checkbox checked={rights} onChange={(e) => setRights(e.target.checked)} />}
            label={
              <Typography sx={{ fontSize: TEXT.md }}>
                I have the right to share this file with third parties (it is ours, or its owner has authorised it).
              </Typography>
            }
          />
          {/* El rechazo del servidor se queda a la vista: el diálogo sigue abierto. */}
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="warning"
          disabled={!shared || !rights || submitting}
          onClick={() => onConfirm?.({ acknowledgeSharing: true, rightToShare: true })}
        >
          {submitting ? "Submitting…" : "Submit to VirusTotal"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function PendingReputationApproveDialog({ open, submitting, onClose, onConfirm }) {
  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>VirusTotal is still analyzing this file</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>
          Approving now publishes the package before the result is in. If the analysis later comes back malicious,
          the package will already be in the catalog.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Wait for the result
        </Button>
        <Button variant="contained" color="warning" onClick={onConfirm} disabled={submitting}>
          Approve without waiting
        </Button>
      </DialogActions>
    </Dialog>
  );
}
