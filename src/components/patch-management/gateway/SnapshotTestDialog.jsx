// src/components/patch-management/gateway/SnapshotTestDialog.jsx
//
// Run a snapshot round trip against one VM and watch it happen.
//
// "Test connection" proves the credential can log in and holds the snapshot
// privileges. This proves the path that matters on patch day: the endpoint is
// found as a VM in vCenter, a quiesced snapshot lands on it, and the gateway
// removes it again. Nothing is deployed, nothing is left behind — the row
// stays as evidence.

import React from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import {
  listSnapshotCandidates,
  startSnapshotTest,
  listSnapshotTests,
} from "../../../api/patchManagement";
import {
  snapshotTestSteps,
  describeSnapshotTest,
  describeSnapshotTestStartError,
  isSnapshotTestSettled,
  formatDuration,
} from "./snapshotTest";

const POLL_MS = 3000;

const STEP_ICON = {
  ok: <CheckCircleOutlineIcon color="success" fontSize="small" />,
  failed: <ErrorOutlineIcon color="error" fontSize="small" />,
  pending: <RadioButtonUncheckedIcon color="disabled" fontSize="small" />,
  skipped: <RemoveCircleOutlineIcon color="disabled" fontSize="small" />,
};

function Steps({ row }) {
  const steps = snapshotTestSteps(row);
  return (
    <Stack spacing={0.75}>
      {steps.map((s) => (
        <Stack key={s.label} direction="row" spacing={1} alignItems="flex-start">
          <Box sx={{ pt: 0.25 }}>{STEP_ICON[s.status]}</Box>
          <Box>
            <Typography variant="body2">{s.label}</Typography>
            {s.detail && (
              <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-word" }}>
                {s.detail}
              </Typography>
            )}
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

export default function SnapshotTestDialog({ open, gateway, onClose, notify }) {
  const [candidates, setCandidates] = React.useState([]);
  const [tests, setTests] = React.useState([]);
  const [target, setTarget] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [startError, setStartError] = React.useState(null);
  const [loadError, setLoadError] = React.useState("");
  // The test started from THIS dialog, so the live view is not confused by an
  // older row that happens to be first in the list.
  const [watchingId, setWatchingId] = React.useState(null);

  const gatewayId = gateway?.id;

  const refreshTests = React.useCallback(async () => {
    if (!gatewayId) return [];
    const data = await listSnapshotTests(gatewayId);
    const rows = data?.tests ?? [];
    setTests(rows);
    return rows;
  }, [gatewayId]);

  React.useEffect(() => {
    if (!open || !gatewayId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setStartError(null);
    setWatchingId(null);
    (async () => {
      try {
        const [cands] = await Promise.all([listSnapshotCandidates(gatewayId), refreshTests()]);
        if (cancelled) return;
        const list = cands?.candidates ?? [];
        setCandidates(list);
        const first = list.find((c) => c.correlatable);
        setTarget((prev) => (list.some((c) => c.deviceId === prev) ? prev : first?.deviceId ?? ""));
      } catch (err) {
        if (!cancelled) setLoadError(err?.body?.message || err?.message || "Could not load the gateway's virtual machines.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, gatewayId, refreshTests]);

  // Poll while the watched test is still moving. Stops by itself on a verdict.
  const watched = tests.find((t) => t.id === watchingId) ?? null;
  const watchedSettled = watched ? isSnapshotTestSettled(watched) : true;
  React.useEffect(() => {
    if (!open || !watchingId || watchedSettled) return;
    const timer = setInterval(() => {
      refreshTests().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, watchingId, watchedSettled, refreshTests]);

  React.useEffect(() => {
    if (!watched || !watchedSettled) return;
    const d = describeSnapshotTest(watched);
    notify?.(d.color === "success" ? "success" : "error", `Snapshot test on ${watched.hostname || watched.deviceId}: ${d.label}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedSettled, watched?.id]);

  const run = async () => {
    if (!target) return;
    setStarting(true);
    setStartError(null);
    try {
      const r = await startSnapshotTest(gatewayId, target);
      setWatchingId(r?.snapshotResultId ?? null);
      await refreshTests();
    } catch (err) {
      setStartError(describeSnapshotTestStartError(err?.body, err?.message));
    } finally {
      setStarting(false);
    }
  };

  const selected = candidates.find((c) => c.deviceId === target);
  const canRun = Boolean(target && selected?.correlatable) && !starting && (!watchingId || watchedSettled);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Test a snapshot{gateway ? ` — ${gateway.name}` : ""}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Picks one virtual machine, asks the gateway to find it in vCenter, takes a quiesced snapshot and
          removes it again. Nothing is installed and nothing is left behind. This is the same path a
          pre-patch snapshot takes, so a pass here means that VM can be protected before a patch.
        </Typography>

        {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

        {gateway && gateway.health !== "verified" && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            The gateway is not verified. Run Test connection first — the control plane will refuse to start a test otherwise.
          </Alert>
        )}

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} sx={{ mb: 2 }}>
          <FormControl size="small" fullWidth disabled={loading || candidates.length === 0}>
            <InputLabel id="snapshot-test-target-label">Virtual machine</InputLabel>
            <Select
              labelId="snapshot-test-target-label"
              label="Virtual machine"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              inputProps={{ "aria-label": "Virtual machine to snapshot" }}
            >
              {candidates.map((c) => (
                <MenuItem key={c.deviceId} value={c.deviceId} disabled={!c.correlatable}>
                  {c.hostname || c.deviceId}
                  {c.platform ? ` · ${c.platform}` : ""}
                  {!c.correlatable ? " — no UUID or serial reported" : ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="contained" onClick={run} disabled={!canRun} sx={{ whiteSpace: "nowrap", minWidth: 140 }}>
            {starting ? <CircularProgress size={18} /> : "Run test"}
          </Button>
        </Stack>

        {!loading && candidates.length === 0 && !loadError && (
          <Alert severity="info" sx={{ mb: 2 }}>
            No virtual machines to test. The agent reports whether a device is a VM in its hardware inventory;
            only devices reported as virtual (other than the gateway host itself) are offered here.
          </Alert>
        )}

        {startError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>{startError.title}</AlertTitle>
            {startError.body}
          </Alert>
        )}

        {watched && (
          <Box sx={{ p: 2, mb: 2, bgcolor: "action.hover", borderRadius: 1 }} data-testid="snapshot-test-live">
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">{watched.hostname || watched.deviceId}</Typography>
              <Chip size="small" label={describeSnapshotTest(watched).label} color={describeSnapshotTest(watched).color} />
              {!watchedSettled && <CircularProgress size={14} />}
            </Stack>
            <Steps row={watched} />
          </Box>
        )}

        <Typography variant="subtitle2" gutterBottom>
          Previous tests
        </Typography>
        {loading ? (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={22} />
          </Stack>
        ) : tests.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No snapshot test has been run on this gateway yet.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Started</TableCell>
                <TableCell>VM</TableCell>
                <TableCell>Result</TableCell>
                <TableCell>Matched by</TableCell>
                <TableCell>Snapshot</TableCell>
                <TableCell align="right">Took</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tests.map((t) => {
                const d = describeSnapshotTest(t);
                return (
                  <TableRow key={t.id} selected={t.id === watchingId}>
                    <TableCell>{new Date(t.startedAt).toLocaleString()}</TableCell>
                    <TableCell>{t.hostname || t.deviceId}</TableCell>
                    <TableCell>
                      <Chip size="small" label={d.label} color={d.color} title={d.hint} />
                    </TableCell>
                    <TableCell>{t.matchedBy || "—"}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace" }}>{t.snapshotMoref || "—"}</TableCell>
                    <TableCell align="right">{formatDuration(t) || "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
