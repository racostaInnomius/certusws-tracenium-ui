// src/components/Compliance/PatchLevel.jsx
//
// Patch-recency presentation cluster extracted from the SecurityCompliance
// god-component: the recency helpers (days-since → red/amber/green role) plus
// the chip, the per-patch row, and the collapsible patch-level section. Pure
// presentation — no data fetching.

import * as React from "react";
import { Box, Chip, Collapse, IconButton, Paper, Stack, Typography } from "@mui/material";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import { BRAND, ROLE } from "../../theme/brand";

export function formatRelativeTime(isoString) {
  if (!isoString) return null;
  const then = Date.parse(isoString);
  if (!Number.isFinite(then)) return null;
  const deltaMs = Date.now() - then;
  if (deltaMs < 0) return "future";
  const mins = Math.round(deltaMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

function daysSince(isoString) {
  if (!isoString) return null;
  const then = Date.parse(isoString);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

// Red/amber/green bucket based on days since the device's most recent
// security patch. Thresholds match the agreed SLA (≤30d green, ≤90d
// amber, >90d or unknown red). Centralized so the table cell and the
// drawer mini-card both agree on a single source of truth.

export function patchRecencyRole(lastInstalledAtUtc) {
  const days = daysSince(lastInstalledAtUtc);
  if (days == null) return { role: "critical", label: "unknown" };
  if (days <= 30) return { role: "positive", label: `${days}d ago` };
  if (days <= 90) return { role: "caution", label: `${days}d ago` };
  return { role: "critical", label: `${days}d ago` };
}

// Table-cell chip that shows {installed count} + {relative time of last
// patch}, color-coded. Compact enough for a narrow table column.

export function PatchChip({ patchSummary }) {
  if (!patchSummary || (patchSummary.count == null && !patchSummary.lastInstalledAtUtc)) {
    return (
      <Typography variant="body2" sx={{ color: BRAND.gray }}>
        —
      </Typography>
    );
  }

  const { role, label } = patchRecencyRole(patchSummary.lastInstalledAtUtc);
  const color =
    role === "positive" ? ROLE.positive : role === "caution" ? ROLE.caution : ROLE.critical;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
      <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark }}>
        {patchSummary.count != null ? patchSummary.count : "—"}
      </Typography>
      <Typography variant="caption" sx={{ color, fontWeight: 600 }}>
        {label}
      </Typography>
    </Box>
  );
}

// ---------- main page --------------------------------------------------------

function PatchRow({ patch }) {
  const [expanded, setExpanded] = React.useState(false);
  const hasDetails = Boolean(patch?.title || patch?.source || patch?.raw);

  return (
    <Box
      sx={{
        borderTop: `1px solid ${BRAND.border}`,
        py: 0.75,
        "&:first-of-type": { borderTop: "none" }
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          cursor: hasDetails ? "pointer" : "default"
        }}
        onClick={() => hasDetails && setExpanded((v) => !v)}
      >
        <Typography
          variant="body2"
          sx={{
            fontFamily: "monospace",
            fontWeight: 700,
            color: BRAND.dark,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {patch?.id || "—"}
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray, flexShrink: 0 }}>
          {patch?.installedAtUtc
            ? new Date(patch.installedAtUtc).toLocaleDateString()
            : "—"}
        </Typography>
        {hasDetails ? (
          <IconButton size="small" sx={{ p: 0.25 }}>
            {expanded ? (
              <ExpandLessOutlinedIcon fontSize="small" />
            ) : (
              <ExpandMoreOutlinedIcon fontSize="small" />
            )}
          </IconButton>
        ) : null}
      </Box>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ mt: 0.75, pl: 0.5 }}>
          {patch?.title ? (
            <Typography variant="body2" sx={{ color: BRAND.dark, mb: 0.5 }}>
              {patch.title}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 0.5, mb: 0.75 }}>
            {patch?.installedAtUtc ? (
              <Chip
                size="small"
                label={`installed ${formatRelativeTime(patch.installedAtUtc)}`}
                sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.dark }}
              />
            ) : null}
            {patch?.source ? (
              <Chip
                size="small"
                label={`source: ${patch.source}`}
                sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.dark }}
              />
            ) : null}
          </Stack>
          {patch?.raw && typeof patch.raw === "object" ? (
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1,
                bgcolor: BRAND.surfaceMuted,
                borderRadius: 1,
                fontSize: 11,
                fontFamily: "monospace",
                color: BRAND.dark,
                overflowX: "auto",
                maxHeight: 180
              }}
            >
              {JSON.stringify(patch.raw, null, 2)}
            </Box>
          ) : null}
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * Patch-level section for the device drawer. Three mini-cards at the
 * top (installed count · last patch · last scan) + a compact list of
 * the most recent patches. Uses the shared `patchRecencyRole` helper
 * so coloring stays consistent with the device table.
 */

export function PatchLevelSection({ patchSummary, recentPatches }) {
  const hasData =
    patchSummary &&
    (patchSummary.count != null ||
      patchSummary.lastInstalledAtUtc ||
      patchSummary.lastScanUtc);

  if (!hasData) {
    return (
      <Paper
        elevation={0}
        sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 2 }}
      >
        <Typography
          variant="caption"
          sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 1 }}
        >
          Patch level
        </Typography>
        <Typography variant="body2" sx={{ color: BRAND.gray }}>
          This device hasn't reported installed patches yet.
        </Typography>
      </Paper>
    );
  }

  const recency = patchRecencyRole(patchSummary.lastInstalledAtUtc);
  const recencyColor =
    recency.role === "positive"
      ? ROLE.positive
      : recency.role === "caution"
      ? ROLE.caution
      : ROLE.critical;

  return (
    <Paper
      elevation={0}
      sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 2 }}
    >
      <Typography
        variant="caption"
        sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 1 }}
      >
        Patch level
      </Typography>

      <Grid container spacing={1} sx={{ mb: Array.isArray(recentPatches) && recentPatches.length > 0 ? 1.5 : 0 }}>
        <Grid size={{ xs: 4 }}>
          <Typography variant="caption" sx={{ color: BRAND.gray, textTransform: "uppercase", fontWeight: 600 }}>
            Installed
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND.dark, lineHeight: 1.1 }}>
            {patchSummary.count != null ? patchSummary.count : "—"}
          </Typography>
        </Grid>
        <Grid size={{ xs: 4 }}>
          <Typography variant="caption" sx={{ color: BRAND.gray, textTransform: "uppercase", fontWeight: 600 }}>
            Last patch
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark }}>
            {patchSummary.lastInstalledAtUtc
              ? new Date(patchSummary.lastInstalledAtUtc).toLocaleDateString()
              : "—"}
          </Typography>
          <Typography variant="caption" sx={{ color: recencyColor, fontWeight: 600 }}>
            {recency.label}
          </Typography>
        </Grid>
        <Grid size={{ xs: 4 }}>
          <Typography variant="caption" sx={{ color: BRAND.gray, textTransform: "uppercase", fontWeight: 600 }}>
            Last scan
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark }}>
            {patchSummary.lastScanUtc
              ? new Date(patchSummary.lastScanUtc).toLocaleDateString()
              : "—"}
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            {patchSummary.lastScanUtc
              ? formatRelativeTime(patchSummary.lastScanUtc)
              : ""}
          </Typography>
        </Grid>
      </Grid>

      {Array.isArray(recentPatches) && recentPatches.length > 0 ? (
        <>
          <Typography
            variant="caption"
            sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 0.5 }}
          >
            Recent ({recentPatches.length})
          </Typography>
          <Box>
            {recentPatches.map((patch, idx) => (
              <PatchRow key={`${patch?.id || "unknown"}-${idx}`} patch={patch} />
            ))}
          </Box>
        </>
      ) : null}
    </Paper>
  );
}

// ---------- drawer: drill-down for one device --------------------------------
