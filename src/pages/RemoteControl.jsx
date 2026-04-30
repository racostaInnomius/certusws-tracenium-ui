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
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  Typography
} from "@mui/material";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import BrandSnackbar from "../components/common/BrandSnackbar";
import { useCachedFetch } from "../hooks/useCachedFetch";
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

import PageHeader from "../components/common/PageHeader";


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
  const [snackbar, setSnackbar] = React.useState({ open: false, message: "", severity: "info" });

  const notify = (severity, message) =>
    setSnackbar({ open: true, severity, message });

  // Bundled loader so the cache stores one snapshot per visit instead
  // of three independent ones — when the page rehydrates, all three
  // panels fill from the same snapshot atomically.
  const loader = React.useCallback(async () => {
    const [sumRes, devRes, sesRes] = await Promise.allSettled([
      getRemoteControlSummary(),
      getConnectableDevices(),
      getRemoteSessions({ limit: 50 })
    ]);
    return {
      summary: sumRes.status === "fulfilled" ? (sumRes.value?.summary ?? null) : null,
      devices: devRes.status === "fulfilled" && Array.isArray(devRes.value?.items)
        ? devRes.value.items : [],
      sessions: sesRes.status === "fulfilled" && Array.isArray(sesRes.value?.items)
        ? sesRes.value.items : [],
      sessionTotal: sesRes.status === "fulfilled" ? Number(sesRes.value?.total ?? 0) : 0,
    };
  }, []);

  const { data, loading, refreshing, refetch, lastUpdatedAt } = useCachedFetch(
    "remoteControl:bundle",
    loader,
  );
  const summary = data?.summary ?? null;
  const devices = data?.devices ?? [];
  const sessions = data?.sessions ?? [];
  const sessionTotal = data?.sessionTotal ?? 0;
  const refreshedAt = lastUpdatedAt ? new Date(lastUpdatedAt) : null;
  const load = refetch;

  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(refetch, "rcAutoRefresh");

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
      <PageHeader
        title="Remote Control"
        subtitle={
          <>
            Interactive sessions to managed endpoints. Gated by the{" "}
            <strong>rcp</strong> plugin — unavailable until deployed.
            {refreshedAt
              ? ` · Last refresh ${refreshedAt.toLocaleTimeString()}`
              : ""}
          </>
        }
        icon={<DesktopWindowsOutlinedIcon />}
        actions={
          <RefreshControl
            refreshSeconds={refreshSeconds}
            onRefreshSecondsChange={setRefreshSeconds}
            onRefresh={load}
            loading={loading || refreshing}
          />
        }
      />

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

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      />
    </Box>
  );
}
