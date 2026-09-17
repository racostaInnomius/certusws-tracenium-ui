// src/components/CryptoDiscovery/PqcReadinessPanels.jsx
//
// Consolidación 2026-09-04: el horizonte 2030/2035 y las familias de
// algoritmo se retiraron de aquí — el embudo del Dashboard y la
// distribución por clave de Explore responden lo mismo con más contexto.
// Quedan las referencias con valor propio, montadas en Roadmap: las
// anclas a reemplazar, lo que no puede migrar y lo que puede con un
// ajuste. «CNSA 2.0» se fue el 17-sep por el mismo criterio —contaba por
// parámetro lo que el sunburst ya cuenta por familia, y su plazo sólo
// obliga a los National Security Systems de EE. UU.
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
import { OS_TLS_FIX_STATE } from "./osTlsFixStates";
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
  "os-tls": "Everything that uses the system stack — on Windows that is IIS, RDP, WinRM, LDAPS and SMB, none of which appear in a software inventory. Windows builds that have the ML-KEM groups but keep them turned off are not listed here: they can migrate, and appear under «Devices that can migrate — need a fix»."
};

/**
 * Una fila por causa, con su recuento de equipos, que se despliega a sus
 * equipos (chips que llevan a Inventory). Lo comparten «no pueden migrar» y
 * «pueden migrar con un ajuste» (ADR-0024): la forma de leerlo es la misma,
 * cambia lo que significa.
 *
 * Repaso UI 2026-09-06: la lista de equipos (uno por fila, chips por
 * causa) no cabía en una pantalla y no decía lo que importa: CUÁNTOS y
 * POR QUÉ.
 */
function CauseGroups({ items, labelOf, hintOf, chipHintOf, barColor, onSelectDevice, causeOrder = null }) {
  const [open, setOpen] = React.useState(() => new Set());

  const groups = React.useMemo(() => {
    const m = new Map();
    for (const it of items) {
      const key = it.cause || "other";
      if (!m.has(key)) m.set(key, { cause: key, devices: new Map(), versions: new Set() });
      const g = m.get(key);
      if (!g.devices.has(it.agentId)) g.devices.set(it.agentId, { agentId: it.agentId, host: it.host || it.agentId, versions: [], item: it });
      g.devices.get(it.agentId).versions.push(it.version);
      if (it.version) g.versions.add(String(it.version));
    }
    const rank = (c) => (causeOrder ? causeOrder.indexOf(c) : -1);
    return [...m.values()].sort((a, b) => (causeOrder ? rank(a.cause) - rank(b.cause) : b.devices.size - a.devices.size));
  }, [items, causeOrder]);
  const max = Math.max(1, ...groups.map((g) => g.devices.size));
  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Stack spacing={1.25}>
      {groups.map((g) => {
        const label = labelOf(g.cause);
        const isOpen = open.has(g.cause);
        const versions = [...g.versions].slice(0, 6);
        return (
          <Box key={g.cause}>
            <Box
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              aria-label={`${label}: ${g.devices.size} device(s)`}
              onClick={() => toggle(g.cause)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(g.cause);
                }
              }}
              sx={{ cursor: "pointer", borderRadius: 0.5, px: 0.5, mx: -0.5, "&:hover": { bgcolor: BRAND.rowHover }, "&:focus-visible": { outline: `2px solid ${BRAND.tealText}` } }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                <Tooltip title={hintOf(g.cause) || ""} arrow>
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
                sx={{ mt: 0.5, height: 6, borderRadius: 3, bgcolor: BRAND.surfaceMuted, "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: barColor } }}
              />
            </Box>
            {isOpen ? (
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: "wrap", gap: 0.5 }}>
                {[...g.devices.values()].map((d) => (
                  <Tooltip key={d.agentId} title={chipHintOf(g.cause, d)} arrow>
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
  );
}

export function AgilityBlockersPanel({ pqc, onSelectDevice }) {
  const agility = pqc?.agility;
  const items = React.useMemo(
    () => (Array.isArray(agility?.blockers) ? agility.blockers : []).map((b) => ({ ...b, cause: b.runtime })),
    [agility]
  );
  const totalDevices = new Set(items.map((b) => b.agentId)).size;

  return (
    <SectionPaper sx={{ p: 2 }}>
      <PanelTitle hint="Devices running a runtime with no post-quantum support. These are not a scheduling problem — they cannot migrate at all until the runtime is upgraded.">
        Devices that cannot migrate yet{totalDevices ? ` (${totalDevices})` : ""}
      </PanelTitle>

      {items.length === 0 ? (
        <Empty>
          Nothing we know how to judge is blocking migration. That is not the same as
          &ldquo;ready&rdquo;.
        </Empty>
      ) : (
        <CauseGroups
          items={items}
          labelOf={(cause) => (RUNTIME_LABEL[cause] || (() => cause))(agility)}
          hintOf={(cause) => RUNTIME_HINT[cause]}
          chipHintOf={(cause, d) => `${cause} ${d.versions.filter(Boolean).join(", ")} — open in Inventory`}
          barColor={BRAND.alert.high}
          onSelectDevice={onSelectDevice}
        />
      )}
    </SectionPaper>
  );
}

// ── 4b. Can migrate — need a fix (ADR-0024) ──────────────────────────

const FIX_ORDER = Object.keys(OS_TLS_FIX_STATE);

/**
 * ADR-0024 — el complemento de «cannot migrate yet»: equipos cuya pila TLS
 * del sistema SÍ puede negociar intercambio de claves post-cuántico y aún
 * no lo hace. No son un bloqueo; en rojo no. Sólo lectura: el panel dice
 * cuántos y por qué, y lleva a Inventory.
 *
 * Sin `agility.fixable` (backend anterior) o vacío, no se pinta: un «nada
 * que arreglar» aquí se leería como «todo listo», y un equipo sin medir no
 * está en esta lista.
 */
export function OsTlsFixablePanel({ pqc, onSelectDevice }) {
  const fixable = pqc?.agility?.fixable;
  const items = React.useMemo(
    () => (Array.isArray(fixable) ? fixable : []).filter((f) => OS_TLS_FIX_STATE[f.state]).map((f) => ({ ...f, cause: f.state })),
    [fixable]
  );
  if (items.length === 0) return null;
  const totalDevices = new Set(items.map((f) => f.agentId)).size;

  return (
    <SectionPaper sx={{ p: 2 }}>
      <PanelTitle hint="The operating system's own TLS stack supports post-quantum (ML-KEM) key exchange but does not use it yet. Not a blocker: each one is a configuration change, a group policy or an OS update away.">
        Devices that can migrate — need a fix ({totalDevices})
      </PanelTitle>
      <CauseGroups
        items={items}
        causeOrder={FIX_ORDER}
        labelOf={(cause) => OS_TLS_FIX_STATE[cause].label}
        hintOf={(cause) => OS_TLS_FIX_STATE[cause].hint}
        chipHintOf={(_cause, d) => `${d.item?.reason || ""} — open in Inventory`}
        barColor={BRAND.teal}
        onSelectDevice={onSelectDevice}
      />
    </SectionPaper>
  );
}

