// src/components/CryptoDiscovery/CdpDashboardPanels.jsx
//
// Consolidación 2026-09-04: «Expiry horizon» y «Where they live» se
// retiraron de aquí. La primera pregunta la responde la línea de tiempo
// (CdpExplorePanels.TimelinePanel) y la segunda el panel de almacenes en
// Explore. Dos paneles para una pregunta era deuda, no cobertura.
//
// The analytical half of the Crypto Discovery dashboard — everything
// below the KPI row. Fed by a single GET /api/v1/cdp/dashboard.
//
// Design notes (see the dataviz guidance):
//   * NO categorical color coding anywhere. The brand ramp is
//     deliberately low-chroma and adjacent teal steps measure ΔE ~12 in
//     normal vision (below the 15 floor), so identity is carried by
//     direct text labels and every chart is single-series / single-hue.
//   * The expiry horizon is the exception and uses the RESERVED status
//     colors — legitimate because the buckets ARE states, and each bar
//     is labeled on the axis, so the color is reinforcement, never the
//     only channel.
//   * No dual axes, no pie charts, no number on every mark.

import * as React from "react";
import { Box, Chip, Stack, Tooltip, Typography, LinearProgress } from "@mui/material";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";

import SectionPaper from "../common/SectionPaper";
import { BRAND, ICON, TEXT, TEXT_MUTED } from "../../theme/brand";
// `TEXT_MUTED` sustituye a BRAND.gray como color de texto (contraste).

// ── shared bits ──────────────────────────────────────────────────────


function PanelTitle({ children, hint }) {
  const title = (
    <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark }}>{children}</Typography>
  );
  return (
    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1.5 }}>
      {hint ? (
        <Tooltip title={hint} arrow>
          <Box sx={{ cursor: "help", borderBottom: `1px dotted ${BRAND.borderStrong}` }}>{title}</Box>
        </Tooltip>
      ) : (
        title
      )}
    </Stack>
  );
}

/**
 * Una fila que navega es un control: ratón Y teclado, con nombre. Antes
 * solo tenía onClick, así que un lector de pantalla no la anunciaba y el
 * tabulador la saltaba (revisión UI 2026-09-05).
 */
function rowActionProps(onActivate, label) {
  if (!onActivate) return {};
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    }
  };
}
const ROW_FOCUS_SX = { "&:focus-visible": { outline: `2px solid ${BRAND.tealText}`, outlineOffset: -2, borderRadius: 0.5 } };

function EmptyPanel({ children }) {
  return (
    <Typography sx={{ color: TEXT_MUTED, fontSize: TEXT.md, py: 3, textAlign: "center" }}>
      {children}
    </Typography>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function daysUntil(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86400000);
}

// ── 0. Overview card ─────────────────────────────────────────────────
//
// Repaso UI 2026-09-05: el Dashboard es una vista rápida de las demás
// pestañas. Cada tarjeta: un título (la pestaña), dos o tres cifras con
// etiqueta, y un clic que lleva allí. Sin prosa: la explicación vive en
// la pestaña.

export function OverviewCard({ title, icon, metrics, onOpen, empty, hint }) {
  const clickable = typeof onOpen === "function";
  const rows = Array.isArray(metrics) ? metrics.filter((m) => m && m.value != null) : [];
  return (
    <SectionPaper
      sx={{
        p: 2,
        height: "100%",
        cursor: clickable ? "pointer" : "default",
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        "&:hover": clickable ? { borderColor: BRAND.teal, boxShadow: "0 4px 12px rgba(59,64,77,0.08)" } : undefined,
        ...ROW_FOCUS_SX,
      }}
      {...rowActionProps(clickable ? onOpen : null, `Open ${title}`)}
    >
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1.25 }}>
        {icon ? <Box sx={{ color: BRAND.tealText, display: "flex" }}>{icon}</Box> : null}
        <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark }}>{title}</Typography>
        {hint ? (
          <Tooltip title={hint} arrow>
            <Box component="span" sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, cursor: "help", borderBottom: `1px dotted ${BRAND.borderStrong}` }}>?</Box>
          </Tooltip>
        ) : null}
      </Stack>
      {rows.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>{empty || "Nothing to show yet."}</Typography>
      ) : (
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", rowGap: 1 }}>
          {rows.map((m) => (
            <Box key={m.label} sx={{ minWidth: 72 }}>
              <Typography sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: m.color || BRAND.dark, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
                {typeof m.value === "number" ? m.value.toLocaleString() : m.value}
              </Typography>
              <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: ".04em" }}>{m.label}</Typography>
            </Box>
          ))}
        </Stack>
      )}
    </SectionPaper>
  );
}

// ── 1. Expiry horizon ────────────────────────────────────────────────
//
// The panel that answers "when does my fleet break?". Ordered urgency
// buckets, so a bar chart on an ordinal axis is the right form.

export function ActionRequiredPanel({ items, onSelect }) {
  const rows = Array.isArray(items) ? items : [];

  return (
    <SectionPaper sx={{ p: 2, height: "100%" }}>
      <PanelTitle hint="Soonest-expiring certificates in the next 90 days. Key-holders first: those are the ones you must personally renew.">
        Action required
      </PanelTitle>

      {rows.length === 0 ? (
        <EmptyPanel>Nothing expires in the next 90 days. 🎉</EmptyPanel>
      ) : (
        <Stack divider={<Box sx={{ borderTop: `1px solid ${BRAND.border}` }} />}>
          {rows.map((row) => {
            const days = daysUntil(row.notAfter);
            const overdue = days != null && days < 0;
            const urgent = days != null && days <= 7;
            return (
              <Box
                key={row.fingerprint256}
                {...rowActionProps(onSelect ? () => onSelect(row) : null, `Open ${row.subjectCN || row.fingerprint256}`)}
                sx={{
                  py: 1,
                  px: 0.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  cursor: onSelect ? "pointer" : "default",
                  "&:hover": onSelect ? { bgcolor: BRAND.rowHover } : undefined,
                  ...ROW_FOCUS_SX,
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    {row.hasPrivateKey && (
                      <Tooltip title="This device holds the private key — you renew this one" arrow>
                        <KeyOutlinedIcon sx={{ fontSize: ICON.sm, color: BRAND.tealText }} />
                      </Tooltip>
                    )}
                    <Typography
                      sx={{
                        fontWeight: 600,
                        fontSize: TEXT.md,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.subjectCN || "(no common name)"}
                    </Typography>
                  </Stack>
                  <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                    {row.issuerCN || "Unknown issuer"} · {row.deviceCount} device
                    {row.deviceCount === 1 ? "" : "s"}
                    {row.sampleHost ? ` · ${row.sampleHost}` : ""}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label={
                    overdue
                      ? `Expired ${Math.abs(days)}d ago`
                      : days === 0
                        ? "Expires today"
                        : `${days}d · ${formatDate(row.notAfter)}`
                  }
                  sx={{
                    bgcolor: overdue
                      ? BRAND.alert.errorSoft
                      : urgent
                        ? BRAND.alert.highSoft
                        : BRAND.alert.warningSoft,
                    color: overdue
                      ? BRAND.alert.errorText
                      : urgent
                        ? BRAND.alert.high
                        : BRAND.alert.warningText,
                    fontWeight: 700,
                    fontSize: TEXT.xs,
                    flexShrink: 0,
                  }}
                />
              </Box>
            );
          })}
        </Stack>
      )}
    </SectionPaper>
  );
}

// ── 4. Top issuers ───────────────────────────────────────────────────

export function IssuersPanel({ issuers, onSelect }) {
  const rows = (Array.isArray(issuers) ? issuers : []).slice(0, 6);
  const max = Math.max(1, ...rows.map((r) => r.count ?? 0));

  return (
    <SectionPaper sx={{ p: 2, height: "100%" }}>
      <PanelTitle hint="Who signs the fleet's certificates. A private CA dominating the list is normal for internal services; unexpected issuers are worth a look.">
        Top issuers
      </PanelTitle>

      {rows.length === 0 ? (
        <EmptyPanel>No issuer data yet.</EmptyPanel>
      ) : (
        <Stack spacing={1.25}>
          {rows.map((row, i) => (
            <Box
              key={`${i}:${row.issuer}`}
              {...rowActionProps(onSelect ? () => onSelect(row.issuer) : null, `Issuer ${row.issuer}: ${row.count}`)}
              sx={{
                cursor: onSelect ? "pointer" : "default",
                "&:hover": onSelect ? { "& .issuer-label": { color: BRAND.tealText } } : undefined,
                ...ROW_FOCUS_SX,
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                <Typography
                  className="issuer-label"
                  sx={{
                    fontSize: TEXT.sm,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.issuer}
                </Typography>
                <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ flexShrink: 0 }}>
                  {row.expiringSoon > 0 && (
                    <Tooltip title={`${row.expiringSoon} expiring within 30 days`} arrow>
                      <Typography
                        sx={{ fontSize: TEXT.xs, fontWeight: 700, color: BRAND.alert.warningText }}
                      >
                        {row.expiringSoon}↑
                      </Typography>
                    </Tooltip>
                  )}
                  <Typography sx={{ fontSize: TEXT.md, fontWeight: 700 }}>{row.count}</Typography>
                </Stack>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={((row.count ?? 0) / max) * 100}
                sx={{
                  mt: 0.5,
                  height: 6,
                  borderRadius: 3,
                  bgcolor: BRAND.surfaceMuted,
                  "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: BRAND.teal },
                }}
              />
            </Box>
          ))}
        </Stack>
      )}
    </SectionPaper>
  );
}

