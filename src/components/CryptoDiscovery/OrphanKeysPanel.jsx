// src/components/CryptoDiscovery/OrphanKeysPanel.jsx
//
// ADR-0011 decisión 9.d — la clave huérfana como ítem de primera clase
// del inventario.
//
// ── Por qué esto es un panel y no un cron ───────────────────────────
//
// La decisión lo dice con una lección de este mismo producto detrás:
// «`purge_after` se escribe y no lo barre nadie». Un respaldo que nadie
// mira se pudre, y entonces el diseño PARECE completo mientras el
// residuo se acumula en silencio. Por eso una huérfana tiene que
// aparecer en el mismo sitio donde el operador mira todo lo demás.
//
// ── La honestidad que este panel tiene que mantener ─────────────────
//
// Lo que se ve es lo que reportó el último `cdp_key_list` de cada
// equipo. Una flota que nunca lo ha pedido sale VACÍA — y vacío aquí no
// significa «no hay huérfanas», significa «no hemos mirado». Confundir
// las dos cosas convertiría este panel en la misma falsa tranquilidad
// que motivó la decisión, así que se dice explícitamente.
//
// Copy en inglés como el resto del portal (revisión UI 2026-09-05: era
// la única pestaña en español).

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import { listOrphanKeys, destroyEndpointKey, refreshEndpointKeys } from "../../api/cdp";
import KnownDevicesPicker from "../AssetGroups/KnownDevicesPicker";
import { BRAND, DATAGRID_SX } from "../../theme/brand";

/**
 * Confirmación de destrucción.
 *
 * Exige expediente porque el backend lo exige, y el backend lo exige
 * porque esto es irreversible: si el certificado llegó entre la lista y
 * el clic, se tira uno ya emitido.
 */
function DestroyKeyDialog({ item, onClose, onDone }) {
  const [reason, setReason] = React.useState("");
  const [ticketRef, setTicketRef] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  React.useEffect(() => {
    if (item) {
      setReason("");
      setTicketRef("");
      setMsg(null);
    }
  }, [item]);

  const canSend = reason.trim().length >= 10 && ticketRef.trim().length >= 3 && !busy;

  const send = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await destroyEndpointKey({
        deviceId: item.agentId,
        keyId: item.keyId,
        reason: reason.trim(),
        ticketRef: ticketRef.trim()
      });
      if (r?.ok) {
        setMsg({ sev: "success", text: "Sent to the device. The list confirms it on the next reload." });
        onDone?.();
      } else {
        setMsg({ sev: "error", text: r?.message || "Couldn't send" });
      }
    } catch (e) {
      setMsg({ sev: "error", text: e?.message || "Couldn't send" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(item)} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Destroy key “{item?.keyId}”</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This is <strong>irreversible</strong> — there is no undo. If the certificate reached the device since
          the list was last read, an already-issued certificate is lost and has to be requested from the CA again.
        </Alert>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Device <code>{item?.agentId}</code>
          {item?.subject ? <> · subject <code>{item.subject}</code></> : null}
        </Typography>
        <TextField
          fullWidth multiline minRows={2} margin="dense" label="Reason" required
          value={reason} onChange={(e) => setReason(e.target.value)}
          helperText="At least 10 characters. It is recorded."
        />
        <TextField
          fullWidth margin="dense" label="Ticket" required
          value={ticketRef} onChange={(e) => setTicketRef(e.target.value)}
          helperText="At least 3 characters"
        />
        {msg && <Alert severity={msg.sev} sx={{ mt: 2 }}>{msg.text}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Close</Button>
        <Button variant="contained" color="error" disabled={!canSend} onClick={send}>
          {busy ? "Sending…" : "Destroy"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Pedir a los equipos que listen su almacén.
 *
 * Análisis de madurez 2026-09: `refreshEndpointKeys` existía en el
 * cliente API sin llamador, mientras el panel decía «si nunca se les ha
 * pedido su almacén, la lista sale vacía» y no ofrecía la forma de
 * pedirlo. Un aviso que señala una acción imposible es peor que ninguno.
 */
function AskDevicesDialog({ open, onClose, onDone }) {
  const [picked, setPicked] = React.useState(() => new Set());
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    if (open) {
      setPicked(new Set());
      setResult(null);
    }
  }, [open]);

  const send = async () => {
    setBusy(true);
    setResult(null);
    let ok = 0;
    const failed = [];
    // Un job por equipo: el endpoint es por dispositivo a propósito, y
    // un fallo en uno no puede impedir el resto.
    for (const deviceId of picked) {
      try {
        const r = await refreshEndpointKeys(deviceId);
        if (r?.ok) ok += 1;
        else failed.push(deviceId);
      } catch {
        failed.push(deviceId);
      }
    }
    setBusy(false);
    setResult({ ok, failed });
    if (ok > 0) onDone?.();
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Ask devices to list their key store</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          A read job is sent to each selected device. The orphan list updates when they answer — normally on the
          next facts cycle.
        </Typography>
        <KnownDevicesPicker
          open={open}
          selectedIds={picked}
          onToggleDevice={(id) =>
            setPicked((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          selectedLabel="device(s)"
          emptyLabel="No device matches."
        />
        {result && (
          <Alert severity={result.failed.length ? "warning" : "success"} sx={{ mt: 2 }}>
            Sent to {result.ok} device(s).
            {result.failed.length ? ` Couldn't send to ${result.failed.length}.` : ""}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Close</Button>
        <Button variant="contained" disabled={busy || picked.size === 0} onClick={send}>
          {busy ? "Sending…" : `Ask ${picked.size || ""}`.trim()}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function OrphanKeysPanel({ refreshNonce }) {
  const [askOpen, setAskOpen] = React.useState(false);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [toDestroy, setToDestroy] = React.useState(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    listOrphanKeys()
      .then((r) => {
        if (!alive) return;
        setRows((r?.items || []).map((x) => ({ ...x, id: `${x.agentId}:${x.keyId}` })));
      })
      .catch((e) => alive && setError(e?.message || "Couldn't load"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [refreshNonce, nonce]);

  const columns = [
    { field: "keyId", headerName: "Key", flex: 1, minWidth: 160 },
    { field: "subject", headerName: "Subject", flex: 1.4, minWidth: 200,
      renderCell: (p) => p.value || <span style={{ opacity: 0.5 }}>—</span> },
    { field: "agentId", headerName: "Device", flex: 1.2, minWidth: 200 },
    {
      field: "ageDays",
      headerName: "Age",
      width: 130,
      renderCell: (p) =>
        p.value == null ? "—" : (
          // El color es la señal: una huérfana de hoy es normal —el
          // certificado viene de camino— y una de tres semanas es
          // residuo que nadie reclamó.
          <Chip
            size="small"
            label={`${p.value} d`}
            color={p.value >= 14 ? "error" : p.value >= 3 ? "warning" : "default"}
          />
        )
    },
    { field: "requestId", headerName: "Request", flex: 1, minWidth: 140,
      renderCell: (p) => p.value || <span style={{ opacity: 0.5 }}>—</span> },
    {
      field: "actions",
      headerName: "",
      width: 60,
      sortable: false,
      renderCell: (p) => (
        <Tooltip title="Destroy this key">
          <Button
            size="small"
            color="error"
            aria-label={`Destroy key ${p.row.keyId}`}
            onClick={() => setToDestroy(p.row)}
          >
            <DeleteOutlineIcon fontSize="small" />
          </Button>
        </Tooltip>
      )
    }
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="body2">
          <strong>{rows.length}</strong> key(s) without a certificate
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" onClick={() => setAskOpen(true)}>
            Ask devices
          </Button>
          <Button size="small" startIcon={<RefreshIcon />} onClick={() => setNonce((n) => n + 1)}>
            Reload
          </Button>
        </Stack>
      </Stack>

      {/*
        ⚠️ Vacío NO es «no hay». Decirlo es el punto entero de la
        decisión 9.d: la falsa tranquilidad de un panel en blanco es
        exactamente lo que pasó con `purge_after`.
      */}
      {!loading && rows.length === 0 && !error && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No orphan keys <strong>recorded</strong>. This reflects the last thing each device reported: if their key
          store has never been asked for, the list is empty without that meaning there are none.
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <DataGrid
        autoHeight
        rows={rows}
        columns={columns}
        loading={loading}
        disableRowSelectionOnClick
        disableColumnMenu
        pageSizeOptions={[10, 25, 50]}
        initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
        sx={{ ...DATAGRID_SX, border: `1px solid ${BRAND.border}` }}
      />

      <AskDevicesDialog
        open={askOpen}
        onClose={() => setAskOpen(false)}
        onDone={() => setNonce((n) => n + 1)}
      />

      <DestroyKeyDialog
        item={toDestroy}
        onClose={() => setToDestroy(null)}
        onDone={() => {
          setToDestroy(null);
          setNonce((n) => n + 1);
        }}
      />
    </Box>
  );
}
