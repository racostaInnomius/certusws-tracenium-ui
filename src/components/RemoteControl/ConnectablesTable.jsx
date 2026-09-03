// src/components/RemoteControl/ConnectablesTable.jsx
//
// The device table in the "Connect" tab.
//
// ── Presentational on purpose ────────────────────────────────────────
//
// It used to hold the fleet in a prop and filter it with Array.filter. Now
// every filter is a server-side query, so the filter VALUES live in
// ConnectTab (which owns the fetch) and this component renders them and
// reports changes. Keeping the state here would mean the component that
// draws the table also decides what gets fetched, and the two would drift.
//
// ── What the columns say ─────────────────────────────────────────────
//
//   · no "Plugin" column and no "Can do" column. Both said what the action
//     buttons say one column over — and "Can do" said it with the SAME three
//     names. A row does not need to list its capabilities next to the
//     buttons for those capabilities: a disabled button is already the
//     statement, and its tooltip carries the reason;
//   · "Last seen" took that space, because it is the question an offline dot
//     raises and nothing on the row could answer;
//   · status is the shared OnlineDot — the same green LED Asset Management
//     uses. A row of pills reading "Online / Online / Offline" is louder
//     than the information in it;
//   · under the hostname goes what lets you RECOGNISE a machine — group,
//     site, agent version — and the deviceId moves to the tooltip with
//     copy-to-clipboard;
//   · the three actions have names. Nobody infers a power plug.

import * as React from "react";
import {
  Box,
  Chip,
  CircularProgress,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
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
import { BRAND, TEXT } from "../../theme/brand";
import OnlineDot from "../common/OnlineDot";
import { formatRelative } from "../../utils/format";
import { RCP_METHODS, blockedReason, canStart, platformLabel } from "./rcpMethods";

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
      /* no clipboard: the tooltip already shows the id */
    }
  };

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

const SELECT_SX = {
  minWidth: 150,
  "& .MuiOutlinedInput-notchedOutline": { borderColor: BRAND.border }
};

/**
 * @param {object} filters    current filter values (owned by ConnectTab)
 * @param {Function} onFilters partial update; ConnectTab resets the page
 * @param {number} total      size of the filtered set, from the server
 * @param {number} withoutRcp how many devices the "remote control" filter
 *   hides. Comes from the KPI summary (fleetTotal − rcpCapable), not from
 *   counting rows: with a paged list the rows on screen can't answer it.
 */
export default function ConnectablesTable({
  devices,
  loading,
  onConnect,
  highlightDeviceId = "",
  filters,
  onFilters,
  total = 0,
  withoutRcp = null,
  groups = [],
  platforms = []
}) {
  const list = Array.isArray(devices) ? devices : [];
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 25;
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

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
          value={filters.searchInput}
          onChange={(e) => onFilters({ searchInput: e.target.value })}
          sx={{ flex: 1, minWidth: 220 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
              </InputAdornment>
            )
          }}
        />

        {groups.length > 0 ? (
          <Select
            size="small"
            displayEmpty
            value={filters.groupId ?? ""}
            onChange={(e) => onFilters({ groupId: e.target.value === "" ? null : Number(e.target.value) })}
            sx={SELECT_SX}
            renderValue={(v) =>
              v === "" ? "All groups" : groups.find((g) => g.id === v)?.name || "Group"
            }
          >
            <MenuItem value="">All groups</MenuItem>
            {groups.map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {g.name}
              </MenuItem>
            ))}
          </Select>
        ) : null}

        {platforms.length > 0 ? (
          <Select
            size="small"
            displayEmpty
            value={filters.platform ?? ""}
            onChange={(e) => onFilters({ platform: e.target.value || null })}
            sx={SELECT_SX}
            renderValue={(v) => (v === "" ? "All platforms" : platformLabel(v))}
          >
            <MenuItem value="">All platforms</MenuItem>
            {platforms.map((p) => (
              <MenuItem key={p} value={p}>
                {platformLabel(p)}
              </MenuItem>
            ))}
          </Select>
        ) : null}

        <FilterChip
          label="Online only"
          on={filters.onlineOnly}
          onClick={() => onFilters({ onlineOnly: !filters.onlineOnly })}
        />
        {withoutRcp ? (
          <FilterChip
            label={
              filters.rcpOnly
                ? `Show the ${withoutRcp} without remote control`
                : `Hide the ${withoutRcp} without remote control`
            }
            on={!filters.rcpOnly}
            onClick={() => onFilters({ rcpOnly: !filters.rcpOnly })}
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
              {/* Replaces "Can do", which listed the same three capabilities
                  the action buttons already spell out one column over. What
                  the row was missing is WHEN this machine was last really
                  here — the question an offline dot raises and could not
                  answer. */}
              <TableCell sx={{ fontWeight: 700 }}>Last seen</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ color: BRAND.gray, py: 3 }}>
                  No device matches the current filters.
                </TableCell>
              </TableRow>
            ) : (
              list.map((d) => (
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
                    <OnlineDot
                      online={d.online}
                      title={
                        d.online
                          ? "Online"
                          : d.lastSeenAt
                            ? `Offline — last seen ${formatRelative(d.lastSeenAt)}`
                            : "Offline — never seen"
                      }
                    />
                  </TableCell>
                  <TableCell sx={{ color: BRAND.gray, whiteSpace: "nowrap" }}>
                    {d.lastSeenAt ? formatRelative(d.lastSeenAt) : "—"}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      {RCP_METHODS.map((m) => {
                        const enabled = canStart(d, m.type);
                        // The reason it CAN'T be done is the same sentence
                        // the wizard shows. One wording for both places:
                        // rcpMethods.blockedReason.
                        const title = enabled ? m.description : blockedReason(d, m.type);
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

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mt: 1.5, gap: 1, flexWrap: "wrap" }}
      >
        <Typography variant="caption" sx={{ color: BRAND.gray }}>
          {total === 0
            ? "No devices"
            : `${firstRow}–${lastRow} of ${total} device${total === 1 ? "" : "s"}`}
          {withoutRcp && filters.rcpOnly
            ? ` · ${withoutRcp} hidden with no remote control`
            : ""}
        </Typography>

        {/* Prev/next rather than numbered pages: the count is a server
            total, so the number of pages is known, but a numbered pager over
            a list that changes as devices come online mostly invites clicks
            on pages that have already shifted. */}
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Box
            component="button"
            type="button"
            aria-label="Previous page"
            disabled={page <= 1 || loading}
            onClick={() => onFilters({ page: page - 1 })}
            sx={pagerSx(page > 1 && !loading)}
          >
            Previous
          </Box>
          <Typography variant="caption" sx={{ color: BRAND.gray, px: 0.5 }}>
            {page} / {pageCount}
          </Typography>
          <Box
            component="button"
            type="button"
            aria-label="Next page"
            disabled={page >= pageCount || loading}
            onClick={() => onFilters({ page: page + 1 })}
            sx={pagerSx(page < pageCount && !loading)}
          >
            Next
          </Box>
        </Stack>
      </Stack>
    </Paper>
  );
}

function pagerSx(enabled) {
  return {
    font: "inherit",
    fontSize: TEXT.xs,
    fontWeight: 700,
    px: 1.25,
    py: 0.5,
    borderRadius: 1,
    bgcolor: "transparent",
    cursor: enabled ? "pointer" : "default",
    color: enabled ? BRAND.tealText : BRAND.gray,
    border: `1px solid ${enabled ? BRAND.teal : BRAND.border}`,
    "&:hover": enabled ? { bgcolor: BRAND.tealSoft } : undefined,
    "&:focus-visible": { outline: `2px solid ${BRAND.teal}`, outlineOffset: 2 }
  };
}
