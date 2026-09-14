// src/components/patch-management/gateway/GatewayPanel.jsx
//
// The "Infrastructure Gateway" tab: register the host that brokers to vCenter,
// seal its credential, and — crucially — see whether any of it actually works.
//
// 2026-09-14: the same gateway is SHARED with Crypto Discovery, which reads the
// vCenter and ESXi certificates through it. This panel therefore renders in two
// places with two `variant`s — "pmp" (Patch Management → Configure, snapshots)
// and "cdp" (Crypto Discovery → Settings → Infra, certificates) — and takes its
// API as a prop, because each page talks to the mount its own capability can
// reach (/patch-management/gateways vs /infrastructure/gateways). Same rows,
// same handlers on the server; only the gate differs.
//
// The verification detail is the point. With an end-to-end sealed credential
// the control plane cannot test it for you, so the gateway self-checks and
// reports back a rung-by-rung diagnostic. Showing only "failed" would put the
// operator exactly where they were before (ADR-0001 C-bis).

import React from "react";

/**
 * Best available human text for a failed request.
 *
 * http.js throws on any non-2xx and attaches the parsed body, so the server's
 * own `message` is the most specific thing we have. The fallback matters:
 * a 500 from the gateway endpoints carries `{ error: "internal_error" }` with
 * no message at all, and saying "rejected" there would be a guess — the server
 * did not reject anything, it failed.
 */
function errorMessage(err, fallback) {
  const fromBody = err?.body?.message;
  if (typeof fromBody === "string" && fromBody.trim()) return fromBody.trim();
  if (err?.status >= 500) return `${fallback} (server error ${err.status})`;
  return fallback;
}

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
  Switch,
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
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";

import * as patchManagementApi from "../../../api/patchManagement";
import GatewayDialog from "./GatewayDialog";
import CredentialDialog from "./CredentialDialog";
import SnapshotTestDialog from "./SnapshotTestDialog";
import {
  toStageRows,
  healthPresentation,
  credentialPresentation,
  remediationFor,
  usesPresentation,
} from "./verifyReport";

const VARIANT = {
  pmp: {
    title: "Infrastructure Gateway",
    subtitle: "Snapshots virtual machines in vCenter before patching them, so a bad patch can be rolled back.",
    empty: "No gateway registered. Patching proceeds normally — virtual machines simply get no pre-patch snapshot.",
    removeConfirm: (gw) => `Remove ${gw.name}? The host will stop acting as a gateway and forget its vCenter credential.${gw.readCertificates ? " Crypto Discovery reads certificates through it and will stop." : ""}`,
  },
  cdp: {
    title: "vCenter gateway",
    subtitle: "A Tracenium agent that can reach vCenter reads the vCenter machine certificate and each ESXi host certificate with a read-only vSphere account. The credential is sealed in this browser against the gateway's certificate; the control plane never sees it.",
    empty: "No vCenter gateway registered. Register one on a device that reaches vCenter, seal a read-only credential, then switch on “Reads certificates”.",
    removeConfirm: (gw) => `Remove ${gw.name}? The host will stop acting as a gateway and forget its vCenter credential. If Patch Management snapshots VMs through it, that stops too.`,
  },
};

const USE_STATUS_ICON = {
  ok: <CheckCircleOutlineIcon color="success" fontSize="small" />,
  failed: <ErrorOutlineIcon color="error" fontSize="small" />,
  pending: <RadioButtonUncheckedIcon color="disabled" fontSize="small" />,
  off: <RemoveCircleOutlineIcon color="disabled" fontSize="small" />,
};

const STATUS_ICON = {
  ok: <CheckCircleOutlineIcon color="success" fontSize="small" />,
  warn: <WarningAmberIcon color="warning" fontSize="small" />,
  failed: <ErrorOutlineIcon color="error" fontSize="small" />,
  pending: <RadioButtonUncheckedIcon color="disabled" fontSize="small" />,
  skipped: <RemoveCircleOutlineIcon color="disabled" fontSize="small" />,
};

function VerifyDetail({ gateway }) {
  const rows = toStageRows(gateway.lastVerifyReport);
  const uses = usesPresentation(gateway);
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

      {/* Per use (2026-09-14): the privilege rung is judged for what the
          gateway is used for, so a read-only account is fine for
          certificates and only snapshots show as missing. */}
      <Stack direction="row" spacing={2} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 0.5 }} aria-label="Gateway uses">
        {uses.map((u) => (
          <Stack key={u.use} direction="row" spacing={0.75} alignItems="center">
            {USE_STATUS_ICON[u.status]}
            <Typography variant="body2">{u.label}</Typography>
            <Typography variant="caption" color="text.secondary">{u.detail}</Typography>
          </Stack>
        ))}
      </Stack>

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

export default function GatewayPanel({ canManage = false, devices = [], notify, variant = "pmp", api = patchManagementApi, onLoaded, onChanged }) {
  const copy = VARIANT[variant] ?? VARIANT.pmp;
  const { listGateways, createGateway, updateGateway, deleteGateway, verifyGateway } = api;
  const [gateways, setGateways] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [expanded, setExpanded] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [credentialFor, setCredentialFor] = React.useState(null);
  const [snapshotTestFor, setSnapshotTestFor] = React.useState(null);
  const [busyId, setBusyId] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // The gateway endpoints answer with the entity itself, not with an
      // `{ ok, data }` envelope — only some of the older modules put an `ok`
      // field inside their JSON. http.js already throws on any non-2xx, so a
      // returned value IS the success case. Testing `res.ok` here reported
      // every successful call as a failure: the gateway was created, its
      // policy was synced, and the operator was told it had been rejected.
      const data = await listGateways();
      const list = data?.gateways ?? [];
      setGateways(list);
      onLoaded?.(list);
    } catch (err) {
      setError(errorMessage(err, "Could not load gateways."));
    } finally {
      setLoading(false);
    }
  }, [listGateways, onLoaded]);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async (payload) => {
    try {
      if (editing) await updateGateway(editing.id, payload);
      else await createGateway(payload);
    } catch (err) {
      throw new Error(errorMessage(err, "The control plane rejected the gateway."));
    }
    notify?.("success", editing ? "Gateway updated." : "Gateway registered.");
    await load();
    onChanged?.();
  };

  const remove = async (gw) => {
    if (!window.confirm(copy.removeConfirm(gw))) {
      return;
    }
    try {
      await deleteGateway(gw.id);
    } catch (err) {
      return notify?.("error", errorMessage(err, "Could not remove the gateway."));
    }
    notify?.("success", "Gateway removed.");
    await load();
    onChanged?.();
  };

  // Crypto Discovery's use of the gateway. A partial PATCH: the server keeps
  // everything else, so a snapshot gateway keeps snapshotting.
  const setReadCertificates = async (gw, on) => {
    setBusyId(gw.id);
    try {
      await updateGateway(gw.id, { readCertificates: on });
    } catch (err) {
      return notify?.("error", errorMessage(err, "Could not change certificate reading."));
    } finally {
      setBusyId(null);
    }
    notify?.("success", on ? "Certificate reading switched on. The gateway reads vCenter and its ESXi hosts on its next Crypto Discovery scan." : "Certificate reading switched off. What it brought stays until its next scan retires it.");
    await load();
    onChanged?.();
  };

  const test = async (gw) => {
    setBusyId(gw.id);
    try {
      try {
        await verifyGateway(gw.id);
      } catch (err) {
        return notify?.("error", errorMessage(err, "Could not queue the verification."));
      }
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
          <Typography variant="h6">{copy.title}</Typography>
          <Typography variant="body2" color="text.secondary">{copy.subtitle}</Typography>
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
        <Alert severity="info">{copy.empty}</Alert>
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
                {variant === "cdp" && <TableCell>Reads certificates</TableCell>}
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
                      {variant === "cdp" && (
                        <TableCell>
                          <Switch
                            size="small"
                            checked={gw.readCertificates === true}
                            disabled={!canManage || busyId === gw.id}
                            onChange={(e) => setReadCertificates(gw, e.target.checked)}
                            slotProps={{ input: { "aria-label": `Read certificates through ${gw.name}` } }}
                          />
                        </TableCell>
                      )}
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
                            {variant === "pmp" && (
                              <Tooltip
                                title={
                                  gw.health === "verified"
                                    ? "Test a snapshot on one VM"
                                    : "Test a snapshot (verify the gateway first)"
                                }
                              >
                                <span>
                                  <IconButton
                                    size="small"
                                    aria-label={`Test a snapshot with ${gw.name}`}
                                    onClick={() => setSnapshotTestFor(gw)}
                                    disabled={gw.health !== "verified"}
                                  >
                                    <PhotoCameraOutlinedIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            )}
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
                      <TableCell colSpan={variant === "cdp" ? 7 : 6} sx={{ p: 0, borderBottom: open ? undefined : "none" }}>
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
        api={api}
        onClose={() => setCredentialFor(null)}
        onDone={load}
        notify={notify}
      />
      {variant === "pmp" && (
        <SnapshotTestDialog
          open={Boolean(snapshotTestFor)}
          gateway={snapshotTestFor}
          onClose={() => setSnapshotTestFor(null)}
          notify={notify}
        />
      )}
    </Box>
  );
}
