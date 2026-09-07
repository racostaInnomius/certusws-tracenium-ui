// src/components/RemoteControl/AccessTab.jsx
//
// El REGISTRO de quién entró, a qué y con qué ticket. ADR-0009 fase 1 existe
// para recoger justamente estos datos, y se estaban escribiendo en una tabla
// que nadie podía leer.
//
// ── ⚠️ Por qué la matriz de vistobueno ya NO está aquí ───────────────
//
// Estuvo en esta pestaña, al lado del registro, con el argumento de que "la
// matriz es la decisión y el log es la evidencia". La práctica lo desmintió
// el 2026-09-07: un operador al que el gate frenó una shell descubrió que
// tenía, en la MISMA pantalla y a un clic, el interruptor para apagarlo — y
// lo apagó, que es lo razonable cuando estás bloqueado y llevas prisa.
//
// Un control que existe para obligar a que intervenga una segunda persona no
// puede estar desactivable por la primera sin salir de donde está esperando.
// Se ha movido a los ajustes del agente (sección Remote Control), que es
// donde se configura el plugin y adonde hay que ir a propósito.
//
// Aquí se queda la evidencia, que es lo que esta pestaña sabe contar.

import * as React from "react";
import {
  Box,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { listAccessRequests } from "../../api/remoteControl";

const STATUS_META = {
  approved: { label: "Approved", fg: ROLE.positive, bg: ROLE.positiveSoft },
  denied: { label: "Denied", fg: ROLE.critical, bg: ROLE.criticalSoft },
  pending: { label: "Pending", fg: ROLE.caution, bg: ROLE.cautionSoft },
  expired: { label: "Expired", fg: BRAND.gray, bg: BRAND.surfaceMuted }
};

function StatusChip({ status }) {
  const meta = STATUS_META[String(status || "").toLowerCase()] || {
    label: status || "—",
    fg: BRAND.gray,
    bg: BRAND.surfaceMuted
  };
  return (
    <Chip
      size="small"
      label={meta.label}
      sx={{
        height: 20,
        fontWeight: 700,
        fontSize: TEXT.xs,
        bgcolor: meta.bg,
        color: meta.fg,
        border: `1px solid ${meta.fg}33`
      }}
    />
  );
}

function AccessLog({ refreshNonce = 0 }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    listAccessRequests({ limit: 100 })
      .then((r) => alive && setItems(Array.isArray(r?.items) ? r.items : []))
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [refreshNonce]);

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}` }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 1.5, gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
            Access record
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            Every privileged access requested on this tenant, with its reason and ticket.
          </Typography>
        </Box>
        {loading ? <CircularProgress size={16} sx={{ color: BRAND.teal }} /> : null}
      </Stack>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>When</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Operator</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Capability</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Device</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Reason</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Ticket</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ color: BRAND.gray, py: 3 }}>
                  No access has been requested yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((it) => (
                <TableRow key={it.requestId} hover>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {it.createdAt ? new Date(it.createdAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>{it.operatorUserId || "—"}</TableCell>
                  <TableCell>{it.capability || "—"}</TableCell>
                  {/* Hostname, with the id behind the tooltip. This log is
                      read by a person auditing who went where; a column of
                      UUIDs answers "which row" and not "which machine". */}
                  <TableCell sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                    <Tooltip title={it.deviceId || ""} placement="top">
                      <span>{it.hostname || it.deviceId || "—"}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 280 }}>{it.reason || "—"}</TableCell>
                  <TableCell>{it.ticketRef || "—"}</TableCell>
                  <TableCell>
                    <StatusChip status={it.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

export default function AccessTab({ refreshNonce = 0 }) {
  return (
    <Stack spacing={2}>
      <AccessLog refreshNonce={refreshNonce} />
    </Stack>
  );
}
