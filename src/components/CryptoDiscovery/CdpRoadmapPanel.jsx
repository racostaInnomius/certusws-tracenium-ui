// src/components/CryptoDiscovery/CdpRoadmapPanel.jsx
//
// Fase 3 del análisis de madurez (2026-09): la hoja de ruta PQC como
// producto. Un inventario dice qué tienes; esto dice qué hacer primero,
// por qué, y cómo vas.
//
// ── Reglas ───────────────────────────────────────────────────────────
//
// 1. El score se EXPLICA: cada fila enseña su desglose con los pesos que
//    publica el backend. Un número que no se puede discutir no se ejecuta.
// 2. La ola SUGERIDA y la ASIGNADA se distinguen a la vista: solo la
//    asignada es un plan. Sugerir no es decidir.
// 3. Excluir exige motivo. Nada desaparece; todo se explica.
// 4. Las recomendaciones citan su fuente, siempre.
// 5. La tendencia es lo que se enseña a un comité: si hay menos de dos
//    puntos, se dice que el histórico empieza hoy — no se pinta una línea
//    de un punto como si fuera una curva.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend
} from "recharts";
import SectionPaper from "../common/SectionPaper";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { getCdpRoadmap, getCdpRoadmapSystem, putCdpRoadmapPlan, getCdpReadinessHistory, postCdpReadinessSnapshot, getCdpPqcReadiness } from "../../api/cdp";
// Lo que quedaba con valor propio en el antiguo tab «Post-quantum» vive
// aquí, como referencias de la hoja de ruta. Lo que duplicaba al embudo
// (horizonte 2030/2035) y a Explore (familias) se retiró — consolidación
// 2026-09-04.
import { TrustAnchorsPanel, AgilityBlockersPanel, CnsaPanel } from "./PqcReadinessPanels";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());

const KIND_LABEL = {
  process: "Served by a process",
  target: "Remote service (probed)",
  issuer: "Issued by",
  subject: "By subject",
  "self-per-device": "Self-signed per device",
  source: "Outside your devices (vault, cloud, cluster, CA)"
};

const FACTOR_LABEL = {
  kemClassical: "Classical key exchange exposed",
  brokenToday: "Broken today",
  beyondDisallowed: "Outlives the disallow date",
  beyondDeprecation: "Outlives the deprecation date",
  isCa: "Includes a CA",
  agilityBlocked: "Devices that can't migrate",
  serverAuth: "TLS server certificates",
  blastRadius: "Blast radius (devices)"
};

// Color solo para estado: la ola es un estado. La 0 es exposición hoy.
const WAVE_SX = {
  0: { bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.errorText },
  1: { bgcolor: BRAND.alert.highSoft, color: BRAND.alert.high },
  2: { bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warningText },
  3: { bgcolor: BRAND.tealSoft, color: BRAND.tealText },
  4: { bgcolor: BRAND.surfaceMuted, color: BRAND.dark }
};

export function WaveChip({ wave, suggested, waves }) {
  if (wave == null) return <Chip size="small" label="unassigned" variant="outlined" sx={{ height: 20, fontSize: TEXT.xs }} />;
  const meta = (waves || []).find((w) => w.wave === wave);
  return (
    <Tooltip title={meta ? `${meta.label} — ${meta.why}` : ""} arrow>
      <Chip
        size="small"
        variant={suggested ? "outlined" : "filled"}
        label={`${suggested ? "suggested " : ""}wave ${wave}`}
        sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, ...(suggested ? { borderColor: WAVE_SX[wave]?.color, color: WAVE_SX[wave]?.color } : WAVE_SX[wave]) }}
      />
    </Tooltip>
  );
}

// ── Tendencia ─────────────────────────────────────────────────────────

export function ReadinessTrend({ snapshots, onSnapshot, snapshotBusy }) {
  // `date` es YYYY-MM-DD del backend; si faltara, la etiqueta queda vacía
  // en vez de tumbar el panel entero (un TypeError aquí dejaba la hoja de
  // ruta en blanco).
  const data = (snapshots || []).map((s) => ({ ...s, label: typeof s.date === "string" ? s.date.slice(5) : "" }));
  return (
    <SectionPaper>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark }}>Readiness over time</Typography>
        <Button size="small" variant="outlined" onClick={onSnapshot} disabled={snapshotBusy}>
          {snapshotBusy ? "Recording…" : "Record today's snapshot"}
        </Button>
      </Stack>
      {data.length < 2 ? (
        <Alert severity="info">
          {data.length === 0
            ? "No snapshots yet. The first one is recorded tonight, or now with the button above."
            : "One snapshot so far — a trend needs at least two. The history starts today."}
        </Alert>
      ) : (
        <Box sx={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(190,190,190,0.35)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: TEXT.sm, fill: BRAND.dark }} />
              <YAxis tick={{ fontSize: TEXT.sm, fill: BRAND.dark }} width={40} allowDecimals={false} />
              <RTooltip />
              <Legend wrapperStyle={{ fontSize: TEXT.sm }} />
              <Line type="monotone" dataKey="ownBeyondDisallowed" name="Yours, valid past 2035" stroke={BRAND.alert.error} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="kemClassical" name="Services: classical KEM only" stroke={BRAND.alert.high} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="systemsPlanned" name="Systems with a wave" stroke={BRAND.tealText} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="ownPostQuantum" name="Yours, post-quantum" stroke={BRAND.alert.success} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </SectionPaper>
  );
}

// ── Plan ──────────────────────────────────────────────────────────────

export function PlanDialog({ system, waves, open, onClose, onSaved }) {
  const [wave, setWave] = React.useState("");
  const [targetDate, setTargetDate] = React.useState("");
  const [owner, setOwner] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [excluded, setExcluded] = React.useState(false);
  const [excludeReason, setExcludeReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!open || !system) return;
    const p = system.plan || {};
    setWave(p.wave == null ? "" : String(p.wave));
    setTargetDate(p.targetDate || "");
    setOwner(p.owner || "");
    setNotes(p.notes || "");
    setDisplayName(p.displayName || "");
    setExcluded(p.excluded === true);
    setExcludeReason(p.excludeReason || "");
    setError(null);
  }, [open, system]);

  const canSave = !busy && (!excluded || excludeReason.trim().length >= 5);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await putCdpRoadmapPlan(system.key, {
        wave: wave === "" ? null : Number(wave),
        targetDate: targetDate || null,
        owner: owner || null,
        notes: notes || null,
        displayName: displayName || null,
        excluded,
        excludeReason: excluded ? excludeReason : null
      });
      if (r?.ok) onSaved?.();
      else setError(r?.error || "Could not save");
    } catch (e) {
      setError(e?.message || "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Plan: {system?.name}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Suggested: <WaveChip wave={system?.suggestedWave} suggested waves={waves} /> — assigning a wave is what turns a suggestion into a plan.
        </Typography>
        <TextField fullWidth margin="dense" label="Display name (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <TextField fullWidth margin="dense" select label="Wave" value={wave} onChange={(e) => setWave(e.target.value)} disabled={excluded}>
          <MenuItem value="">Unassigned</MenuItem>
          {(waves || []).map((w) => (
            <MenuItem key={w.wave} value={String(w.wave)}>
              {w.wave} — {w.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField fullWidth margin="dense" type="date" label="Target date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} InputLabelProps={{ shrink: true }} disabled={excluded} />
        <TextField fullWidth margin="dense" label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
        <TextField fullWidth margin="dense" multiline minRows={2} label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <FormControlLabel
          sx={{ mt: 1 }}
          control={<Switch size="small" checked={excluded} onChange={(e) => setExcluded(e.target.checked)} />}
          label={<Typography sx={{ fontSize: TEXT.md }}>Exclude from the roadmap</Typography>}
        />
        {excluded ? (
          <TextField
            fullWidth
            margin="dense"
            required
            label="Why (required)"
            value={excludeReason}
            onChange={(e) => setExcludeReason(e.target.value)}
            helperText="Nothing is deleted; the reason stays with the system. E.g. «rotated by AWS», «decommissioned 2027»."
          />
        ) : null}
        {error ? <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert> : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!canSave}>
          {busy ? "Saving…" : "Save plan"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Detalle de un sistema ─────────────────────────────────────────────

/** Un sistema-origen vive fuera de los equipos: sus miembros están en Explore, no en Inventory. */
const isSourceSystem = (system) => typeof system?.key === "string" && system.key.startsWith("source:");

/** Etiqueta corta de un miembro: sujeto, o huella, o nombre — nunca `undefined.slice`. */
function memberTitle(m) {
  if (m.subjectCN) return m.subjectCN;
  if (typeof m.fingerprint256 === "string" && m.fingerprint256) return m.fingerprint256.slice(0, 16);
  return m.name || m.storeName || "(unnamed)";
}

function memberKey(m, i) {
  return `${m.agentId ?? "-"}:${m.fingerprint256 ?? m.name ?? i}:${m.port ?? ""}`;
}

function SystemDrawer({ system, waves, weights, onClose, onPlan, onDrillDown, onOpenCertificate }) {
  const [members, setMembers] = React.useState(null);
  const [membersError, setMembersError] = React.useState(null);
  React.useEffect(() => {
    if (!system) return;
    let alive = true;
    setMembers(null);
    setMembersError(null);
    getCdpRoadmapSystem(system.key)
      .then((r) => alive && setMembers(r?.members ?? []))
      .catch((e) => {
        if (!alive) return;
        // «0 members» sería una afirmación sobre el sistema; la verdad es
        // «no pude leerlos».
        setMembers([]);
        setMembersError(e?.message || String(e));
      });
    return () => {
      alive = false;
    };
  }, [system]);

  if (!system) return null;
  // Todo lo que el backend puede no traer se degrada a vacío, no a un
  // TypeError que tumba el cajón entero.
  const f = system.factors ?? {};
  const breakdown = system.scoreBreakdown ?? {};
  const recommendations = Array.isArray(system.recommendations) ? system.recommendations : [];
  const outside = isSourceSystem(system);
  const openLabel = outside ? "Open in Explore" : "Open in Inventory";
  return (
    <Box sx={{ p: 2, width: { xs: "100%", sm: 520 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: TEXT.lg, color: BRAND.dark }}>{system.name}</Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, fontFamily: "monospace" }}>{system.key}</Typography>
        </Box>
        <IconButton size="small" aria-label="Close" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1 }}>
        <WaveChip wave={system.plan?.wave ?? null} waves={waves} />
        <WaveChip wave={system.suggestedWave} suggested waves={waves} />
        {system.plan?.excluded ? <Chip size="small" label={`excluded: ${system.plan.excludeReason}`} sx={{ height: 20, fontSize: TEXT.xs }} /> : null}
        <Button size="small" variant="contained" onClick={() => onPlan(system)}>Edit plan</Button>
      </Stack>

      <Typography sx={{ fontWeight: 700, fontSize: TEXT.md, mt: 2.5, mb: 0.5 }}>Why this priority ({system.score})</Typography>
      <Stack spacing={0.25}>
        {Object.entries(breakdown).map(([k, v]) => (
          <Stack key={k} direction="row" justifyContent="space-between">
            <Typography sx={{ fontSize: TEXT.sm }}>{FACTOR_LABEL[k] ?? k}</Typography>
            <Typography sx={{ fontSize: TEXT.sm, fontVariantNumeric: "tabular-nums" }}>+{v}</Typography>
          </Stack>
        ))}
        {Object.keys(breakdown).length === 0 ? <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>Nothing weighs on this system.</Typography> : null}
      </Stack>
      <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
        Weights: KEM {weights?.kemClassical} · broken today {weights?.brokenToday} · past 2035 {weights?.beyondDisallowed} · past 2030 {weights?.beyondDeprecation} · CA {weights?.isCa} · blocked {weights?.agilityBlocked} · server {weights?.serverAuth} · radius ≤{weights?.blastRadiusMax}
      </Typography>

      <Typography sx={{ fontWeight: 700, fontSize: TEXT.md, mt: 2.5, mb: 0.5 }}>Facts</Typography>
      <Typography sx={{ fontSize: TEXT.sm }}>
        {outside
          ? `${fmt(f.certs)} asset(s) (${fmt(f.uniqueCerts)} distinct) at the source · ${fmt(f.withPrivateKey)} with private key · ${fmt(f.isCa)} CA`
          : `${fmt(f.certs)} certificates (${fmt(f.uniqueCerts)} distinct) on ${fmt(f.devices)} device(s) · ${fmt(f.withPrivateKey)} with private key · ${fmt(f.isCa)} CA`}
        {f.listeners ? ` · ${fmt(f.listeners)} TLS endpoint(s): ${fmt(f.kemHybrid)} hybrid, ${fmt(f.kemClassical)} classical, ${fmt(f.kemUnknown)} unknown` : ""}
        {f.brokenToday ? ` · ${fmt(f.brokenToday)} broken today` : ""}
        {f.beyondDisallowed ? ` · ${fmt(f.beyondDisallowed)} valid past 2035` : f.beyondDeprecation ? ` · ${fmt(f.beyondDeprecation)} valid past 2030` : ""}
        {f.agilityBlockedDevices ? ` · ${fmt(f.agilityBlockedDevices)} device(s) can't migrate yet` : ""}
      </Typography>

      {recommendations.length > 0 ? (
        <>
          <Typography sx={{ fontWeight: 700, fontSize: TEXT.md, mt: 2.5, mb: 0.5 }}>Recommendations</Typography>
          <Stack spacing={1}>
            {recommendations.map((r, i) => (
              <Box key={i} sx={{ borderLeft: `3px solid ${BRAND.teal}`, pl: 1.25 }}>
                <Typography sx={{ fontSize: TEXT.sm }}>{r.text}</Typography>
                <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>Source: {r.source}</Typography>
              </Box>
            ))}
          </Stack>
        </>
      ) : null}

      <Typography sx={{ fontWeight: 700, fontSize: TEXT.md, mt: 2.5, mb: 0.5 }}>
        Members {members && !membersError ? `(${members.length})` : ""}
        <Button size="small" sx={{ ml: 1 }} onClick={() => onDrillDown?.(system)}>{openLabel}</Button>
      </Typography>
      {members == null ? <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>Loading…</Typography> : null}
      {membersError ? <Alert severity="error" sx={{ mb: 1 }}>Couldn&apos;t load the members: {membersError}</Alert> : null}
      <Stack spacing={0.5}>
        {(members || []).slice(0, 50).map((m, i) => {
          const where = m.host || m.agentId || m.storeName || "";
          const key = m.keyAlgorithm ? `${m.keyAlgorithm}${m.keySizeBits ? `-${m.keySizeBits}` : ""}` : null;
          const expires = typeof m.notAfter === "string" && m.notAfter ? m.notAfter.slice(0, 10) : null;
          const bits = [where, key, expires ? `expires ${expires}` : null].filter(Boolean);
          // Un miembro con huella en un equipo tiene ficha propia en el
          // inventario; uno de origen (sin agente) no la tiene.
          const open = !outside && onOpenCertificate && typeof m.fingerprint256 === "string" && m.fingerprint256
            ? () => onOpenCertificate(m.fingerprint256)
            : null;
          return (
            <Box
              key={memberKey(m, i)}
              {...(open
                ? {
                    role: "button",
                    tabIndex: 0,
                    "aria-label": `Open certificate ${memberTitle(m)}`,
                    onClick: open,
                    onKeyDown: (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open();
                      }
                    }
                  }
                : {})}
              sx={{
                fontSize: TEXT.sm,
                borderBottom: `1px solid ${BRAND.border}`,
                pb: 0.5,
                ...(open ? { cursor: "pointer", "&:hover": { bgcolor: BRAND.rowHover }, "&:focus-visible": { outline: `2px solid ${BRAND.tealText}`, borderRadius: 0.5 } } : {})
              }}
            >
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600 }}>{memberTitle(m)}</Typography>
              <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                {bits.join(" · ")}
                {m.processName ? ` · ${m.processName}:${m.port}` : ""}
                {m.kemHybrid === true ? " · hybrid KEM" : m.kemHybrid === false ? " · classical KEM" : ""}
                {Array.isArray(m.usedBy) && m.usedBy.length ? ` · used by ${m.usedBy.slice(0, 3).join(", ")}${m.usedBy.length > 3 ? "…" : ""}` : ""}
              </Typography>
            </Box>
          );
        })}
        {members && members.length > 50 ? <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>+{members.length - 50} more — {openLabel.toLowerCase()}</Typography> : null}
      </Stack>
    </Box>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────

export default function CdpRoadmapPanel({ refreshNonce, onDrillDown, onOpenOutside, onOpenCertificate }) {
  const [data, setData] = React.useState(null);
  const [snapshots, setSnapshots] = React.useState([]);
  const [pqc, setPqc] = React.useState(null);
  const [pqcError, setPqcError] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [nonce, setNonce] = React.useState(0);
  const [selected, setSelected] = React.useState(null);
  const [planFor, setPlanFor] = React.useState(null);
  const [snapshotBusy, setSnapshotBusy] = React.useState(false);
  const [showExcluded, setShowExcluded] = React.useState(false);
  // Una tarjeta de ola es un contador: clic = la tabla filtrada a esa ola
  // (asignada o sugerida). Otro clic la quita.
  const [waveFilter, setWaveFilter] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([getCdpRoadmap(), getCdpReadinessHistory(180)])
      .then(([r, h]) => {
        if (!alive) return;
        setData(r ?? null);
        setSnapshots(h?.snapshots ?? []);
      })
      .catch((e) => alive && setError(e?.message || String(e)));
    // Las referencias (agilidad, CNSA, anclas) vienen de /pqc; fallo
    // blando: sin ellas la hoja de ruta sigue siendo legible — pero se
    // dice que faltan, en vez de desaparecer sin más.
    setPqcError(null);
    getCdpPqcReadiness()
      .then((r) => alive && setPqc(r?.pqc ?? null))
      .catch((e) => {
        if (!alive) return;
        setPqc(null);
        setPqcError(e?.message || String(e));
      });
    return () => {
      alive = false;
    };
  }, [refreshNonce, nonce]);

  const effectiveWave = (s) => s.plan?.wave ?? s.suggestedWave;
  const systems = (data?.systems ?? []).filter(
    (s) => (showExcluded || !s.plan?.excluded) && (waveFilter == null || effectiveWave(s) === waveFilter)
  );
  const waves = data?.waves ?? [];
  const byWave = React.useMemo(() => {
    const m = {};
    for (const s of data?.systems ?? []) {
      if (s.plan?.excluded) continue;
      const w = s.plan?.wave ?? s.suggestedWave;
      m[w] = m[w] || { assigned: 0, suggested: 0 };
      if (s.plan?.wave != null) m[w].assigned += 1;
      else m[w].suggested += 1;
    }
    return m;
  }, [data]);

  const snapshotNow = async () => {
    setSnapshotBusy(true);
    try {
      await postCdpReadinessSnapshot();
      setNonce((n) => n + 1);
    } finally {
      setSnapshotBusy(false);
    }
  };

  const drill = (s) => {
    // Un sistema-origen no tiene filas en el inventario de equipos: sus
    // miembros están en «Outside your devices» (Explore).
    if (isSourceSystem(s)) return onOpenOutside ? onOpenOutside(s) : onDrillDown?.({ search: s.sampleSubject || "" });
    // Al listado con el filtro que mejor identifica al sistema.
    if (s.key.startsWith("issuer:")) return onDrillDown?.({ issuer: s.sampleIssuer, hasPrivateKey: true });
    if (s.key.startsWith("target:")) return onDrillDown?.({ source: "probe" });
    if (s.key.startsWith("process:")) return onDrillDown?.({ source: "listener", search: s.sampleSubject || "" });
    return onDrillDown?.({ search: s.sampleSubject || "", hasPrivateKey: true });
  };

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}

      <ReadinessTrend snapshots={snapshots} onSnapshot={snapshotNow} snapshotBusy={snapshotBusy} />

      <SectionPaper>
        <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark, mb: 1 }}>Waves</Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
          {waves.map((w) => (
            <Tooltip key={w.wave} title={`${w.why}${waveFilter === w.wave ? " — click to show all waves" : " — click to list these systems"}`} arrow>
              <Box
                role="button"
                tabIndex={0}
                aria-pressed={waveFilter === w.wave}
                aria-label={`Wave ${w.wave}: ${fmt(byWave[w.wave]?.assigned ?? 0)} assigned, ${fmt(byWave[w.wave]?.suggested ?? 0)} suggested`}
                onClick={() => setWaveFilter((cur) => (cur === w.wave ? null : w.wave))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setWaveFilter((cur) => (cur === w.wave ? null : w.wave));
                  }
                }}
                sx={{
                  border: `1px solid ${waveFilter === w.wave ? BRAND.tealText : BRAND.border}`,
                  bgcolor: waveFilter === w.wave ? BRAND.tealSoft : undefined,
                  borderRadius: 1,
                  px: 1.5,
                  py: 1,
                  minWidth: 170,
                  cursor: "pointer",
                  "&:hover": { borderColor: BRAND.tealText, bgcolor: BRAND.rowHover },
                  "&:focus-visible": { outline: `2px solid ${BRAND.tealText}`, outlineOffset: 2 }
                }}
              >
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <WaveChip wave={w.wave} waves={waves} />
                  <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600 }}>{w.label}</Typography>
                </Stack>
                <Typography sx={{ fontSize: TEXT.xs, color: BRAND.dark, mt: 0.5 }}>
                  {fmt(byWave[w.wave]?.assigned ?? 0)} assigned · {fmt(byWave[w.wave]?.suggested ?? 0)} suggested
                </Typography>
              </Box>
            </Tooltip>
          ))}
        </Stack>
      </SectionPaper>

      <SectionPaper>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark }}>
              Systems to migrate {data ? `(${systems.length})` : ""}
            </Typography>
            {waveFilter != null ? (
              <Chip size="small" label={`wave ${waveFilter}`} onDelete={() => setWaveFilter(null)} sx={{ height: 22, fontSize: TEXT.xs, bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700 }} />
            ) : null}
          </Stack>
          <FormControlLabel
            control={<Switch size="small" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} />}
            label={<Typography sx={{ fontSize: TEXT.md }}>Show excluded</Typography>}
          />
        </Stack>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8, mb: 1.5 }}>
          Only what you control or serve is here: certificates with a private key on a device, what TLS services
          actually present, and each connected source outside your devices (vault, cloud, cluster, CA, public CT) as
          one system. The thousands of vendor roots are not — they are not yours to migrate.
        </Typography>
        {data && systems.length === 0 ? (
          <Alert severity="info">No systems yet. Systems appear once devices report certificates they hold keys for, or TLS services.</Alert>
        ) : null}
        {/* La tabla desborda en pantallas estrechas; que desborde ELLA y no la página. */}
        <Box sx={{ overflowX: "auto" }}>
        <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: TEXT.sm }}>
          <Box component="thead">
            <Box component="tr" sx={{ textAlign: "left", color: TEXT_MUTED, fontSize: TEXT.xs, textTransform: "uppercase", letterSpacing: ".06em" }}>
              <Box component="th" sx={{ py: 0.75 }}>System</Box>
              <Box component="th">Wave</Box>
              <Box component="th" sx={{ textAlign: "right" }}>Devices</Box>
              <Box component="th" sx={{ textAlign: "right" }}>Certs</Box>
              <Box component="th" sx={{ textAlign: "right" }}>Priority</Box>
              <Box component="th">Recommendation</Box>
            </Box>
          </Box>
          <Box component="tbody">
            {systems.map((s) => (
              // La fila entera es clicable con el ratón, pero el control
              // accesible es el nombre: un <tr role="button"> rompe la
              // semántica de tabla para el lector de pantalla.
              <Box
                component="tr"
                key={s.key}
                onClick={() => setSelected(s)}
                sx={{ cursor: "pointer", borderTop: `1px solid ${BRAND.border}`, "&:hover": { bgcolor: BRAND.rowHover }, "&:focus-within": { bgcolor: BRAND.rowHover }, opacity: s.plan?.excluded ? 0.55 : 1 }}
              >
                <Box component="td" sx={{ py: 0.75, pr: 1 }}>
                  <Typography
                    component="span"
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${s.name}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(s);
                      }
                    }}
                    sx={{ display: "block", fontSize: TEXT.sm, fontWeight: 600, "&:focus-visible": { outline: `2px solid ${BRAND.tealText}`, outlineOffset: 2, borderRadius: 0.5 } }}
                  >
                    {s.name}
                  </Typography>
                  <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>{KIND_LABEL[s.kind] ?? s.kind}{s.plan?.owner ? ` · ${s.plan.owner}` : ""}{s.plan?.targetDate ? ` · by ${s.plan.targetDate}` : ""}</Typography>
                </Box>
                <Box component="td" sx={{ pr: 1 }}>
                  {s.plan?.excluded ? (
                    <Chip size="small" label="excluded" variant="outlined" sx={{ height: 20, fontSize: TEXT.xs }} />
                  ) : s.plan?.wave != null ? (
                    <WaveChip wave={s.plan.wave} waves={waves} />
                  ) : (
                    <WaveChip wave={s.suggestedWave} suggested waves={waves} />
                  )}
                </Box>
                <Box component="td" sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(s.factors?.devices)}</Box>
                <Box component="td" sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(s.factors?.certs)}</Box>
                <Box component="td" sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                  <Tooltip title={Object.entries(s.scoreBreakdown ?? {}).map(([k, v]) => `${FACTOR_LABEL[k] ?? k}: +${v}`).join(" · ") || "Nothing weighs on it"} arrow>
                    <span>{s.score}</span>
                  </Tooltip>
                </Box>
                <Box component="td" sx={{ fontSize: TEXT.xs, color: BRAND.dark, maxWidth: 360 }}>
                  {s.recommendations?.[0]?.text ? s.recommendations[0].text.slice(0, 110) + (s.recommendations[0].text.length > 110 ? "…" : "") : <span style={{ color: TEXT_MUTED }}>—</span>}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
        </Box>
      </SectionPaper>

      {pqcError ? (
        <Alert severity="warning">
          The references below (agility blockers, CNSA 2.0, trust anchors) didn&apos;t load: {pqcError}. The systems
          list above is unaffected.
        </Alert>
      ) : null}

      {/* Referencias de la hoja de ruta: qué no puede migrar todavía, qué
          exige CNSA 2.0, y qué anclas habría que reemplazar. */}
      {pqc ? (
        <>
          <AgilityBlockersPanel
            pqc={pqc}
            // Un equipo bloqueado → sus certificados en Inventory (vista por equipo).
            onSelectDevice={onDrillDown ? (d) => onDrillDown({ view: "devices", search: d.host || d.agentId }) : undefined}
          />
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="stretch">
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <CnsaPanel pqc={pqc} onSelect={onDrillDown ? (f) => onDrillDown({ ...f, hasPrivateKey: true }) : undefined} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {/* Un ancla vive en un almacén de raíces: la lista la esconde salvo que se pidan. */}
              <TrustAnchorsPanel pqc={pqc} onSelect={onOpenCertificate ? (row) => onOpenCertificate(row.fingerprint256) : undefined} />
            </Box>
          </Stack>
        </>
      ) : null}

      <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelected(null)}>
        <SystemDrawer
          system={selected}
          waves={waves}
          weights={data?.weights}
          onClose={() => setSelected(null)}
          onPlan={(s) => setPlanFor(s)}
          onDrillDown={(s) => {
            setSelected(null);
            drill(s);
          }}
          onOpenCertificate={onOpenCertificate}
        />
      </Drawer>

      <PlanDialog
        system={planFor}
        waves={waves}
        open={Boolean(planFor)}
        onClose={() => setPlanFor(null)}
        onSaved={() => {
          setPlanFor(null);
          setSelected(null);
          setNonce((n) => n + 1);
        }}
      />
    </Stack>
  );
}
