// src/components/RemoteControl/SessionsTab.jsx
//
// Session history, with the filters and pagination the endpoint now
// supports.
//
// Before this it asked for `limit: 50` — which was the whole of what the
// endpoint could do — so past the newest 200 sessions the history simply did
// not exist for this page, and nothing said so. An audit trail that silently
// truncates is worse than one that isn't there, because it looks complete.

import * as React from "react";
import {
  Box,
  Chip,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  TextField
} from "@mui/material";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import SessionHistoryTable from "./SessionHistoryTable";
import SessionDetailDrawer from "./SessionDetailDrawer";
import HistoryPager from "./HistoryPager";
import { RCP_METHODS } from "./rcpMethods";
import { useRemoteSessions } from "./useRemoteControlData";
import { BRAND } from "../../theme/brand";

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" }
];

const SELECT_SX = {
  minWidth: 150,
  "& .MuiOutlinedInput-notchedOutline": { borderColor: BRAND.border }
};

/** Local midnight, as YYYY-MM-DD, N days back. */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const RANGES = [
  { value: "", label: "Any date" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" }
];

export default function SessionsTab({ onReplay, refreshNonce = 0 }) {
  // The row whose drawer is open. Held here rather than in the page: the
  // drawer only makes sense over this list, and lifting it would mean the
  // page carrying state for a tab that may not even be mounted.
  const [detailFor, setDetailFor] = React.useState(null);
  const [filters, setFilters] = React.useState({
    page: 1,
    pageSize: 25,
    status: null,
    type: null,
    operatorInput: "",
    operator: "",
    range: "",
    hasRecording: false
  });

  // Same 350 ms split as everywhere else on this page: the box updates on
  // every keystroke, the query lags behind it.
  React.useEffect(() => {
    if (filters.operatorInput === filters.operator) return undefined;
    const t = window.setTimeout(
      () => setFilters((f) => ({ ...f, operator: f.operatorInput, page: 1 })),
      350
    );
    return () => window.clearTimeout(t);
  }, [filters.operatorInput, filters.operator]);

  const update = React.useCallback((patch) => {
    setFilters((f) => ({ ...f, ...patch, page: patch.page != null ? patch.page : 1 }));
  }, []);

  const { sessions, total, loading, refetch } = useRemoteSessions({
    page: filters.page,
    pageSize: filters.pageSize,
    status: filters.status,
    type: filters.type,
    operator: filters.operator,
    // The range is stored as a number of days and turned into a date here,
    // so the cache key is stable across a render rather than moving with the
    // clock.
    from: filters.range ? daysAgo(Number(filters.range)) : null,
    hasRecording: filters.hasRecording
  });

  // The panel unmounts when another tab is active, so this only fires while
  // Sessions is on screen. Everything else is covered by the page
  // invalidating the cache key — the next mount then reloads.
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    refetch();
  }, [refreshNonce, refetch]);

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", gap: 1 }}>
        <TextField
          size="small"
          placeholder="Filter by operator…"
          value={filters.operatorInput}
          onChange={(e) => update({ operatorInput: e.target.value })}
          sx={{ flex: 1, minWidth: 200 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
              </InputAdornment>
            )
          }}
        />

        <Select
          size="small"
          displayEmpty
          value={filters.type ?? ""}
          onChange={(e) => update({ type: e.target.value || null })}
          sx={SELECT_SX}
          renderValue={(v) =>
            v === "" ? "All types" : RCP_METHODS.find((m) => m.type === v)?.action || v
          }
        >
          <MenuItem value="">All types</MenuItem>
          {RCP_METHODS.map((m) => (
            <MenuItem key={m.type} value={m.type}>
              {m.action}
            </MenuItem>
          ))}
        </Select>

        <Select
          size="small"
          displayEmpty
          value={filters.status ?? ""}
          onChange={(e) => update({ status: e.target.value || null })}
          sx={SELECT_SX}
          renderValue={(v) =>
            v === "" ? "Any status" : STATUSES.find((s) => s.value === v)?.label || v
          }
        >
          <MenuItem value="">Any status</MenuItem>
          {STATUSES.map((s) => (
            <MenuItem key={s.value} value={s.value}>
              {s.label}
            </MenuItem>
          ))}
        </Select>

        <Select
          size="small"
          displayEmpty
          value={filters.range}
          onChange={(e) => update({ range: e.target.value })}
          sx={SELECT_SX}
          renderValue={(v) => RANGES.find((r) => r.value === v)?.label || "Any date"}
        >
          {RANGES.map((r) => (
            <MenuItem key={r.value || "any"} value={r.value}>
              {r.label}
            </MenuItem>
          ))}
        </Select>

        <Chip
          size="small"
          label="With recording"
          onClick={() => update({ hasRecording: !filters.hasRecording })}
          variant={filters.hasRecording ? "filled" : "outlined"}
          sx={{
            fontWeight: filters.hasRecording ? 700 : 500,
            borderColor: filters.hasRecording ? BRAND.teal : BRAND.border,
            bgcolor: filters.hasRecording ? BRAND.tealSoft : "transparent",
            color: filters.hasRecording ? BRAND.tealText : BRAND.textMuted
          }}
        />
      </Stack>

      <SessionHistoryTable
        sessions={sessions}
        total={total}
        loading={loading}
        onReplay={onReplay}
        onOpenDetail={setDetailFor}
      />

      <SessionDetailDrawer
        session={detailFor}
        onClose={() => setDetailFor(null)}
        onReplay={(s) => {
          // Close the drawer first: the player is a modal dialog, and leaving
          // the drawer under it puts two dismissible layers on screen with
          // only the top one obviously dismissible.
          setDetailFor(null);
          onReplay?.(s);
        }}
      />

      <HistoryPager
        page={filters.page}
        pageSize={filters.pageSize}
        total={total}
        loading={loading}
        noun="session"
        onPage={(p) => update({ page: p })}
      />
    </Box>
  );
}
