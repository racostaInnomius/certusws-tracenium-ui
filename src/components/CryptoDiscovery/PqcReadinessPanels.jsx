// src/components/CryptoDiscovery/PqcReadinessPanels.jsx
//
// Consolidación 2026-09-04: el horizonte 2030/2035 y las familias de
// algoritmo se retiraron de aquí — el embudo del Dashboard y la
// distribución por clave de Explore responden lo mismo con más contexto.
// Quedan las tres referencias con valor propio, montadas en Roadmap.
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
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import SectionPaper from "../common/SectionPaper";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";

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

function Empty({ children }) {
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

// ── 1. The anchor metric ─────────────────────────────────────────────

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
                  fontSize: TEXT.md,
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
                  sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.dark, fontWeight: 700, fontSize: TEXT.xs }}
                />
                <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
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
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, mb: 1.5 }}>
            Thresholds: Java {agility.jvmMinMajor}+ (ML-KEM and ML-DSA arrived in that JDK),
            OpenSSL {agility.opensslMinVersion}+, Windows{" "}
            {agility.windowsMinBuild ? `build ${agility.windowsMinBuild}` : "24H2"}+ and macOS{" "}
            {agility.macosMinMajor ?? 26}+ for the operating system&apos;s own TLS stack.
          </Typography>
          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mb: 1.5, fontStyle: "italic" }}>
            An <strong>os-tls</strong> blocker covers everything that uses the system stack —
            on Windows that is IIS, RDP, WinRM, LDAPS and SMB, none of which appear in a
            software inventory. Clearing the threshold is not the same as having it on:
            Windows ships the ML-KEM groups disabled until policy enables them.
          </Typography>
          <Stack divider={<Box sx={{ borderTop: `1px solid ${BRAND.border}` }} />}>
            {[...byDevice.values()].map((device) => (
              <Box key={device.host} sx={{ py: 1, px: 0.5 }}>
                <Typography sx={{ fontSize: TEXT.md, fontWeight: 600 }}>{device.host}</Typography>
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
                          fontSize: TEXT.xs,
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

/**
 * CNSA 2.0 assessment.
 *
 * ⚠️ The applicability line is not decoration. CNSA 2.0 is mandatory only
 * for US National Security Systems; for everyone else it is a reference
 * timeline. Showing counts and a countdown without that sentence would
 * tell a commercial customer they are out of compliance with something
 * that does not bind them. It comes from the API rather than being
 * written here, so the claim has one source.
 *
 * The panel leads with the 2027 gate because that is the number that
 * bears on a purchasing decision this year — unlike the 2030/2035
 * horizon above it, which comes from a NIST draft.
 */
export function CnsaPanel({ pqc }) {
  const cnsa = pqc?.cnsa;
  if (!cnsa) return null;

  const c = cnsa.certificates || {};
  const next = (cnsa.gates || []).find((g) => !g.passed);

  const rows = [
    ["Approved parameter sets", c.approved, "ML-KEM-1024 or ML-DSA-87 throughout."],
    [
      "Post-quantum, not approved",
      c.pqNotApproved,
      "Genuinely post-quantum, but a parameter set CNSA 2.0 excludes — ML-DSA-44/65, ML-KEM-512/768, or SLH-DSA, which the suite omits entirely. A parameter change, not a migration."
    ],
    ["Quantum-vulnerable", c.quantumVulnerable, "RSA, ECDSA and friends. A full algorithm migration."],
    ["Not classified", c.unknown, "No algorithm we could read. Neither passed nor failed."]
  ];

  return (
    <SectionPaper sx={{ p: 2 }}>
      <PanelTitle hint="CNSA 2.0 is the NSA's published suite: ML-KEM-1024 for key establishment and ML-DSA-87 for signatures, at the highest parameter sets only.">
        CNSA 2.0
      </PanelTitle>

      <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mb: 1.5, fontStyle: "italic" }}>
        {cnsa.applicability}
      </Typography>

      {next ? (
        <Box sx={{ mb: 2, p: 1.25, borderRadius: 1, bgcolor: BRAND.surfaceMuted }}>
          <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
            {next.daysRemaining} days to {next.date}
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>{next.label}</Typography>
        </Box>
      ) : null}

      <Stack spacing={0.75}>
        {rows.map(([label, value, hint]) => (
          <Tooltip key={label} title={hint} arrow>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="baseline"
              sx={{ cursor: "help" }}
            >
              <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>{label}</Typography>
              <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
                {value ?? 0}
              </Typography>
            </Stack>
          </Tooltip>
        ))}
      </Stack>

      {c.weakDigest > 0 ? (
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 1.5 }}>
          {c.weakDigest} of {c.total} also sit below the SHA-384 digest floor. Counted separately
          because on an estate that has already migrated its algorithms, the digest can be the
          only thing left failing.
        </Typography>
      ) : null}
    </SectionPaper>
  );
}
