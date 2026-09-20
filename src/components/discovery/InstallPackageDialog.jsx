// src/components/discovery/InstallPackageDialog.jsx
//
// El paquete para instalar el agente en los equipos que faltan: el comando de
// un técnico, el guion de inicio para una GPO, y el código de alta que los
// autoriza.
//
// ⚠️ El código se enseña UNA vez —el servidor sólo guarda su huella—, y por eso
// el diálogo lo dice antes de que alguien lo cierre.
//
// ⚠️ Esto NO instala nada: reparte el paquete. Empujar el MSI en remoto sería
// otra capacidad (y otra conversación sobre credenciales y aprobación).

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";

const CODE_SX = {
  m: 0,
  p: 1.5,
  borderRadius: 1,
  bgcolor: BRAND.surfaceMuted,
  border: `1px solid ${BRAND.border}`,
  fontFamily: "monospace",
  fontSize: TEXT.xs,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  maxHeight: 260,
  overflow: "auto",
};

export default function InstallPackageDialog({ open, pkg, onClose, notify }) {
  const [tab, setTab] = React.useState(0);
  React.useEffect(() => {
    if (open) setTab(0);
  }, [open]);

  if (!pkg) return null;
  const views = [
    { label: "One device", body: pkg.command, help: "Run it on the device, in a console with administrator rights." },
    { label: "GPO startup script", body: pkg.gpoScript, help: "Computer Configuration → Policies → Windows Settings → Scripts → Startup. Runs as SYSTEM and does nothing if the agent is already there." },
    { label: "Intune (Win32 app)", body: pkg.intuneInstallCommand, help: "Install command of a Win32 app that carries the MSI." },
  ];
  const current = views[tab];

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      notify?.("success", "Copied");
    } catch {
      notify?.("error", "Could not copy — select the text manually");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontSize: TEXT.base, fontWeight: 800 }}>
        Install the agent on {pkg.devices.length} device{pkg.devices.length === 1 ? "" : "s"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Alert severity="warning">
            The enrollment code below is shown <strong>once</strong>. Copy it now — we only keep its fingerprint.
            It is good for {pkg.devices.length} install{pkg.devices.length === 1 ? "" : "s"}
            {pkg.tokenExpiresAt ? ` and expires on ${new Date(pkg.tokenExpiresAt).toLocaleDateString()}` : ""}.
          </Alert>

          {pkg.msiUrl ? (
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
              Installer: {pkg.msiVersion ? `v${pkg.msiVersion} · ` : ""}
              <Box component="span" sx={{ fontFamily: "monospace" }}>{pkg.msiUrl}</Box>
            </Typography>
          ) : (
            <Alert severity="info">
              There is no active Windows MSI in the release catalog, so the script has a placeholder where its URL goes.
              Add one in Settings → Agent releases.
            </Alert>
          )}

          <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
            {views.map((v) => (
              <Tab key={v.label} label={v.label} sx={{ textTransform: "none", fontWeight: 700 }} />
            ))}
          </Tabs>

          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>{current.help}</Typography>
          <Box component="pre" sx={CODE_SX}>{current.body}</Box>
          <Box>
            <Button size="small" startIcon={<ContentCopyOutlinedIcon />} onClick={() => copy(current.body)}>
              Copy {current.label.toLowerCase()}
            </Button>
          </Box>

          <Box>
            <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: BRAND.dark }}>
              Waiting for: {pkg.devices.slice(0, 12).join(", ")}
              {pkg.devices.length > 12 ? ` and ${pkg.devices.length - 12} more` : ""}
            </Typography>
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
              They are marked as invited. Each one turns into “with agent” on its own, when its agent checks in.
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">Done</Button>
      </DialogActions>
    </Dialog>
  );
}
