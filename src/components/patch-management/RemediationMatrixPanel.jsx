// src/components/patch-management/RemediationMatrixPanel.jsx
//
// The remediation matrix with its evidence, and the button that produces it.
//
// This is the answer to "can the agent actually fix this?" — one row per
// handler, per platform, with two separate columns that must never be merged:
//
//   Plumbing   the latest dry_run: did the agent read the state on a real
//              device and ack it structurally? Proves whitelist → IPC →
//              privsvc reader → ack → reducer → result row. Changes nothing.
//   Fix        an apply that changed an SCP verdict in the field. Curated in
//              the backend matrix with a note; not derived from a counter.
//
// Until 2026-09-01 the Baselines tab said "auto coming soon" about the only
// handler ever validated by campaign, and 10 of 12 handlers had never run
// anywhere. Nobody was lying; there was simply nowhere to look. This is
// where to look.
//
// "Run dry-run validation" launches one dry_run per remediable handler on one
// device per platform. A dry run reads state and acks it — it never calls
// pmp.remediate. Still gated like /remediate (PMP entitlement + admin): it is
// work dispatched to the fleet.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { BRAND, TEXT, ROLE } from "../../theme/brand";
import { getRemediationMatrix, validateRemediationMatrix } from "../../api/patchManagement";

const PLATFORMS = [
  { key: "windows", label: "Windows" },
  { key: "linux", label: "Linux" },
  { key: "macos", label: "macOS" },
];

/** Same fallbacks GatewayDialog uses: the device list is not one shape. */
const idOf = (d) => d?.deviceId ?? d?.agentId ?? "";
const nameOf = (d) => d?.hostname || d?.host || idOf(d);
const platformOf = (d) => String(d?.platform || d?.osPlatform || d?.os || "").toLowerCase();

function matchesPlatform(d, key) {
  const p = platformOf(d);
  if (key === "windows") return p.startsWith("win");
  if (key === "macos") return p.startsWith("mac") || p === "darwin";
  if (key === "linux") return p.startsWith("linux");
  return false;
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "");

/** The plumbing column: what the last dry run says, in words. */
export function describeDryRun(evidence, validatedAnywhere) {
  const d = evidence?.dryRun;
  if (!d) {
    return validatedAnywhere
      ? { tone: "info", label: "Verified elsewhere", hint: "A dry run succeeded in another tenant. Not yet run here." }
      : { tone: "muted", label: "Never run", hint: "No dry run has exercised this handler on any device." };
  }
  if (d.verified) {
    const what = d.outcome === "dryrun_already_compliant" ? "already compliant" : "would apply";
    return { tone: "ok", label: `Read OK · ${what}`, hint: `${fmt(d.at)} on ${d.deviceId}` };
  }
  if (!d.hasState) {
    // The 14-Aug shape: an outcome inferred from an exit code, nothing read.
    return { tone: "warn", label: "Acked without state", hint: `The agent answered but sent no state — an outcome with nothing behind it. ${fmt(d.at)}` };
  }
  return { tone: "error", label: d.outcome, hint: `${fmt(d.at)} on ${d.deviceId}` };
}

const TONE = {
  ok: { bg: BRAND.tealSoft, fg: BRAND.tealText },
  info: { bg: BRAND.surfaceMuted, fg: BRAND.tealText },
  muted: { bg: BRAND.surfaceMuted, fg: BRAND.gray },
  warn: { bg: ROLE.cautionSoft, fg: ROLE.caution },
  error: { bg: ROLE.criticalSoft, fg: ROLE.critical },
};

export default function RemediationMatrixPanel({ canManage = false, devices = [], notify }) {
  const [state, setState] = React.useState({ loading: true, rows: [], error: null });
  const [picked, setPicked] = React.useState({ windows: "", linux: "", macos: "" });
  const [running, setRunning] = React.useState(false);
  const [lastRun, setLastRun] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      const res = await getRemediationMatrix();
      setState({ loading: false, rows: Array.isArray(res?.rows) ? res.rows : [], error: null });
    } catch (err) {
      setState({ loading: false, rows: [], error: err?.body?.message || err?.message || "Could not load the matrix." });
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const byPlatform = React.useMemo(
    () => Object.fromEntries(PLATFORMS.map((p) => [p.key, devices.filter((d) => matchesPlatform(d, p.key))])),
    [devices]
  );

  const anyPicked = Object.values(picked).some(Boolean);

  const run = async () => {
    setRunning(true);
    try {
      const chosen = Object.fromEntries(Object.entries(picked).filter(([, v]) => Boolean(v)));
      const res = await validateRemediationMatrix(chosen);
      setLastRun(res);
      notify?.(
        "success",
        `${res.launched?.length ?? 0} dry runs queued` +
          (res.failed?.length ? `, ${res.failed.length} could not be created` : "") +
          ". Results land here as each agent answers."
      );
    } catch (err) {
      notify?.("error", err?.body?.message || err?.message || "Could not launch the validation.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Box>
      <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
        Remediation matrix
      </Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 0.5, mb: 2 }}>
        What the agent can fix, per platform — and whether anyone has seen it work.
        <strong> Plumbing</strong> is the latest dry run: the agent read the state on a
        real device and reported it, without changing anything. <strong>Fix</strong> is an
        apply that changed a compliance verdict in the field.
      </Typography>

      {canManage && (
        <Box
          sx={{
            border: `1px solid ${BRAND.border}`, borderRadius: 1, p: 1.5, mb: 2,
            bgcolor: BRAND.surfaceMuted, display: "grid", gap: 1.25,
          }}
        >
          <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>
            Run dry-run validation
          </Typography>
          <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
            Pick one device per platform. Each remediable handler gets one dry run there —
            it reads state and reports it, and never calls the remediator.
          </Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.25}>
            {PLATFORMS.map((p) => (
              <TextField
                key={p.key}
                select
                size="small"
                label={p.label}
                value={picked[p.key]}
                onChange={(e) => setPicked((s) => ({ ...s, [p.key]: e.target.value }))}
                sx={{ minWidth: 220 }}
                helperText={byPlatform[p.key].length === 0 ? "No known device" : ""}
              >
                <MenuItem value="">(skip)</MenuItem>
                {byPlatform[p.key].map((d) => (
                  <MenuItem key={idOf(d)} value={idOf(d)}>{nameOf(d)}</MenuItem>
                ))}
              </TextField>
            ))}
          </Stack>
          <Box>
            <Button variant="contained" onClick={run} disabled={!anyPicked || running}>
              {running ? "Queuing…" : "Run dry-run validation"}
            </Button>
          </Box>
          {lastRun && (
            <Alert severity={lastRun.failed?.length ? "warning" : "info"} onClose={() => setLastRun(null)}>
              {lastRun.launched?.length ?? 0} queued
              {lastRun.skipped?.length ? ` · ${lastRun.skipped.length} skipped` : ""}
              {lastRun.failed?.length ? ` · ${lastRun.failed.length} failed to create` : ""}
              {lastRun.failed?.length ? (
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2, fontSize: TEXT.xs }}>
                  {lastRun.failed.map((f) => (
                    <li key={f.handlerId}>{f.handlerId}: {f.error}</li>
                  ))}
                </Box>
              ) : null}
            </Alert>
          )}
        </Box>
      )}

      {state.loading ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
          <CircularProgress size={16} sx={{ color: BRAND.teal }} />
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>Loading the matrix…</Typography>
        </Stack>
      ) : state.error ? (
        <Alert severity="warning">{state.error}</Alert>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Box component="table" sx={{ borderCollapse: "collapse", width: "100%", fontSize: TEXT.sm }}>
            <Box component="thead">
              <Box component="tr" sx={{ textAlign: "left", color: BRAND.gray, fontSize: TEXT.xs }}>
                {["Platform", "Capability", "Handler", "Via", "Plumbing (dry run)", "Fix (apply)"].map((h) => (
                  <Box key={h} component="th" sx={{ p: 1, borderBottom: `1px solid ${BRAND.border}`, fontWeight: 700 }}>{h}</Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {state.rows.map((r) => {
                const dry = describeDryRun(r.evidence, r.validatedAnywhere);
                const tone = TONE[dry.tone] || TONE.muted;
                return (
                  <Box component="tr" key={r.handlerId} sx={{ borderBottom: `1px solid ${BRAND.border}` }}>
                    <Box component="td" sx={{ p: 1 }}>{r.platform}</Box>
                    <Box component="td" sx={{ p: 1, fontWeight: 700, color: BRAND.dark }}>{r.capability}</Box>
                    <Box component="td" sx={{ p: 1, fontFamily: "monospace", fontSize: TEXT.xs }}>{r.handlerId}</Box>
                    <Box component="td" sx={{ p: 1 }}>
                      <Stack direction="row" spacing={0.5}>
                        {r.support === "read_only" ? (
                          <Chip size="small" label="read-only" sx={{ height: 20, fontSize: TEXT.xs }} />
                        ) : (
                          <>
                            {r.viaCampaign && <Chip size="small" label="campaign" sx={{ height: 20, fontSize: TEXT.xs }} />}
                            {r.viaPolicy && <Chip size="small" label="policy auto" sx={{ height: 20, fontSize: TEXT.xs }} />}
                          </>
                        )}
                      </Stack>
                    </Box>
                    <Box component="td" sx={{ p: 1 }}>
                      {r.support === "read_only" ? (
                        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>n/a</Typography>
                      ) : (
                        <Tooltip title={dry.hint} arrow>
                          <Chip size="small" label={dry.label} sx={{ height: 20, fontSize: TEXT.xs, bgcolor: tone.bg, color: tone.fg, fontWeight: 700 }} />
                        </Tooltip>
                      )}
                    </Box>
                    <Box component="td" sx={{ p: 1 }}>
                      {r.verifiedAt ? (
                        <Tooltip title={r.verifiedNote || ""} arrow>
                          <Chip size="small" label={`Verified ${r.verifiedAt}`} sx={{ height: 20, fontSize: TEXT.xs, bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700 }} />
                        </Tooltip>
                      ) : r.support === "read_only" ? (
                        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>n/a</Typography>
                      ) : (
                        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>Not seen</Typography>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
