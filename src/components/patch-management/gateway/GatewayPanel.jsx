// src/components/patch-management/gateway/GatewayPanel.jsx
//
// The "Infrastructure Gateway" tab: register the host that brokers to vCenter,
// seal its credential, and — crucially — see whether any of it actually works.
//
// The verification detail is the point. With an end-to-end sealed credential
// the control plane cannot test it for you, so the gateway self-checks and
// reports back a rung-by-rung diagnostic. Showing only "failed" would put the
// operator exactly where they were before (ADR-0001 C-bis).

import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import NetworkCheckIcon from "@mui/icons-material/NetworkCheck";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";

import {
  listGateways,
  createGateway,
  updateGateway,
  deleteGateway,
  verifyGateway,
} from "../../../api/patchManagement";
import GatewayDialog from "./GatewayDialog";
import CredentialDialog from "./CredentialDialog";
import {
  toStageRows,
  healthPresentation,
  credentialPresentation,
  remediationFor,
} from "./verifyReport";

const STATUS_ICON = {
  ok: <CheckCircleOutlineIcon color="success" fontSize="small" />,
  warn: <WarningAmberIcon color="warning" fontSize="small" />,
  failed: <ErrorOutlineIcon color="error" fontSize="small" />,
  pending: <RadioButtonUncheckedIcon color="disabled" fontSize="small" />,
  skipped: <RemoveCircleOutlineIcon color="disabled" fontSize="small" />,
};

function VerifyDetail({ gateway }) {
  const rows = toStageRows(gateway.lastVerifyReport);
  return (
    <Box sx={{ p: 2, bgcolor: "action.hover" }}>
      <Typography variant="subtitle2" gutterBottom>
        Last verification
        {gateway.lastVerifiedAt ? ` — ${new Date(gateway.lastVerifiedAt).toLocaleString()}` : ""}
      </Typography>

      {gateway.health === "failed" && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {remediationFor(gateway.lastVerifyClassify)}
        </Alert>
      )}

      <Stack spacing={0.75}>
        {rows.map((r) => (
          <Box key={r.stage}>
            <Stack direction="row" spacing={1} alignItems="center">
              {STATUS_ICON[r.status]}
              <Typography variant="body2" sx={{ minWidth: 160 }}>
                {r.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {r.detail}
              </Typography>
            </Stack>
            {r.privileges && (
              <Stack sx={{ pl: 4.5, pt: 0.5 }} spacing={0.25}>
                {r.privileges.map((p) => (
                  <Typography
                    key={p.priv}
                    variant="caption"
                    sx={{ fontFamily: "monospace" }}
                    color={p.granted ? "success.main" : p.supported ? "error.main" : "text.disabled"}
                  >
                    {p.granted ? "✓" : p.supported ? "✗" : "–"} {p.priv}
                    {!p.supported && " (not offered by this vCenter build)"}
                  </Typography>
                ))}
              </Stack>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

export default function GatewayPanel({ canManage = false, devices = [], notify }) {
  const [gateways, setGateways] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [expanded, setExpanded] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [credentialFor, setCredentialFor] = React.useState(null);
  const [busyId, setBusyId] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listGateways();
      if (!res?.ok) {
        setError(res?.data?.message || "Could not load gateways.");
        return;
      }
      setGateways(res.data?.gateways ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async (payload) => {
    const res = editing
      ? await updateGateway(editing.id, payload)
      : await createGateway(payload);
    if (!res?.ok) throw new Error(res?.data?.message || "The control plane rejected the gateway.");
    notify?.("success", editing ? "Gateway updated." : "Gateway registered.");
    await load();
  };

  const remove = async (gw) => {
    if (!window.confirm(`Remove ${gw.name}? The host will stop acting as a gateway and forget its vCenter credential.`)) {
      return;
    }
    const res = await deleteGateway(gw.id);
    if (!res?.ok) return notify?.("error", "Could not remove the gateway.");
    notify?.("success", "Gateway removed.");
    await load();
  };

  const test = async (gw) => {
    setBusyId(gw.id);
    try {
      const res = await verifyGateway(gw.id);
      if (!res?.ok) return notify?.("error", "Could not queue the verification.");
      notify?.("info", "Verification queued — the gateway will report back shortly.");
      // The gateway answers asynchronously; refresh shortly after.
      setTimeout(load, 4000);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress />
      </Stack>
    );
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6">Infrastructure Gateway</Typography>
          <Typography variant="body2" color="text.secondary">
            Snapshots virtual machines in vCenter before patching them, so a bad patch
            can be rolled back.
          </Typography>
        </Box>
        {canManage && (
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Register gateway
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {gateways.length === 0 ? (
        <Alert severity="info">
          No gateway registered. Patching proceeds normally — virtual machines simply
          get no pre-patch snapshot.
        </Alert>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={40} />
                <TableCell>Name</TableCell>
                <TableCell>vCenter</TableCell>
                <TableCell>Credential</TableCell>
                <TableCell>Health</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {gateways.map((gw) => {
                const health = healthPresentation(gw);
                const cred = credentialPresentation(gw.credentialState);
                const open = expanded === gw.id;
                return (
                  <React.Fragment key={gw.id}>
                    <TableRow hover>
                      <TableCell>
                        <IconButton
                          size="small"
                          aria-label={open ? `Hide verification detail for ${gw.name}` : `Show verification detail for ${gw.name}`}
                          onClick={() => setExpanded(open ? null : gw.id)}
                        >
                          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{gw.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {gw.deviceId}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{gw.vcenterUrl}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={cred.label} color={cred.color} variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Tooltip title={health.hint || ""}>
                          <Chip size="small" label={health.label} color={health.color} />
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">
                        {canManage && (
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Tooltip title="Set vCenter credential">
                              <IconButton size="small" aria-label={`Set vCenter credential for ${gw.name}`} onClick={() => setCredentialFor(gw)}>
                                <KeyOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Test connection">
                              <span>
                                <IconButton size="small" aria-label={`Test connection for ${gw.name}`} onClick={() => test(gw)} disabled={busyId === gw.id}>
                                  <NetworkCheckIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Edit">
                              <IconButton
                                size="small"
                                aria-label={`Edit ${gw.name}`}
                                onClick={() => {
                                  setEditing(gw);
                                  setDialogOpen(true);
                                }}
                              >
                                <EditOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Remove">
                              <IconButton size="small" aria-label={`Remove ${gw.name}`} onClick={() => remove(gw)}>
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} sx={{ p: 0, borderBottom: open ? undefined : "none" }}>
                        <Collapse in={open} unmountOnExit>
                          <VerifyDetail gateway={gw} />
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}

      <GatewayDialog
        open={dialogOpen}
        gateway={editing}
        devices={devices}
        onClose={() => setDialogOpen(false)}
        onSave={save}
      />
      <CredentialDialog
        open={Boolean(credentialFor)}
        gateway={credentialFor}
        onClose={() => setCredentialFor(null)}
        onDone={load}
        notify={notify}
      />
    </Box>
  );
}
