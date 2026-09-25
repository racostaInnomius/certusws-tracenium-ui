// src/components/CryptoDiscovery/CdpExplorePanels.jsx
//
// Fase 1 del análisis de madurez (2026-09): las vistas que faltaban.
//
// ── La tesis que ordena estos paneles ────────────────────────────────
//
// Medido en producción: 10.429 certificados vigentes, TODOS
// «quantum-broken», y solo 179 (1,7 %) con clave privada — los únicos que
// el cliente posee y puede migrar. El tablero contaba los 10.429 y le
// decía al cliente que todo su parque estaba roto. Verdad e inútil. La
// dimensión que ordena todo es la PROPIEDAD, y por eso el embudo va
// primero y todo lo demás se apila por ella.
//
// ── Reglas que estos paneles cumplen ─────────────────────────────────
//
// 1. Todo lo que cuenta navega: ningún número, barra ni segmento sin
//    onSelect. Un número que no lleva a su lista es un adorno.
// 2. Color solo para ESTADO, nunca para identidad. Medido: los teals
//    adyacentes de la paleta distan ΔE ~12, por debajo del suelo de 15.
//    Algoritmos y almacenes se distinguen por posición y etiqueta; la
//    propiedad se distingue por intensidad (propio = lleno, ajeno = tenue).
// 3. Dos lenguajes, un dato: el modo «explicar» añade una frase por
//    concepto para quien empieza; el dato es el mismo.

import * as React from "react";
import {
  Alert,
  Box,
  Chip,
  Collapse,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip as RTooltip
} from "recharts";
import SectionPaper from "../common/SectionPaper";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";

// ── Modo explicar ────────────────────────────────────────────────────

const EXPLAIN_KEY = "cdp.explain";

export function useExplainMode() {
  const [on, setOn] = React.useState(() => {
    try {
      const v = window.localStorage.getItem(EXPLAIN_KEY);
      // Por defecto ENCENDIDO: el análisis lo pidió para el cliente que
      // empieza, y quien ya sabe lo apaga una vez.
      return v == null ? true : v === "1";
    } catch {
      return true;
    }
  });
  const toggle = React.useCallback(() => {
    setOn((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(EXPLAIN_KEY, next ? "1" : "0");
      } catch {
        /* sin storage, sin persistencia; el toggle sigue funcionando */
      }
      return next;
    });
  }, []);
  return [on, toggle];
}

export function ExplainToggle({ on, onToggle }) {
  return (
    <FormControlLabel
      control={<Switch size="small" checked={on} onChange={onToggle} />}
      label={<Typography sx={{ fontSize: TEXT.md }}>Explain the terms</Typography>}
    />
  );
}

/** Una frase que sólo aparece en modo explicar. */
function Explain({ on, children }) {
  if (!on) return null;
  return (
    <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8, mt: 0.5 }}>
      {children}
    </Typography>
  );
}

// ── Propiedad: etiquetas y orden ─────────────────────────────────────

export const OWNERSHIP = {
  own_leaf: { label: "Yours (private key)", short: "Yours", explain: "Certificates this device holds the private key for. The only ones you can — and will have to — replace." },
  own_ca: { label: "Your own CA", short: "Your CA", explain: "A certificate authority whose private key lives on a device. Replacing it means distributing a new root everywhere first." },
  foreign: { label: "Third-party", short: "3rd-party", explain: "Leaves and intermediates that belong to someone else — cached chains, vendors' services." },
  vendor: { label: "Shipped with the OS / JVM", short: "Vendor", explain: "Root bundles from the operating system, a JVM or a browser. Not yours to migrate; the vendor rotates them." }
};
const OWNERSHIP_ORDER = ["own_leaf", "own_ca", "foreign", "vendor"];
// Intensidad, no matiz: propio lleno, ajeno tenue.
const OWNERSHIP_FILL = {
  own_leaf: BRAND.tealText,
  own_ca: BRAND.teal,
  foreign: "rgba(90,159,159,0.45)",
  vendor: "rgba(190,190,190,0.6)"
};

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());

// ── B · Distribución por clave ───────────────────────────────────────

/**
 * Barras horizontales apiladas por propiedad, una por algoritmo+tamaño.
 * Cada segmento navega. Sin color por identidad: la fila se identifica por
 * su etiqueta y el apilado por intensidad.
 */
export function KeyDistributionPanel({ facets, onSelect, explain, stackBy = "ownership" }) {
  const rows = React.useMemo(() => {
    const byKey = new Map();
    for (const r of facets?.rows ?? []) {
      const algo = r.keys.key_algorithm ?? "unknown";
      const bits = r.keys.key_size_bits;
      const id = `${algo}-${bits ?? "?"}`;
      const cur = byKey.get(id) || { id, algo, bits, total: 0, devices: 0, stacks: {} };
      cur.total += r.certs;
      cur.devices = Math.max(cur.devices, r.devices);
      cur.stacks[r.stack ?? "all"] = (cur.stacks[r.stack ?? "all"] || 0) + r.certs;
      byKey.set(id, cur);
    }
    return Array.from(byKey.values()).sort((a, b) => b.total - a.total);
  }, [facets]);
  const max = rows[0]?.total || 1;
  const stackKeys = stackBy === "ownership" ? OWNERSHIP_ORDER : Array.from(new Set(rows.flatMap((r) => Object.keys(r.stacks))));

  return (
    <SectionPaper>
      <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark, mb: 0.5 }}>Certificates by key algorithm and size</Typography>
      <Explain on={explain}>
        Every RSA and elliptic-curve key here is what a quantum computer would eventually break — but a 512- or
        1024-bit RSA key is already too small for today&apos;s hardware. What matters most is the dark segment: keys you
        own.
      </Explain>
      {rows.length === 0 ? (
        <Typography sx={{ color: TEXT_MUTED, fontSize: TEXT.md, py: 3, textAlign: "center" }}>No certificates match.</Typography>
      ) : (
        <Stack spacing={0.75} sx={{ mt: 1.5 }}>
          {rows.map((r) => {
            const weakNow = (r.algo === "RSA" && r.bits && r.bits < 2048) || (r.algo === "EC" && r.bits && r.bits < 256);
            return (
              <Stack key={r.id} direction="row" alignItems="center" spacing={1.5}>
                <Box sx={{ width: 120, flexShrink: 0 }}>
                  <Typography sx={{ fontSize: TEXT.md, fontWeight: 600, color: BRAND.dark, fontFamily: "monospace" }}>
                    {r.algo}-{r.bits ?? "?"}
                  </Typography>
                  {weakNow ? (
                    <Chip size="small" label="weak today" sx={{ height: 18, fontSize: TEXT.xs, bgcolor: BRAND.alert.highSoft, color: BRAND.alert.high }} />
                  ) : null}
                </Box>
                <Box sx={{ flex: 1, display: "flex", height: 22, bgcolor: BRAND.surfaceMuted, borderRadius: 0.5, overflow: "hidden" }}>
                  {stackKeys.map((k) => {
                    const v = r.stacks[k] || 0;
                    if (!v) return null;
                    const label = stackBy === "ownership" ? OWNERSHIP[k]?.label ?? k : k;
                    return (
                      <Tooltip key={k} title={`${label}: ${fmt(v)} certificate(s)`} arrow>
                        <Box
                          role="button"
                          tabIndex={0}
                          aria-label={`${r.algo}-${r.bits} ${label}: ${fmt(v)}`}
                          onClick={() => onSelect({ keyAlgorithm: r.algo, keySizeBits: r.bits, ...(stackBy === "ownership" && k.startsWith("own") ? { hasPrivateKey: true } : {}) })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSelect({ keyAlgorithm: r.algo, keySizeBits: r.bits });
                            }
                          }}
                          sx={{
                            width: `${(v / max) * 100}%`,
                            minWidth: 3,
                            bgcolor: stackBy === "ownership" ? OWNERSHIP_FILL[k] : BRAND.teal,
                            cursor: "pointer",
                            "&:hover": { filter: "brightness(0.9)" },
                            "&:focus-visible": { outline: `2px solid ${BRAND.tealText}` }
                          }}
                        />
                      </Tooltip>
                    );
                  })}
                </Box>
                <Typography sx={{ width: 150, flexShrink: 0, fontSize: TEXT.sm, color: BRAND.dark, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                  {fmt(r.total)} · {fmt(r.devices)} dev · <Box component="span" sx={{ color: BRAND.tealText, fontWeight: 600 }}>{fmt((r.stacks.own_leaf || 0) + (r.stacks.own_ca || 0))} yours</Box>
                </Typography>
              </Stack>
            );
          })}
          {stackBy === "ownership" ? (
            <Stack direction="row" spacing={2} sx={{ pt: 1, flexWrap: "wrap" }}>
              {OWNERSHIP_ORDER.map((k) => (
                <Stack key={k} direction="row" alignItems="center" spacing={0.5}>
                  <Box sx={{ width: 12, height: 12, bgcolor: OWNERSHIP_FILL[k], borderRadius: 0.5 }} />
                  <Typography sx={{ fontSize: TEXT.xs, color: BRAND.dark }}>{OWNERSHIP[k].label}</Typography>
                </Stack>
              ))}
            </Stack>
          ) : null}
        </Stack>
      )}
    </SectionPaper>
  );
}

// ── C · Almacenes ────────────────────────────────────────────────────

const SOURCE_LABELS = {
  store: "OS certificate store",
  "java-store": "Java keystore",
  listener: "TLS listener",
  file: "Certificate file on disk",
  nss: "Firefox / Thunderbird (NSS)",
  probe: "Remote TLS service (probed)"
};

export function StoresPanel({ stores, javaOnlyVendorBundles, onSelect, onOpenPolicy, explain }) {
  const [openSource, setOpenSource] = React.useState(() => new Set());
  const [openStore, setOpenStore] = React.useState(() => new Set());
  const toggle = (setter) => (key) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleSource = toggle(setOpenSource);
  const toggleStore = toggle(setOpenStore);

  const bySource = React.useMemo(() => {
    const m = new Map();
    for (const s of stores ?? []) {
      const cur = m.get(s.source) || { source: s.source, certs: 0, devices: new Set(), stores: [] };
      cur.certs += s.certs;
      for (const d of s.deviceList ?? []) cur.devices.add(d.agentId);
      cur.stores.push(s);
      m.set(s.source, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.certs - a.certs);
  }, [stores]);

  return (
    <SectionPaper>
      <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark, mb: 0.5 }}>Where certificates live</Typography>
      <Explain on={explain}>
        Source → store → device. A Java keystore is invisible to the operating system&apos;s store, and a service can
        serve a certificate that is in no store at all — that is what the TLS listener rows are.
      </Explain>

      {javaOnlyVendorBundles ? (
        <Alert severity="info" sx={{ mt: 1.5 }} action={onOpenPolicy ? <Chip size="small" label="Open policy" onClick={onOpenPolicy} /> : null}>
          Only JVM <code>cacerts</code> are being read — vendor root bundles. Your application keystores (the
          <code> keystore.jks</code> of a Tomcat, a <code>.p12</code> of a service) are <strong>not inventoried</strong> until
          their paths are added to the Crypto Discovery policy.
        </Alert>
      ) : null}

      <Stack spacing={0.5} sx={{ mt: 1.5 }}>
        {bySource.length === 0 ? (
          <Typography sx={{ color: TEXT_MUTED, fontSize: TEXT.md, py: 3, textAlign: "center" }}>No stores reported.</Typography>
        ) : null}
        {bySource.map((src) => {
          const open = openSource.has(src.source);
          return (
            <Box key={src.source}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 0.5 }}>
                <IconButton size="small" aria-label={`${open ? "Collapse" : "Expand"} ${SOURCE_LABELS[src.source] ?? src.source}`} onClick={() => toggleSource(src.source)}>
                  {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                </IconButton>
                <Typography
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect({ source: src.source })}
                  onKeyDown={(e) => e.key === "Enter" && onSelect({ source: src.source })}
                  sx={{ fontWeight: 700, fontSize: TEXT.md, color: BRAND.dark, cursor: "pointer", "&:hover": { color: BRAND.tealText } }}
                >
                  {SOURCE_LABELS[src.source] ?? src.source}
                </Typography>
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.75 }}>
                  {fmt(src.certs)} certs · {src.stores.length} store(s) · {src.devices.size} device(s)
                </Typography>
              </Stack>
              <Collapse in={open}>
                <Stack spacing={0.25} sx={{ pl: 4.5 }}>
                  {src.stores.map((st) => {
                    const key = `${st.source}|${st.storeName}`;
                    const isOpen = openStore.has(key);
                    return (
                      <Box key={key}>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 0.25 }}>
                          <IconButton size="small" aria-label={`${isOpen ? "Collapse" : "Expand"} ${st.storeName}`} onClick={() => toggleStore(key)}>
                            {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                          </IconButton>
                          <Typography
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelect({ source: st.source, storeName: st.storeName })}
                            onKeyDown={(e) => e.key === "Enter" && onSelect({ source: st.source, storeName: st.storeName })}
                            sx={{ fontSize: TEXT.sm, fontFamily: "monospace", color: BRAND.dark, cursor: "pointer", wordBreak: "break-all", "&:hover": { color: BRAND.tealText } }}
                          >
                            {st.storeName}
                          </Typography>
                          {st.vendorBundle ? <Chip size="small" label="vendor bundle" variant="outlined" sx={{ height: 18, fontSize: TEXT.xs }} /> : null}
                          {st.withPrivateKey > 0 ? <Chip size="small" label={`${fmt(st.withPrivateKey)} with key`} sx={{ height: 18, fontSize: TEXT.xs, bgcolor: BRAND.tealSoft, color: BRAND.tealText }} /> : null}
                          {st.expired > 0 ? <Chip size="small" label={`${fmt(st.expired)} expired`} sx={{ height: 18, fontSize: TEXT.xs, bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.errorText }} /> : null}
                          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.dark, opacity: 0.75, whiteSpace: "nowrap" }}>
                            {fmt(st.certs)} certs ({fmt(st.uniqueCerts)} distinct) · {fmt(st.devices)} device(s)
                          </Typography>
                        </Stack>
                        <Collapse in={isOpen}>
                          <Stack direction="row" spacing={0.5} sx={{ pl: 4.5, pb: 0.75, flexWrap: "wrap", rowGap: 0.5 }}>
                            {(st.deviceList ?? []).map((d) => (
                              <Chip
                                key={d.agentId}
                                size="small"
                                label={d.host || d.agentId}
                                onClick={() => onSelect({ source: st.source, storeName: st.storeName, agentId: d.agentId })}
                                sx={{ height: 20, fontSize: TEXT.xs }}
                              />
                            ))}
                            {st.devices > (st.deviceList ?? []).length ? (
                              <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, alignSelf: "center" }}>
                                +{st.devices - (st.deviceList ?? []).length} more
                              </Typography>
                            ) : null}
                          </Stack>
                        </Collapse>
                      </Box>
                    );
                  })}
                </Stack>
              </Collapse>
            </Box>
          );
        })}
      </Stack>
    </SectionPaper>
  );
}

// ── E · Línea de tiempo ──────────────────────────────────────────────

function TimelineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <Box sx={{ bgcolor: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 1, px: 1.5, py: 1, boxShadow: BRAND.shadow }}>
      <Typography sx={{ fontWeight: 700, fontSize: TEXT.md }}>{label}</Typography>
      {OWNERSHIP_ORDER.map((k) => (
        <Typography key={k} sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
          {OWNERSHIP[k].short}: {fmt(row[k])}
        </Typography>
      ))}
    </Box>
  );
}

export function TimelinePanel({ timeline, onSelect, explain, ownOnly = false }) {
  const data = React.useMemo(() => {
    const b = timeline?.buckets ?? [];
    return b.map((x) => ({
      ...x,
      label: x.bucket === "expired" ? "expired" : x.bucket === "beyond" ? `>${timeline.toYear}` : x.bucket === "no_expiry" ? "no date" : x.bucket
    }));
  }, [timeline]);
  const refs = timeline?.references ?? [];
  const keys = ownOnly ? ["own_leaf", "own_ca"] : OWNERSHIP_ORDER;

  const select = (row) => {
    if (!row) return;
    if (row.bucket === "expired") return onSelect({ status: "expired", ...(ownOnly ? { hasPrivateKey: true } : {}) });
    if (row.bucket === "beyond") return onSelect({ notAfterFrom: `${timeline.toYear + 1}-01-01`, ...(ownOnly ? { hasPrivateKey: true } : {}) });
    if (row.bucket === "no_expiry") return;
    onSelect({ notAfterFrom: `${row.year}-01-01`, notAfterTo: `${row.year + 1}-01-01`, ...(ownOnly ? { hasPrivateKey: true } : {}) });
  };

  return (
    <SectionPaper>
      <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark, mb: 0.5 }}>When certificates expire, against the deadlines</Typography>
      <Explain on={explain}>
        Anything that expires before a deadline gets replaced on its normal renewal — you only have to make sure the
        replacement is post-quantum by then. Anything that outlives a deadline is a migration you have to plan.
        Vertical lines are the reference dates; the dashed ones come from a draft.
      </Explain>
      <Box sx={{ height: 280, mt: 1.5 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }} onClick={(s) => select(s?.activePayload?.[0]?.payload)}>
            <CartesianGrid stroke="rgba(190,190,190,0.35)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: TEXT.sm, fill: BRAND.dark }} interval={0} angle={-35} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: TEXT.sm, fill: BRAND.dark }} width={44} allowDecimals={false} />
            <RTooltip content={<TimelineTooltip />} cursor={{ fill: BRAND.rowHover }} />
            {refs.map((r) => (
              <ReferenceLine
                key={`${r.year}:${r.label}`}
                x={String(r.year)}
                stroke={BRAND.alert.high}
                // `draft` desde el 24-sep; «borrador» es el texto de un backend anterior.
                strokeDasharray={r.draft === true || r.scope === "borrador" ? "4 4" : undefined}
                label={{ value: String(r.year), position: "top", fontSize: TEXT.xs, fill: BRAND.alert.high }}
              />
            ))}
            {keys.map((k) => (
              <Bar key={k} dataKey={k} stackId="a" fill={OWNERSHIP_FILL[k]} cursor="pointer" isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Box>
      <Stack direction="row" spacing={2} sx={{ pt: 1, flexWrap: "wrap", rowGap: 0.5 }}>
        {keys.map((k) => (
          <Stack key={k} direction="row" alignItems="center" spacing={0.5}>
            <Box sx={{ width: 12, height: 12, bgcolor: OWNERSHIP_FILL[k], borderRadius: 0.5 }} />
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.dark }}>{OWNERSHIP[k].label}</Typography>
          </Stack>
        ))}
        {refs.map((r) => (
          <Tooltip key={`${r.year}:${r.label}`} title={`${r.label} — ${r.scope}. ${r.source}`} arrow>
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.high, cursor: "help", borderBottom: `1px dotted ${BRAND.alert.high}` }}>
              {r.year}: {r.label}
            </Typography>
          </Tooltip>
        ))}
      </Stack>
    </SectionPaper>
  );
}

/** Interruptor «solo lo mío» compartido por los paneles de exploración. */
export function OwnershipScopeToggle({ value, onChange }) {
  return (
    <ToggleButtonGroup size="small" exclusive value={value} onChange={(_e, v) => v && onChange(v)}>
      <ToggleButton value="all">Everything</ToggleButton>
      <ToggleButton value="own">Only yours</ToggleButton>
    </ToggleButtonGroup>
  );
}
