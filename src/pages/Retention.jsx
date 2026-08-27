// src/pages/Retention.jsx
//
// U1 — admin-facing surface for the per-tenant retention policy. Drills
// out of the "Database retention" card on Settings.
//
// Three panels:
//   1. Status — policy on/off + last-run audit.
//   2. Live sizes — current row counts + bytes per audit/snapshot
//      table, refreshed on demand.
//   3. Days-per-table editor — partial-update PUT to /retention/policy.
//      Dry-run preview button below the editor before committing.
//
// Why a single dense page instead of three navigation steps: retention
// is operationally one decision ("how much history do we keep, where
// is it growing, did the worker actually run yesterday?"). Splitting
// that into three pages would force the operator to chase the answer
// across screens.

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";

import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import {
  getRetentionStats,
  updateRetentionPolicy,
  runRetention,
} from "../api/retention";
import { BRAND, ROLE, TEXT } from "../theme/brand";
import { formatBytes } from "../utils/format";

// Bind each policy field to:
//   * the matching `sizes.perTable[].table` row (so the editor and the
//     live-sizes panel render in the same order — easier to scan),
//   * a human label,
//   * a tooltip explaining the trade-off,
//   * the underlying SQL CHECK range — UI clamp matches the constraint
//     so the operator gets the error inline rather than after PUT.
const FIELDS = [
  {
    key: "factsEventsDays",
    table: "facts_events",
    label: "Facts events",
    hint: "Raw per-device telemetry stream. Highest-churn table — most tenants keep 14-60 days.",
    min: 1,
    max: 730,
  },
  {
    key: "hardwareInventoryDays",
    table: "hardware_inventory",
    label: "Hardware inventory snapshots",
    hint: "Per-device hardware snapshot history. Lower churn — 90d is the default.",
    min: 1,
    max: 730,
  },
  {
    key: "softwareInventoryDays",
    table: "software_inventory",
    label: "Software inventory snapshots",
    hint: "Per-device app inventory history. The 'delta' column is reconstructed from these, so going below 90d will shorten the change-events timeline.",
    min: 1,
    max: 730,
  },
  {
    key: "securityComplianceSnapshotDays",
    table: "security_compliance_snapshot",
    label: "Compliance snapshots",
    hint: "SCP snapshots — drive the per-device score trend chart. 90d gives operators a quarter of history.",
    min: 1,
    max: 730,
  },
  {
    key: "patchManagementSnapshotDays",
    table: "patch_management_snapshot",
    label: "Patch snapshots",
    hint: "PMP snapshots — agent-side. Lower than compliance because the live device state is the source of truth and old snapshots rarely get queried.",
    min: 1,
    max: 730,
  },
  {
    key: "inventoryChangeEventsDays",
    table: "inventory_change_events",
    label: "Software change events",
    hint: "Append-only audit of install / uninstall / version-bump events. Often the longest-retained table because compliance audits look back 12 months.",
    min: 1,
    max: 1825,
  },
  // ── Software Delivery (SDP) — control-DB tables. Blank = never (opt-in). ──
  {
    key: "sdpInstallResultsDays",
    table: "software_install_results",
    label: "SDP install-result forensics",
    hint: "Blanks the per-device detection snapshots (before/after) on terminal install results past this age. The result row + deployment rollup stay — only the bulky forensic JSON is dropped. Blank = keep forever.",
    min: 1,
    max: 3650,
  },
  {
    key: "sdpIntakesRejectedDays",
    table: "software_package_intakes",
    label: "SDP rejected/blocked intakes",
    hint: "Deletes blocked or rejected AI-intake uploads (and their stored binaries) past this age — they never become catalog entries. Approved/pending uploads are never touched. Blank = keep forever.",
    min: 1,
    max: 3650,
  },
  {
    key: "sdpDeploymentSnapshotDays",
    table: "software_deployments",
    label: "SDP deployment snapshots",
    hint: "Trims the frozen package-snapshot JSON on terminal deployments past this age (the live package still lives in the catalog). The deployment + its counts stay. Blank = keep forever.",
    min: 1,
    max: 3650,
  },
  // ── Remote Control (RCP) — tenant-DB audit. Blank = never (opt-in). ──
  // Two windows because the content and the ledger age differently; see
  // modules/db/migrations/20260728_retention_rcp.sql.
  {
    key: "rcpTranscriptDays",
    table: "remote_session_io",
    label: "Remote session transcripts",
    hint: "Recorded terminal output of remote shell sessions — the biggest-growing RCP table, and the one that can contain whatever an operator happened to print on screen. Deleting a transcript keeps its session in the history. Blank = keep forever.",
    min: 1,
    max: 3650,
  },
  {
    key: "rcpSessionsDays",
    table: "remote_sessions",
    label: "Remote session history",
    hint: "Who connected to which device, when, and which files moved. A few hundred bytes per session — usually kept far longer than the transcripts. Deleting a session also removes its transcript and file-transfer records. Blank = keep forever.",
    min: 1,
    max: 3650,
  },
  // ── Audit trail — control DB. Blank = never (opt-in). ──
  {
    key: "securityEventsDays",
    table: "security_events",
    label: "Audit trail",
    hint: "Everything the Audit page shows: enrollments, policy pushes, rejected connections, security-drift outcomes. This is compliance evidence, so it has no window until you set one. Connections that were rejected before we could identify the tenant have no tenant to attribute them to and are never swept by this. Blank = keep forever.",
    min: 1,
    max: 3650,
  },
];

function formatRows(n) {
  if (!Number.isFinite(n) || n < 0) return "—";
  return n.toLocaleString();
}

function formatTimestamp(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleString();
}

export default function Retention({ onNavigate }) {
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [draft, setDraft] = React.useState({}); // per-field local edits
  const [enabledDraft, setEnabledDraft] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [dryRun, setDryRun] = React.useState(null);
  const [dryRunBusy, setDryRunBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getRetentionStats();
      setStats(res);
      // Reset drafts to match the freshly-loaded server state so we
      // don't surprise the operator with edits left over from a
      // previous load.
      setDraft({});
      setEnabledDraft(null);
    } catch (e) {
      console.error("retention stats fetch failed:", e);
      setError(e?.message || "Failed to load retention stats");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const policy = stats?.policy ?? null;
  const sizes = stats?.sizes ?? null;
  // perTable comes back as an array; convert to a lookup so the
  // editor rows can index into it without an O(n) scan per row.
  const sizesByTable = React.useMemo(() => {
    const m = new Map();
    for (const row of sizes?.perTable ?? []) m.set(row.table, row);
    return m;
  }, [sizes]);
  const totalBytes = React.useMemo(
    () =>
      (sizes?.perTable ?? []).reduce(
        (acc, r) => acc + (Number.isFinite(r.sizeBytes) ? r.sizeBytes : 0),
        0
      ),
    [sizes]
  );

  const isEnabled = enabledDraft != null ? enabledDraft : !!policy?.enabled;
  const isDirty =
    Object.keys(draft).length > 0 || (enabledDraft != null && enabledDraft !== !!policy?.enabled);

  function effectiveValue(field) {
    if (draft[field.key] !== undefined) return draft[field.key];
    return policy?.[field.key] ?? null;
  }

  function handleField(field, raw) {
    const num = raw === "" ? null : Number(raw);
    setDraft((d) => ({ ...d, [field.key]: num }));
  }

  function discardChanges() {
    setDraft({});
    setEnabledDraft(null);
    setDryRun(null);
  }

  async function handleSave() {
    if (!policy) return;
    try {
      setSaving(true);
      setError("");

      // Build the partial patch — only fields whose value differs from
      // the server state are sent. Avoids surfacing CHECK errors on
      // fields the operator didn't even touch.
      const patch = {};
      for (const field of FIELDS) {
        if (draft[field.key] !== undefined && draft[field.key] !== policy[field.key]) {
          // Clamp inside the documented range so the backend doesn't
          // 400 us. SQL CHECK enforces these too — UI clamp is just a
          // friendlier first line of defense.
          const v = draft[field.key];
          if (v == null) continue;
          const clamped = Math.max(field.min, Math.min(field.max, v));
          patch[field.key] = clamped;
        }
      }
      if (enabledDraft != null && enabledDraft !== !!policy.enabled) {
        patch.enabled = enabledDraft;
      }

      const res = await updateRetentionPolicy(patch);
      // Updated policy is returned inline — refresh stats so the live
      // sizes panel and the audit timestamps come back up to date.
      setStats((s) => ({ ...(s || {}), policy: res?.policy ?? s?.policy }));
      setDraft({});
      setEnabledDraft(null);
      // Trigger a sizes refresh in the background so the operator sees
      // the new policy reflected without a manual refresh.
      load();
    } catch (e) {
      console.error("retention policy save failed:", e);
      setError(e?.body?.detail || e?.message || "Failed to save retention policy");
    } finally {
      setSaving(false);
    }
  }

  async function handleDryRun() {
    try {
      setDryRunBusy(true);
      setError("");
      const res = await runRetention({ dryRun: true });
      setDryRun(res?.result ?? null);
    } catch (e) {
      console.error("retention dry-run failed:", e);
      setError(e?.message || "Dry-run failed");
    } finally {
      setDryRunBusy(false);
    }
  }

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Database retention"
        subtitle="Per-tenant cleanup policy for high-volume audit and snapshot tables."
        icon={<StorageOutlinedIcon />}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            {onNavigate ? (
              <Button
                size="small"
                variant="text"
                onClick={() => onNavigate("configurations")}
                sx={{ color: BRAND.gray }}
              >
                ← Settings
              </Button>
            ) : null}
            <Tooltip title="Refresh stats">
              <span>
                <IconButton
                  aria-label="Refresh"
                  onClick={load}
                  disabled={loading}
                  size="small"
                  aria-label="refresh retention stats"
                >
                  <RefreshOutlinedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        }
      />

      {error ? (
        <Typography sx={{ color: ROLE.critical, mb: 2 }}>{error}</Typography>
      ) : null}

      {loading && !stats ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: BRAND.teal }} />
        </Box>
      ) : !policy ? (
        <Typography sx={{ color: BRAND.gray }}>
          No retention policy is configured for this tenant.
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {/* Status + sizes summary */}
          <Grid size={{ xs: 12, md: 5 }}>
            <SectionPaper variant="panel" sx={{ p: 2.5, height: "100%" }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>
                    Cleanup worker
                  </Typography>
                  <Typography sx={{ fontSize: TEXT["3xl"], fontWeight: 800, color: BRAND.dark, lineHeight: 1.1, mt: 0.5 }}>
                    {isEnabled ? "Enabled" : "Paused"}
                  </Typography>
                </Box>
                <Switch
                  checked={isEnabled}
                  onChange={(e) => setEnabledDraft(e.target.checked)}
                  color="primary"
                />
              </Stack>
              <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mt: 0.5 }}>
                {isEnabled
                  ? "The retention worker runs nightly. Rows older than the per-table windows below are deleted."
                  : "Cleanup is paused. Tables grow until re-enabled."}
              </Typography>

              <Divider sx={{ my: 2, borderColor: BRAND.border }} />

              <Stack spacing={1}>
                <Box>
                  <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 600 }}>
                    Last run
                  </Typography>
                  <Typography variant="body2" sx={{ color: BRAND.dark }}>
                    {formatTimestamp(policy.lastRunAtUtc) ?? "— never run yet"}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 600 }}>
                    Rows deleted (last run)
                  </Typography>
                  <Typography variant="body2" sx={{ color: BRAND.dark }}>
                    {formatRows(Number(policy.lastRunDeletedTotal ?? 0))}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 600 }}>
                    Current total size
                  </Typography>
                  <Typography variant="body2" sx={{ color: BRAND.dark }}>
                    {formatBytes(totalBytes)}
                    {sizes?.tenantDb ? (
                      <Typography component="span" variant="caption" sx={{ color: BRAND.gray, ml: 0.5 }}>
                        ({sizes.tenantDb})
                      </Typography>
                    ) : null}
                  </Typography>
                </Box>
              </Stack>

              <Divider sx={{ my: 2, borderColor: BRAND.border }} />

              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip
                  size="small"
                  label={`Preserve baseline: ${policy.preserveBaseline ? "yes" : "no"}`}
                  sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 600, fontSize: TEXT.xs }}
                />
                <Chip
                  size="small"
                  label={`Preserve latest: ${policy.preserveLatest ? "yes" : "no"}`}
                  sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 600, fontSize: TEXT.xs }}
                />
                <Chip
                  size="small"
                  label={`Batch: ${formatRows(Number(policy.batchSize ?? 0))}`}
                  sx={{ bgcolor: BRAND.darkSoft, color: BRAND.dark, fontWeight: 600, fontSize: TEXT.xs }}
                />
              </Stack>
            </SectionPaper>
          </Grid>

          {/* Per-table editor + live sizes */}
          <Grid size={{ xs: 12, md: 7 }}>
            <SectionPaper variant="panel" sx={{ p: 2.5, height: "100%" }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Typography sx={{ fontSize: TEXT.base, fontWeight: 700, color: BRAND.dark }}>
                  Per-table retention windows
                </Typography>
                {isDirty ? (
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={discardChanges} disabled={saving}>
                      Discard
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<SaveOutlinedIcon fontSize="small" />}
                      onClick={handleSave}
                      disabled={saving}
                      sx={{ bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealText } }}
                    >
                      Save changes
                    </Button>
                  </Stack>
                ) : null}
              </Stack>

              {saving ? <LinearProgress sx={{ mb: 1.5 }} /> : null}

              <Stack spacing={1.25}>
                {FIELDS.map((field) => {
                  const value = effectiveValue(field);
                  const row = sizesByTable.get(field.table);
                  const isChanged = draft[field.key] !== undefined && draft[field.key] !== policy[field.key];
                  return (
                    <Stack
                      key={field.key}
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.5}
                      alignItems={{ xs: "stretch", sm: "center" }}
                      sx={{
                        py: 1,
                        px: 1,
                        borderRadius: 1,
                        bgcolor: isChanged ? BRAND.tealSoft : "transparent",
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Tooltip title={field.hint} placement="top" arrow>
                          <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600 }}>
                            {field.label}
                          </Typography>
                        </Tooltip>
                        <Typography variant="caption" sx={{ color: BRAND.gray }}>
                          {field.table} · {formatRows(Number(row?.rows ?? -1))} rows ·{" "}
                          {formatBytes(Number(row?.sizeBytes ?? -1))}
                        </Typography>
                      </Box>
                      <TextField
                        size="small"
                        type="number"
                        value={value ?? ""}
                        onChange={(e) => handleField(field, e.target.value)}
                        inputProps={{
                          min: field.min,
                          max: field.max,
                          step: 1,
                          "aria-label": `${field.label} retention days`,
                        }}
                        InputProps={{ endAdornment: <Typography variant="caption" sx={{ color: BRAND.gray }}>days</Typography> }}
                        sx={{ width: { xs: "100%", sm: 140 } }}
                      />
                    </Stack>
                  );
                })}
              </Stack>

              <Divider sx={{ my: 2, borderColor: BRAND.border }} />

              {/* Dry-run preview — counts candidates without deleting */}
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={dryRunBusy ? <CircularProgress size={14} /> : <PlayArrowOutlinedIcon fontSize="small" />}
                  onClick={handleDryRun}
                  disabled={dryRunBusy || isDirty}
                  sx={{ borderColor: BRAND.teal, color: BRAND.teal }}
                >
                  Preview cleanup (dry run)
                </Button>
                {isDirty ? (
                  <Typography variant="caption" sx={{ color: BRAND.gray }}>
                    Save your changes first to preview against the new policy.
                  </Typography>
                ) : null}
              </Stack>

              {dryRun ? (
                <Box
                  sx={{
                    mt: 1,
                    p: 1.5,
                    borderRadius: 1,
                    border: `1px dashed ${BRAND.border}`,
                    bgcolor: BRAND.tealSoft,
                  }}
                >
                  <Typography variant="caption" sx={{ color: BRAND.tealText, fontWeight: 700 }}>
                    DRY RUN — would delete {formatRows(Number(dryRun.totalCandidates ?? 0))} rows
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
                    {Array.isArray(dryRun.perTable)
                      ? dryRun.perTable
                          .filter((r) => Number(r.candidates ?? 0) > 0)
                          .map((r) => (
                            <Chip
                              key={r.table}
                              size="small"
                              label={`${r.table}: ${formatRows(Number(r.candidates))}`}
                              sx={{ bgcolor: BRAND.surface, color: BRAND.dark, fontSize: TEXT.xs }}
                            />
                          ))
                      : null}
                  </Stack>
                </Box>
              ) : null}
            </SectionPaper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
