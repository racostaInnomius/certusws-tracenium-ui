// src/components/RemoteControl/AccessTab.jsx
//
// Everything about WHO is allowed in and WHY, in one place:
//
//   · the approval-policy matrix (device class × capability), which used to
//     be a dialog behind a header button. The matrix component is shared —
//     Crypto Discovery renders the same one over its own capabilities — and
//     this tab passes the "rcp." prefix so only Remote Control's rows show;
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
import AccessPolicyMatrix from "../common/AccessPolicyMatrix";

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

export default function AccessTab({ notify }) {
  return (
    <Stack spacing={2}>
      {/* Filtered to rcp.* — Crypto Discovery's capabilities share this matrix
          in the DATA but they are not settings of this screen, and rendering
          them here read as somebody else's configuration leaking in. They
          have their own tab under Crypto Discovery. */}
      <AccessPolicyMatrix
        prefix="rcp."
        title="Privileged access policy"
        description="Which remote control capabilities need a second person’s approval before they can be used. Connecting to a server and connecting to a laptop are not the same operation."
        notify={notify}
      />
      <AccessLog />
    </Stack>
  );
}
