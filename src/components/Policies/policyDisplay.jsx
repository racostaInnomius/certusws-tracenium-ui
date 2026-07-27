// src/components/Policies/policyDisplay.jsx
//
// Presentational helpers + small shared UI pieces for the Policies page,
// extracted from the god-component. formatJson/formatRelativeTime/shortHash
// are pure formatters; renderAckChip/renderSourceChip return status Chips;
// SummaryCard/DetailRow/JsonBlock are the page's shared layout atoms.

import * as React from "react";
import { Box, Chip, Paper, Typography } from "@mui/material";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import { BRAND } from "../../theme/brand";

export function formatJson(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

// Compact relative time formatter — "Now" / "5m ago" / "2h ago" / "3d ago".
//
// Used in tabular columns where space is tight and the operator wants to
// scan-read freshness, not parse exact timestamps. Pair with
// `formatDate(value)` as a tooltip when context warrants the absolute
// reading. Returns "—" for null/invalid input so the cell renders
// consistently with other helpers.
export function formatRelativeTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "Now"; // future timestamp (clock skew) — round to now
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "Now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}


export function shortHash(hash) {
  if (!hash) return "—";
  const s = String(hash);
  return s.length > 14 ? `${s.slice(0, 10)}…${s.slice(-4)}` : s;
}

export function renderAckChip(status, reasonText) {
  if (status === 0) {
    return (
      <Chip
        label="ACK OK"
        size="small"
        icon={<CheckCircleOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
        sx={{
          bgcolor: BRAND.tealSoft,
          color: BRAND.tealText,
          fontWeight: 700,
          border: `1px solid ${BRAND.teal}55`,
          "& .MuiChip-icon": { color: BRAND.tealText },
        }}
      />
    );
  }
  if (status == null) {
    return (
      <Chip
        label={reasonText || "Pending"}
        size="small"
        icon={<HourglassEmptyOutlinedIcon sx={{ fontSize: 14 }} />}
        sx={{
          bgcolor: BRAND.darkSoft,
          color: BRAND.dark,
          fontWeight: 700,
          border: `1px solid ${BRAND.border}`,
          "& .MuiChip-icon": { color: BRAND.dark },
        }}
      />
    );
  }
  return (
    <Chip
      label={`ACK ERR ${status}`}
      size="small"
      icon={<ErrorOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
      sx={{
        bgcolor: BRAND.alert.errorSoft,
        color: BRAND.alert.error,
        fontWeight: 700,
        border: `1px solid ${BRAND.alert.error}55`,
        "& .MuiChip-icon": { color: BRAND.alert.error },
      }}
    />
  );
}

export function renderSourceChip(source) {
  const val = String(source || "").toLowerCase();
  if (val === "device") {
    return (
      <Chip
        label="Device override"
        size="small"
        sx={{
          bgcolor: BRAND.cyanSoft,
          color: BRAND.dark,
          fontWeight: 700,
          border: `1px solid ${BRAND.cyan}88`,
        }}
      />
    );
  }
  if (val === "tenant") {
    return (
      <Chip
        label="Tenant"
        size="small"
        sx={{
          bgcolor: BRAND.tealSoft,
          color: BRAND.tealText,
          fontWeight: 700,
          border: `1px solid ${BRAND.teal}55`,
        }}
      />
    );
  }
  return (
    <Chip
      label={source || "—"}
      size="small"
      sx={{ bgcolor: BRAND.darkSoft, color: BRAND.dark, fontWeight: 700 }}
    />
  );
}

// ── Shared UI pieces ────────────────────────────────────────────────────

export function SummaryCard({ title, value, hint, icon, accent = BRAND.teal, tint = BRAND.tealSoft }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.75,
        minHeight: 96,
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        boxShadow: BRAND.shadow,
        display: "flex",
        alignItems: "center",
        gap: 1.75,
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: 2,
          bgcolor: tint,
          color: accent,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12, color: "text.secondary", fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 26, fontWeight: 800, color: BRAND.dark, lineHeight: 1.1 }}>
          {value}
        </Typography>
        {hint ? (
          <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.25 }}>
            {hint}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
}

export function DetailRow({ label, value, mono = false }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "baseline" }}>
      <Typography
        sx={{
          fontSize: 12,
          color: "text.secondary",
          fontWeight: 600,
          minWidth: 96,
          textTransform: "uppercase",
          letterSpacing: 0.3,
          flexShrink: 0,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 13,
          color: BRAND.dark,
          fontFamily: mono ? "monospace" : "inherit",
          wordBreak: "break-all",
          flex: 1,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export function JsonBlock({ value, maxHeight = 260 }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        bgcolor: BRAND.dark,
        color: "#e2e8f0",
        borderColor: BRAND.dark,
        overflow: "auto",
        maxHeight,
        fontFamily: "monospace",
        fontSize: 12,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {formatJson(value)}
    </Paper>
  );
}
