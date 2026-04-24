// src/pages/RemoteControl.jsx
//
// Remote Control page — placeholders today, scaffolding for when the
// `rcp` plugin lands. Structure:
//
//   Row 1  Hero KPIs (4)               — connectable / active / 7d / avg
//   Row 2  ConnectablesTable (md:8)    + PluginUnavailableCard (md:4)
//   Row 3  SessionHistoryTable         — full width, empty state
//
// All data flows through the stable `/api/v1/remote-control/*`
// contract. Backend returns zeros + empty lists while the plugin
// doesn't exist; page never crashes, user sees meaningful copy.

import * as React from "react";
import {
  Alert,
  Box,
  Grid,
  IconButton,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import DesktopWindowsOutlinedIcon from "@mui/icons-material/DesktopWindowsOutlined";
import FlashOnOutlinedIcon from "@mui/icons-material/FlashOnOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";

import { BRAND, ROLE } from "../theme/brand";
import {
  getRemoteControlSummary,
  getConnectableDevices,
  getRemoteSessions,
  startRemoteSession
} from "../api/remoteControl";

import ConnectablesTable from "../components/RemoteControl/ConnectablesTable";
import PluginUnavailableCard from "../components/RemoteControl/PluginUnavailableCard";
import SessionHistoryTable from "../components/RemoteControl/SessionHistoryTable";

// ---------- small atoms -----------------------------------------------------

function Kpi({ title, value, subtitle, icon: Icon, accent, tint, loading }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 1.25
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: tint,
            color: accent,
            flexShrink: 0
          }}
        >
          <Icon fontSize="small" />
        </Box>
        <Typography
          variant="body2"
          sx={{ color: BRAND.dark, fontWeight: 600, lineHeight: 1.2 }}
        >
          {title}
        </Typography>
      </Stack>

      {loading ? (
        <Skeleton variant="text" width={90} height={40} />
      ) : (
        <Typography
          variant="h4"
          sx={{ color: BRAND.dark, fontWeight: 700, lineHeight: 1.1 }}
        >
          {value}
        </Typography>
      )}

      {subtitle != null && !loading && (
        <Typography variant="caption" sx={{ color: BRAND.gray }}>
          {subtitle}
        </Typography>
      )}
    </Paper>
  );
}

// ---------- page ------------------------------------------------------------

export default function RemoteControl() {
  const [loading, setLoading] = React.useState(true);
  const [refreshedAt, setRefreshedAt] = React.useState(null);

  const [summary, setSummary] = React.useState(null);
  const [devices, setDevices] = React.useState([]);
  const [sessions, setSessions] = React.useState([]);
  const [sessionTotal, setSessionTotal] = React.useState(0);

  const [snackbar, setSnackbar] = React.useState({ open: false, message: "", severity: "info" });

  const notify = (severity, message) =>
    setSnackbar({ open: true, severity, message });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // allSettled: one slow/broken endpoint doesn't blank the rest.
      const [sumRes, devRes, sesRes] = await Promise.allSettled([
        getRemoteControlSummary(),
        getConnectableDevices(),
        getRemoteSessions({ limit: 50 })
      ]);

      if (sumRes.status === "fulfilled") {
        setSummary(sumRes.value?.summary ?? null);
      }
      if (devRes.status === "fulfilled") {
        setDevices(Array.isArray(devRes.value?.items) ? devRes.value.items : []);
      }
      if (sesRes.status === "fulfilled") {
        setSessions(Array.isArray(sesRes.value?.items) ? sesRes.value.items : []);
        setSessionTotal(Number(sesRes.value?.total ?? 0));
      }
      setRefreshedAt(new Date());
    } catch (err) {
      console.error(err);
      notify("error", "Failed to load Remote Control data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  /**
   * Click handler for Connect buttons in the ConnectablesTable. While
   * the plugin isn't shipped this always fails with the
   * RCP_PLUGIN_NOT_AVAILABLE error — we catch it and surface a
   * targeted toast. When the plugin lands this opens a session drawer
   * (Phase 2).
   */
  const handleConnect = async (device) => {
    try {
      await startRemoteSession({ deviceId: device.deviceId, type: "shell" });
      notify("success", "Session started");
      load(); // pull history + active count
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg.includes("501") || msg.includes("RCP_PLUGIN_NOT_AVAILABLE")) {
        notify(
          "info",
          "Remote Control plugin (`rcp`) is not yet available. This device will be connectable once the plugin ships."
        );
      } else {
        notify("error", "Failed to start session");
      }
    }
  };

  // KPI values — zero-safe whether summary is null or has zeros.
  const connectable = Number(summary?.connectableDevices ?? 0);
  const active = Number(summary?.activeSessions ?? 0);
  const last7d = Number(summary?.sessionsLast7d ?? 0);
  const avgDurationSec = summary?.avgDurationSec ?? null;
  const avgDurationLabel =
    avgDurationSec == null
      ? "—"
      : avgDurationSec < 60
      ? `${avgDurationSec}s`
      : `${Math.round(avgDurationSec / 60)}m`;

  return (
    <Box sx={{ pb: 4 }}>
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography
            variant="h5"
            sx={{ color: BRAND.dark, fontWeight: 700, lineHeight: 1.2 }}
          >
            Remote Control
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            Interactive sessions to managed endpoints. Gated by the{" "}
            <strong>rcp</strong> plugin — unavailable until deployed.
            {refreshedAt
              ? ` · Last refresh ${refreshedAt.toLocaleTimeString()}`
              : ""}
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <span>
            <IconButton
              onClick={load}
              disabled={loading}
              size="small"
              sx={{
                color: BRAND.teal,
                border: `1px solid ${BRAND.border}`,
                borderRadius: 1.5
              }}
            >
              <RefreshOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {/* Row 1 — Hero KPIs */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Kpi
            title="Connectable devices"
            value={connectable}
            subtitle={connectable ? "with rcp enabled" : "none yet"}
            icon={DesktopWindowsOutlinedIcon}
            accent={BRAND.teal}
            tint={BRAND.tealSoft}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Kpi
            title="Active sessions"
            value={active}
            subtitle={active ? "in progress" : "none right now"}
            icon={FlashOnOutlinedIcon}
            accent={active > 0 ? ROLE.positive : BRAND.gray}
            tint={active > 0 ? ROLE.positiveSoft : BRAND.surfaceMuted}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Kpi
            title="Sessions last 7d"
            value={last7d}
            subtitle={last7d ? "completed" : "no history yet"}
            icon={HistoryOutlinedIcon}
            accent={BRAND.teal}
            tint={BRAND.tealSoft}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Kpi
            title="Avg session duration"
            value={avgDurationLabel}
            subtitle={avgDurationSec != null ? "across last 7d" : "—"}
            icon={TimerOutlinedIcon}
            accent={BRAND.teal}
            tint={BRAND.tealSoft}
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* Row 2 — Device selector + plugin info */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 8 }}>
          <ConnectablesTable
            devices={devices}
            loading={loading}
            onConnect={handleConnect}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <PluginUnavailableCard />
        </Grid>
      </Grid>

      {/* Row 3 — Session history */}
      <SessionHistoryTable sessions={sessions} total={sessionTotal} loading={loading} />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ maxWidth: 420 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
