// src/msp/GlobalCatalogAdmin.jsx
//
// ADR-0016 F1 — el panel de publicación. Sólo staff de Tracenium.
//
// Dos listas y dos acciones: lo que se puede publicar (los paquetes activos de
// Tracenium) y lo que ya está publicado (agrupado por título, con la vigente
// primero). Publicar y retirar.
//
// ⚠️ ESTE PANEL NO ES LA GARANTÍA DE QUE NO SE PUBLIQUE SOFTWARE DE UN CLIENTE.
// Que aquí sólo se ofrezcan paquetes de Tracenium evita el error; lo que lo
// IMPIDE es la comprobación de propiedad dentro de `publishPackage`, en el
// servidor. Una lista no es un control de acceso, y quien llega hasta esta
// pantalla tiene `admin_master`.
//
// ⚠️ Y NO ES UNA PESTAÑA DE SOFTWARE DELIVERY. Vive en el portal MSP porque su
// gate ya existe y porque su usuario es otro. El catálogo del tenant no se toca.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";

import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import { BRAND, ROLE, TEXT } from "../theme/brand";
import {
  fetchGlobalCatalog,
  fetchPublishablePackages,
  publishToGlobalCatalog,
  unpublishFromGlobalCatalog,
} from "./mspApi";

/**
 * Agrupa las entradas por título, la vigente primero.
 *
 * ⚠️ LA UNIDAD ES EL TÍTULO, NO LA VARIANTE (ADR-0016 D9). Con 5 plataformas ×
 * 5 versiones × 10 títulos son 250 filas: una lista plana las trata como
 * iguales y obliga a leerlas todas para encontrar «¿cuál es la de Chrome
 * ahora?». La vigente es la que no tiene sucesora.
 */
export function groupByTitle(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  const byKey = new Map();
  for (const e of rows) {
    const k = e.titleKey || e.title || "";
    if (!byKey.has(k)) byKey.set(k, { titleKey: k, title: e.title, vendor: e.vendor, variants: [] });
    byKey.get(k).variants.push(e);
  }
  for (const g of byKey.values()) {
    // Sin sucesora = vigente, y va primero. El resto por publicación reciente.
    g.variants.sort((a, b) => {
      const av = a.supersededBy == null ? 0 : 1;
      const bv = b.supersededBy == null ? 0 : 1;
      if (av !== bv) return av - bv;
      return String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""));
    });
    g.current = g.variants.find((v) => v.supersededBy == null) ?? null;
    g.linkedTotal = g.variants.reduce((n, v) => n + Number(v.linkCount || 0), 0);
  }
  return [...byKey.values()].sort((a, b) => String(a.title).localeCompare(String(b.title)));
}

function Variant({ entry, onUnpublish, busy }) {
  const linked = Number(entry.linkCount || 0);
  const vigente = entry.supersededBy == null;
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: "center", py: 0.75, borderTop: `1px solid ${BRAND.border}` }}
    >
      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, minWidth: 140 }}>
        {entry.version}
      </Typography>
      <Chip size="small" label={entry.platform} sx={{ height: 20, fontSize: TEXT.xs }} />
      <Chip size="small" label={entry.arch} sx={{ height: 20, fontSize: TEXT.xs }} />
      {vigente ? (
        <Chip
          size="small"
          label="Current"
          sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 800, bgcolor: BRAND.tealSoft, color: BRAND.tealText }}
        />
      ) : (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>superseded</Typography>
      )}
      <Box sx={{ flex: 1 }} />
      <Typography sx={{ fontSize: TEXT.xs, color: linked ? BRAND.dark : BRAND.gray }}>
        {linked} linked
      </Typography>
      {/* ⚠️ Deshabilitado con enlaces, y el motivo va en el tooltip: retirar
          algo que un cliente está desplegando no debería ser un clic que
          devuelve un 409 — debería no ofrecerse. El servidor lo rechaza igual;
          esto evita el intento. */}
      <Tooltip
        title={
          linked
            ? `${linked} tenant${linked === 1 ? "" : "s"} still linked — publish a newer version instead`
            : "Remove from the global catalog"
        }
      >
        <span>
          <Button
            size="small"
            disabled={busy || linked > 0}
            onClick={() => onUnpublish(entry)}
            sx={{ textTransform: "none", color: ROLE.critical }}
          >
            Unpublish
          </Button>
        </span>
      </Tooltip>
    </Stack>
  );
}

export default function GlobalCatalogAdmin({ onClose }) {
  const [entries, setEntries] = React.useState([]);
  const [packages, setPackages] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    // ⚠️ allSettled y no all: si una de las dos cae, la otra se sigue viendo, y
    // el aviso lo dice. Es la misma lección del Overview de SDP — un panel que
    // desaparece es indistinguible de uno sin datos.
    const [cat, pkgs] = await Promise.allSettled([
      fetchGlobalCatalog(),
      fetchPublishablePackages(),
    ]);
    setEntries(cat.status === "fulfilled" ? cat.value?.entries ?? [] : []);
    setPackages(pkgs.status === "fulfilled" ? pkgs.value?.packages ?? [] : []);
    if (cat.status === "rejected" || pkgs.status === "rejected") {
      setToast({ severity: "warning", text: "Some of this screen could not be loaded." });
    }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const publish = async (pkg) => {
    setBusy(true);
    try {
      await publishToGlobalCatalog(pkg.id, pkg.name);
      setToast({ severity: "success", text: `${pkg.name} ${pkg.version} published.` });
      await load();
    } catch (err) {
      setToast({
        severity: "error",
        text: err?.body?.message || err?.message || "Could not publish.",
      });
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async (entry) => {
    setBusy(true);
    try {
      await unpublishFromGlobalCatalog(entry.id);
      setToast({ severity: "success", text: `${entry.title} ${entry.version} removed.` });
      await load();
    } catch (err) {
      setToast({
        severity: "error",
        text: err?.body?.message || err?.message || "Could not unpublish.",
      });
    } finally {
      setBusy(false);
    }
  };

  const grouped = React.useMemo(() => groupByTitle(entries), [entries]);
  const publicables = packages.filter((p) => p.publishedEntryId == null);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: "auto" }}>
      <PageHeader
        title="Global software catalog"
        subtitle="Published by Tracenium, available for every tenant to link"
        icon={<PublicOutlinedIcon />}
        actions={
          <Button
            size="small"
            startIcon={<ArrowBackOutlinedIcon />}
            onClick={onClose}
            sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}
          >
            Back
          </Button>
        }
      />

      {/* La responsabilidad, dicha donde se publica y no en una nota al pie. */}
      <Alert severity="info" sx={{ mb: 2, borderRadius: 2, fontSize: TEXT.sm }}>
        Publishing makes a binary available to every tenant. Tracenium hosts and
        verifies it; each tenant still has to accept it before it can be deployed.
      </Alert>

      {loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress size={28} /></Stack>
      ) : (
        <Stack spacing={2}>
          <SectionPaper variant="panel" sx={{ p: 2 }}>
            <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base, mb: 0.5 }}>
              Ready to publish
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1.5 }}>
              Active packages in the Tracenium catalog that are not published yet.
              Upload and approve them in Software Delivery first.
            </Typography>

            {publicables.length === 0 ? (
              <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray }}>
                Nothing waiting. Everything active is already published.
              </Typography>
            ) : (
              publicables.map((p) => (
                <Stack
                  key={p.id}
                  direction="row"
                  spacing={1.5}
                  sx={{ alignItems: "center", py: 0.75, borderTop: `1px solid ${BRAND.border}` }}
                >
                  <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
                    {p.name}
                  </Typography>
                  <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>{p.version}</Typography>
                  <Chip size="small" label={p.platform} sx={{ height: 20, fontSize: TEXT.xs }} />
                  <Chip size="small" label={p.arch} sx={{ height: 20, fontSize: TEXT.xs }} />
                  <Box sx={{ flex: 1 }} />
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy}
                    onClick={() => publish(p)}
                    sx={{
                      textTransform: "none",
                      fontWeight: 700,
                      bgcolor: BRAND.teal,
                      "&:hover": { bgcolor: BRAND.tealHover },
                    }}
                  >
                    Publish
                  </Button>
                </Stack>
              ))
            )}
          </SectionPaper>

          <SectionPaper variant="panel" sx={{ p: 2 }}>
            <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base, mb: 0.5 }}>
              Published
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1.5 }}>
              Grouped by title. Publishing a newer version supersedes the previous
              one; tenants already linked keep theirs until they move.
            </Typography>

            {grouped.length === 0 ? (
              <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray }}>
                Nothing published yet.
              </Typography>
            ) : (
              grouped.map((g) => (
                <Box key={g.titleKey} sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
                    <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark }}>
                      {g.title}
                    </Typography>
                    {g.vendor ? (
                      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{g.vendor}</Typography>
                    ) : null}
                    <Box sx={{ flex: 1 }} />
                    <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
                      {g.variants.length} version{g.variants.length === 1 ? "" : "s"} ·{" "}
                      {g.linkedTotal} link{g.linkedTotal === 1 ? "" : "s"}
                    </Typography>
                  </Stack>
                  {g.variants.map((v) => (
                    <Variant key={v.id} entry={v} onUnpublish={unpublish} busy={busy} />
                  ))}
                </Box>
              ))
            )}
          </SectionPaper>
        </Stack>
      )}

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: "100%" }}>
            {toast.text}
          </Alert>
        ) : null}
      </Snackbar>
    </Box>
  );
}
