// src/components/Overview/PluginCoverageStrip.jsx
//
// Compact horizontal stat block that sits inside the Fleet composition
// row and shows "how many of the N enrolled agents have plugin X
// enabled" — one row per plugin. Answers the operator's question "do
// my devices have SCP / PMP / AMP turned on?" without having to drill
// into each device.
//
// Data comes from /api/v1/dashboard/plugin-coverage:
//   { total: 4, byPlugin: [{ plugin: "scp", count: 3 }, ...] }
//
// The layout is a mini progress-bar-per-plugin. We deliberately do NOT
// render it as a donut/pie — the operator cares about "how close to
// 100% is each plugin", a direction that bars convey instantly. Pie
// slices for three separate plugins would force the reader to compare
// arc lengths, which is slower.
//
// Click on a plugin row to open a drill-down dialog listing the actual
// devices that are covered vs. missing — so "PMP 4/10" becomes "show me
// the 6 agents that don't have it" with one click. Drill-down data
// comes from /api/v1/dashboard/plugin-coverage/:plugin/devices and is
// fetched lazily on first open per plugin.

import { useState } from "react";
import {
  Paper,
  Box,
  Stack,
  Typography,
  Skeleton,
  LinearProgress,
  Tooltip,
  ButtonBase,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  Chip,
  Divider,
} from "@mui/material";
import { BRAND, ROLE } from "../../theme/brand";
import AsyncState from "../common/AsyncState";
import { getPluginCoverageDevices } from "../../api/overview";

function getValue(result) {
  if (!result || result.status !== "fulfilled") return null;
  return result.value ?? null;
}

// Plugin display metadata. Ordered intentionally — SCP first because
// it's the compliance-story plugin we surface most, PMP second for
// patching, AMP third for inventory. A plugin the backend reports
// that we don't have metadata for still renders (generic label).
// Covers the whole backend catalog (modules/policies/plugin-catalog.ts):
// amp, scp, pmp, sdp, cdp, rcp. Any key missing here still renders, but
// with a bare uppercase key and no hint of what it does — which is what
// CDP/RCP/SDP looked like before.
const PLUGIN_META = {
  scp: { label: "SCP · Compliance" },
  pmp: { label: "PMP · Patching" },
  amp: { label: "AMP · Inventory" },
  sdp: { label: "SDP · Software" },
  cdp: { label: "CDP · Crypto" },
  rcp: { label: "RCP · Remote" }
};

// Enablement rate color. 100% green, >50% teal, <50% amber, 0% red.
function colorForRate(rate) {
  if (rate >= 1) return ROLE.positive;
  if (rate >= 0.5) return BRAND.teal;
  if (rate > 0) return ROLE.caution;
  return ROLE.critical;
}

function formatRelativeTime(iso) {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export default function PluginCoverageStrip({ result, loading }) {
  const value = getValue(result);
  const total = Number(value?.total ?? 0);
  const byPlugin = Array.isArray(value?.byPlugin) ? value.byPlugin : [];

  const [drillOpen, setDrillOpen] = useState(false);
  const [drillPlugin, setDrillPlugin] = useState(null);
  const [drillLabel, setDrillLabel] = useState("");
  const [drillData, setDrillData] = useState(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState(null);
  const [drillTab, setDrillTab] = useState(0); // 0 = missing, 1 = covered

  const openDrill = async (key, label) => {
    setDrillPlugin(key);
    setDrillLabel(label);
    setDrillData(null);
    setDrillError(null);
    setDrillTab(0); // default to "missing" — that's the actionable list
    setDrillOpen(true);
    setDrillLoading(true);
    try {
      const data = await getPluginCoverageDevices(key);
      setDrillData(data);
    } catch (err) {
      setDrillError(err?.message || "Failed to load device list");
    } finally {
      setDrillLoading(false);
    }
  };

  const closeDrill = () => {
    setDrillOpen(false);
  };

  // Build a row for each known plugin even if the backend omitted it
  // (count = 0). That way the UI is deterministic — always shows SCP,
  // PMP, AMP — and "agent has no plugins on" reads as explicit zeros
  // rather than an empty strip.
  const rows = Object.keys(PLUGIN_META).map((key) => {
    const found = byPlugin.find((r) => String(r.plugin).toLowerCase() === key);
    return {
      key,
      label: PLUGIN_META[key].label,
      count: Number(found?.count ?? 0)
    };
  });

  // Append any unknown plugins the backend reported but we don't have
  // metadata for — they still render with a generic label.
  for (const row of byPlugin) {
    const key = String(row.plugin).toLowerCase();
    if (!PLUGIN_META[key]) {
      rows.push({
        key,
        label: key.toUpperCase(),
        count: Number(row.count ?? 0)
      });
    }
  }

  return (
    <>
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: 2,
          border: `1px solid ${BRAND.border}`,
          height: "100%"
        }}
      >
        <Stack direction="row" alignItems="baseline" sx={{ mb: 1.5, gap: 0.75 }}>
          <Typography
            variant="subtitle2"
            sx={{ color: BRAND.dark, fontWeight: 700 }}
          >
            Plugin coverage
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 500 }}>
            across {total} enrolled
          </Typography>
        </Stack>

        {loading ? (
          <Stack spacing={1}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={22} />
            ))}
          </Stack>
        ) : total === 0 ? (
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            No agents reporting yet.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {rows.map((row) => {
              const rate = total > 0 ? row.count / total : 0;
              const color = colorForRate(rate);
              const missing = total - row.count;
              const tooltipText =
                missing > 0
                  ? `${row.count} of ${total} agents have ${row.key.toUpperCase()} enabled · click to see the ${missing} missing`
                  : `${row.count} of ${total} agents have ${row.key.toUpperCase()} enabled · click for details`;
              return (
                <Tooltip
                  key={row.key}
                  title={tooltipText}
                  placement="top"
                  arrow
                >
                  <ButtonBase
                    onClick={() => openDrill(row.key, row.label)}
                    focusRipple
                    sx={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      borderRadius: 1,
                      p: 0.5,
                      mx: -0.5,
                      transition: "background-color 120ms ease",
                      "&:hover": { backgroundColor: BRAND.surfaceMuted },
                      "&:focus-visible": {
                        outline: `2px solid ${BRAND.teal}`,
                        outlineOffset: 2
                      }
                    }}
                  >
                    <Box sx={{ width: "100%" }}>
                      <Stack
                        direction="row"
                        alignItems="baseline"
                        justifyContent="space-between"
                        sx={{ mb: 0.25 }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ color: BRAND.dark, fontWeight: 600, fontSize: 12.5 }}
                        >
                          {row.label}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color, fontWeight: 700 }}
                        >
                          {row.count}/{total}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={Math.round(rate * 100)}
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          bgcolor: BRAND.surfaceMuted,
                          "& .MuiLinearProgress-bar": {
                            backgroundColor: color,
                            borderRadius: 3
                          }
                        }}
                      />
                    </Box>
                  </ButtonBase>
                </Tooltip>
              );
            })}
          </Stack>
        )}
      </Paper>

      <PluginCoverageDrillDialog
        open={drillOpen}
        onClose={closeDrill}
        plugin={drillPlugin}
        label={drillLabel}
        data={drillData}
        loading={drillLoading}
        error={drillError}
        tab={drillTab}
        onTabChange={setDrillTab}
      />
    </>
  );
}

function PluginCoverageDrillDialog({
  open,
  onClose,
  plugin,
  label,
  data,
  loading,
  error,
  tab,
  onTabChange
}) {
  const covered = Array.isArray(data?.covered) ? data.covered : [];
  const missing = Array.isArray(data?.missing) ? data.missing : [];
  const list = tab === 0 ? missing : covered;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="baseline" spacing={1}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: BRAND.dark }}>
            {label || (plugin ? plugin.toUpperCase() : "Plugin coverage")}
          </Typography>
          {data && (
            <Typography variant="caption" sx={{ color: BRAND.gray }}>
              {data.coveredCount}/{data.total} covered
            </Typography>
          )}
        </Stack>
      </DialogTitle>

      <Tabs
        value={tab}
        onChange={(_e, v) => onTabChange(v)}
        sx={{
          px: 3,
          borderBottom: `1px solid ${BRAND.border}`,
          minHeight: 36,
          "& .MuiTab-root": { minHeight: 36, textTransform: "none" }
        }}
      >
        <Tab
          label={
            <Stack direction="row" spacing={1} alignItems="center">
              <span>Missing</span>
              <Chip
                size="small"
                label={data?.missingCount ?? "—"}
                sx={{
                  height: 18,
                  fontSize: 11,
                  bgcolor:
                    (data?.missingCount ?? 0) > 0 ? ROLE.caution : BRAND.surfaceMuted,
                  color:
                    (data?.missingCount ?? 0) > 0 ? BRAND.surface : BRAND.gray
                }}
              />
            </Stack>
          }
        />
        <Tab
          label={
            <Stack direction="row" spacing={1} alignItems="center">
              <span>Covered</span>
              <Chip
                size="small"
                label={data?.coveredCount ?? "—"}
                sx={{
                  height: 18,
                  fontSize: 11,
                  bgcolor:
                    (data?.coveredCount ?? 0) > 0 ? ROLE.positive : BRAND.surfaceMuted,
                  color:
                    (data?.coveredCount ?? 0) > 0 ? BRAND.surface : BRAND.gray
                }}
              />
            </Stack>
          }
        />
      </Tabs>

      <DialogContent sx={{ p: 0, minHeight: 220 }}>
        <AsyncState
          loading={loading}
          error={error}
          isEmpty={list.length === 0}
          emptyText={
            tab === 0
              ? "No devices missing this plugin. 🎉"
              : "No devices reporting this plugin yet."
          }
          minHeight={200}
        >
          <List dense disablePadding>
            {list.map((dev, idx) => (
              <Box key={dev.agentId}>
                {idx > 0 && <Divider component="li" />}
                <ListItem sx={{ py: 1, px: 3 }}>
                  <ListItemText
                    primary={
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, color: BRAND.dark }}
                        >
                          {dev.hostname || dev.agentId}
                        </Typography>
                        {dev.platform && (
                          <Chip
                            size="small"
                            label={dev.platform}
                            sx={{
                              height: 18,
                              fontSize: 10.5,
                              bgcolor: BRAND.surfaceMuted,
                              color: BRAND.dark
                            }}
                          />
                        )}
                      </Stack>
                    }
                    secondary={
                      <Stack
                        direction="row"
                        spacing={1.5}
                        sx={{ mt: 0.25 }}
                        component="span"
                      >
                        <Typography
                          variant="caption"
                          sx={{ color: BRAND.gray, fontFamily: "monospace" }}
                          component="span"
                        >
                          {dev.agentId.slice(0, 8)}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: BRAND.gray }}
                          component="span"
                        >
                          last seen {formatRelativeTime(dev.lastSeenAt)}
                        </Typography>
                      </Stack>
                    }
                  />
                </ListItem>
              </Box>
            ))}
          </List>
        </AsyncState>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} variant="text">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
