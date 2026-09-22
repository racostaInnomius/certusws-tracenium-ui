// src/components/Compliance/CategoryDrilldown.jsx
//
// What opens under a row of "Posture by category".
//
// ── Why it is organised by CHECK, not by device ─────────────────────────
// It used to list every failing device with every one of its failing checks
// as a chip. Measured on 22-sep-2026 in a 54-device tenant: Integrity was
// 15,706 chips and ~2.5 MB in one response. At 1,200 devices that is
// ~350,000 chips and ~56 MB — neither the browser nor the API survives it.
//
// Devices grow with the fleet; the checks of a category are fixed by the
// catalog (Integrity: 387). So the default view is one row per failing check
// — "Secure Boot: 41 of 51 devices" — which weighs the same with 12 devices
// or 12,000, and answers "what do I fix?" rather than "who is broken?". The
// devices are one click away, 50 at a time, searchable. "By device" is still
// there, as a paginated table of counts; a device opens its own drawer
// instead of spilling 300 chips inline.
//
// Nothing here is ever fetched whole: every list is a page with a total.

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  LinearProgress,
  Link,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import { BRAND, ICON, TEXT } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import { formatDate } from "../../utils/format";
import { getCategoryFailingChecks, getCategoryCheckDevices, getCategoryDevices } from "../../api/compliance";

export const CHECKS_PAGE = 25;
export const DEVICES_PAGE = 50;

/**
 * One paginated list: first page on mount (and whenever `fetchPage`
 * changes), then "show more" appends. A response that arrives after a newer
 * request was issued is dropped — typing in the search box fires several.
 */
function usePagedList(fetchPage, pageSize) {
  const [state, setState] = React.useState({ items: [], total: 0, loading: true, err: null });
  const seq = React.useRef(0);

  const load = React.useCallback(
    async (offset, append) => {
      const id = ++seq.current;
      setState((s) => ({ ...s, loading: true, err: null }));
      try {
        const res = await fetchPage({ limit: pageSize, offset });
        if (id !== seq.current) return;
        const items = Array.isArray(res?.items) ? res.items : [];
        setState((s) => ({
          items: append ? [...s.items, ...items] : items,
          total: Number.isFinite(Number(res?.total)) ? Number(res.total) : items.length,
          loading: false,
          err: null,
        }));
      } catch (e) {
        if (id !== seq.current) return;
        setState((s) => ({ ...s, loading: false, err: e?.body?.message || e?.message || "Failed to load" }));
      }
    },
    [fetchPage, pageSize]
  );

  React.useEffect(() => {
    load(0, false);
  }, [load]);

  return { ...state, loadMore: () => load(state.items.length, true) };
}

function useDebounced(value, ms = 300) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function SearchBox({ value, onChange, label }) {
  return (
    <TextField
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={label}
      inputProps={{ "aria-label": label }}
      sx={{ width: { xs: "100%", sm: 260 } }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchOutlinedIcon sx={{ fontSize: ICON.sm, color: BRAND.gray }} />
          </InputAdornment>
        ),
      }}
    />
  );
}

/** "Showing 50 of 1,203" + the button for the next page. */
function PageFooter({ shown, total, loading, onMore, noun, pageSize }) {
  if (total <= shown && !loading) return null;
  const remaining = Math.max(0, total - shown);
  return (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1 }}>
      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
        Showing {shown.toLocaleString()} of {total.toLocaleString()} {noun}
      </Typography>
      {remaining > 0 ? (
        <Button size="small" onClick={onMore} disabled={loading} sx={{ textTransform: "none" }}>
          Show {Math.min(remaining, pageSize).toLocaleString()} more
        </Button>
      ) : null}
      {loading ? <CircularProgress size={14} sx={{ color: BRAND.teal }} /> : null}
    </Stack>
  );
}

function ListState({ loading, err, empty, children }) {
  if (err) return <Box sx={{ py: 1.5, color: BRAND.alert?.errorText, fontSize: TEXT.sm }}>{err}</Box>;
  if (loading && empty) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={20} sx={{ color: BRAND.teal }} />
      </Box>
    );
  }
  return children;
}

function DeviceName({ device, onOpenDevice }) {
  const name = device.hostname || device.agentId;
  if (!onOpenDevice) return <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>{name}</Typography>;
  return (
    <Link
      component="button"
      type="button"
      underline="hover"
      onClick={() => onOpenDevice(device.agentId)}
      sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, textAlign: "left" }}
    >
      {name}
    </Link>
  );
}

// ── By check ────────────────────────────────────────────────────────────

function CheckDevices({ category, checkId, onOpenDevice }) {
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search.trim());
  const fetchPage = React.useCallback((p) => getCategoryCheckDevices(category, checkId, { ...p, q }), [category, checkId, q]);
  const list = usePagedList(fetchPage, DEVICES_PAGE);

  return (
    <Box sx={{ pl: 4, pr: 1, pb: 1.5, pt: 0.5 }}>
      <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} spacing={1} sx={{ mb: 1 }}>
        <Typography sx={{ fontSize: TEXT.xs, fontWeight: 800, color: BRAND.gray }}>
          {list.loading && !list.items.length ? "Devices failing this check" : `${list.total.toLocaleString()} device${list.total === 1 ? "" : "s"} failing this check`}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <SearchBox value={search} onChange={setSearch} label="Search devices" />
      </Stack>
      <ListState loading={list.loading} err={list.err} empty={!list.items.length}>
        {!list.items.length ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>{q ? `No device matches “${q}”.` : "No devices are failing this check."}</Typography>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, columnGap: 2, rowGap: 0.5 }}>
            {list.items.map((d) => (
              <Stack key={d.agentId} direction="row" alignItems="baseline" spacing={1} sx={{ minWidth: 0 }}>
                <DeviceName device={d} onOpenDevice={onOpenDevice} />
                <Typography noWrap sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
                  {[d.platform, d.failingSince ? `since ${formatDate(d.failingSince, { month: "short", day: "numeric" })}` : null].filter(Boolean).join(" · ")}
                </Typography>
              </Stack>
            ))}
          </Box>
        )}
        <PageFooter shown={list.items.length} total={list.total} loading={list.loading} onMore={list.loadMore} noun="devices" pageSize={DEVICES_PAGE} />
      </ListState>
    </Box>
  );
}

function CheckRow({ check, category, open, onToggle, onOpenDevice }) {
  const sev = severityMeta(check.severity);
  const evaluated = Math.max(check.devicesEvaluated || 0, check.deviceCount || 0);
  const share = evaluated ? Math.round((check.deviceCount / evaluated) * 100) : 0;
  return (
    <Box sx={{ borderBottom: `1px solid ${BRAND.border}` }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.25}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`Devices failing ${check.title || check.checkId}`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        sx={{ py: 0.75, px: 0.5, cursor: "pointer", "&:hover": { bgcolor: BRAND.surfaceMuted } }}
      >
        {open ? <ExpandLessOutlinedIcon sx={{ fontSize: ICON.sm, color: BRAND.gray }} /> : <ExpandMoreOutlinedIcon sx={{ fontSize: ICON.sm, color: BRAND.gray }} />}
        <Chip size="small" label={check.severity || "unknown"} sx={{ height: 20, minWidth: 64, fontSize: TEXT.xs, fontWeight: 700, bgcolor: sev.bg, color: sev.fg }} />
        <Tooltip title={check.checkId} arrow placement="top-start">
          <Typography sx={{ flex: 1, minWidth: 0, fontSize: TEXT.sm, fontWeight: 600, color: BRAND.dark }} noWrap>
            {check.title || check.checkId}
          </Typography>
        </Tooltip>
        {check.agentRemediable ? (
          <Tooltip title="Patch Management can fix this check on the device" arrow>
            <Chip size="small" label="Agent fix" variant="outlined" sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, color: BRAND.tealText, borderColor: BRAND.teal }} />
          </Tooltip>
        ) : null}
        <Tooltip title={`${check.deviceCount} of the ${evaluated} devices where this check was evaluated`} arrow>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ width: { xs: 120, sm: 200 }, flexShrink: 0 }}>
            <Box sx={{ flex: 1 }}>
              <LinearProgress
                variant="determinate"
                value={share}
                sx={{ height: 6, borderRadius: 3, bgcolor: BRAND.surfaceMuted, "& .MuiLinearProgress-bar": { bgcolor: sev.fg } }}
              />
            </Box>
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.dark, fontWeight: 700, whiteSpace: "nowrap" }}>
              {check.deviceCount.toLocaleString()}
              <Typography component="span" sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontWeight: 400 }}> / {evaluated.toLocaleString()}</Typography>
            </Typography>
          </Stack>
        </Tooltip>
      </Stack>
      {open ? <CheckDevices category={category} checkId={check.checkId} onOpenDevice={onOpenDevice} /> : null}
    </Box>
  );
}

function ChecksView({ category, onOpenDevice }) {
  const fetchPage = React.useCallback((p) => getCategoryFailingChecks(category, p), [category]);
  const list = usePagedList(fetchPage, CHECKS_PAGE);
  const [openCheck, setOpenCheck] = React.useState(null);

  return (
    <ListState loading={list.loading} err={list.err} empty={!list.items.length}>
      {!list.items.length ? (
        <Typography sx={{ py: 1.5, fontSize: TEXT.sm, color: BRAND.gray }}>No checks are failing in this category.</Typography>
      ) : (
        <>
          <Stack direction="row" alignItems="center" sx={{ px: 0.5, pb: 0.5, borderBottom: `1px solid ${BRAND.border}` }}>
            <Typography sx={{ flex: 1, fontSize: TEXT.xs, fontWeight: 800, color: BRAND.gray }}>
              {list.total.toLocaleString()} failing check{list.total === 1 ? "" : "s"} · most severe and most widespread first
            </Typography>
            <Typography sx={{ width: { xs: 120, sm: 200 }, fontSize: TEXT.xs, fontWeight: 800, color: BRAND.gray }}>Devices failing</Typography>
          </Stack>
          {list.items.map((c) => (
            <CheckRow
              key={c.checkId}
              check={c}
              category={category}
              open={openCheck === c.checkId}
              onToggle={() => setOpenCheck((cur) => (cur === c.checkId ? null : c.checkId))}
              onOpenDevice={onOpenDevice}
            />
          ))}
          <PageFooter shown={list.items.length} total={list.total} loading={list.loading} onMore={list.loadMore} noun="checks" pageSize={CHECKS_PAGE} />
        </>
      )}
    </ListState>
  );
}

// ── By device ───────────────────────────────────────────────────────────

function DevicesView({ category, onOpenDevice }) {
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search.trim());
  const fetchPage = React.useCallback((p) => getCategoryDevices(category, { ...p, q, fields: "counts" }), [category, q]);
  const list = usePagedList(fetchPage, DEVICES_PAGE);

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} spacing={1} sx={{ mb: 1 }}>
        <Typography sx={{ fontSize: TEXT.xs, fontWeight: 800, color: BRAND.gray }}>
          {list.loading && !list.items.length ? "Devices failing this category" : `${list.total.toLocaleString()} device${list.total === 1 ? "" : "s"} failing · worst first`}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <SearchBox value={search} onChange={setSearch} label="Search devices" />
      </Stack>
      <ListState loading={list.loading} err={list.err} empty={!list.items.length}>
        {!list.items.length ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>{q ? `No device matches “${q}”.` : "No devices are failing this category."}</Typography>
        ) : (
          list.items.map((d) => (
            <Stack key={d.agentId} direction="row" alignItems="center" spacing={1.25} sx={{ py: 0.6, px: 0.5, borderBottom: `1px solid ${BRAND.border}` }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <DeviceName device={d} onOpenDevice={onOpenDevice} />
              </Box>
              {d.platform ? (
                <Chip size="small" label={d.platform} sx={{ height: 18, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }} />
              ) : null}
              <Typography sx={{ width: 90, textAlign: "right", fontSize: TEXT.xs, color: BRAND.dark }}>
                {d.failingChecks} failing
              </Typography>
              <Box sx={{ width: 110, textAlign: "right" }}>
                {d.highSeverityFails ? (
                  <Chip size="small" label={`${d.highSeverityFails} critical/high`} sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.alert?.errorSoft, color: BRAND.alert?.errorText }} />
                ) : null}
              </Box>
            </Stack>
          ))
        )}
        <PageFooter shown={list.items.length} total={list.total} loading={list.loading} onMore={list.loadMore} noun="devices" pageSize={DEVICES_PAGE} />
      </ListState>
    </Box>
  );
}

export default function CategoryDrilldown({ category, onOpenDevice = null }) {
  const [view, setView] = React.useState("checks");
  return (
    <Box sx={{ py: 1 }}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={view}
        onChange={(_e, v) => v && setView(v)}
        aria-label="Group failures by"
        sx={{ mb: 1 }}
      >
        <ToggleButton value="checks" sx={{ textTransform: "none", py: 0.25 }}>By check</ToggleButton>
        <ToggleButton value="devices" sx={{ textTransform: "none", py: 0.25 }}>By device</ToggleButton>
      </ToggleButtonGroup>
      {view === "checks" ? (
        <ChecksView category={category} onOpenDevice={onOpenDevice} />
      ) : (
        <DevicesView category={category} onOpenDevice={onOpenDevice} />
      )}
    </Box>
  );
}
