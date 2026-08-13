// src/components/CryptoDiscovery/PqcReadinessPanels.jsx
//
// The post-quantum readiness surface (ADR-0004 e-F1 / e-F2), fed by a
// single GET /api/v1/cdp/pqc.
//
// The framing matters as much as the numbers. "How many certificates use
// RSA" is ~all of them and tells an operator nothing. What this shows is
// **which certificates will still be in service when the deadlines land**,
// split by role — because replacing a trust anchor is a multi-year
// distribution project while renewing a leaf you hold the key for is a
// Tuesday.
//
// Design constraints carried over from the dashboard: no categorical
// colour anywhere (the brand ramp fails the CVD separation floor), single
// hue plus text labels, status colours reserved for genuine states.

import * as React from "react";
import { Box, Chip, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import SectionPaper from "../common/SectionPaper";
import { BRAND } from "../../theme/brand";

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

function Empty({ children }) {
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

// ── 1. The anchor metric ─────────────────────────────────────────────

function HorizonBlock({ year, data, emphasis }) {
  const total = data?.total ?? 0;
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        p: 2,
        borderRadius: 2,
        border: `1px solid ${emphasis ? BRAND.alert.error : BRAND.border}`,
        bgcolor: emphasis ? BRAND.alert.errorSoft : BRAND.surfaceMuted,
      }}
    >
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.gray, letterSpacing: 0.6 }}>
        STILL VALID AFTER {year}
      </Typography>
      <Typography
        sx={{
          fontSize: 34,
          fontWeight: 800,
          lineHeight: 1.1,
          color: emphasis ? BRAND.alert.error : BRAND.dark,
        }}
      >
        {total.toLocaleString()}
      </Typography>
      <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
        <Typography sx={{ fontSize: 12, color: BRAND.dark }}>
          <strong>{(data?.ca ?? 0).toLocaleString()}</strong> certificate authorities
        </Typography>
        <Typography sx={{ fontSize: 12, color: BRAND.dark }}>
          <strong>{(data?.withPrivateKey ?? 0).toLocaleString()}</strong> with private key
        </Typography>
      </Stack>
    </Box>
  );
}

export function PqcHorizonPanel({ pqc }) {
  const outliving = pqc?.quantumBrokenOutliving;
  const deprecation = pqc?.deprecationYear ?? 2030;
  const disallowed = pqc?.disallowedYear ?? 2035;

  return (
    <SectionPaper sx={{ p: 2 }}>
      <PanelTitle hint="NIST IR 8547 (draft) proposes deprecating RSA and ECDSA after 2030 and disallowing them after 2035. A certificate that outlives those dates is a planning problem today, not in 2030.">
        Quantum-broken certificates outliving the deadlines
      </PanelTitle>

      {!outliving ? (
        <Empty>No certificate data yet.</Empty>
      ) : (
        <>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <HorizonBlock year={deprecation} data={outliving.beyondDeprecation} />
            <HorizonBlock year={disallowed} data={outliving.beyondDisallowed} emphasis />
          </Stack>
          <Typography sx={{ fontSize: 12, color: BRAND.gray, mt: 1.5 }}>
            Replacing a certificate authority means distributing a new root to every device
            years in advance. Renewing a leaf you hold the key for does not.
            {outliving.noExpiry > 0 && (
              <> {outliving.noExpiry} certificate(s) carry no expiry date at all.</>
            )}
          </Typography>
        </>
      )}
    </SectionPaper>
  );
}

// ── 2. Algorithm families ────────────────────────────────────────────

const FAMILY_META = {
  quantum_broken: {
    label: "Quantum-broken",
    hint: "RSA, ECDSA, EdDSA and friends — everything Shor's algorithm breaks. This is a statement about migration deadlines, not about the certificate being unsafe today.",
  },
  pq_safe: { label: "Post-quantum safe", hint: "ML-DSA, SLH-DSA, ML-KEM and the stateful hash-based signatures." },
  hybrid: { label: "Hybrid", hint: "A post-quantum algorithm bound together with a classical one." },
  unknown: {
    label: "Unclassified",
    hint: "An algorithm the control plane does not recognise yet. Deliberately not folded into either bucket: guessing would either hide a deadline or invent one.",
  },
};

export function PqcFamilyPanel({ pqc }) {
  const reported = Array.isArray(pqc?.byFamily) ? pqc.byFamily : [];
  const total = reported.reduce((sum, r) => sum + (r.total ?? 0), 0);

  // Every family is rendered, including the ones with nothing in them.
  // The backend only returns families it actually found, and omitting
  // the empty ones would hide the single most important line a
  // readiness panel can show: "post-quantum safe: 0". A zero here is the
  // finding, not the absence of one.
  const order = ["quantum_broken", "hybrid", "pq_safe", "unknown"];
  const byName = new Map(reported.map((r) => [r.family, r]));
  const rows = order.map(
    (family) =>
      byName.get(family) ?? { family, total: 0, nonRoot: 0, withPrivateKey: 0 }
  );

  return (
    <SectionPaper sx={{ p: 2, height: "100%" }}>
      <PanelTitle hint="Every certificate in the inventory, by algorithm family. Classification happens on the control plane, so it can be updated without touching a single endpoint.">
        Algorithm families
      </PanelTitle>

      {total === 0 ? (
        <Empty>No certificates inventoried yet.</Empty>
      ) : (
        <Stack spacing={1.25}>
          {rows.map((row) => {
            const meta = FAMILY_META[row.family] ?? { label: row.family, hint: null };
            const pct = Math.round(((row.total ?? 0) / total) * 100);
            return (
              <Box key={row.family}>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                  <Tooltip title={meta.hint ?? ""} arrow>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 600, cursor: meta.hint ? "help" : "default" }}>
                      {meta.label}
                    </Typography>
                  </Tooltip>
                  <Typography
                    sx={{ fontSize: 13, fontWeight: 700, color: row.total === 0 ? BRAND.gray : BRAND.dark }}
                  >
                    {row.total.toLocaleString()}
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
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 3,
                      bgcolor: row.family === "pq_safe" ? BRAND.alert.success : BRAND.tealText,
                    },
                  }}
                />
                {row.total > 0 && (
                  <Typography sx={{ fontSize: 11, color: BRAND.gray }}>
                    {row.nonRoot.toLocaleString()} outside trust stores ·{" "}
                    {row.withPrivateKey.toLocaleString()} with private key
                  </Typography>
                )}
              </Box>
            );
          })}
        </Stack>
      )}
    </SectionPaper>
  );
}

// ── 3. Trust anchors at risk ─────────────────────────────────────────

export function TrustAnchorsPanel({ pqc }) {
  const rows = Array.isArray(pqc?.trustAnchorsAtRisk) ? pqc.trustAnchorsAtRisk : [];
  const year = pqc?.disallowedYear ?? 2035;

  return (
    <SectionPaper sx={{ p: 2, height: "100%" }}>
      <PanelTitle hint="Certificate authorities using quantum-broken algorithms whose validity runs past the disallowed date. Each one is a distribution project: a new root has to reach every device before the old one stops being acceptable.">
        Trust anchors to replace
      </PanelTitle>

      {rows.length === 0 ? (
        <Empty>No trust anchors outlive {year}.</Empty>
      ) : (
        <Stack divider={<Box sx={{ borderTop: `1px solid ${BRAND.border}` }} />}>
          {rows.map((row) => (
            <Box key={row.fingerprint256} sx={{ py: 1, px: 0.5 }}>
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.subjectCN || `${row.fingerprint256?.slice(0, 16)}…`}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                <Chip
                  size="small"
                  label={[row.keyAlgorithm ?? "?", row.keySizeBits].filter(Boolean).join(" ")}
                  sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.dark, fontWeight: 700, fontSize: 10.5 }}
                />
                <Typography sx={{ fontSize: 11.5, color: BRAND.gray }}>
                  valid to {formatDate(row.notAfter)} · {row.deviceCount} device
                  {row.deviceCount === 1 ? "" : "s"}
                </Typography>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </SectionPaper>
  );
}

// ── 4. Agility blockers ──────────────────────────────────────────────

export function AgilityBlockersPanel({ pqc }) {
  const agility = pqc?.agility;
  const blockers = Array.isArray(agility?.blockers) ? agility.blockers : [];

  // One row per device, listing what blocks it.
  const byDevice = new Map();
  for (const b of blockers) {
    const key = b.agentId;
    if (!byDevice.has(key)) byDevice.set(key, { host: b.host || b.agentId, items: [] });
    byDevice.get(key).items.push(b);
  }

  return (
    <SectionPaper sx={{ p: 2 }}>
      <PanelTitle hint="Devices running a runtime with no post-quantum support. These are not a scheduling problem — they cannot migrate at all until the runtime is upgraded.">
        Devices that cannot migrate yet
      </PanelTitle>

      {byDevice.size === 0 ? (
        <Empty>
          Nothing we know how to judge is blocking migration. That is not the same as
          &ldquo;ready&rdquo;.
        </Empty>
      ) : (
        <>
          <Typography sx={{ fontSize: 12, color: BRAND.gray, mb: 1.5 }}>
            Thresholds: Java {agility.jvmMinMajor}+ (ML-KEM and ML-DSA arrived in that JDK),
            OpenSSL {agility.opensslMinVersion}+.
          </Typography>
          <Stack divider={<Box sx={{ borderTop: `1px solid ${BRAND.border}` }} />}>
            {[...byDevice.values()].map((device) => (
              <Box key={device.host} sx={{ py: 1, px: 0.5 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{device.host}</Typography>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5 }}>
                  {device.items.map((item) => (
                    <Tooltip key={`${item.runtime}-${item.version}`} title={item.reason} arrow>
                      <Chip
                        size="small"
                        label={`${item.runtime} ${item.version}`}
                        sx={{
                          bgcolor: BRAND.alert.highSoft,
                          color: BRAND.alert.high,
                          fontWeight: 700,
                          fontSize: 10.5,
                        }}
                      />
                    </Tooltip>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </>
      )}
    </SectionPaper>
  );
}
