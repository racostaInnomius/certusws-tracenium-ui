// src/components/patch-management/ActionOutlookNotice.jsx
//
// The three lines that decide whether someone presses the button: when this
// will actually go out, what catches it if it breaks, and whether it can be
// undone.
//
// All three were already knowable — maintenance windows and the vCenter
// gateway have been in the product for a while — but they lived two tabs away,
// so the one moment they matter was the one moment they were invisible. A
// cautious operator pressed nothing; an incautious one pressed everything.
//
// Says nothing it cannot back up. When the fleet has no windows there is no
// wait to report; when nothing is snapshotted it says so plainly rather than
// staying quiet and letting the silence read as safety.

import * as React from "react";
import { Box, Stack, Typography, CircularProgress, Tooltip } from "@mui/material";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";
import { BRAND, TEXT, ROLE } from "../../theme/brand";
import { getActionOutlook } from "../../api/patchManagement";

function Line({ icon, children, tone }) {
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start">
      <Box sx={{ color: tone ?? BRAND.gray, display: "flex", mt: "1px" }}>{icon}</Box>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>{children}</Typography>
    </Stack>
  );
}

function whenText(dispatch) {
  if (!dispatch.restricted) return "Goes out immediately — no maintenance windows configured.";
  if (dispatch.openNow) return "A maintenance window is open now.";
  if (!dispatch.opensAtUtc) return "Held until the next maintenance window.";
  const when = new Date(dispatch.opensAtUtc).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const hours = Math.round(dispatch.minutesUntilOpen / 60);
  const away = hours >= 1 ? ` (in about ${hours}h)` : "";
  return `Held until ${when}${away}.`;
}

export default function ActionOutlookNotice({ deviceIds = [] }) {
  const [state, setState] = React.useState({ loading: false, outlook: null, error: null });

  React.useEffect(() => {
    if (deviceIds.length === 0) {
      setState({ loading: false, outlook: null, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    getActionOutlook(deviceIds)
      .then((outlook) => !cancelled && setState({ loading: false, outlook, error: null }))
      // Silent on failure. A wrong outlook is worse than none: if we cannot
      // say when this dispatches or what protects it, we must not guess.
      .catch((err) => !cancelled && setState({ loading: false, outlook: null, error: err }));
    return () => { cancelled = true; };
  }, [deviceIds.join(",")]);

  if (deviceIds.length === 0 || state.error) return null;

  if (state.loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1 }}>
        <CircularProgress size={13} sx={{ color: BRAND.teal }} />
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
          Checking when this would run…
        </Typography>
      </Stack>
    );
  }

  const o = state.outlook;
  if (!o?.dispatch) return null;

  const covered = o.protection?.snapshotted?.length ?? 0;
  const unprotected = o.protection?.unprotected ?? [];
  const blocked = o.protection?.blocked ?? [];

  return (
    <Box
      sx={{
        border: `1px solid ${BRAND.border}`,
        borderLeft: `3px solid ${o.reversible ? BRAND.teal : ROLE.caution}`,
        borderRadius: 1,
        bgcolor: BRAND.surfaceMuted,
        p: 1.5,
        display: "grid",
        gap: 0.75,
      }}
    >
      <Line icon={<ScheduleOutlinedIcon fontSize="small" />}>{whenText(o.dispatch)}</Line>

      <Line icon={<CameraAltOutlinedIcon fontSize="small" />}>
        {covered > 0
          ? `${covered} of ${deviceIds.length} device${deviceIds.length === 1 ? "" : "s"} will be snapshotted in vCenter first.`
          : "No vCenter snapshot will be taken."}
        {unprotected.length > 0 ? (
          <Tooltip
            arrow
            title={unprotected.map((u) => `${u.deviceId}: ${u.reason}`).join("\n")}
          >
            <Box component="span" sx={{ color: BRAND.tealText, ml: 0.5, cursor: "help", textDecoration: "underline dotted" }}>
              {unprotected.length} without a rollback point
            </Box>
          </Tooltip>
        ) : null}
      </Line>

      <Line
        icon={<UndoOutlinedIcon fontSize="small" />}
        tone={o.reversible ? BRAND.teal : ROLE.caution}
      >
        {o.reversible
          ? "Reversible — every target can be rolled back to its snapshot."
          : "Not reversible. Applying this cannot be undone from here."}
      </Line>

      {blocked.length > 0 ? (
        <Line icon={<span style={{ fontSize: 14 }}>⛔</span>} tone={ROLE.critical}>
          {blocked.length} device{blocked.length === 1 ? "" : "s"} will be skipped entirely:{" "}
          {blocked.map((b) => b.reason).join("; ")}
        </Line>
      ) : null}
    </Box>
  );
}
