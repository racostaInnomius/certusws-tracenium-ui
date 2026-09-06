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
import { Box, Chip, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
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

/**
 * Una fila que cuenta certificados o equipos NAVEGA (repaso UI 2026-09-05:
 * «todas las gráficas que permitan seleccionar certificados deberían llevar
 * al detalle»). Ratón y teclado, con nombre accesible.
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
const ROW_ACTION_SX = (clickable) =>
  clickable
    ? { cursor: "pointer", "&:hover": { bgcolor: BRAND.rowHover }, "&:focus-visible": { outline: `2px solid ${BRAND.tealText}`, outlineOffset: -2, borderRadius: 0.5 } }
    : {};

export function TrustAnchorsPanel({ pqc, onSelect }) {
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
            <Box
              key={row.fingerprint256}
              sx={{ py: 1, px: 0.5, ...ROW_ACTION_SX(Boolean(onSelect)) }}
              {...rowActionProps(onSelect ? () => onSelect(row) : null, `Open ${row.subjectCN || row.fingerprint256}`)}
            >
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

// Etiqueta legible de cada bloqueo. El umbral viene de la API.
const RUNTIME_LABEL = {
  jvm: (a) => `Java below ${a?.jvmMinMajor ?? 24}`,
  openssl: (a) => `OpenSSL below ${a?.opensslMinVersion ?? "3.5"}`,
  "os-tls": (a) => `OS TLS stack below the threshold (Windows build ${a?.windowsMinBuild ?? 26100} / macOS ${a?.macosMinMajor ?? 26})`
};
const RUNTIME_HINT = {
  jvm: "ML-KEM and ML-DSA arrived in that JDK; older JVMs cannot negotiate post-quantum TLS.",
  openssl: "OpenSSL gained X25519MLKEM768 in 3.5; anything linked against an older one stays classical.",
  "os-tls": "Everything that uses the system stack — on Windows that is IIS, RDP, WinRM, LDAPS and SMB, none of which appear in a software inventory. Clearing the threshold is not the same as having it on: Windows ships the ML-KEM groups disabled until policy enables them."
};

/**
 * Repaso UI 2026-09-06: la lista de equipos (uno por fila, chips por
 * causa) no cabía en una pantalla y no decía lo que importa: CUÁNTOS y
 * POR QUÉ. Ahora se agrupa por causa —una barra por bloqueo con su
 * recuento de equipos— y cada causa se despliega a sus equipos, que
 * llevan a Inventory. La cifra total sigue siendo la del embudo.
 */
export function AgilityBlockersPanel({ pqc, onSelectDevice }) {
  const agility = pqc?.agility;
  const blockers = Array.isArray(agility?.blockers) ? agility.blockers : [];
  const [open, setOpen] = React.useState(() => new Set());

  // Una fila por causa (runtime), con sus equipos deduplicados.
  const groups = React.useMemo(() => {
    const m = new Map();
    for (const b of blockers) {
      const key = b.runtime || "other";
      if (!m.has(key)) m.set(key, { runtime: key, devices: new Map(), versions: new Set() });
      const g = m.get(key);
      if (!g.devices.has(b.agentId)) g.devices.set(b.agentId, { agentId: b.agentId, host: b.host || b.agentId, versions: [] });
      g.devices.get(b.agentId).versions.push(b.version);
      if (b.version) g.versions.add(String(b.version));
    }
    return [...m.values()].sort((a, b) => b.devices.size - a.devices.size);
  }, [blockers]);
  const totalDevices = new Set(blockers.map((b) => b.agentId)).size;
  const max = Math.max(1, ...groups.map((g) => g.devices.size));
  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <SectionPaper sx={{ p: 2 }}>
      <PanelTitle hint="Devices running a runtime with no post-quantum support. These are not a scheduling problem — they cannot migrate at all until the runtime is upgraded.">
        Devices that cannot migrate yet{totalDevices ? ` (${totalDevices})` : ""}
      </PanelTitle>

      {groups.length === 0 ? (
        <Empty>
          Nothing we know how to judge is blocking migration. That is not the same as
          &ldquo;ready&rdquo;.
        </Empty>
      ) : (
        <Stack spacing={1.25}>
          {groups.map((g) => {
            const label = (RUNTIME_LABEL[g.runtime] || ((_a) => g.runtime))(agility);
            const isOpen = open.has(g.runtime);
            const versions = [...g.versions].slice(0, 6);
            return (
              <Box key={g.runtime}>
                <Box
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  aria-label={`${label}: ${g.devices.size} device(s)`}
                  onClick={() => toggle(g.runtime)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(g.runtime);
                    }
                  }}
                  sx={{ cursor: "pointer", borderRadius: 0.5, px: 0.5, mx: -0.5, "&:hover": { bgcolor: BRAND.rowHover }, "&:focus-visible": { outline: `2px solid ${BRAND.tealText}` } }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                    <Tooltip title={RUNTIME_HINT[g.runtime] || ""} arrow>
                      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600, cursor: "help" }}>
                        {label}
                        {versions.length ? <Box component="span" sx={{ color: TEXT_MUTED, fontWeight: 400 }}> · seen: {versions.join(", ")}{g.versions.size > 6 ? "…" : ""}</Box> : null}
                      </Typography>
                    </Tooltip>
                    <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark, whiteSpace: "nowrap" }}>
                      {g.devices.size} device{g.devices.size === 1 ? "" : "s"}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={(g.devices.size / max) * 100}
                    sx={{ mt: 0.5, height: 6, borderRadius: 3, bgcolor: BRAND.surfaceMuted, "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: BRAND.alert.high } }}
                  />
                </Box>
                {isOpen ? (
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: "wrap", gap: 0.5 }}>
                    {[...g.devices.values()].map((d) => (
                      <Tooltip key={d.agentId} title={`${g.runtime} ${d.versions.filter(Boolean).join(", ")} — open in Inventory`} arrow>
                        <Chip
                          size="small"
                          label={d.host}
                          onClick={onSelectDevice ? () => onSelectDevice(d) : undefined}
                          sx={{ height: 22, fontSize: TEXT.xs }}
                        />
                      </Tooltip>
                    ))}
                  </Stack>
                ) : null}
              </Box>
            );
          })}
        </Stack>
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
export function CnsaPanel({ pqc, onSelect }) {
  const cnsa = pqc?.cnsa;
  if (!cnsa) return null;

  const c = cnsa.certificates || {};
  const next = (cnsa.gates || []).find((g) => !g.passed);

  // Cuarto elemento: el filtro de inventario que enseña EXACTAMENTE esa
  // cifra. Las dos clases post-cuánticas comparten familia `pq_safe`, así
  // que no tienen filtro exacto y no navegan: mejor inertes que engañosas.
  const rows = [
    ["Approved parameter sets", c.approved, "ML-KEM-1024 or ML-DSA-87 throughout.", null],
    [
      "Post-quantum, not approved",
      c.pqNotApproved,
      "Genuinely post-quantum, but a parameter set CNSA 2.0 excludes — ML-DSA-44/65, ML-KEM-512/768, or SLH-DSA, which the suite omits entirely. A parameter change, not a migration.",
      null
    ],
    ["Quantum-vulnerable", c.quantumVulnerable, "RSA, ECDSA and friends. A full algorithm migration.", { family: "quantum_broken" }],
    ["Not classified", c.unknown, "No algorithm we could read. Neither passed nor failed.", { family: "unknown" }]
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
        {rows.map(([label, value, hint, filter]) => (
          <Tooltip key={label} title={hint} arrow>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="baseline"
              sx={{ cursor: "help", px: 0.5, mx: -0.5, ...ROW_ACTION_SX(Boolean(onSelect && filter)) }}
              {...rowActionProps(onSelect && filter ? () => onSelect(filter) : null, `${label}: ${value ?? 0}`)}
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
