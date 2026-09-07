// src/components/software-delivery/GlobalCatalogSegment.jsx
//
// ADR-0016 F2 — el catálogo de Tracenium, dentro de la pestaña Catalog.
//
// ⚠️ ES UN SEGMENTO, NO UNA QUINTA PESTAÑA. La fase 2 del refactor de SDP se
// llama «one door into the catalog» y la fase 3 retiró la pestaña de AI Intake
// con este argumento: revisar es un paso del flujo del catálogo, no una sección
// compitiendo en la barra. Esto es lo mismo — una tercera puerta de entrada al
// catálogo, junto a «subir instalador» y «añadir desde URL».
//
// ⚠️ LA UNIDAD ES EL TÍTULO, NO LA VARIANTE (D9). Con 5 plataformas × 5
// versiones × 10 títulos son 250 filas: los filtros las tratarían como iguales
// y obligarían a leerlas todas para contestar «¿cuál es la de Chrome?». Se
// listan títulos y se abren sus variantes.
//
// ⚠️ ENLAZAR ES ACEPTAR, NO REVISAR (D7). El análisis de firma e integridad
// ocurrió UNA vez, al publicarse. Si esto se pareciera a la cola de revisión,
// el operador creería que le volvimos a escanear el binario. Se enseña el
// veredicto global y su fecha, y se pide una aceptación explícita.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import SectionPaper from "../common/SectionPaper";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { getGlobalCatalog, linkGlobalEntry } from "../../api/softwareDelivery";

/**
 * Títulos con sus variantes, y qué tiene ya este tenant.
 *
 * `linkedVersion` viene del servidor porque la comparación «tienes la 152, hay
 * la 153» tiene que vivir junto a la lista: calcularla aquí obligaría a traerse
 * los enlaces aparte y a repetir la regla en dos sitios.
 */
export function groupCatalog(entries, { platform = "all" } = {}) {
  const rows = (Array.isArray(entries) ? entries : []).filter(
    (e) => platform === "all" || e.platform === platform
  );
  const byKey = new Map();
  for (const e of rows) {
    const k = e.titleKey || e.title || "";
    if (!byKey.has(k)) {
      byKey.set(k, {
        titleKey: k,
        title: e.title,
        vendor: e.vendor,
        variants: [],
        platforms: new Set(),
        linkedVersion: null,
        linkedCount: 0,
      });
    }
    const g = byKey.get(k);
    g.variants.push(e);
    g.platforms.add(e.platform);
    if (e.linkedVersionOfTitle) g.linkedVersion = e.linkedVersionOfTitle;
    if (e.linkedPackageId != null) g.linkedCount += 1;
  }
  for (const g of byKey.values()) {
    // La vigente primero: es la que el operador quiere el 90 % de las veces.
    g.variants.sort((a, b) => {
      const av = a.supersededBy == null ? 0 : 1;
      const bv = b.supersededBy == null ? 0 : 1;
      if (av !== bv) return av - bv;
      return String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""));
    });
    g.current = g.variants.find((v) => v.supersededBy == null) ?? g.variants[0] ?? null;
    g.platformList = [...g.platforms].sort();
    // Hay novedad si la vigente NO está enlazada pero otra versión del título sí.
    g.hasUpdate = Boolean(
      g.linkedVersion && g.current && g.current.linkedPackageId == null
    );
  }
  return [...byKey.values()].sort((a, b) => String(a.title).localeCompare(String(b.title)));
}

/** Las plataformas presentes, para el filtro. */
export function platformsOf(entries) {
  const set = new Set((Array.isArray(entries) ? entries : []).map((e) => e.platform).filter(Boolean));
  return [...set].sort();
}

function Variant({ entry, onLink, busy }) {
  const linked = entry.linkedPackageId != null;
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: "center", py: 0.75, borderTop: `1px solid ${BRAND.border}` }}
    >
      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, minWidth: 130 }}>
        {entry.version}
      </Typography>
      <Chip size="small" label={entry.platform} sx={{ height: 20, fontSize: TEXT.xs }} />
      <Chip size="small" label={entry.arch} sx={{ height: 20, fontSize: TEXT.xs }} />
      {entry.supersededBy == null ? (
        <Chip
          size="small"
          label="Latest"
          sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 800, bgcolor: BRAND.tealSoft, color: BRAND.tealText }}
        />
      ) : null}
      <Box sx={{ flex: 1 }} />
      {linked ? (
        <Typography sx={{ fontSize: TEXT.sm, color: ROLE.positive, fontWeight: 700 }}>
          In your catalog
        </Typography>
      ) : (
        <Button
          size="small"
          variant="outlined"
          disabled={busy}
          onClick={() => onLink(entry)}
          sx={{ textTransform: "none", fontWeight: 700, borderColor: BRAND.teal, color: BRAND.tealText }}
        >
          Add to my catalog
        </Button>
      )}
    </Stack>
  );
}

export default function GlobalCatalogSegment({ notify, onLinked }) {
  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [platform, setPlatform] = React.useState("all");
  const [open, setOpen] = React.useState({});

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getGlobalCatalog();
      setEntries(res?.entries ?? []);
      setFailed(false);
    } catch {
      // Un panel que desaparece es indistinguible de uno sin datos: se dice.
      setEntries([]);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const link = async (entry) => {
    setBusy(true);
    try {
      await linkGlobalEntry(entry.id);
      notify?.("success", `${entry.title} ${entry.version} added to your catalog.`);
      await load();
      onLinked?.();
    } catch (err) {
      notify?.("error", err?.body?.message || err?.message || "Could not add it.");
    } finally {
      setBusy(false);
    }
  };

  const groups = React.useMemo(() => {
    const g = groupCatalog(entries, { platform });
    const q = search.trim().toLowerCase();
    if (!q) return g;
    return g.filter(
      (x) =>
        String(x.title).toLowerCase().includes(q) ||
        String(x.vendor || "").toLowerCase().includes(q)
    );
  }, [entries, platform, search]);

  const platforms = React.useMemo(() => platformsOf(entries), [entries]);

  if (loading) {
    return <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress size={28} /></Stack>;
  }

  if (failed) {
    return (
      <Alert severity="warning" sx={{ borderRadius: 2 }}>
        Couldn&apos;t load the Tracenium catalog — the request failed.
      </Alert>
    );
  }

  return (
    <Box>
      {/* La responsabilidad, dicha donde se acepta. */}
      <Alert severity="info" sx={{ mb: 2, borderRadius: 2, fontSize: TEXT.sm }}>
        Published and verified by Tracenium, already configured for silent
        install. Adding one to your catalog is your decision to deploy it.
      </Alert>

      <Stack direction="row" spacing={1.5} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
        <TextField
          size="small"
          placeholder="Search by title or vendor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 260 }}
        />
        <Stack direction="row" spacing={0.5}>
          {["all", ...platforms].map((p) => (
            <Button
              key={p}
              size="small"
              onClick={() => setPlatform(p)}
              sx={{
                textTransform: "none",
                fontWeight: platform === p ? 800 : 500,
                color: platform === p ? BRAND.tealText : BRAND.gray,
                bgcolor: platform === p ? BRAND.tealSoft : "transparent",
              }}
            >
              {p === "all" ? "All platforms" : p}
            </Button>
          ))}
        </Stack>
      </Stack>

      {groups.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray }}>
          {entries.length === 0
            ? "Tracenium hasn't published anything yet."
            : "Nothing matches that search."}
        </Typography>
      ) : (
        <Stack spacing={1}>
          {groups.map((g) => (
            <SectionPaper key={g.titleKey} variant="card" sx={{ p: 1.5 }}>
              <Stack
                direction="row"
                spacing={1.5}
                role="button"
                tabIndex={0}
                aria-expanded={Boolean(open[g.titleKey])}
                aria-label={`${g.title}, ${g.variants.length} versions`}
                onClick={() => setOpen((o) => ({ ...o, [g.titleKey]: !o[g.titleKey] }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen((o) => ({ ...o, [g.titleKey]: !o[g.titleKey] }));
                  }
                }}
                sx={{ alignItems: "center", cursor: "pointer", "&:focus-visible": { outline: `2px solid ${BRAND.teal}` } }}
              >
                <ExpandMoreIcon
                  fontSize="small"
                  sx={{
                    color: BRAND.gray,
                    transform: open[g.titleKey] ? "none" : "rotate(-90deg)",
                    transition: "transform .15s",
                  }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark }}>
                    {g.title}
                  </Typography>
                  <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
                    {g.vendor ? `${g.vendor} · ` : ""}
                    {g.platformList.join(", ")} · {g.variants.length} version
                    {g.variants.length === 1 ? "" : "s"}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1 }} />
                {/* ⚠️ El aviso de D5 vive aquí, en la fila del título: «tienes
                    la 152, hay la 153». Es la única comparación que el operador
                    necesita para decidir, y decidir es suyo — no se re-enlaza
                    solo. */}
                {g.hasUpdate ? (
                  <Chip
                    size="small"
                    label={`You have ${g.linkedVersion} · ${g.current.version} available`}
                    sx={{ height: 22, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.alert?.warningSoft, color: BRAND.alert?.warningText }}
                  />
                ) : g.linkedCount > 0 && !open[g.titleKey] ? (
                  // ⚠️ SÓLO CERRADO. Abierto, cada variante ya dice si está en
                  // el catálogo, y repetirlo en la cabecera es la misma frase
                  // dos veces en la misma tarjeta — el operador se pregunta si
                  // hablan de cosas distintas. La cabecera resume lo que no se
                  // ve; en cuanto se ve, sobra.
                  <Typography sx={{ fontSize: TEXT.xs, color: ROLE.positive, fontWeight: 700 }}>
                    In your catalog
                  </Typography>
                ) : null}
              </Stack>

              <Collapse in={Boolean(open[g.titleKey])} unmountOnExit>
                <Box sx={{ mt: 1 }}>
                  {g.variants.map((v) => (
                    <Variant key={v.id} entry={v} onLink={link} busy={busy} />
                  ))}
                </Box>
              </Collapse>
            </SectionPaper>
          ))}
        </Stack>
      )}
    </Box>
  );
}
