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
  Box,
  CircularProgress,
  Drawer,
  Grid,
  Paper,
  Skeleton,
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
  getAllFileTransfers,
  startRemoteSession
} from "../api/remoteControl";

import ConnectablesTable from "../components/RemoteControl/ConnectablesTable";
import PluginUnavailableCard from "../components/RemoteControl/PluginUnavailableCard";
import SessionHistoryTable from "../components/RemoteControl/SessionHistoryTable";
import FileTransfersAuditTable from "../components/RemoteControl/FileTransfersAuditTable";
// Lazy-loaded: these four own the xterm.js + WebRTC/DataChannel stack (~347KB
// combined). They only render when an operator actually opens a shell/file/
// screen session, so keep them out of the RemoteControl page's initial chunk
// — otherwise all of xterm + WebRTC parses on page mount even for an operator
// who never starts a session.
const ShellTerminal = React.lazy(() => import("../components/RemoteControl/ShellTerminal"));
const TranscriptReplayDialog = React.lazy(() => import("../components/RemoteControl/TranscriptReplayDialog"));
const FileBrowserPanel = React.lazy(() => import("../components/RemoteControl/FileBrowserPanel"));
const ScreenShareViewer = React.lazy(() => import("../components/RemoteControl/ScreenShareViewer"));

// Centered fallback while a session drawer's heavy body loads.
function SessionLoading() {
  return (
    <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <CircularProgress size={28} sx={{ color: BRAND.teal }} />
    </Box>
  );
}

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
    const [sumRes, devRes, sesRes, ftRes] = await Promise.allSettled([
      getRemoteControlSummary(),
      getConnectableDevices(),
      getRemoteSessions({ limit: 50 }),
      getAllFileTransfers({ limit: 200 })
    ]);
    return {
      summary: sumRes.status === "fulfilled" ? (sumRes.value?.summary ?? null) : null,
      devices: devRes.status === "fulfilled" && Array.isArray(devRes.value?.items)
        ? devRes.value.items : [],
      sessions: sesRes.status === "fulfilled" && Array.isArray(sesRes.value?.items)
        ? sesRes.value.items : [],
      sessionTotal: sesRes.status === "fulfilled" ? Number(sesRes.value?.total ?? 0) : 0,
      fileTransfers: ftRes.status === "fulfilled" && Array.isArray(ftRes.value?.items)
        ? ftRes.value.items : [],
      fileTransferTotal: ftRes.status === "fulfilled" ? Number(ftRes.value?.total ?? 0) : 0,
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
  const fileTransfers = data?.fileTransfers ?? [];
  const fileTransferTotal = data?.fileTransferTotal ?? 0;
  const refreshedAt = lastUpdatedAt ? new Date(lastUpdatedAt) : null;
  const load = refetch;

  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(refetch, "rcAutoRefresh");

  // RCP M1.S2 — shell session envelope (ShellTerminal drawer).
  const [activeSession, setActiveSession] = React.useState(null);

  // RCP M2.S1 — file session envelope (FileBrowserPanel drawer).
  const [fileSession, setFileSession] = React.useState(null);

  // RCP M3.S1 — screen session envelope (ScreenShareViewer drawer).
  const [screenSession, setScreenSession] = React.useState(null);

  // RCP M1.S3 — replay dialog state. Holds the SessionHistory row
  // selected via the "Replay" action so the dialog can stamp its
  // header with operator/device metadata while it fetches the
  // transcript itself.
  const [replaySession, setReplaySession] = React.useState(null);

  /**
   * Click handler for Connect buttons in the ConnectablesTable.
   * Calls POST /sessions; on success opens the appropriate drawer:
   *   - type "shell"   → ShellTerminal drawer      (M1.S2)
   *   - type "file"    → FileBrowserPanel drawer   (M2.S1)
   *   - type "screen"  → ScreenShareViewer drawer  (M3.S1)
   *
   * Backend error codes map to friendly toasts:
   *   - 501 / RCP_PLUGIN_NOT_AVAILABLE    — screen cap (M3+)
   *   - 409 / RCP_DEVICE_OFFLINE          — device offline mid-click
   *   - 409 / RCP_CAPABILITY_NOT_ADVERTISED — agent missing capability
   *   - 429 / RCP_TOO_MANY_SESSIONS       — concurrency cap hit
   *   - 403 / RCP_ADMIN_MASTER_REQUIRED   — user isn't admin_master
   */
  const handleConnect = async (device, type = "shell") => {
    try {
      const res = await startRemoteSession({ deviceId: device.deviceId, type });
      if (!res?.ok) {
        notify("error", res?.message || "Failed to start session");
        return;
      }
      const sessionEnvelope = {
        sessionId: res.sessionId,
        signalingUrl: res.signalingUrl,
        turnConfig: res.turnConfig,
        device
      };
      if (type === "file") {
        setFileSession(sessionEnvelope);
      } else if (type === "screen") {
        setScreenSession(sessionEnvelope);
      } else {
        setActiveSession(sessionEnvelope);
      }
      load(); // pull history + active count
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg.includes("RCP_PLUGIN_NOT_AVAILABLE") || msg.includes("501")) {
        notify(
          "info",
          "This capability is not yet available on the selected agent."
        );
      } else if (msg.includes("RCP_ADMIN_MASTER_REQUIRED")) {
        notify(
          "warning",
          "Remote Control is restricted to admin_master users in this milestone."
        );
      } else if (msg.includes("RCP_DEVICE_OFFLINE")) {
        notify("error", "Device is not currently connected. Try again later.");
      } else if (msg.includes("RCP_CAPABILITY_NOT_ADVERTISED")) {
        notify(
          "warning",
          `This device hasn't advertised rcp.${type} — check the agent's policy configuration.`
        );
      } else if (msg.includes("RCP_TOO_MANY_SESSIONS")) {
        notify(
          "warning",
          "Too many concurrent sessions. Close one before starting another."
        );
      } else {
        notify("error", `Failed to start session: ${msg || "unknown error"}`);
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
            onConnect={(device, type) => handleConnect(device, type)}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <PluginUnavailableCard />
        </Grid>
      </Grid>

      {/* Row 3 — Session history */}
      <SessionHistoryTable
        sessions={sessions}
        total={sessionTotal}
        loading={loading}
        onReplay={(s) => setReplaySession(s)}
      />

      {/* Row 4 — M2.S2 File transfer audit (cross-session, tenant-wide) */}
      <Box sx={{ mt: 2 }}>
        <FileTransfersAuditTable
          transfers={fileTransfers}
          total={fileTransferTotal}
          loading={loading}
        />
      </Box>

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      />

      {/* RCP M1.S2 — interactive shell drawer. Opens when a Connect
          button succeeds; ShellTerminal owns the WebRTC + xterm
          lifecycle. Closing the drawer triggers a clean session
          close + refetch so the session history table updates. */}
      <Drawer
        anchor="right"
        open={Boolean(activeSession)}
        onClose={() => {
          setActiveSession(null);
          load();
        }}
        PaperProps={{
          sx: {
            width: { xs: "100%", md: 780, lg: 920 },
            maxWidth: "100%",
            bgcolor: "transparent",
            border: "none"
          }
        }}
      >
        {activeSession ? (
          <Box sx={{ p: 1.5, height: "100%", display: "flex", flexDirection: "column" }}>
            <React.Suspense fallback={<SessionLoading />}>
              <ShellTerminal
                session={activeSession}
                device={activeSession.device}
                onClose={() => {
                  setActiveSession(null);
                  load();
                }}
              />
            </React.Suspense>
          </Box>
        ) : null}
      </Drawer>

      {/* RCP M1.S3 — transcript replay dialog. Mounted only when a replay is
          selected so its lazy chunk doesn't load on page mount. */}
      {replaySession ? (
        <React.Suspense fallback={null}>
          <TranscriptReplayDialog
            open={Boolean(replaySession)}
            session={replaySession}
            onClose={() => setReplaySession(null)}
          />
        </React.Suspense>
      ) : null}

      {/* RCP M2.S1 — file manager drawer. Opens when a Files button
          succeeds; FileBrowserPanel owns the WebRTC + DataChannel
          lifecycle. Closing the drawer triggers a refetch so the
          session history table picks up the ended session. */}
      <Drawer
        anchor="right"
        open={Boolean(fileSession)}
        onClose={() => {
          setFileSession(null);
          load();
        }}
        PaperProps={{
          sx: {
            width: { xs: "100%", md: 880, lg: 1040 },
            maxWidth: "100%",
            bgcolor: "transparent",
            border: "none"
          }
        }}
      >
        {fileSession ? (
          <Box sx={{ p: 1.5, height: "100%", display: "flex", flexDirection: "column" }}>
            <React.Suspense fallback={<SessionLoading />}>
              <FileBrowserPanel
                session={fileSession}
                device={fileSession.device}
                onClose={() => {
                  setFileSession(null);
                  load();
                }}
              />
            </React.Suspense>
          </Box>
        ) : null}
      </Drawer>

      {/* RCP M3.S1 — screen share drawer. Opens when a Screen button
          succeeds; ScreenShareViewer owns the WebRTC + DataChannel
          lifecycle. The drawer is full-width to maximise the canvas
          area; the viewer also supports browser fullscreen mode. */}
      <Drawer
        anchor="right"
        open={Boolean(screenSession)}
        onClose={() => {
          setScreenSession(null);
          load();
        }}
        PaperProps={{
          sx: {
            width: { xs: "100%", md: "75vw", lg: "65vw" },
            maxWidth: "100%",
            bgcolor: "transparent",
            border: "none"
          }
        }}
      >
        {screenSession ? (
          <Box sx={{ p: 1.5, height: "100%", display: "flex", flexDirection: "column" }}>
            <React.Suspense fallback={<SessionLoading />}>
              <ScreenShareViewer
                session={screenSession}
                device={screenSession.device}
                onClose={() => {
                  setScreenSession(null);
                  load();
                }}
              />
            </React.Suspense>
          </Box>
        ) : null}
      </Drawer>
    </Box>
  );
}
