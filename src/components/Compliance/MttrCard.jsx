// src/components/Compliance/MttrCard.jsx
//
// Sprint 5 — visualises the time-to-close endpoint
// (`GET /security/compliance/time-to-close`). One row per severity
// bucket, showing p50/p90 in days plus the sample size we computed
// it from. The sample-size column matters because percentiles on
// fewer than ~5 remediated findings are statistical noise; we render
// those buckets faded so operators don't read "p50: 0.3 days" as a
// signal when it's really "we've fixed 1 critical this quarter".
//
// 2026-09-01 — the endpoint now counts only findings that closed as
// 'pass' (actually remediated) AND that lived longer than one
// evaluation cycle. Sample sizes here dropped by roughly 80% and the
// medians grew from hours to days; that is the correction, not a
// regression. Copy in this card was rewritten to match what the
// number means, and the discarded sub-cycle closures are shown as a
// footnote rather than swallowed — they are the fingerprint of a
// flapping check, which is worth seeing.
//
// Place in the SCP page right under the framework table — operators
// who land on the page wanting "are we trending better?" see this
// before they scroll to per-device drill-down.
//
// Self-contained: own loading + error states, own window selector,
// no need for the parent to wire refresh logic. The SCP page just
// mounts it and forgets.

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Typography,
  Select,
  MenuItem,
  Skeleton,
  Alert,
  Tooltip
} from "@mui/material";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";

import { getTimeToCloseSummary } from "../../api/compliance";
import { BRAND, ICON } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";

// Window options match what we offer in fleet-timeseries — 7d/30d/90d
// is the standard SaaS spread; auditors typically want 90d so we
// default there.
const WINDOW_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" }
];

// Below this sample count, percentiles aren't trustworthy. We still
// render them but fade them — operators see the bucket exists,
// they just understand the number is noisy.
const SAMPLE_SIZE_NOISY_BELOW = 5;

// Canonical severity scale (theme/severity.js) — was High=amber, Medium=teal.
const SEVERITY_META = {
  critical: { label: "Critical", color: severityMeta("critical").fg },
  high:     { label: "High",     color: severityMeta("high").fg },
  medium:   { label: "Medium",   color: severityMeta("medium").fg },
  low:      { label: "Low",      color: severityMeta("low").fg }
};

// Renderer for a percentile value:
//   - null    → "—" (no closed findings in window)
//   - < 1 day → "<1d" (a control fixed within the same day)
//   - else    → integer-rounded days, "Nd"
function fmtDays(d) {
  if (d == null || !Number.isFinite(d)) return "—";
  if (d < 1) return "<1d";
  return `${Math.round(d)}d`;
}

// `reloadKey` — see ComplianceTrendChart; lets the page-level refresh
// reach this widget (Sprint 2 item 4).
export default function MttrCard({ reloadKey } = {}) {
  const [windowDays, setWindowDays] = useState(90);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // The set-state-in-effect rule flags this synchronous pre-fetch
    // state nudge, but it's the canonical "kick off async data
    // load" pattern React docs explicitly bless. Suppressing on
    // the next two lines so the rule still catches genuine
    // problems elsewhere.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    getTimeToCloseSummary({ windowDays })
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) {
          setData(res.summary ?? null);
        } else {
          setError(res?.message || "Failed to load time-to-close data.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [windowDays, reloadKey]);

  // The endpoint returns one row per severity that has closures.
  // We render a FIXED set of buckets (critical/high/medium/low) and
  // fill in empty rows for the ones that didn't come back, so the
  // operator sees the absence explicitly rather than wondering
  // "where's medium?".
  const rows = useMemo(() => {
    const bySeverity = new Map();
    for (const b of data?.bySeverity ?? []) bySeverity.set(b.severity, b);
    return ["critical", "high", "medium", "low"].map(
      (sev) =>
        bySeverity.get(sev) ?? {
          severity: sev,
          sampleSize: 0,
          churnExcluded: 0,
          medianDays: null,
          p90Days: null
        }
    );
  }, [data]);

  // Closures the backend threw out for being shorter than one
  // evaluation cycle. Surfacing the total is the point: a large number
  // here means checks are flapping, which is a defect in the evidence
  // pipeline rather than a property of the fleet. Hiding it would make
  // the medians look clean and leave the actual problem invisible.
  const churnExcluded = useMemo(
    () => (data?.bySeverity ?? []).reduce((n, b) => n + (b.churnExcluded ?? 0), 0),
    [data]
  );

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        mb: 2
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1.5 }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1.5,
              bgcolor: BRAND.tealSoft,
              color: BRAND.teal,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <TimerOutlinedIcon sx={{ fontSize: ICON.lg }} />
          </Box>
          <Box>
            <Tooltip
              arrow
              placement="top"
              title="Counts only findings that went from failing to passing. Controls that stopped applying, or that a device stopped reporting, are excluded — they close too, but nobody fixed them."
            >
              <Typography
                variant="subtitle1"
                sx={{ color: BRAND.dark, fontWeight: 700, cursor: "help", display: "inline-block" }}
              >
                Time to remediate
              </Typography>
            </Tooltip>
            {/* The old caption said "from open to resolved", which was
                not what the number measured: it averaged every closure,
                including controls that merely stopped applying. Now
                that the query counts only findings that went green,
                the caption can say so — and saying so is what makes
                the number readable. */}
            <Typography variant="caption" sx={{ color: BRAND.gray }}>
              How long a failing control takes to turn passing, by severity
            </Typography>
          </Box>
        </Stack>
        <Select
          size="small"
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
          sx={{ minWidth: 150 }}
          inputProps={{ "aria-label": "Time-to-close window" }}
        >
          {WINDOW_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </Select>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
            gap: 0,
            alignItems: "center"
          }}
        >
          {/* Header row — small caps caption style for column titles. */}
          <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", py: 1, borderBottom: `1px solid ${BRAND.border}` }}>
            Severity
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", textAlign: "right", py: 1, borderBottom: `1px solid ${BRAND.border}` }}>
            Median
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", textAlign: "right", py: 1, borderBottom: `1px solid ${BRAND.border}` }}>
            p90
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", textAlign: "right", py: 1, borderBottom: `1px solid ${BRAND.border}` }}>
            Remediated
          </Typography>

          {loading
            ? Array.from({ length: 4 }, (_, i) => (
                <Box key={i} sx={{ gridColumn: "1 / -1", py: 0.5 }}>
                  <Skeleton variant="text" height={28} />
                </Box>
              ))
            : rows.map((row) => {
                const meta =
                  SEVERITY_META[row.severity] ?? {
                    label: row.severity,
                    color: BRAND.gray
                  };
                const noisy =
                  row.sampleSize > 0 &&
                  row.sampleSize < SAMPLE_SIZE_NOISY_BELOW;
                const empty = row.sampleSize === 0;
                // Fade rows with too few samples OR no samples — both
                // are "no signal worth eyeballing".
                const opacity = empty || noisy ? 0.55 : 1;
                return (
                  <Box
                    key={row.severity}
                    sx={{
                      display: "contents",
                      opacity
                    }}
                  >
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      sx={{ py: 1, borderBottom: `1px solid ${BRAND.border}` }}
                    >
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          bgcolor: meta.color
                        }}
                      />
                      <Typography
                        variant="body2"
                        sx={{ color: BRAND.dark, fontWeight: 600 }}
                      >
                        {meta.label}
                      </Typography>
                      {noisy ? (
                        <Tooltip
                          title={`Only ${row.sampleSize} remediated finding${
                            row.sampleSize === 1 ? "" : "s"
                          } in this window — percentile is noisy.`}
                          arrow
                          placement="top"
                        >
                          <Typography
                            variant="caption"
                            sx={{ color: BRAND.gray, fontStyle: "italic" }}
                          >
                            (noisy)
                          </Typography>
                        </Tooltip>
                      ) : null}
                    </Stack>
                    <Typography
                      variant="body2"
                      sx={{
                        color: BRAND.dark,
                        fontWeight: 700,
                        textAlign: "right",
                        py: 1,
                        borderBottom: `1px solid ${BRAND.border}`
                      }}
                    >
                      {fmtDays(row.medianDays)}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: BRAND.dark,
                        textAlign: "right",
                        py: 1,
                        borderBottom: `1px solid ${BRAND.border}`
                      }}
                    >
                      {fmtDays(row.p90Days)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: BRAND.gray,
                        textAlign: "right",
                        py: 1,
                        borderBottom: `1px solid ${BRAND.border}`
                      }}
                    >
                      {row.sampleSize}
                    </Typography>
                  </Box>
                );
              })}
        </Box>
      )}

      {!error && !loading && churnExcluded > 0 ? (
        <Tooltip
          arrow
          placement="top"
          title="These controls went from failing to passing and back within a single evaluation cycle, which is too fast to be anyone's doing. Usually it means the evidence behind the check is arriving late or intermittently."
        >
          <Typography
            variant="caption"
            sx={{ color: BRAND.gray, display: "block", mt: 1.25, cursor: "help" }}
          >
            {churnExcluded} short-lived {churnExcluded === 1 ? "closure" : "closures"} excluded —
            flipped back to passing within one evaluation cycle.
          </Typography>
        </Tooltip>
      ) : null}
    </Paper>
  );
}
