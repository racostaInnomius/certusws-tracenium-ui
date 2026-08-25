import React from "react";
import {
  Box,
  Stack,
  Button,
  Chip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import {
  MOBILE_COMMANDS,
  issueMobileCommand,
  listMobileCommands,
} from "../../api/mobileCommands";

// Status → chip colors. pending/sent are "in flight"; acked is terminal
// success; failed/expired/canceled are terminal non-success.
const STATUS_COLORS = {
  pending: { bg: "rgba(234,179,8,0.14)", fg: "#8a6d00" },
  sent: { bg: "rgba(234,179,8,0.14)", fg: "#8a6d00" },
  acked: { bg: "rgba(16,185,129,0.14)", fg: "#047857" },
  failed: { bg: "rgba(220,38,38,0.14)", fg: "#b91c1c" },
  expired: { bg: BRAND.surfaceMuted, fg: BRAND.gray },
  canceled: { bg: BRAND.surfaceMuted, fg: BRAND.gray },
};

function StatusChip({ status }) {
  const s = STATUS_COLORS[status] || { bg: BRAND.surfaceMuted, fg: BRAND.gray };
  return (
    <Chip
      size="small"
      label={status}
      sx={{ height: 20, fontWeight: 700, fontSize: TEXT.xs, textTransform: "capitalize", bgcolor: s.bg, color: s.fg }}
    />
  );
}

function formatWhen(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

/**
 * Operator console for MDM-lite native commands on a single mobile
 * device. Issues lock / selectiveWipe / alert / locate and shows recent
 * command history with live status. Read-only when `disabled`.
 */
export default function MobileCommandsPanel({ deviceId, platform, disabled = false }) {
  const [history, setHistory] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [busyType, setBusyType] = React.useState(null);
  const [error, setError] = React.useState("");
  const [alertOpen, setAlertOpen] = React.useState(false);
  const [alertTitle, setAlertTitle] = React.useState("");
  const [alertBody, setAlertBody] = React.useState("");

  const refresh = React.useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError("");
    try {
      const res = await listMobileCommands(deviceId, { limit: 20 });
      setHistory(Array.isArray(res?.commands) ? res.commands : []);
    } catch (err) {
      setError(err?.message || "Could not load command history.");
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  async function issue(type, params) {
    if (!deviceId || disabled) return;
    setBusyType(type);
    setError("");
    try {
      await issueMobileCommand(deviceId, { type, ...(params ? { params } : {}) });
      await refresh();
    } catch (err) {
      setError(err?.message || `Could not issue ${type}.`);
    } finally {
      setBusyType(null);
    }
  }

  function handleClick(cmd) {
    if (cmd.type === "alert") {
      setAlertTitle("");
      setAlertBody("");
      setAlertOpen(true);
      return;
    }
    if (cmd.destructive) {
      const ok = window.confirm(
        "Selective wipe clears this app's data and its enrolled identity on the device. This cannot be undone from here. Continue?"
      );
      if (!ok) return;
    }
    issue(cmd.type);
  }

  function submitAlert() {
    const body = alertBody.trim();
    if (!body) return;
    setAlertOpen(false);
    issue("alert", { title: alertTitle.trim() || "Tracenium", body });
  }

  if (!deviceId) {
    return (
      <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>
        Remote commands are unavailable — no device identity resolved for this host.
      </Typography>
    );
  }

  return (
    <Box>
      <Typography
        sx={{
          fontSize: TEXT.xs,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "text.secondary",
          mb: 1,
        }}
      >
        Remote commands
      </Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1.5 }}>
        App-scoped actions delivered by push to this {platform || "mobile"} device.
        The device drains and acknowledges commands on wake or next check-in.
      </Typography>

      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
        {MOBILE_COMMANDS.map((cmd) => (
          <Tooltip key={cmd.type} title={cmd.description} arrow>
            <span>
              <Button
                size="small"
                variant="outlined"
                color={cmd.destructive ? "error" : "primary"}
                disabled={disabled || busyType !== null}
                onClick={() => handleClick(cmd)}
                sx={{ textTransform: "none", fontWeight: 700 }}
              >
                {busyType === cmd.type ? <CircularProgress size={14} sx={{ mr: 0.75 }} /> : null}
                {cmd.label}
              </Button>
            </span>
          </Tooltip>
        ))}
      </Stack>

      {error ? (
        <Typography sx={{ mt: 1.5, fontSize: TEXT.sm, fontWeight: 700, color: "#b91c1c" }}>{error}</Typography>
      ) : null}

      {/* History */}
      <Box sx={{ mt: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
          <Typography sx={{ fontSize: TEXT.xs, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "text.secondary" }}>
            Recent commands
          </Typography>
          {loading ? <CircularProgress size={12} sx={{ color: BRAND.teal }} /> : null}
        </Stack>
        {history.length === 0 && !loading ? (
          <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>No commands issued yet.</Typography>
        ) : (
          <Stack spacing={0.75}>
            {history.map((c) => (
              <Box
                key={c.command_id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  flexWrap: "wrap",
                  p: 1,
                  borderRadius: 1.5,
                  border: `1px solid ${BRAND.border}`,
                  bgcolor: BRAND.surface,
                }}
              >
                <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark, minWidth: 110 }}>
                  {c.type}
                </Typography>
                <StatusChip status={c.status} />
                <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", ml: "auto" }}>
                  {formatWhen(c.issued_at)}
                </Typography>
                {c.error ? (
                  <Typography sx={{ fontSize: TEXT.sm, color: "#b91c1c", flexBasis: "100%" }}>{c.error}</Typography>
                ) : null}
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      {/* Alert message dialog */}
      <Dialog open={alertOpen} onClose={() => setAlertOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Send a message</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              size="small"
              label="Title"
              placeholder="Tracenium"
              value={alertTitle}
              onChange={(e) => setAlertTitle(e.target.value)}
              inputProps={{ maxLength: 500 }}
              fullWidth
            />
            <TextField
              size="small"
              label="Message"
              value={alertBody}
              onChange={(e) => setAlertBody(e.target.value)}
              inputProps={{ maxLength: 500 }}
              required
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAlertOpen(false)} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            onClick={submitAlert}
            variant="contained"
            disabled={!alertBody.trim()}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            Send
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
