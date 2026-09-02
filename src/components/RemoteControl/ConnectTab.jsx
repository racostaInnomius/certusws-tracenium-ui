// src/components/RemoteControl/ConnectTab.jsx
//
// The Connect tab: the KPI strip and the device table.
//
// ── The KPI strip, and what was wrong with it ────────────────────────
//
// It used to be four cards. Two of them didn't earn their place and one was
// factually wrong:
//
//   · "Connectable devices" showed summary.connectableDevices, which the
//     backend computes as COUNT(*) over every active enrolment with no
//     capability filter at all — the service comment says as much: "We don't
//     filter by rcp capability here to keep this query cheap". The card
//     labelled that number "with rcp enabled". It was the fleet size wearing
//     someone else's name;
//   · "Avg session duration" on its own is noise. An 8-minute average with
//     no idea how many sessions it averages tells you nothing, so it merges
//     into the 7-day card.
//
// ⚠️ readyNow / rcpCapable / fleetTotal are derived HERE, in the browser,
// from the full device list. That is only correct while /devices returns the
// whole fleet. When phase 3 paginates it, these three must move to
// /devices/facets — counting a page and calling it the fleet would be the
// very bug this replaces. summarizeFleet() carries the same warning.

import * as React from "react";
import { Box, Grid, Paper, Skeleton, Stack, Typography } from "@mui/material";
import DesktopWindowsOutlinedIcon from "@mui/icons-material/DesktopWindowsOutlined";
import FlashOnOutlinedIcon from "@mui/icons-material/FlashOnOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import { BRAND, ROLE } from "../../theme/brand";
import ConnectablesTable from "./ConnectablesTable";
import NoRemoteControlCard from "./NoRemoteControlCard";
import { summarizeFleet } from "./rcpMethods";
import { useConnectableDevices, useRemoteControlSummary } from "./useRemoteControlData";

function Kpi({ title, value, subtitle, icon: Icon, accent, tint, loading, onClick }) {
  const clickable = typeof onClick === "function";
  return (
    <Paper
      elevation={0}
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 1.25,
        cursor: clickable ? "pointer" : "default",
        "&:hover": clickable ? { borderColor: BRAND.teal } : undefined,
        "&:focus-visible": { outline: `2px solid ${BRAND.teal}`, outlineOffset: 2 }
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
        <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600, lineHeight: 1.2 }}>
          {title}
        </Typography>
      </Stack>

      {loading ? (
        <Skeleton variant="text" width={90} height={40} />
      ) : (
        <Typography variant="h4" sx={{ color: BRAND.dark, fontWeight: 700, lineHeight: 1.1 }}>
          {value}
        </Typography>
      )}

      {subtitle != null && !loading ? (
        <Typography variant="caption" sx={{ color: BRAND.gray }}>
          {subtitle}
        </Typography>
      ) : null}
    </Paper>
  );
}

function durationLabel(seconds) {
  if (seconds == null) return null;
  return seconds < 60 ? `${seconds}s avg` : `${Math.round(seconds / 60)} min avg`;
}

export default function ConnectTab({
  onConnect,
  highlightDeviceId,
  onShowActiveSessions,
  refreshNonce = 0
}) {
  const { devices, loading: devicesLoading, refetch: refetchDevices } = useConnectableDevices();
  const { summary, loading: summaryLoading, refetch: refetchSummary } = useRemoteControlSummary();

  // Reaches the panel that IS mounted. The ones that aren't are covered by
  // the page invalidating the cache prefix, which makes their next mount
  // reload — see refreshAll() in pages/RemoteControl.jsx.
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    refetchDevices();
    refetchSummary();
  }, [refreshNonce, refetchDevices, refetchSummary]);

  const fleet = React.useMemo(() => summarizeFleet(devices), [devices]);

  const active = Number(summary?.activeSessions ?? 0);
  const last7d = Number(summary?.sessionsLast7d ?? 0);
  const avg = durationLabel(summary?.avgDurationSec ?? null);

  // No device has a capability: the table would be an empty box with three
  // filters on top. The card explains it and says where to fix it.
  const showEmptyState = !devicesLoading && fleet.rcpCapable === 0;

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Kpi
            title="Ready now"
            value={
              <>
                {fleet.readyNow}
                <Box component="span" sx={{ fontSize: "1rem", color: BRAND.gray, fontWeight: 500 }}>
                  {" "}
                  / {fleet.rcpCapable}
                </Box>
              </>
            }
            subtitle={`online with remote control · ${fleet.fleetTotal} devices in the fleet`}
            icon={DesktopWindowsOutlinedIcon}
            accent={BRAND.teal}
            tint={BRAND.tealSoft}
            loading={devicesLoading && devices.length === 0}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Kpi
            title="Active sessions"
            value={active}
            subtitle={active > 0 ? "in progress — open the history" : "none right now"}
            icon={FlashOnOutlinedIcon}
            accent={active > 0 ? ROLE.positive : BRAND.gray}
            tint={active > 0 ? ROLE.positiveSoft : BRAND.surfaceMuted}
            loading={summaryLoading && !summary}
            // A number nobody can act on is decoration. Clicking it goes to
            // the history, which is where the sessions themselves are.
            onClick={active > 0 ? onShowActiveSessions : undefined}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Kpi
            title="Last 7 days"
            value={last7d}
            subtitle={
              last7d > 0
                ? [`${last7d === 1 ? "session" : "sessions"}`, avg].filter(Boolean).join(" · ")
                : "no sessions yet"
            }
            icon={HistoryOutlinedIcon}
            accent={BRAND.teal}
            tint={BRAND.tealSoft}
            loading={summaryLoading && !summary}
          />
        </Grid>
      </Grid>

      {showEmptyState ? (
        <NoRemoteControlCard fleetTotal={fleet.fleetTotal} />
      ) : (
        <ConnectablesTable
          devices={devices}
          loading={devicesLoading}
          onConnect={onConnect}
          highlightDeviceId={highlightDeviceId}
        />
      )}
    </Box>
  );
}
