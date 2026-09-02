// src/components/RemoteControl/ConnectablesTable.jsx
//
// The device table in the "Connect" tab.
//
// The wizard (StartSessionWizard) is for people who don't know the fleet.
// This table stays for the people who do, and for whoever arrives through
// the deep link from Asset Management — but slimmed down:
//
//   · the "Plugin" column is gone: it repeated what "Can do" and the buttons
//     themselves already say. Three ways of telling the same thing in one row;
//   · the UUID gives up the prime slot. Under the hostname goes what lets
//     you RECOGNISE a machine (group, site, agent version) and the deviceId
//     moves to the tooltip, with copy-to-clipboard;
//   · the three icons get names. Nobody infers a power plug.
//
// ⚠️ Group and site don't come back from /devices yet (they arrive in phase
// 3). The secondary line renders them as soon as they exist and today
// degrades on its own to the agent version — nothing to touch here when
// they land.

import * as React from "react";
import {
  Box,
  Chip,
  CircularProgress,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import {
  RCP_METHODS,
  blockedReason,
  canStart,
  deviceSupports,
  filterDevices,
  countWithoutRcp,
  platformLabel
} from "./rcpMethods";

function StatusChip({ online }) {
  return (
    <Chip
      size="small"
      label={online ? "Online" : "Offline"}
      sx={{
        height: 20,
        fontWeight: 700,
        fontSize: TEXT.xs,
        bgcolor: online ? ROLE.positiveSoft : BRAND.surfaceMuted,
        color: online ? ROLE.positive : BRAND.gray,
        border: `1px solid ${online ? ROLE.positive : BRAND.gray}33`
      }}
    />
  );
}

/** Filter chip. Lit = the filter is applied. */
function FilterChip({ label, on, onClick }) {
  return (
    <Chip
      size="small"
      label={label}
      onClick={onClick}
      variant={on ? "filled" : "outlined"}
      sx={{
        fontWeight: on ? 700 : 500,
        borderColor: on ? BRAND.teal : BRAND.border,
        bgcolor: on ? BRAND.tealSoft : "transparent",
        color: on ? BRAND.tealText : BRAND.textMuted
      }}
    />
  );
}

/** What this device can serve, as readable labels. */
function CanDoCell({ device }) {
  const usable = RCP_METHODS.filter((m) => deviceSupports(device, m.type));
  if (usable.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: BRAND.gray }}>
        —
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
      {usable.map((m) => (
        <Chip
          key={m.type}
          size="small"
          label={m.action}
          sx={{
            height: 20,
            fontWeight: 700,
            fontSize: TEXT.xs,
            bgcolor: BRAND.tealSoft,
            color: BRAND.tealText,
            border: `1px solid ${BRAND.teal}33`
          }}
        />
      ))}
    </Stack>
  );
}

function DeviceCell({ device }) {
  const [copied, setCopied] = React.useState(false);

  const copyId = () => {
    // navigator.clipboard doesn't exist in insecure contexts or in jsdom.
    // The failure is irrelevant — the id is still visible in the tooltip —
    // so it's swallowed rather than breaking the row.
    try {
      navigator.clipboard?.writeText(device.deviceId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* sin portapapeles: el tooltip ya enseña el id */
    }
  };

  // Group · site · version. The first two arrive in phase 3; until then the
  // line keeps whatever it has.
  const meta = [
    Array.isArray(device.groupNames) && device.groupNames.length
      ? device.groupNames.join(", ")
      : null,
    device.siteName || null,
    device.agentVersion ? `agent ${device.agentVersion}` : null
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Tooltip title={copied ? "Identifier copied" : `${device.deviceId} — click to copy`} arrow>
      <Box
        onClick={copyId}
        sx={{ cursor: "pointer", display: "inline-block", maxWidth: "100%" }}
      >
        <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600 }}>
          {device.hostname || device.deviceId}
        </Typography>
        {meta ? (
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            {meta}
          </Typography>
        ) : null}
      </Box>
    </Tooltip>
  );
}

/** onConnect(device, type) con type "shell" | "file" | "screen". */
export default function ConnectablesTable({
  devices,
  loading,
  onConnect,
  highlightDeviceId = ""
}) {
  const [search, setSearch] = React.useState("");
  // On by default: an offline device can't take a session, so this is the
  // state in which the table is useful almost all of the time.
  const [onlineOnly, setOnlineOnly] = React.useState(true);
  const [includeWithoutRcp, setIncludeWithoutRcp] = React.useState(false);

  const list = Array.isArray(devices) ? devices : [];
  const hiddenCount = React.useMemo(() => countWithoutRcp(list), [list]);

  const filtered = React.useMemo(
    () =>
      filterDevices(list, {
        search,
        onlineOnly,
        includeWithoutRcp,
        // The device reached through a deep link ALWAYS shows, even if it's
        // offline or has no plugin. Otherwise the flash would highlight a
        // row the table doesn't contain.
        keepIds: highlightDeviceId ? [highlightDeviceId] : []
      }),
    [list, search, onlineOnly, includeWithoutRcp, highlightDeviceId]
  );

  const hiddenTotal = list.length - filtered.length;

  return (
    <Paper
      id="remote-control-connectables"
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        display: "flex",
        flexDirection: "column"
      }}
    >
      <Stack direction="row" alignItems="center" sx={{ mb: 1.5, gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
            Devices
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            Pick a device and an action, or use “Start a session” to be guided through it.
          </Typography>
        </Box>
        {loading ? <CircularProgress size={16} sx={{ color: BRAND.teal }} /> : null}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", gap: 1 }}>
        <TextField
          size="small"
          placeholder="Search by host, group, site or identifier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: 220 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
              </InputAdornment>
            )
          }}
        />
        <FilterChip
          label="Online only"
          on={onlineOnly}
          onClick={() => setOnlineOnly((v) => !v)}
        />
        {hiddenCount > 0 ? (
          <FilterChip
            label={
              includeWithoutRcp
                ? `Hide the ${hiddenCount} without remote control`
                : `Show the ${hiddenCount} without remote control`
            }
            on={includeWithoutRcp}
            onClick={() => setIncludeWithoutRcp((v) => !v)}
          />
        ) : null}
      </Stack>

      <TableContainer>
        <Table
          size="small"
          sx={{
            "@keyframes traceniumFlash": {
              "0%, 100%": { backgroundColor: "transparent" },
              "25%, 75%": { backgroundColor: BRAND.tealSoft }
            },
            "& .tracenium-flash-row": {
              animation: "traceniumFlash 1.2s ease-in-out 2"
            }
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Device</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Platform</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Can do</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ color: BRAND.gray, py: 3 }}>
                  {list.length === 0
                    ? "No enrolled devices to display."
                    : "No device matches the current filters."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => (
                <TableRow
                  key={d.deviceId}
                  hover
                  className={
                    highlightDeviceId && String(d.deviceId) === String(highlightDeviceId)
                      ? "tracenium-flash-row"
                      : undefined
                  }
                >
                  <TableCell>
                    <DeviceCell device={d} />
                  </TableCell>
                  <TableCell>{platformLabel(d.platform)}</TableCell>
                  <TableCell>
                    <StatusChip online={d.online} />
                  </TableCell>
                  <TableCell>
                    <CanDoCell device={d} />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      {RCP_METHODS.map((m) => {
                        const enabled = canStart(d, m.type);
                        // The reason it CAN'T be done is the same sentence
                        // the wizard shows. One wording for both places:
                        // rcpMethods.blockedReason.
                        const title = enabled
                          ? m.description
                          : blockedReason(d, m.type);
                        return (
                          <Tooltip key={m.type} title={title} arrow>
                            <span>
                              <Box
                                component="button"
                                type="button"
                                aria-label={`${m.action} on ${d.hostname || d.deviceId}`}
                                disabled={!enabled}
                                onClick={() => onConnect?.(d, m.type)}
                                sx={{
                                  font: "inherit",
                                  fontSize: TEXT.xs,
                                  fontWeight: 700,
                                  px: 1.25,
                                  py: 0.5,
                                  borderRadius: 1,
                                  cursor: enabled ? "pointer" : "default",
                                  bgcolor: "transparent",
                                  color: enabled ? BRAND.tealText : BRAND.gray,
                                  border: `1px solid ${enabled ? BRAND.teal : BRAND.border}`,
                                  "&:hover": enabled ? { bgcolor: BRAND.tealSoft } : undefined,
                                  "&:focus-visible": {
                                    outline: `2px solid ${BRAND.teal}`,
                                    outlineOffset: 2
                                  }
                                }}
                              >
                                {m.action}
                              </Box>
                            </span>
                          </Tooltip>
                        );
                      })}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ⚠️ This counts EVERY hidden device, not just the ones without the
          plugin. Two filters ship on — "online only" and "without remote
          control" — and a footer that only accounted for one of them left
          the arithmetic not adding up ("2 shown · 1 hidden" out of 4), which
          is precisely the "where is my device?" the counter exists to
          prevent. The chips above name which filter hides what. */}
      {hiddenTotal > 0 ? (
        <Typography variant="caption" sx={{ color: BRAND.gray, mt: 1.5 }}>
          {filtered.length} of {list.length} devices shown · {hiddenTotal} hidden by the
          filters above.
        </Typography>
      ) : null}
    </Paper>
  );
}
