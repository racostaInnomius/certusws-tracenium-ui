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
// pestaña; un gajo del sunburst abre SU lista —Inventory, «Outside your
// devices» o las claves huérfanas, según dónde vivan esas filas— y una
// base amplía el sector, porque abarca las dos cosas a la vez (revisión
// 17-sep: había gajos que no llevaban a ningún sitio y otros que abrían
// una lista más corta que su propio número).

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
    { color: "#C7CBD1", text: "Revoked by its issuer, or not classified" },
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
    { color: "#C7CBD1", text: "Vendor roots (not yours to migrate), or revoked by the issuer" },
    { color: "#E4E7EC", text: "Base with no source connected yet" }
  ]
};

const RINGS = {
  keys: "Base → the store, keystore, vault, cluster or CA holding or certifying the key → its algorithm and size.",
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
  // ADR-0024: los que PUEDEN migrar con un ajuste. null (backend anterior o
  // sin evaluar) no se pinta como cero.
  const fixable = exposure?.devicesFixable ?? null;
  // ADR-0026 §7 — el porcentaje dice SOBRE QUÉ se calculó. Se calcula sólo
  // sobre lo que ven los agentes (y los servicios medidos); lo que vive fuera
  // de los equipos no entra, así que para quien no tiene nada conectado sale
  // optimista. Decirlo es más honesto que dejar que la cifra lo esconda.
  const outsideCerts = exposure?.outside?.certificates ?? null;
  const outsideSources = exposure?.outside?.sources ?? null;
  const basis =
    devicesReporting == null
      ? null
      : `Measured on ${fmt(devicesReporting)} device${Number(devicesReporting) === 1 ? "" : "s"} with an agent. ` +
        (outsideCerts > 0
          ? `The ${fmt(outsideCerts)} certificates found outside your devices are not in this figure.`
          : outsideSources === 0
            ? "Nothing outside your devices is connected, so this only covers what the agents see."
            : "");

  const pairs = [
    {
      label: "Quantum-broken certificates you own", value: own - ownPq, total: own, color: own - ownPq > 0 ? BRAND.alert.errorText : BRAND.dark,
      // `own` cuenta TODO lo que tiene clave, sus CA y raíces propias
      // incluidas: la lista con la lente por defecto (sólo entidades finales)
      // enseñaba 223 de 229 (24-sep).
      hint: "Private key on a device, your own CAs included. What the migration is planned on.",
      onClick: () => onDrillDown?.({ hasPrivateKey: true, certClass: "all", includeRoots: true }, { replace: true })
    },
    {
      label: "Services on classical key exchange", value: kemC, total: measured, color: kemC > 0 ? BRAND.alert.errorText : BRAND.dark,
      hint: "Traffic recorded today can be decrypted later. Opens the certificates those services present.",
      // La lista es de CERTIFICADOS: la cifra de debajo dice cuántos, para
      // que «45» no aterrice en «33» sin explicación (25-sep). Lente entera,
      // como la cuenta el servidor.
      onClick: () => onDrillDown?.({ kem: "classical", certClass: "all", includeRoots: true }, { replace: true }),
      sub: kemC > 0 && exposure?.kem?.classicalCerts != null ? `on ${fmt(exposure.kem.classicalCerts)} certificate${exposure.kem.classicalCerts === 1 ? "" : "s"}` : null,
      subHint: "Several services can present the same certificate (one per device or port).",
      subColor: TEXT_MUTED
    },
    {
      label: "Systems without a wave", value: systemsTotal == null ? null : systemsTotal - systemsPlanned, total: systemsTotal, color: BRAND.dark,
      hint: "Groups of certificates that migrate together.", onClick: () => onOpenRoadmap?.()
    },
    {
      label: "Devices that cannot migrate yet", value: blocked, total: devicesReporting ?? null, color: blocked > 0 ? BRAND.alert.warningText : BRAND.dark,
      hint: "Runtime or OS without post-quantum primitives.", onClick: () => onOpenRoadmap?.(),
      // Debajo, sin quinta columna: el complemento del mismo par.
      sub: fixable > 0 ? `+ ${fmt(fixable)} can migrate with a fix` : null,
      subHint: "The OS TLS stack supports post-quantum key exchange but has it turned off, is governed by a group policy, or needs an update."
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
          {basis ? <Typography sx={{ mt: 0.25, fontSize: TEXT.xs, color: TEXT_MUTED }}>{basis}</Typography> : null}
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
            {p.sub ? (
              <Typography title={p.subHint} sx={{ fontSize: TEXT.xs, color: p.subColor ?? BRAND.tealText, fontWeight: 600, lineHeight: 1.2 }}>
                {p.sub}
              </Typography>
            ) : null}
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
export function QuantumSunburst({ exposure, overview, refreshNonce = 0, onSelect }) {
  const [mode, setMode] = React.useState("keys");
  const [data, setData] = React.useState({});
  const [error, setError] = React.useState(null);
  // Sector ampliado. Una base no navega —abarca el inventario de equipos Y
  // lo de fuera, y no hay lista que junte las dos cosas— así que se abre:
  // es además lo que hace visible un origen pequeño (vCenter con 3
  // certificados junto a un almacén con 1.000).
  const [focus, setFocus] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setError(null);
    const load =
      mode === "certs"
        ? // `sunburst_bucket` parte el anillo como las listas (25-sep); un
          // backend anterior la rechaza con 400 y se cae a la partición vieja.
          getCdpFacets({ by: ["sunburst_bucket", "key_algorithm"], stack: "key_size_bits", limit: 1000 })
            .catch(() => getCdpFacets({ by: ["ownership", "source", "key_algorithm"], stack: "key_size_bits", limit: 1000 }))
            .then((r) => r?.rows ?? [])
        : mode === "keys"
          ? // Los ficheros, aparte y sin ruta: el mismo certificado copiado en
            // dos rutas es UNA clave (ver buildKeysTree). Si esa consulta cae,
            // se cuenta por ruta como antes, no se pierde el gajo.
            Promise.all([
              getCdpFacets({ by: ["source", "store_name", "key_algorithm"], stack: "key_size_bits", hasPrivateKey: true, limit: 1000 }).then((r) => r?.rows ?? []),
              getCdpFacets({ by: ["key_algorithm"], stack: "key_size_bits", hasPrivateKey: true, source: "file", limit: 1000 }).then((r) => r?.rows ?? null).catch(() => null)
            ]).then(([rows, fileRows]) => ({ rows, fileRows }))
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
    if (mode === "keys") return buildKeysTree(rows.rows, { orphanKeys: overview?.orphanKeys?.total ?? 0, sshHostKeys, outsideBySource: outside, outsideByAlgorithm, fileRows: rows.fileRows });
    return buildServicesTree(rows);
  }, [data, mode, outside, outsideByAlgorithm, overview, sshHostKeys]);
  // Ampliado: el árbol es SOLO ese sector, así que ocupa la vuelta entera.
  const shown = React.useMemo(() => (tree && focus ? tree.filter((b) => b.key === focus) : tree), [tree, focus]);
  const layout = React.useMemo(() => (shown ? layoutSunburst(shown) : null), [shown]);
  const focused = focus ? BASES.find((b) => b.key === focus) : null;

  const centerValue = focus
    ? layout?.total ?? 0
    : mode === "certs"
      ? (Number(exposure?.total ?? 0) || layout?.total || 0) + outside.filter((s) => s.origin !== "ssh").reduce((s, x) => s + Number(x.certificates ?? 0), 0)
      : layout?.total ?? 0;

  // Un gajo: o amplía su base, o abre su lista. `null` = no hace nada
  // (una base vacía, una hoja sin destino).
  const actionFor = (a) => {
    if (a.empty) return null;
    // La base ampliada vuelve atrás: es lo que dice su etiqueta, y un clic
    // que no cambia nada se lee como que la vista se ha roto.
    if (a.base) return () => setFocus((f) => (f === a.base ? null : a.base));
    if (a.drill && onSelect) return () => onSelect(a.drill);
    return null;
  };
  const arcHint = (a) => {
    if (a.empty) return "nothing connected yet";
    if (a.base) return focus ? "click to go back to all bases" : "click to zoom into this base";
    if (!a.drill) return null;
    if (a.folded) return "the rest of this source, folded — opens the whole source";
    if (a.drill.to === "system") return "open this system's TLS services in Roadmap";
    return a.drill.to === "outside" ? "open in Explore → Outside your devices (valid only)" : a.drill.to === "orphans" ? "open the Orphan keys tab" : "open in Inventory";
  };

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
      {/* Una frase (24-sep): qué es cada base ya lo dicen su tooltip y la
          leyenda, y el párrafo largo lo repetía dos veces más. */}
      <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
        Click a base to zoom into it; click any slice inside to open the list it counts.
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: TEXT_MUTED }}>Group by:</Typography>
        <RadioGroup row value={mode} onChange={(e) => { setMode(e.target.value); setFocus(null); }} aria-label="Group by">
          {MODES.map((m) => (
            <FormControlLabel key={m.key} value={m.key} control={<Radio size="small" />} label={<Typography sx={{ fontSize: TEXT.md }}>{m.label}</Typography>} />
          ))}
        </RadioGroup>
      </Stack>
      {error ? <Typography sx={{ mt: 1, fontSize: TEXT.sm, color: BRAND.alert.errorText }}>{error}</Typography> : null}
      <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="center" sx={{ mt: 1 }}>
        <Box sx={{ position: "relative", width: 560, height: 560, flexShrink: 0, maxWidth: "100%" }} aria-label={`Sunburst by ${MODES.find((m) => m.key === mode)?.label}${focused ? `, zoomed into ${focused.label}` : ""}`}>
          <svg key={`${mode}:${focus ?? ""}`} width="560" height="560" viewBox="-280 -280 560 560" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            {(layout?.arcs ?? []).map((a) => {
              const act = actionFor(a);
              const hint = arcHint(a);
              return (
                <path
                  key={a.id}
                  className="cdp-sunburst-arc"
                  d={a.d}
                  fill={a.fill}
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  role={act ? "button" : undefined}
                  tabIndex={act ? 0 : undefined}
                  aria-label={act ? `${a.name}: ${fmt(a.value)} ${CENTER[mode]} — ${hint}` : undefined}
                  style={{ cursor: act ? "pointer" : "default", animationDelay: `${a.depth * 160}ms` }}
                  onClick={act ?? undefined}
                  onKeyDown={act ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } } : undefined}
                >
                  <title>{`${a.name}: ${a.empty ? "nothing connected yet" : `${fmt(a.value)} ${CENTER[mode]}`}${a.note ? ` · ${a.note}` : ""}${hint && !a.empty ? ` — ${hint}` : ""}`}</title>
                </path>
              );
            })}
            <circle cx="0" cy="0" r="58" fill="#FFFFFF" />
          </svg>
          {(layout?.labels ?? []).map((l, i) => (
            <Box
              key={`${mode}:${focus ?? ""}:${i}`}
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
          <Box sx={{ position: "absolute", left: 280, top: 280, transform: "translate(-50%, -50%)", textAlign: "center", width: 100 }}>
            <Typography sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: BRAND.dark, lineHeight: 1, pointerEvents: "none" }}>{layout ? fmt(centerValue) : "…"}</Typography>
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, pointerEvents: "none" }}>{CENTER[mode]}</Typography>
            {focused ? (
              <Box
                role="button"
                tabIndex={0}
                aria-label="Back to all bases"
                onClick={() => setFocus(null)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFocus(null); } }}
                sx={{ mt: 0.5, cursor: "pointer", fontSize: TEXT.xs, fontWeight: 700, color: BRAND.tealText, lineHeight: 1.1 }}
              >
                ← All bases
              </Box>
            ) : null}
          </Box>
        </Box>
        <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
          {focused ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
              <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>Showing {focused.label} only</Typography>
              <Box
                component="button"
                type="button"
                onClick={() => setFocus(null)}
                sx={{ border: "none", bgcolor: "transparent", p: 0, cursor: "pointer", fontSize: TEXT.sm, fontWeight: 700, color: BRAND.tealText }}
              >
                Show all bases
              </Box>
            </Stack>
          ) : null}
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
          {mode !== "services" ? (
            // El 9 % de la tira cuenta el intercambio híbrido de los
            // servicios; una clave o un certificado RSA sigue siendo rojo
            // aunque el servicio que lo usa negocie ML-KEM (14-sep).
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.75 }}>
              The hybrid key exchange counted in the readiness figure shows under Services / Resources. A key or certificate stays quantum-broken until it is post-quantum itself, whatever the handshake negotiates.
            </Typography>
          ) : null}
          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
            On-prem is only what the agents collect; the Windows CA sits inside Infra. A certificate found in two sources counts in both, so the rings can add up to more than the centre.
          </Typography>
        </Stack>
      </Stack>
      <CoverageGapLine gap={exposure?.coverageGap} />
    </SectionPaper>
  );
}

/**
 * ADR-0026 §4 — el NÚMERO DEL AGUJERO, con los datos del propio cliente: de
 * lo que emitió su CA y sigue vigente, cuánto está en un equipo que Tracenium
 * ve. Es el mejor argumento para poner agentes y no se dice con un
 * argumentario: lo dicen sus números.
 *
 * ⚠️ No acusa. Hay certificados que viven legítimamente en cosas que nunca
 * tendrán agente (un balanceador, un appliance), así que la frase dice «en
 * ningún equipo con agente», no «perdidos».
 *
 * Sin CA leída no se pinta: una frase con ceros no dice nada. Y si la lectura
 * es vieja —la CA se congela sin el complemento, o su lector dejó de leer—
 * se dice la fecha, para no presentar una foto vieja como actual.
 */
export function CoverageGapLine({ gap, now }) {
  // El reloj se lee UNA vez, al montar: leerlo en cada render lo haría
  // impuro (y el aviso de «vieja» podría parpadear entre renders).
  const [mountedAt] = React.useState(() => now ?? Date.now());
  if (!gap || !(gap.caIssued > 0)) return null;
  const elsewhere = Math.max(0, gap.caIssued - gap.caOnDevices);
  const lastRead = gap.caLastRead ? new Date(gap.caLastRead) : null;
  const stale = lastRead && mountedAt - lastRead.getTime() > 2 * 24 * 60 * 60 * 1000;
  return (
    <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${BRAND.border}` }} aria-label="Coverage gap">
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
        Your Windows CA issued <strong>{fmt(gap.caIssued)}</strong> certificates that have not expired
        {gap.caRevoked > 0 ? <> — <strong>{fmt(gap.caRevoked)}</strong> of them revoked by the CA</> : null}. Tracenium knows
        where <strong>{fmt(gap.caOnDevices)}</strong> of them are — on the {fmt(gap.devicesWithAgent)} devices with an
        agent.{" "}
        {elsewhere > 0 ? (
          <>
            The other <strong>{fmt(elsewhere)}</strong> are on machines without an agent, where nothing here can see
            them: who holds them, when they expire, or whether their key is still safe.
          </>
        ) : (
          "Every one of them is on a device you can see."
        )}
      </Typography>
      {stale ? (
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
          As last read from the CA on {lastRead.toLocaleDateString()}.
        </Typography>
      ) : null}
    </Box>
  );
}
