// src/components/agent-releases/UnattendedInstallDialog.jsx
//
// Muestra el comando de instalación desatendida del binario que el operador
// acaba de ver en la lista, listo para copiar.
//
// Va POR FILA y no en un bloque al final de la tabla a propósito: el comando
// lleva dentro la versión, la arquitectura y el formato exactos, así que pegado
// a su binario no puede desincronizarse. Un bloque general invita a descargar
// arm64 y copiar el comando de x64.

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
  Typography,
} from "@mui/material";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";

import { BRAND } from "../../theme/brand";
import {
  TOKEN_PLACEHOLDER,
  unattendedInstallCommand,
  unattendedInstallNote,
} from "./unattendedInstall";

export default function UnattendedInstallDialog({ open, row, onClose, notify }) {
  const command = React.useMemo(() => unattendedInstallCommand(row), [row]);
  const note = React.useMemo(() => unattendedInstallNote(row), [row]);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      notify?.("success", "Comando copiado");
    } catch {
      // Portapapeles bloqueado (contexto no seguro o permiso denegado). El
      // comando sigue visible y seleccionable, así que esto es un aviso, no un
      // fallo del que haya que recuperarse.
      notify?.("error", "No se pudo copiar; selecciona el texto manualmente");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Instalación desatendida</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            {row?.platform} · {row?.arch} · {row?.format} · v{row?.version}
          </Typography>

          {command ? (
            <>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: BRAND.darkSoft,
                  color: BRAND.dark,
                  fontFamily: "monospace",
                  fontSize: 12,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {command}
              </Box>

              {/* El token NO se inyecta: un comando con la credencial dentro
                  termina en capturas de pantalla y tickets de soporte. */}
              <Alert severity="info">
                Sustituye <strong>{TOKEN_PLACEHOLDER}</strong> por un token del
                paso <strong>Enrollment tokens</strong>. Un mismo token puede
                enrolar varios equipos según su límite de usos.
              </Alert>

              {note ? (
                <Typography variant="caption" color="text.secondary">
                  {note}
                </Typography>
              ) : null}
            </>
          ) : (
            <Alert severity="warning">
              No hay comando desatendido conocido para esta combinación de
              plataforma y formato.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
        <Button
          variant="contained"
          startIcon={<ContentCopyOutlinedIcon />}
          onClick={handleCopy}
          disabled={!command}
        >
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
