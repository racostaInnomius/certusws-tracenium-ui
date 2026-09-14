// src/components/CryptoDiscovery/CdpQuantumExposure.jsx
//
// Bloque «Post-quantum readiness» + sunburst del Dashboard de Crypto
// Discovery (2026-09-10), a partir de la maqueta aprobada por el usuario:
// una tira de preparación con cuatro pares «vulnerable / total» y un
// sunburst con anillo base fijo (On-prem devices · Infra · Cloud · External key
// sources), agrupable por Keys, Services / Resources y Certificates.
//
// Datos: los que ya sirven a las otras pestañas. La tira sale de
// /cdp/exposure y del overview del dashboard; el sunburst pide facetas
// (certificados y claves) o el roadmap (servicios) al cambiar de vista.
// El modelo y el trazado están en cdpSunburst.js, sin React, con tests.
//
// Todo lo que cuenta navega: un par de la tira abre su lista o su
// pestaña; un arco del sunburst abre Inventory con el filtro de ese gajo.

import * as React from "react";
import { Box, FormControlLabel, GlobalStyles, Radio, RadioGroup, Stack, Typography } from "@mui/material";
import SectionPaper from "../common/SectionPaper";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { getCdpFacets, getCdpRoadmap } from "../../api/cdp";
import { BASES, buildCertificatesTree, buildKeysTree, buildServicesTree, layoutSunburst } from "./cdpSunburst";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());

const MODES = [
  { key: "keys", label: "Keys" },
  { key: "services", label: "Services / Resources" },
  { key: "certs", label: "Certificates" }
];

const LEGEND = {
  keys: [
    { color: BRAND.alert.error, text: "Quantum-broken key" },
    { color: BRAND.alert.success, text: "Post-quantum key" },
    { color: "#E4E7EC", text: "Base with no source connected yet" }
  ],
  services: [
    { color: BRAND.alert.success, text: "Hybrid ML-KEM negotiated" },
    { color: BRAND.alert.error, text: "Classical key exchange only, or a resource holding classical keys" },
    { color: BRAND.teal, text: "Where and by which process it was measured" },
    { color: "#E4E7EC", text: "Base with no source connected yet" }
  ],
  certs: [
    { color: BRAND.alert.error, text: "Quantum-broken certificate" },
    { color: BRAND.alert.success, text: "Post-quantum or hybrid certificate" },
    { color: "#C7CBD1", text: "Vendor roots: not yours to migrate" },
    { color: "#E4E7EC", text: "Base with no source connected yet" }
  ]
};

const RINGS = {
  keys: "Base → the store, keystore, vault or CA holding the key → its algorithm and size.",
  services: "Base → the process, target, cluster, account or CA that serves it → the key exchange it negotiated, or the keys it holds.",
  certs: "Base → the source the certificate came from → key algorithm and size."
};

const CENTER = { keys: "private keys", services: "services and resources", certs: "certificates" };

/**
 * Tira de preparación: un porcentaje y cuatro pares. El porcentaje es la
 * parte quantum-safe de lo que el cliente posee o sirve: certificados
 * propios post-cuánticos más servicios con KEM híbrido, sobre certificados
 * propios más servicios medidos. Debajo se enseñan las dos fracciones,
 * porque mezcla dos unidades a propósito y hay que poder deshacerlo.
 */
export function ReadinessStrip({ exposure, overview, devicesReporting, snapshotDate = null, onDrillDown, onOpenRoadmap }) {
  const own = Number(exposure?.own ?? 0);
  const ownPq = Number(exposure?.ownPostQuantum ?? 0);
  const kemH = Number(exposure?.kem?.hybrid ?? 0);
  const kemC = Number(exposure?.kem?.classicalOnly ?? 0);
  const measured = kemH + kemC;
  const all = own + measured;
  const pct = all > 0 ? Math.round((100 * (ownPq + kemH)) / all) : null;
  const systemsTotal = overview?.roadmap?.systemsTotal ?? null;
  const systemsPlanned = overview?.roadmap?.systemsPlanned ?? 0;
  const blocked = exposure?.devicesBlocked ?? overview?.roadmap?.devicesBlocked ?? null;

  const pairs = [
    {
      label: "Quantum-broken certificates you own", value: own - ownPq, total: own, color: own - ownPq > 0 ? BRAND.alert.errorText : BRAND.dark,
      hint: "Private key on a device. What the migration is planned on.", onClick: () => onDrillDown?.({ hasPrivateKey: true }, { replace: true })
    },
    {
      label: "Services on classical key exchange", value: kemC, total: measured, color: kemC > 0 ? BRAND.alert.errorText : BRAND.dark,
      hint: "Traffic recorded today can be decrypted later.", onClick: () => onDrillDown?.({ kem: "classical" }, { replace: true })
    },
    {
      label: "Systems without a wave", value: systemsTotal == null ? null : systemsTotal - systemsPlanned, total: systemsTotal, color: BRAND.dark,
      hint: "Groups of certificates that migrate together.", onClick: () => onOpenRoadmap?.()
    },
    {
      label: "Devices that cannot migrate yet", value: blocked, total: devicesReporting ?? null, color: blocked > 0 ? BRAND.alert.warningText : BRAND.dark,
      hint: "Runtime or OS without post-quantum primitives.", onClick: () => onOpenRoadmap?.()
    }
  ];

  // Compacta (14-sep): el usuario veía el sunburst por debajo del pliegue y
  // la animación de carga se perdía. Un renglón por par, la pista en el
  // tooltip, y en fila desde md en vez de lg.
  return (
    <SectionPaper sx={{ py: 1.5 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={0} sx={{ alignItems: "stretch" }}>
        <Box sx={{ width: { md: 300 }, flexShrink: 0, pr: { md: 2.5 }, borderRight: { md: `1px solid ${BRAND.border}` } }}>
          <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>Post-quantum readiness</Typography>
            <Typography component="span" sx={{ fontSize: TEXT["3xl"], fontWeight: 800, lineHeight: 1, color: BRAND.dark }} aria-label="Post-quantum readiness">
              {pct == null ? "—" : `${pct}%`}
            </Typography>
          </Stack>
          <Box role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} sx={{ mt: 0.75, height: 8, borderRadius: 999, bgcolor: all > 0 ? BRAND.alert.error : "#E4E7EC", overflow: "hidden" }}>
            <Box sx={{ height: "100%", width: `${pct ?? 0}%`, bgcolor: BRAND.alert.success }} />
          </Box>
          <Typography sx={{ mt: 0.5, fontSize: TEXT.xs, color: TEXT_MUTED }} title={snapshotDate ? `Systems and blocked devices as of the ${snapshotDate} roadmap snapshot.` : undefined}>
            {fmt(ownPq)} of {fmt(own)} certificates you own are post-quantum · {fmt(kemH)} of {fmt(measured)} TLS services negotiate hybrid ML-KEM.
          </Typography>
        </Box>
        {pairs.map((p, i) => (
          <Box
            key={p.label}
            role="button"
            tabIndex={0}
            title={p.hint}
            onClick={p.onClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                p.onClick?.();
              }
            }}
            sx={{
              flex: "1 1 0", minWidth: 0, px: { md: 2 }, pt: { xs: 1.25, md: 0 }, cursor: "pointer", borderRadius: 1,
              display: "flex", flexDirection: "column", justifyContent: "center",
              borderRight: { md: i < pairs.length - 1 ? `1px solid ${BRAND.border}` : "none" },
              "&:hover": { bgcolor: BRAND.rowHover }
            }}
          >
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, lineHeight: 1.2 }}>{p.label}</Typography>
            <Stack direction="row" spacing={0.75} alignItems="baseline">
              <Typography component="span" sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: p.color }}>{fmt(p.value)}</Typography>
              <Typography component="span" sx={{ fontSize: TEXT.md, color: TEXT_MUTED }}>/ {fmt(p.total)}</Typography>
            </Stack>
          </Box>
        ))}
      </Stack>
    </SectionPaper>
  );
}

/**
 * Sunburst con anillo base fijo. Pide sus propios datos al cambiar de
 * vista; `exposure` y `overview` llegan del Dashboard para no repetir
 * llamadas (activos externos, claves huérfanas).
 */
export function QuantumSunburst({ exposure, overview, refreshNonce = 0, onDrillDown }) {
  const [mode, setMode] = React.useState("keys");
  const [data, setData] = React.useState({});
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setError(null);
    const load =
      mode === "certs"
        ? getCdpFacets({ by: ["ownership", "source", "key_algorithm"], stack: "key_size_bits", limit: 1000 }).then((r) => r?.rows ?? [])
        : mode === "keys"
          ? getCdpFacets({ by: ["source", "store_name", "key_algorithm"], stack: "key_size_bits", hasPrivateKey: true, limit: 1000 }).then((r) => r?.rows ?? [])
          : getCdpRoadmap().then((r) => r?.systems ?? []);
    load
      .then((rows) => alive && setData((d) => ({ ...d, [mode]: rows })))
      .catch((e) => alive && setError(e?.message || String(e)));
    return () => {
      alive = false;
    };
  }, [mode, refreshNonce]);

  const outside = React.useMemo(() => exposure?.outside?.bySource ?? [], [exposure]);
  const outsideByAlgorithm = React.useMemo(() => exposure?.outside?.byAlgorithm ?? [], [exposure]);
  const sshHostKeys = outside.filter((s) => s.origin === "ssh").reduce((s, x) => s + Number(x.certificates ?? 0), 0);
  const tree = React.useMemo(() => {
    const rows = data[mode];
    if (!rows) return null;
    if (mode === "certs") return buildCertificatesTree(rows, outside, outsideByAlgorithm);
    if (mode === "keys") return buildKeysTree(rows, { orphanKeys: overview?.orphanKeys?.total ?? 0, sshHostKeys });
    return buildServicesTree(rows);
  }, [data, mode, outside, outsideByAlgorithm, overview, sshHostKeys]);
  const layout = React.useMemo(() => (tree ? layoutSunburst(tree) : null), [tree]);

  const centerValue = mode === "certs"
    ? (Number(exposure?.total ?? 0) || layout?.total || 0) + outside.filter((s) => s.origin !== "ssh").reduce((s, x) => s + Number(x.certificates ?? 0), 0)
    : layout?.total ?? 0;

  return (
    <SectionPaper>
      {/* Al cargar (y al cambiar de vista) los anillos crecen desde el
          centro, de dentro a fuera, y las etiquetas aparecen al final. Se
          respeta prefers-reduced-motion. */}
      <GlobalStyles styles={{
        "@keyframes cdpSunburstIn": { from: { opacity: 0, transform: "scale(0.15)" }, to: { opacity: 1, transform: "scale(1)" } },
        "@keyframes cdpSunburstLabel": { from: { opacity: 0 }, to: { opacity: 1 } },
        ".cdp-sunburst-arc": { transformOrigin: "0 0", animation: "cdpSunburstIn 560ms cubic-bezier(.2,.8,.2,1) both", transition: "opacity 120ms ease" },
        ".cdp-sunburst-arc:hover": { opacity: 0.82 },
        ".cdp-sunburst-label": { animation: "cdpSunburstLabel 400ms ease-out both" },
        "@media (prefers-reduced-motion: reduce)": { ".cdp-sunburst-arc, .cdp-sunburst-label": { animation: "none" } }
      }} />
      <Typography sx={{ fontSize: TEXT.xl, fontWeight: 700, color: BRAND.dark }}>Quantum exposure by base, source and algorithm</Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
        Inside out: On-prem devices, Infra, Cloud or External key sources → the source it came from (the Windows CA sits inside On-prem, after what the agents collect) → its algorithm or key exchange. Click a ring to open that slice in Inventory.
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: TEXT_MUTED }}>Group by:</Typography>
        <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Group by">
          {MODES.map((m) => (
            <FormControlLabel key={m.key} value={m.key} control={<Radio size="small" />} label={<Typography sx={{ fontSize: TEXT.md }}>{m.label}</Typography>} />
          ))}
        </RadioGroup>
      </Stack>
      {error ? <Typography sx={{ mt: 1, fontSize: TEXT.sm, color: BRAND.alert.errorText }}>{error}</Typography> : null}
      <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="center" sx={{ mt: 1 }}>
        <Box sx={{ position: "relative", width: 560, height: 560, flexShrink: 0, maxWidth: "100%" }} aria-label={`Sunburst by ${MODES.find((m) => m.key === mode)?.label}`}>
          <svg key={mode} width="560" height="560" viewBox="-280 -280 560 560" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            {(layout?.arcs ?? []).map((a) => (
              <path
                key={a.id}
                className="cdp-sunburst-arc"
                d={a.d}
                fill={a.fill}
                stroke="#FFFFFF"
                strokeWidth="2"
                role={a.drill && onDrillDown ? "button" : undefined}
                tabIndex={a.drill && onDrillDown ? 0 : undefined}
                aria-label={a.drill ? `${a.name}: ${fmt(a.value)} ${CENTER[mode]}` : undefined}
                style={{ cursor: a.drill && onDrillDown ? "pointer" : "default", animationDelay: `${a.depth * 160}ms` }}
                onClick={a.drill && onDrillDown ? () => onDrillDown(a.drill, { replace: true }) : undefined}
                onKeyDown={a.drill && onDrillDown ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDrillDown(a.drill, { replace: true }); } } : undefined}
              >
                <title>{`${a.name}: ${a.empty ? "nothing connected yet" : `${fmt(a.value)} ${CENTER[mode]}`}${a.note ? ` · ${a.note}` : ""}`}</title>
              </path>
            ))}
            <circle cx="0" cy="0" r="58" fill="#FFFFFF" />
          </svg>
          {(layout?.labels ?? []).map((l, i) => (
            <Box
              key={`${mode}:${i}`}
              className="cdp-sunburst-label"
              style={{ animationDelay: "560ms" }}
              sx={{
                position: "absolute", left: l.left, top: l.top, transform: `translate(-50%, -50%) rotate(${l.rotate.toFixed(1)}deg)`,
                color: l.color, fontSize: l.size, fontWeight: l.weight, whiteSpace: l.wrap ? "normal" : "nowrap", width: l.width ?? "auto",
                textAlign: "center", pointerEvents: "none", lineHeight: 1.05
              }}
            >
              {l.text}
            </Box>
          ))}
          <Box sx={{ position: "absolute", left: 280, top: 280, transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
            <Typography sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: BRAND.dark, lineHeight: 1 }}>{layout ? fmt(centerValue) : "…"}</Typography>
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>{CENTER[mode]}</Typography>
          </Box>
        </Box>
        <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: ".06em" }}>Legend</Typography>
          {LEGEND[mode].map((e) => (
            <Stack key={e.text} direction="row" spacing={1.25} alignItems="center">
              <Box sx={{ width: 12, height: 12, borderRadius: 0.75, bgcolor: e.color, flexShrink: 0 }} />
              <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>{e.text}</Typography>
            </Stack>
          ))}
          <Box sx={{ height: 1, bgcolor: BRAND.border }} />
          <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: ".06em" }}>Rings</Typography>
          <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>{RINGS[mode]}</Typography>
          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
            {BASES.map((b) => `${b.label}: ${b.note}`).join(" · ")}. A certificate found in two sources counts in both. Bases without a source stay on the chart so the map does not change when a connector is added in Settings.
          </Typography>
        </Stack>
      </Stack>
    </SectionPaper>
  );
}
