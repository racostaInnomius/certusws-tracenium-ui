// src/components/Compliance/DeviceDiffSection.jsx
//
// "What changed since last scan" section for the device drawer, extracted from
// the SecurityCompliance god-component. Owns a lazy one-shot fetch of the diff
// on first expand (cancelled cleanly on close). DiffBucket is its internal
// presentational child.

import * as React from "react";
import { Alert, Box, Button, Collapse, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import AddCircleOutlineOutlinedIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import RemoveCircleOutlineOutlinedIcon from "@mui/icons-material/RemoveCircleOutlineOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import DifferenceOutlinedIcon from "@mui/icons-material/DifferenceOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import { BRAND, ROLE } from "../../theme/brand";
import { getDeviceFindingsDiff } from "../../api/compliance";
import AsyncState from "../common/AsyncState";

export default function DeviceDiffSection({ agentId }) {
  const [expanded, setExpanded] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [diff, setDiff] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [fetched, setFetched] = React.useState(false);

  // Sprint 6 — operator-pickable reference date. null/"" means
  // "use the prior snapshot" (default behavior). When the operator
  // picks an arbitrary date, we send it as ?vs=<iso>; the backend
  // finds the closest open-set at that timestamp.
  //
  // <input type="date"> gives us a yyyy-mm-dd string. We translate
  // to "the start of that day in UTC" so picking 2026-05-01 means
  // "what was open at 00:00Z on May 1?" — the most intuitive
  // semantic for daily compliance reviews.
  const [vsDate, setVsDate] = React.useState("");

  // Bumped on Apply so the effect refetches even when expanded
  // hasn't toggled. (Pure `vsDate` in the dep array would refetch
  // on every keystroke before Apply.)
  const [refetchTick, setRefetchTick] = React.useState(0);

  // Trigger the fetch the first time the section is expanded, AND any
  // time the agent changes while expanded (e.g. user navigates from
  // one device to another without closing the drawer — uncommon but
  // possible). Also re-triggered by Apply (refetchTick).
  React.useEffect(() => {
    if (!expanded || !agentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const vsIso = vsDate ? `${vsDate}T00:00:00Z` : null;
    getDeviceFindingsDiff(agentId, vsIso ? { vs: vsIso } : {})
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) {
          setDiff(res.diff ?? null);
          setFetched(true);
        } else {
          setError(res?.message || "Failed to load diff.");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, agentId, refetchTick]);

  const hasReference = diff?.referenceSnapshotAt != null;
  const added = diff?.added ?? [];
  const removed = diff?.removed ?? [];
  const severityChanged = diff?.severityChanged ?? [];
  const statusChanged = diff?.statusChanged ?? [];
  const totalChanges =
    added.length + removed.length + severityChanged.length + statusChanged.length;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        mb: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          cursor: "pointer"
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <DifferenceOutlinedIcon sx={{ fontSize: 18, color: BRAND.tealText }} />
        <Typography
          variant="caption"
          sx={{
            color: BRAND.tealText,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            flex: 1
          }}
        >
          Changes since last scan
        </Typography>
        {/* Mini-badge when collapsed so the operator sees there's
            something worth expanding without opening it. Only
            renders after the first fetch (`fetched`) so we don't
            mislead the user with a "0 changes" before we know. */}
        {fetched && !expanded ? (
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            {totalChanges === 0 ? "no changes" : `${totalChanges} change${totalChanges === 1 ? "" : "s"}`}
          </Typography>
        ) : null}
        <IconButton size="small" sx={{ ml: 0.5 }}>
          {expanded ? (
            <ExpandLessOutlinedIcon fontSize="small" />
          ) : (
            <ExpandMoreOutlinedIcon fontSize="small" />
          )}
        </IconButton>
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ mt: 1.5 }}>
          {/* NOTE: JSX children are evaluated eagerly — the block below runs
              even while AsyncState renders loading/empty and `diff` is still
              null, so every access to it has to stay null-safe. */}
          <AsyncState
            loading={loading}
            error={error}
            isEmpty={!hasReference}
            emptyText="No prior scan to compare against. Once this device reports a second snapshot, this section will show the delta."
            minHeight={120}
          >
            <Stack spacing={1.5}>
              {/* Sprint 6 — reference date picker. Empty = "compare
                  against the prior snapshot" (the default behavior
                  shipped in Sprint 4); a date sends ?vs=<iso> so the
                  backend computes diff vs that point in time. The
                  Apply button is enabled when the input differs from
                  the currently rendered reference date. */}
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <TextField
                  type="date"
                  size="small"
                  label="Reference date"
                  value={vsDate}
                  onChange={(e) => setVsDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ minWidth: 160 }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setRefetchTick((t) => t + 1)}
                  disabled={loading}
                  sx={{ textTransform: "none" }}
                >
                  Apply
                </Button>
                {vsDate ? (
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => {
                      setVsDate("");
                      setRefetchTick((t) => t + 1);
                    }}
                    disabled={loading}
                    sx={{ textTransform: "none", color: BRAND.gray }}
                  >
                    Reset to prior snapshot
                  </Button>
                ) : null}
              </Stack>
              <Typography variant="caption" sx={{ color: BRAND.gray }}>
                Comparing{" "}
                <strong>
                  {diff?.currentSnapshotAt
                    ? new Date(diff.currentSnapshotAt).toLocaleString()
                    : "current"}
                </strong>{" "}
                vs{" "}
                <strong>
                  {diff?.referenceSnapshotAt
                    ? new Date(diff.referenceSnapshotAt).toLocaleString()
                    : "—"}
                </strong>
              </Typography>

              {totalChanges === 0 ? (
                <Alert severity="success" icon={false} sx={{ py: 0.5 }}>
                  No changes since the prior scan.
                </Alert>
              ) : null}

              <DiffBucket
                title="New findings"
                items={added.map((f) => `${f.severity ?? "?"} · ${f.checkId} — ${f.title ?? ""}`)}
                color={ROLE.critical}
                icon={<AddCircleOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
              />
              <DiffBucket
                title="Resolved"
                items={removed.map((f) => `${f.severity ?? "?"} · ${f.checkId} — ${f.title ?? ""}`)}
                color={ROLE.positive}
                icon={<RemoveCircleOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
              />
              <DiffBucket
                title="Severity changed"
                items={severityChanged.map(
                  (c) => `${c.checkId}: ${c.before ?? "?"} → ${c.after ?? "?"}`
                )}
                color={ROLE.caution}
                icon={<SwapHorizOutlinedIcon sx={{ fontSize: 14 }} />}
              />
              <DiffBucket
                title="Status changed"
                items={statusChanged.map(
                  (c) => `${c.checkId}: ${c.before ?? "?"} → ${c.after ?? "?"}`
                )}
                color={ROLE.caution}
                icon={<SwapHorizOutlinedIcon sx={{ fontSize: 14 }} />}
              />
            </Stack>
          </AsyncState>
        </Box>
      </Collapse>
    </Paper>
  );
}

// Hidden when items array is empty — keeps the diff section compact
// for the common "only one bucket has content" case.

function DiffBucket({ title, items, color, icon }) {
  if (!items || items.length === 0) return null;
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
        <Box sx={{ color, display: "flex" }}>{icon}</Box>
        <Typography
          variant="caption"
          sx={{ color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}
        >
          {title} ({items.length})
        </Typography>
      </Stack>
      <Box
        component="ul"
        sx={{
          m: 0,
          pl: 2.5,
          color: BRAND.dark,
          fontSize: 13,
          lineHeight: 1.55
        }}
      >
        {items.map((line, idx) => (
          <li key={idx}>
            <Typography variant="body2" component="span">
              {line}
            </Typography>
          </li>
        ))}
      </Box>
    </Box>
  );
}

// ── Sprint 7 item 3.6 — fleet ranking line ────────────────────────
//
// Loads the per-device ranking lazily when the drawer opens for a
// given agent. Renders a single text line under the score:
//
//   "#12 of 45 scored · top 27%"           (scored device)
//   "Not scored (33 of 45 unscored)"       (insufficient_data)
//   "Loading…" / hidden on error
//
// Doesn't surface its own error UI — a failed ranking request is
// fine to silently hide. The drawer's main content is still useful
// without it.
