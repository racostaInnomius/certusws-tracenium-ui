// src/components/CryptoDiscovery/CdpDashboardPanels.jsx
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
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Cell,
} from "recharts";

import SectionPaper from "../common/SectionPaper";
import { BRAND } from "../../theme/brand";

// ── shared bits ──────────────────────────────────────────────────────

const AXIS_TICK = { fontSize: 12, fill: BRAND.dark };
const GRID_STROKE = "rgba(190,190,190,0.35)";

function PanelTitle({ children, hint }) {
  const title = (
    <Typography sx={{ fontWeight: 700, fontSize: 14, color: BRAND.dark }}>{children}</Typography>
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

function EmptyPanel({ children }) {
  return (
    <Typography sx={{ color: BRAND.gray, fontSize: 13, py: 3, textAlign: "center" }}>
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

// ── 1. Expiry horizon ────────────────────────────────────────────────
//
// The panel that answers "when does my fleet break?". Ordered urgency
// buckets, so a bar chart on an ordinal axis is the right form.

const SEVERITY_FILL = {
  critical: BRAND.alert.error,
  serious: BRAND.alert.high,
  warning: BRAND.alert.warningText,
  neutral: BRAND.teal,
};

function HorizonTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <Box
      sx={{
        bgcolor: BRAND.surface,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 1,
        px: 1.5,
        py: 1,
        boxShadow: BRAND.shadow,
      }}
    >
      <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{row.label}</Typography>
      <Typography sx={{ fontSize: 12, color: BRAND.dark }}>
        {row.count} certificate{row.count === 1 ? "" : "s"}
      </Typography>
      <Typography sx={{ fontSize: 12, color: BRAND.tealText }}>
        {row.withPrivateKey} with private key
      </Typography>
    </Box>
  );
}

export function ExpiryHorizonPanel({ data, noExpiryDate }) {
  const buckets = Array.isArray(data) ? data : [];
  const total = buckets.reduce((sum, b) => sum + (b.count ?? 0), 0);

  return (
    <SectionPaper sx={{ p: 2, height: "100%" }}>
      <PanelTitle hint="Certificates grouped by how soon they expire. System roots excluded — this is a worklist, and OS trust bundles are not work.">
        Expiry horizon
      </PanelTitle>

      {total === 0 ? (
        <EmptyPanel>No certificates with an expiry date yet.</EmptyPanel>
      ) : (
        <>
          <Box sx={{ height: 240, width: "100%", minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                <RTooltip content={<HorizonTooltip />} cursor={{ fill: BRAND.surfaceMuted }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {buckets.map((b) => (
                    <Cell key={b.key} fill={SEVERITY_FILL[b.severity] ?? BRAND.teal} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
          {noExpiryDate > 0 && (
            <Typography sx={{ fontSize: 12, color: BRAND.gray, mt: 1 }}>
              + {noExpiryDate} with no expiry date recorded
            </Typography>
          )}
        </>
      )}
    </SectionPaper>
  );
}

// ── 2. Action required (worklist) ────────────────────────────────────

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
                onClick={onSelect ? () => onSelect(row) : undefined}
                sx={{
                  py: 1,
                  px: 0.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  cursor: onSelect ? "pointer" : "default",
                  "&:hover": onSelect ? { bgcolor: BRAND.rowHover } : undefined,
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    {row.hasPrivateKey && (
                      <Tooltip title="This device holds the private key — you renew this one" arrow>
                        <KeyOutlinedIcon sx={{ fontSize: 15, color: BRAND.tealText }} />
                      </Tooltip>
                    )}
                    <Typography
                      sx={{
                        fontWeight: 600,
                        fontSize: 13,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.subjectCN || "(no common name)"}
                    </Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 11.5, color: BRAND.gray }}>
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
                      ? BRAND.alert.error
                      : urgent
                        ? BRAND.alert.high
                        : BRAND.alert.warningText,
                    fontWeight: 700,
                    fontSize: 11,
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

// ── 3. Hygiene breakdown ─────────────────────────────────────────────

const FLAG_META = {
  weak_sig: { label: "Weak signature", hint: "Signed with MD5 or SHA-1" },
  weak_key: { label: "Weak key", hint: "RSA < 2048 bits or EC < 256 bits" },
  self_signed_leaf: { label: "Self-signed leaf", hint: "Self-signed non-CA cert in a machine store" },
  long_validity: { label: "Validity > 398d", hint: "Exceeds the CA/Browser Forum ceiling for leaf TLS certs" },
  nonstandard_root: {
    label: "Nonstandard root",
    hint: "A CA trusted by only a small minority of comparable devices — the signature of an injected proxy CA or malware root. Needs at least 5 comparable devices to compute.",
    security: true,
  },
  shared_private_key: {
    label: "Shared private key",
    hint: "The same private key is present on more than one device. A private key should exist on exactly one machine — if two report it, it was copied.",
    security: true,
  },
  revoked: {
    label: "Revoked",
    hint: "The issuer revoked this certificate but it is still installed. Worse than expired: it still looks valid to anything that does not check revocation.",
    security: true,
  },
  chain_incomplete: {
    label: "Incomplete chain",
    hint: "The service serves its certificate without the intermediates. It may work on this machine and fail for clients that do not already have them — one of the most common real-world TLS failures.",
    security: true,
  },
  chain_untrusted: {
    label: "Untrusted chain",
    hint: "The device's own trust store rejects the chain the service serves.",
    security: true,
  },
  reused_key: {
    label: "Reused key",
    hint: "Two or more certificates share a key pair, usually a renewal that kept the old key. CA cross-signing and OS trust bundles are excluded, since both do this by design.",
  },
};

export function HygienePanel({ flags, onSelect }) {
  const entries = Object.entries(FLAG_META).map(([key, meta]) => ({
    key,
    ...meta,
    count: Number(flags?.[key] ?? 0),
  }));
  const max = Math.max(1, ...entries.map((e) => e.count));
  const anyFlagged = entries.some((e) => e.count > 0);

  return (
    <SectionPaper sx={{ p: 2, height: "100%" }}>
      <PanelTitle hint="Server-derived hygiene judgments. Thresholds live in the control plane, so they can change without touching agents.">
        Hygiene
      </PanelTitle>

      {!anyFlagged ? (
        <EmptyPanel>No hygiene issues found.</EmptyPanel>
      ) : (
        <Stack spacing={1.5}>
          {entries.map((entry) => (
            <Box
              key={entry.key}
              onClick={onSelect && entry.count > 0 ? () => onSelect(entry.key) : undefined}
              sx={{
                cursor: onSelect && entry.count > 0 ? "pointer" : "default",
                "&:hover":
                  onSelect && entry.count > 0 ? { "& .flag-label": { color: BRAND.tealText } } : undefined,
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                <Tooltip title={entry.hint} arrow>
                  <Typography
                    className="flag-label"
                    sx={{ fontSize: 12.5, fontWeight: 600, cursor: "help" }}
                  >
                    {entry.label}
                  </Typography>
                </Tooltip>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}>
                  {entry.count}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={(entry.count / max) * 100}
                sx={{
                  mt: 0.5,
                  height: 6,
                  borderRadius: 3,
                  bgcolor: BRAND.surfaceMuted,
                  "& .MuiLinearProgress-bar": {
                    borderRadius: 3,
                    // A nonstandard root is a possible intrusion, not
                    // hygiene debt — it gets the error tone so it does
                    // not read as "one more thing to tidy up someday".
                    bgcolor:
                      entry.count === 0
                        ? BRAND.gray
                        : entry.security
                          ? BRAND.alert.error
                          : BRAND.alert.high,
                  },
                }}
              />
            </Box>
          ))}
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
          {rows.map((row) => (
            <Box
              key={row.issuer}
              onClick={onSelect ? () => onSelect(row.issuer) : undefined}
              sx={{
                cursor: onSelect ? "pointer" : "default",
                "&:hover": onSelect ? { "& .issuer-label": { color: BRAND.tealText } } : undefined,
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                <Typography
                  className="issuer-label"
                  sx={{
                    fontSize: 12.5,
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
                        sx={{ fontSize: 11, fontWeight: 700, color: BRAND.alert.warningText }}
                      >
                        {row.expiringSoon}↑
                      </Typography>
                    </Tooltip>
                  )}
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{row.count}</Typography>
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

// ── 5. Where certificates live ───────────────────────────────────────
//
// Text-labeled rows rather than a pie: with OS stores vs Java keystores
// the categories are few and the labels are the identity channel.

const SOURCE_LABELS = {
  store: "OS certificate store",
  "java-store": "Java keystore",
  // Captured from a live local handshake — what the service actually
  // serves, which can differ from anything in a store.
  listener: "TLS listener",
};

const SCOPE_LABELS = {
  machine: "machine",
  user: "user",
  "system-roots": "system roots",
};

export function DistributionPanel({ distribution }) {
  const rows = Array.isArray(distribution) ? distribution : [];
  const total = rows.reduce((sum, r) => sum + (r.count ?? 0), 0);

  return (
    <SectionPaper sx={{ p: 2, height: "100%" }}>
      <PanelTitle hint="Java keystores (JKS/PKCS12) are invisible to the OS certificate stores — they are collected separately by the agent.">
        Where they live
      </PanelTitle>

      {total === 0 ? (
        <EmptyPanel>No certificates inventoried yet.</EmptyPanel>
      ) : (
        <Stack spacing={1.25}>
          {rows.map((row) => {
            const pct = Math.round(((row.count ?? 0) / total) * 100);
            return (
              <Box key={`${row.source}:${row.scope}`}>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>
                    {SOURCE_LABELS[row.source] ?? row.source}
                    <Typography component="span" sx={{ fontSize: 11.5, color: BRAND.gray, ml: 0.5 }}>
                      ({SCOPE_LABELS[row.scope] ?? row.scope})
                    </Typography>
                  </Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                    {row.count}
                    <Typography component="span" sx={{ fontSize: 11, color: BRAND.gray, ml: 0.5 }}>
                      {pct}%
                    </Typography>
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={pct}
                  sx={{
                    mt: 0.5,
                    height: 6,
                    borderRadius: 3,
                    bgcolor: BRAND.surfaceMuted,
                    "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: BRAND.tealText },
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

// ── 6. Devices needing attention ─────────────────────────────────────

export function TopDevicesPanel({ devices, onSelect }) {
  const rows = Array.isArray(devices) ? devices : [];

  return (
    <SectionPaper sx={{ p: 2, height: "100%" }}>
      <PanelTitle hint="Devices with expired, soon-to-expire or flagged certificates — worst first.">
        Devices needing attention
      </PanelTitle>

      {rows.length === 0 ? (
        <EmptyPanel>Every reporting device is clean.</EmptyPanel>
      ) : (
        <Stack divider={<Box sx={{ borderTop: `1px solid ${BRAND.border}` }} />}>
          {rows.map((row) => (
            <Box
              key={row.agentId}
              onClick={onSelect ? () => onSelect(row) : undefined}
              sx={{
                py: 1,
                px: 0.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                cursor: onSelect ? "pointer" : "default",
                "&:hover": onSelect ? { bgcolor: BRAND.rowHover } : undefined,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.host || row.agentId}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: BRAND.gray }}>
                  {row.total} certificate{row.total === 1 ? "" : "s"}
                </Typography>
              </Box>
              <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                {row.expired > 0 && (
                  <Chip
                    size="small"
                    label={`${row.expired} expired`}
                    sx={{
                      bgcolor: BRAND.alert.errorSoft,
                      color: BRAND.alert.error,
                      fontWeight: 700,
                      fontSize: 10.5,
                    }}
                  />
                )}
                {row.expiring > 0 && (
                  <Chip
                    size="small"
                    label={`${row.expiring} expiring`}
                    sx={{
                      bgcolor: BRAND.alert.warningSoft,
                      color: BRAND.alert.warningText,
                      fontWeight: 700,
                      fontSize: 10.5,
                    }}
                  />
                )}
                {row.flagged > 0 && (
                  <Chip
                    size="small"
                    label={`${row.flagged} flagged`}
                    sx={{
                      bgcolor: BRAND.alert.highSoft,
                      color: BRAND.alert.high,
                      fontWeight: 700,
                      fontSize: 10.5,
                    }}
                  />
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </SectionPaper>
  );
}
