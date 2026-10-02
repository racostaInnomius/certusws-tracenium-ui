// src/components/patch-management/SnapshotHistoryPanel.jsx
//
// ADR-0038 D10 — every pre-change snapshot of the tenant, live or not, and how
// it ended: removed by retention, released by someone (and why), not taken,
// reverted, or shared with a retry. Where an auditor sees "a rollback point was
// taken before each change and released once it was checked".
//
// Read-only. The decisions on live snapshots (extend, release, revert) stay in
// RollbackPointsPanel, which this tab renders right above.

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SectionPaper from "../common/SectionPaper";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { formatDate } from "../../utils/format";
import { listSnapshotHistory } from "../../api/patchManagement";
import {
  HISTORY_FILTERS,
  filterCount,
  historyStatus,
  lifetimeText,
  protectsText,
  verificationSummary,
} from "./snapshotHistory";

const PAGE = 50;

// Same palette as the decision list: fill from ROLE.*, text from *Text.
const TONE = {
  critical: { bg: ROLE.criticalSoft, fg: BRAND.alert.errorText },
  caution: { bg: ROLE.cautionSoft, fg: BRAND.alert.warningText },
  info: { bg: BRAND.tealSoft, fg: BRAND.tealText },
  neutral: { bg: BRAND.surfaceMuted, fg: BRAND.dark },
  muted: { bg: BRAND.surfaceMuted, fg: BRAND.gray },
};

function ToneChip({ label, tone, title }) {
  const t = TONE[tone] ?? TONE.neutral;
  const chip = <Chip size="small" label={label} sx={{ height: 22, fontSize: TEXT.xs, fontWeight: 700, bgcolor: t.bg, color: t.fg }} />;
  return title ? (
    <Tooltip title={title} arrow>
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}

export default function SnapshotHistoryPanel({ refreshNonce = 0 }) {
  const [filter, setFilter] = React.useState("all");
  const [gateway, setGateway] = React.useState("");
  const [items, setItems] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [counts, setCounts] = React.useState(null);
  const [gateways, setGateways] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const fetchPage = React.useCallback(
    (offset) => listSnapshotHistory({ status: filter, gatewayDeviceId: gateway || undefined, limit: PAGE, offset }),
    [filter, gateway]
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPage(0);
      setItems(Array.isArray(res?.items) ? res.items : []);
      setTotal(Number(res?.total) || 0);
      setCounts(res?.counts ?? null);
      setGateways(Array.isArray(res?.gateways) ? res.gateways : []);
    } catch (err) {
      setError(err?.body?.message || err?.message || "Could not load the snapshot history.");
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  React.useEffect(() => {
    load();
  }, [load, refreshNonce]);

  const loadMore = async () => {
    setLoading(true);
    try {
      const res = await fetchPage(items.length);
      setItems((prev) => [...prev, ...(Array.isArray(res?.items) ? res.items : [])]);
    } catch (err) {
      setError(err?.body?.message || err?.message || "Could not load more.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>History</Typography>
        <Box sx={{ flex: 1 }} />
        <Button onClick={load} startIcon={<RefreshOutlinedIcon />} sx={{ textTransform: "none", color: BRAND.gray }}>
          Refresh
        </Button>
      </Stack>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1.5 }}>
        Every snapshot taken before a patch or a software deployment, and how it ended — with what the change looked like
        afterwards.
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1 }} role="group" aria-label="Filter by status">
        {HISTORY_FILTERS.map((f) => {
          const n = filterCount(counts, f.value);
          const on = filter === f.value;
          return (
            <Chip
              key={f.value}
              label={n == null ? f.label : `${f.label} · ${n}`}
              onClick={() => setFilter(f.value)}
              aria-pressed={on}
              sx={{
                fontWeight: 700,
                fontSize: TEXT.xs,
                bgcolor: on ? BRAND.teal : BRAND.surfaceMuted,
                color: on ? "#fff" : BRAND.dark,
                "&:hover": { bgcolor: on ? BRAND.tealHover : BRAND.darkSoft },
              }}
            />
          );
        })}
        {gateways.length > 1 ? (
          <TextField select size="small" label="Gateway" value={gateway} onChange={(e) => setGateway(e.target.value)} sx={{ minWidth: 200 }}>
            <MenuItem value="">All gateways</MenuItem>
            {gateways.map((g) => (
              <MenuItem key={g.deviceId} value={g.deviceId}>
                {g.name || g.deviceId}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
      </Stack>

      {error ? (
        <Typography role="alert" sx={{ color: BRAND.alert.errorText, fontSize: TEXT.sm, mb: 1 }}>
          {error}
        </Typography>
      ) : null}

      {loading && items.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={26} sx={{ color: BRAND.teal }} />
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ p: 3, textAlign: "center", color: BRAND.gray, fontSize: TEXT.sm }}>
          {filter === "all"
            ? "No snapshots yet. They appear here once a virtual-infrastructure gateway takes one before a patch or a deployment."
            : "No snapshots match this filter."}
        </Box>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label="Snapshot history">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Server</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Before</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Requested</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>After the change</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Lifetime</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((e) => {
                const st = historyStatus(e);
                const ver = verificationSummary(e.jobs);
                return (
                  <TableRow key={e.id} hover>
                    <TableCell>
                      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>{e.hostname || e.deviceId}</Typography>
                      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
                        {[e.vmMoref, e.gatewayName].filter(Boolean).join(" · ")}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: TEXT.sm }}>{protectsText(e)}</TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>{formatDate(e.requestedAt)}</Typography>
                      {e.requestedBy ? (
                        <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>by {e.requestedByEmail || e.requestedBy}</Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                        <ToneChip label={st.label} tone={st.tone} title={st.detail || undefined} />
                        {e.revert ? (
                          <ToneChip
                            label={e.revert.status === "reverted" ? "Reverted" : "Revert failed"}
                            tone={e.revert.status === "reverted" ? "caution" : "critical"}
                            title={e.revert.detail || undefined}
                          />
                        ) : null}
                      </Stack>
                      {st.detail && (e.stage === "removed" || e.stage === "failed") ? (
                        <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 0.5 }}>{st.detail}</Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>{ver ? <ToneChip label={ver.label} tone={ver.tone} /> : <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>—</Typography>}</TableCell>
                    <TableCell sx={{ fontSize: TEXT.sm, whiteSpace: "nowrap" }}>{lifetimeText(e)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      {items.length < total ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 1.5 }}>
          <Button onClick={loadMore} disabled={loading} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}>
            {loading ? "Loading…" : `Show more (${total - items.length} left)`}
          </Button>
        </Box>
      ) : null}
    </SectionPaper>
  );
}
