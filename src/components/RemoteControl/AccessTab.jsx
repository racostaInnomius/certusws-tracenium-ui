// src/components/RemoteControl/AccessTab.jsx
//
// Everything about WHO is allowed in and WHY, in one place:
//
//   · the approval-policy matrix (device class × capability), which used to
//     be a dialog behind a header button;
//   · the access record — who connected, to what, under which ticket. The
//     endpoint and its API client already existed (listAccessRequests) and
//     nothing rendered them. ADR-0009 phase 1 exists to COLLECT the data
//     with which the policy gets calibrated, and the data was being written
//     to a table nobody could read.
//
// Putting them side by side is the point: the matrix is the decision, the
// log is the evidence you'd base it on.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
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
  Typography
} from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { getAccessPolicy, setAccessPolicyCell, listAccessRequests } from "../../api/remoteControl";

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

// Exported for its own test: the tab renders two independent panels and
// mounting the whole tab to exercise the matrix would drag the access log's
// fetch in with it.
export function PolicyMatrix({ notify }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    getAccessPolicy()
      .then((r) => alive && setRows(r?.items ?? []))
      .catch(() => alive && setRows([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async (row) => {
    const key = `${row.capability}:${row.deviceClass}`;
    setBusy(key);
    try {
      await setAccessPolicyCell({
        capability: row.capability,
        deviceClass: row.deviceClass,
        requiresApproval: !row.requiresApproval,
        jitMinutes: row.jitMinutes
      });
      setRows((prev) =>
        prev.map((r) =>
          r.capability === row.capability && r.deviceClass === row.deviceClass
            ? { ...r, requiresApproval: !r.requiresApproval }
            : r
        )
      );
    } catch (e) {
      notify("error", e?.message || "Could not save the policy");
    } finally {
      setBusy("");
    }
  };

  const capabilities = [...new Set(rows.map((r) => r.capability))];

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}` }}>
      <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
        Privileged access policy
      </Typography>
      <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 2 }}>
        Which capabilities need a second person’s approval before they can be used.
        Connecting to a server and connecting to a laptop are not the same operation.
      </Typography>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={22} sx={{ color: BRAND.teal }} />
        </Box>
      ) : null}

      {!loading && rows.length === 0 ? (
        <Alert severity="info">
          No policy loaded. If you have just deployed, the migration that seeds the matrix
          may not have run yet.
        </Alert>
      ) : null}

      {capabilities.map((cap) => (
        <Box key={cap} sx={{ mb: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: BRAND.dark }}>
            {cap}
          </Typography>
          {rows
            .filter((r) => r.capability === cap)
            .map((r) => (
              <Stack
                key={r.deviceClass}
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ pl: 1, py: 0.5 }}
              >
                <Typography variant="caption" sx={{ width: 90, color: BRAND.textMuted }}>
                  {r.deviceClass === "server" ? "Servers" : "Endpoints"}
                </Typography>
                <Button
                  size="small"
                  variant={r.requiresApproval ? "contained" : "outlined"}
                  disabled={busy === `${r.capability}:${r.deviceClass}`}
                  onClick={() => toggle(r)}
                >
                  {r.requiresApproval ? "Approval required" : "No approval"}
                </Button>
              </Stack>
            ))}
        </Box>
      ))}
    </Paper>
  );
}

function AccessLog() {
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
  }, []);

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
                  <TableCell sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.deviceId || "—"}
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

export default function AccessTab({ notify }) {
  return (
    <Stack spacing={2}>
      <PolicyMatrix notify={notify} />
      <AccessLog />
    </Stack>
  );
}
