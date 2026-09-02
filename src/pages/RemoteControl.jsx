// src/pages/RemoteControl.jsx
//
// Remote Control — four tabs over the /api/v1/remote-control/* contract.
//
// ── What this page used to be ────────────────────────────────────────
//
// One scroll holding everything: four KPIs, a device table beside a card
// that told operators the plugin was "not yet shipped", the session history
// and the file-transfer log — all four datasets fetched on every visit
// through a single Promise.allSettled under one cache key. Opening the page
// to run one command downloaded the entire audit trail.
//
// ── What the tabs actually buy ───────────────────────────────────────
//
// Nothing, unless the loader is split with them. TabPanel unmounts the
// inactive panel, so each tab now asks for its own data when it opens
// (see useRemoteControlData.js, where the cache keys live). That is what
// makes this a change in behaviour rather than a change in appearance.
//
// ── What stays outside the tabs ──────────────────────────────────────
//
// The approval queue. Someone is waiting to get into a machine; burying
// that behind a tab would mean arriving late. It renders null when there is
// nothing pending, so it costs no space the rest of the time.

import * as React from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  Tab,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import DesktopWindowsOutlinedIcon from "@mui/icons-material/DesktopWindowsOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import SwapVertOutlinedIcon from "@mui/icons-material/SwapVertOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";

import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import BrandSnackbar from "../components/common/BrandSnackbar";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import { invalidateCachePrefix } from "../hooks/useCachedFetch";
import { getSearchParam, updateSearchParams } from "../utils/browserState";
import { BRAND } from "../theme/brand";
import {
  startRemoteSession,
  listPendingApprovals,
  decideApproval
} from "../api/remoteControl";

import ConnectTab from "../components/RemoteControl/ConnectTab";
import SessionsTab from "../components/RemoteControl/SessionsTab";
import TransfersTab from "../components/RemoteControl/TransfersTab";
import AccessTab from "../components/RemoteControl/AccessTab";
import StartSessionWizard from "../components/RemoteControl/StartSessionWizard";

// Lazy: these own the xterm.js + WebRTC/DataChannel stack (~347KB combined).
// They only render when an operator actually opens a session, so they stay
// out of the page's initial chunk.
const ShellTerminal = React.lazy(() => import("../components/RemoteControl/ShellTerminal"));
const TranscriptReplayDialog = React.lazy(() =>
  import("../components/RemoteControl/TranscriptReplayDialog")
);
const FileBrowserPanel = React.lazy(() => import("../components/RemoteControl/FileBrowserPanel"));
const ScreenShareViewer = React.lazy(() => import("../components/RemoteControl/ScreenShareViewer"));
const RecordingReplayDialog = React.lazy(() =>
  import("../components/RemoteControl/RecordingReplayDialog")
);

const TAB_CONNECT = 0;
const TAB_SESSIONS = 1;
const TAB_TRANSFERS = 2;
const TAB_ACCESS = 3;

const TAB_SX = {
  textTransform: "none",
  fontWeight: 700,
  minHeight: 58,
  color: "text.secondary",
  "&.Mui-selected": { color: BRAND.dark }
};

function SessionLoading() {
  return (
    <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <CircularProgress size={28} sx={{ color: BRAND.teal }} />
    </Box>
  );
}

function TabPanel({ children, value, index }) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`remote-control-tabpanel-${index}`}
      aria-labelledby={`remote-control-tab-${index}`}
    >
      {/* Mounting only the active panel is what makes each tab fetch its own
          data on open — see the header note. */}
      {value === index ? children : null}
    </Box>
  );
}

/**
 * Approval queue — ADR-0009 phase 2.
 *
 * Shown ONLY when something is pending. A permanently empty panel on the
 * most-used screen turns invisible within a week, and then it fails to warn
 * on the day there is something to see.
 *
 * ⚠️ Approving is granting root to another person for a window of time.
 * That's why the row shows the whole record — who, to which device, why and
 * under which ticket — instead of an identifier: approving blind isn't
 * approving, it's signing.
 */
export function ApprovalQueue({ refreshNonce, notify }) {
  const [items, setItems] = React.useState([]);
  const [busy, setBusy] = React.useState("");

  const load = React.useCallback(() => {
    listPendingApprovals()
      .then((r) => setItems(r?.items ?? []))
      .catch(() => setItems([]));
  }, []);

  React.useEffect(() => {
    load();
  }, [load, refreshNonce]);

  const decide = async (requestId, approve) => {
    setBusy(requestId);
    try {
      const r = await decideApproval(requestId, approve);
      if (r?.ok) {
        notify("success", approve ? "Access approved" : "Access denied");
      } else {
        // The backend answers 409 when the STATE doesn't allow the decision:
        // already resolved, expired, or it's the approver's own request.
        // Those are different situations and the message says which.
        notify("error", r?.message || "Could not record the decision");
      }
    } catch (e) {
      notify("error", e?.message || "Could not record the decision");
    } finally {
      setBusy("");
      load();
    }
  };

  if (!items.length) return null;

  return (
    <Card sx={{ mb: 2, border: `1px solid ${BRAND.alert.warningText}` }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
          {items.length} access {items.length === 1 ? "request is" : "requests are"} waiting
          for approval
        </Typography>
        {items.map((it) => (
          <Box
            key={it.requestId}
            sx={{
              display: "flex",
              gap: 2,
              alignItems: "center",
              py: 1,
              borderTop: `1px solid ${BRAND.border}`,
              flexWrap: "wrap"
            }}
          >
            <Box sx={{ flex: 1, minWidth: 260 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {it.operatorUserId} → {it.capability} on {it.deviceId}
              </Typography>
              <Typography variant="caption" sx={{ color: BRAND.textMuted }}>
                {it.reason} · ticket {it.ticketRef}
                {it.expiresAt
                  ? ` · expires ${new Date(it.expiresAt).toLocaleTimeString()}`
                  : ""}
              </Typography>
            </Box>
            <Button
              size="small"
              disabled={busy === it.requestId}
              onClick={() => decide(it.requestId, false)}
            >
              Deny
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={busy === it.requestId}
              onClick={() => decide(it.requestId, true)}
            >
              Approve
            </Button>
          </Box>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * The access record — ADR-0009 phase 1 — for the table's per-row buttons.
 *
 * The wizard asks for the same two fields as its step 3. This dialog stays
 * for the path that doesn't go through the wizard: `reason` and `ticketRef`
 * are stored next to the session and are the data the phase-2 policy gets
 * calibrated on, so no path may skip them.
 */
function AccessRecordDialog({ pending, onCancel, onConfirm }) {
  const [reason, setReason] = React.useState("");
  const [ticketRef, setTicketRef] = React.useState("");

  React.useEffect(() => {
    if (pending) {
      setReason("");
      setTicketRef("");
    }
  }, [pending]);

  const reasonOk = reason.trim().length >= 10;
  const ticketOk = ticketRef.trim().length >= 3;

  return (
    <Dialog open={Boolean(pending)} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>
        Access to {pending?.device?.hostname || pending?.device?.deviceId}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
          Who connects, to which device and why is recorded and stored alongside the
          session.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          margin="dense"
          label="Reason"
          placeholder="What you are going to do and why this access is needed"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={reason.length > 0 && !reasonOk}
          helperText={
            reason.length > 0 && !reasonOk ? "Describe the reason (at least 10 characters)" : " "
          }
        />
        <TextField
          fullWidth
          margin="dense"
          label="Ticket"
          placeholder="TCK-4821, INC0012345, jira/OPS-77…"
          value={ticketRef}
          onChange={(e) => setTicketRef(e.target.value)}
          helperText="The ticket this access is performed under"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!reasonOk || !ticketOk}
          onClick={() => onConfirm({ reason: reason.trim(), ticketRef: ticketRef.trim() })}
        >
          Connect
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function RemoteControl() {
  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "info"
  });
  const notify = React.useCallback(
    (severity, message) => setSnackbar({ open: true, severity, message }),
    []
  );

  const [activeTab, setActiveTab] = React.useState(TAB_CONNECT);
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);

  /**
   * Refresh everything the page can show.
   *
   * Two moves, and both are needed. `invalidateCachePrefix` drops the cached
   * entries of the tabs that are NOT mounted, so the next time one is opened
   * it reloads instead of serving a snapshot from before the session. The
   * nonce is what reaches the tab that IS mounted, which invalidation alone
   * can't re-render.
   */
  const refreshAll = React.useCallback(() => {
    invalidateCachePrefix("remoteControl:");
    setRefreshNonce((v) => v + 1);
  }, []);

  const manualRefresh = React.useCallback(() => {
    setRefreshing(true);
    refreshAll();
    window.setTimeout(() => setRefreshing(false), 900);
  }, [refreshAll]);

  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(refreshAll, "rcAutoRefresh");

  // Deep link: Asset Management's Actions menu links here with
  // `?highlightAgentId=<agentId>` so the operator lands on the exact device
  // row instead of hunting for it. Forces the Connect tab — the link means
  // "this device", and the row only exists there.
  const [highlightDeviceId, setHighlightDeviceId] = React.useState("");
  React.useEffect(() => {
    const id = getSearchParam("highlightAgentId", "");
    if (!id) return undefined;
    updateSearchParams({ highlightAgentId: null });
    setHighlightDeviceId(id);
    setActiveTab(TAB_CONNECT);
    const scrollTimer = window.setTimeout(() => {
      document.getElementById("remote-control-connectables")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 150);
    const clearTimer = window.setTimeout(() => setHighlightDeviceId(""), 2600);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
    // Mount-only — a one-shot "just arrived" flash.
  }, []);

  // Session envelopes, one per capability. Each drawer owns its own WebRTC
  // lifecycle, so they stay separate pieces of state rather than one
  // discriminated union that every consumer would have to narrow.
  const [shellSession, setShellSession] = React.useState(null);
  const [fileSession, setFileSession] = React.useState(null);
  const [screenSession, setScreenSession] = React.useState(null);

  const [replaySession, setReplaySession] = React.useState(null);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  // { device, type } while waiting for reason + ticket on the table path.
  const [recordFor, setRecordFor] = React.useState(null);

  const closeSession = React.useCallback(
    (setter) => () => {
      setter(null);
      refreshAll();
    },
    [refreshAll]
  );

  const doConnect = React.useCallback(
    async (device, type, record) => {
      try {
        const res = await startRemoteSession({
          deviceId: device.deviceId,
          type,
          reason: record.reason,
          ticketRef: record.ticketRef
        });

        // ADR-0009 phase 2 — the gate answers 202 with ok:false. That is NOT
        // a failure: the request was queued for approval. Treating it as an
        // error would say "Failed to start session" to someone whose request
        // was correctly recorded, and make them retry in a loop, generating
        // one pending request per attempt.
        if (res?.status === "pending_approval") {
          notify(
            "info",
            `Access queued: ${res.message || "approval required"}. ` +
              `Request ${String(res.requestId || "").slice(0, 8)}…`
          );
          return;
        }
        if (!res?.ok) {
          notify("error", res?.message || "Failed to start session");
          return;
        }

        const envelope = {
          sessionId: res.sessionId,
          signalingUrl: res.signalingUrl,
          turnConfig: res.turnConfig,
          device
        };
        if (type === "file") setFileSession(envelope);
        else if (type === "screen") setScreenSession(envelope);
        else setShellSession(envelope);

        refreshAll();
      } catch (err) {
        const msg = String(err?.message || "");
        if (msg.includes("RCP_PLUGIN_NOT_AVAILABLE") || msg.includes("501")) {
          notify("info", "This capability is not yet available on the selected agent.");
        } else if (msg.includes("FORBIDDEN") || msg.includes("RCP_ADMIN_MASTER_REQUIRED")) {
          // M4 moved RCP onto the shared requireRole("ADMIN","OWNER") gate, so
          // the backend now answers a plain FORBIDDEN. The old code is still
          // matched because a browser may be talking to a backend that hasn't
          // been rolled forward yet.
          notify(
            "warning",
            "You need the Admin or Owner role on this tenant to start a remote session."
          );
        } else if (msg.includes("RCP_DEVICE_OFFLINE")) {
          notify("error", "Device is not currently connected. Try again later.");
        } else if (msg.includes("RCP_CAPABILITY_NOT_ADVERTISED")) {
          notify(
            "warning",
            `This device hasn't advertised rcp.${type} — check the agent's policy configuration.`
          );
        } else if (msg.includes("RCP_TOO_MANY_SESSIONS")) {
          notify("warning", "Too many concurrent sessions. Close one before starting another.");
        } else {
          notify("error", `Failed to start session: ${msg || "unknown error"}`);
        }
      }
    },
    [notify, refreshAll]
  );

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Remote Control"
        subtitle="Interactive sessions to managed endpoints, with every access recorded."
        icon={<DesktopWindowsOutlinedIcon />}
        actions={
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<AddOutlinedIcon fontSize="small" />}
              onClick={() => setWizardOpen(true)}
            >
              Start a session
            </Button>
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={manualRefresh}
              loading={refreshing}
            />
          </Box>
        }
      />

      {/* Above the tabs on purpose — see the header note. */}
      <ApprovalQueue refreshNonce={refreshNonce} notify={notify} />

      <SectionPaper variant="panel" sx={{ mb: 2, p: 0, overflow: "hidden" }}>
        <Tabs
          value={activeTab}
          onChange={(_e, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: { xs: 1, sm: 2 },
            minHeight: 58,
            "& .MuiTabs-indicator": {
              height: 3,
              borderRadius: 999,
              backgroundColor: BRAND.teal
            }
          }}
        >
          <Tab
            icon={<PlayCircleOutlineOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Connect"
            id="remote-control-tab-0"
            aria-controls="remote-control-tabpanel-0"
            sx={TAB_SX}
          />
          <Tab
            icon={<HistoryOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Sessions"
            id="remote-control-tab-1"
            aria-controls="remote-control-tabpanel-1"
            sx={TAB_SX}
          />
          <Tab
            icon={<SwapVertOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="File transfers"
            id="remote-control-tab-2"
            aria-controls="remote-control-tabpanel-2"
            sx={TAB_SX}
          />
          <Tab
            icon={<VerifiedUserOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Access"
            id="remote-control-tab-3"
            aria-controls="remote-control-tabpanel-3"
            sx={TAB_SX}
          />
        </Tabs>
      </SectionPaper>

      <TabPanel value={activeTab} index={TAB_CONNECT}>
        <ConnectTab
          refreshNonce={refreshNonce}
          highlightDeviceId={highlightDeviceId}
          onConnect={(device, type) => setRecordFor({ device, type })}
          onShowActiveSessions={() => setActiveTab(TAB_SESSIONS)}
        />
      </TabPanel>

      <TabPanel value={activeTab} index={TAB_SESSIONS}>
        <SessionsTab refreshNonce={refreshNonce} onReplay={(s) => setReplaySession(s)} />
      </TabPanel>

      <TabPanel value={activeTab} index={TAB_TRANSFERS}>
        <TransfersTab refreshNonce={refreshNonce} />
      </TabPanel>

      <TabPanel value={activeTab} index={TAB_ACCESS}>
        <AccessTab notify={notify} />
      </TabPanel>

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      />

      {/* Shell drawer — ShellTerminal owns the WebRTC + xterm lifecycle. */}
      <Drawer
        anchor="right"
        open={Boolean(shellSession)}
        onClose={closeSession(setShellSession)}
        PaperProps={{
          sx: {
            width: { xs: "100%", md: 780, lg: 920 },
            maxWidth: "100%",
            bgcolor: "transparent",
            border: "none"
          }
        }}
      >
        {shellSession ? (
          <Box sx={{ p: 1.5, height: "100%", display: "flex", flexDirection: "column" }}>
            <React.Suspense fallback={<SessionLoading />}>
              <ShellTerminal
                session={shellSession}
                device={shellSession.device}
                onClose={closeSession(setShellSession)}
              />
            </React.Suspense>
          </Box>
        ) : null}
      </Drawer>

      {/* File manager drawer. */}
      <Drawer
        anchor="right"
        open={Boolean(fileSession)}
        onClose={closeSession(setFileSession)}
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
                onClose={closeSession(setFileSession)}
              />
            </React.Suspense>
          </Box>
        ) : null}
      </Drawer>

      {/* Screen share drawer — wide, and the viewer also supports fullscreen. */}
      <Drawer
        anchor="right"
        open={Boolean(screenSession)}
        onClose={closeSession(setScreenSession)}
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
                onClose={closeSession(setScreenSession)}
              />
            </React.Suspense>
          </Box>
        ) : null}
      </Drawer>

      {/* Two players, chosen by session type. A shell session replays terminal
          output; a screen session rebuilds frames onto a canvas (ADR-0012).
          They share the table's button and nothing else — merging them would
          give one component with two mutually exclusive halves. */}
      {replaySession && replaySession.type === "screen" ? (
        <React.Suspense fallback={null}>
          <RecordingReplayDialog
            open
            session={replaySession}
            onClose={() => setReplaySession(null)}
          />
        </React.Suspense>
      ) : null}

      {replaySession && replaySession.type !== "screen" ? (
        <React.Suspense fallback={null}>
          <TranscriptReplayDialog
            open
            session={replaySession}
            onClose={() => setReplaySession(null)}
          />
        </React.Suspense>
      ) : null}

      <StartSessionWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onConfirm={({ device, type, record }) => {
          setWizardOpen(false);
          doConnect(device, type, record);
        }}
      />

      <AccessRecordDialog
        pending={recordFor}
        onCancel={() => setRecordFor(null)}
        onConfirm={(record) => {
          const pending = recordFor;
          setRecordFor(null);
          if (pending) doConnect(pending.device, pending.type, record);
        }}
      />
    </Box>
  );
}
