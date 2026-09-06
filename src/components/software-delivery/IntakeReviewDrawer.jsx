// src/components/software-delivery/IntakeReviewDrawer.jsx
//
// La cola de instaladores subidos que esperan revisión.
//
// POR QUÉ DEJÓ DE SER UNA PESTAÑA (fase 3)
//
// "AI Intake" era una pestaña-destino: se iba allí a subir un instalador. La
// fase 2 movió esa puerta al catálogo, y con ella se fue la razón de visitarla.
// Lo que quedaba dentro no es una sección de la página: es un paso del flujo
// del catálogo —revisar lo que subiste antes de publicarlo— y su sitio es
// colgando del catálogo, no compitiendo con él en la barra de pestañas.
//
// ⚠️ AQUÍ NO SE SUBE NADA, Y ES DELIBERADO. La pestaña traía su propio botón
// "Upload installer" y su propio diálogo, duplicando exactamente lo que la
// fase 2 unificó. Un refactor que conserva las dos puertas no ha refactorizado
// nada: ver [[feedback_refactor_replaces_not_adds]]. Se sube desde el catálogo;
// esto sólo revisa.

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import { BRAND, TEXT } from "../../theme/brand";
import { listFrom } from "../../api/shape";
import { approveIntake, listIntakes, rejectIntake } from "../../api/softwareDelivery";
import { intakeToPackageItem } from "./intakeMapping";
import VerdictBadge from "./VerdictBadge";
import IntakeVerdictBanner from "./IntakeVerdictBanner";
import IntakeProposalBanner from "./IntakeProposalBanner";
import PackageDialog from "./PackageDialog";

// Copiado tal cual de la pestaña que esto reemplaza: mismos tokens, mismas
// etiquetas. Reescribirlo "parecido" fue mi primer intento y metió hexes a mano
// y nombres distintos — un movimiento no es una reescritura.
const STATUS_STYLES = {
  pending_review: { label: "Pending review", bg: BRAND.tealSoft, color: BRAND.tealText },
  approved: { label: "Approved", bg: BRAND.alert?.successSoft, color: BRAND.alert?.success },
  rejected: { label: "Rejected", bg: BRAND.darkSoft, color: BRAND.gray },
  blocked: { label: "Blocked", bg: BRAND.alert?.errorSoft, color: BRAND.alert?.error },
};

const STAGE_TONES = {
  ok: { bg: BRAND.alert?.successSoft, border: BRAND.alert?.success, color: BRAND.alert?.success },
  warn: { bg: BRAND.alert?.warningSoft, border: BRAND.alert?.warning, color: BRAND.alert?.warning },
  crit: { bg: BRAND.alert?.errorSoft, border: BRAND.alert?.error, color: BRAND.alert?.error },
  neutral: { bg: BRAND.surface, border: BRAND.border, color: BRAND.dark },
};
function formatTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function errorMessage(err, fallback) {
  return err?.body?.message || err?.message || fallback;
}

export default function IntakeReviewDrawer({ open, onClose, canManage, notify, onChanged }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [reviewIntake, setReviewIntake] = React.useState(null);
  const [reviewSubmitting, setReviewSubmitting] = React.useState(false);
  // Etapa en la que el operador se metió; null = todo.
  const [stageFilter, setStageFilter] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listIntakes();
      setItems(listFrom(res, { context: "sdpIntake" }));
    } catch (err) {
      notify?.("error", errorMessage(err, "Failed to load intake queue"));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  // Se carga al ABRIR, no al montar: el cajón vive junto al catálogo y pedir la
  // cola en cada render de la página sería trabajo que nadie mira.
  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleApprove = async (payload) => {
    if (!reviewIntake) return;
    setReviewSubmitting(true);
    try {
      await approveIntake(reviewIntake.id, payload);
      setReviewIntake(null);
      notify?.("success", "Approved — package added to the catalog.");
      await load();
      // ⚠️ Aprobar CREA un paquete. Sin avisar, el catálogo de detrás se queda
      // mostrando una lista a la que le falta justo lo que acabas de publicar.
      onChanged?.();
    } catch (err) {
      notify?.("error", errorMessage(err, "Approve failed"));
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleReject = async (intake) => {
    try {
      await rejectIntake(intake.id);
      notify?.("success", "Intake rejected.");
      await load();
      onChanged?.();
    } catch (err) {
      notify?.("error", errorMessage(err, "Reject failed"));
    }
  };

  // El flujo es subir → verificar → revisar → catálogo, y una tabla plana nunca
  // comunicó eso. Cada etapa es un predicado sobre datos que la lista ya trae.
  const stages = React.useMemo(() => {
    const verdictOf = (it) => it.verification?.verdict ?? it.verdict;
    return [
      { key: "all", label: "Uploaded", match: () => true, tone: "neutral" },
      { key: "verified", label: "Verified", match: (it) => verdictOf(it) === "verified", tone: "ok" },
      { key: "warn", label: "Warnings", match: (it) => verdictOf(it) === "warn", tone: "warn" },
      { key: "blocked", label: "Blocked", match: (it) => verdictOf(it) === "blocked", tone: "crit" },
      { key: "pending_review", label: "To review", match: (it) => it.status === "pending_review", tone: "neutral" },
      { key: "approved", label: "In catalog", match: (it) => it.status === "approved", tone: "ok" },
    ].map((s) => ({ ...s, count: items.filter(s.match).length }));
  }, [items]);

  const visibleItems = React.useMemo(() => {
    if (!stageFilter || stageFilter === "all") return items;
    const stage = stages.find((s) => s.key === stageFilter);
    return stage ? items.filter(stage.match) : items;
  }, [items, stageFilter, stages]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", md: 900 }, p: 3 } }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2, mb: 2 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
            Uploads awaiting review
          </Typography>
          <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray, mt: 0.5 }}>
            Each file was verified and given a proposed install configuration. Approving
            publishes it to the catalog.
          </Typography>
        </Box>
        <Button
          onClick={load}
          startIcon={<RefreshOutlinedIcon />}
          sx={{ textTransform: "none", color: BRAND.gray }}
        >
          Refresh
        </Button>
        <IconButton onClick={onClose} aria-label="Close review queue" size="small">
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </Box>

      {items.length > 0 ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, flexWrap: "wrap" }}>
          {stages.map((stage, idx) => (
            <React.Fragment key={stage.key}>
              <Box
                role="button"
                tabIndex={0}
                aria-pressed={(stageFilter ?? "all") === stage.key}
                onClick={() => setStageFilter(stage.key === "all" ? null : stage.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setStageFilter(stage.key === "all" ? null : stage.key);
                  }
                }}
                sx={{
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 2,
                  cursor: "pointer",
                  border: `1px solid ${(stageFilter ?? "all") === stage.key ? (STAGE_TONES[stage.tone] || STAGE_TONES.neutral).border : BRAND.border}`,
                  bgcolor: (stageFilter ?? "all") === stage.key ? (STAGE_TONES[stage.tone] || STAGE_TONES.neutral).bg : "transparent",
                  "&:focus-visible": { outline: `2px solid ${BRAND.teal}` },
                }}
              >
                <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, lineHeight: 1, color: (STAGE_TONES[stage.tone] || STAGE_TONES.neutral).color }}>
                  {stage.count}
                </Typography>
                <Typography sx={{ fontSize: TEXT.xs, fontWeight: 600, color: BRAND.gray, mt: 0.5 }}>
                  {stage.label}
                </Typography>
              </Box>
              {idx < stages.length - 1 ? (
                <ChevronRightIcon fontSize="small" sx={{ color: BRAND.border }} />
              ) : null}
            </React.Fragment>
          ))}
        </Box>
      ) : null}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} sx={{ color: BRAND.teal }} />
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ p: 4, textAlign: "center", color: BRAND.gray }}>
          {/* ⚠️ Nombra la puerta que EXISTE. La subida vive en el catálogo desde
              la fase 2; mandar aquí a un botón que no está es como quedó el
              estado vacío del catálogo tras renombrar el suyo. */}
          Nothing waiting. Use “Add package” in the catalog to upload an installer.
        </Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>File</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Verdict</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Created</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleItems.map((it) => {
              const verdict = it.verification?.verdict ?? it.verdict;
              const status = STATUS_STYLES[it.status] || {
                label: it.status,
                bg: BRAND.darkSoft,
                color: BRAND.gray,
              };
              const reasons = it.verification?.reasons;
              const isPending = it.status === "pending_review";
              return (
                <TableRow key={it.id} hover>
                  <TableCell>
                    <Typography sx={{ fontSize: TEXT.md, fontWeight: 600, color: BRAND.dark }}>
                      {it.filename}
                    </Typography>
                    <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontFamily: "monospace" }}>
                      {String(it.sha256 || "").slice(0, 12)}…
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={`${it.facts?.platform || "?"} · ${(it.facts?.format || "?").toUpperCase()}`}
                      sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box title={Array.isArray(reasons) ? reasons.join("\n") : ""}>
                      <VerdictBadge verdict={verdict} />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={status.label}
                      sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: status.bg, color: status.color }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                      {formatTime(it.createdAt)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {canManage && isPending ? (
                      <>
                        <Button
                          size="small"
                          onClick={() => setReviewIntake(it)}
                          sx={{ textTransform: "none", color: BRAND.teal, "&:hover": { color: BRAND.tealHover } }}
                        >
                          Review
                        </Button>
                        <Button
                          size="small"
                          onClick={() => handleReject(it)}
                          sx={{ textTransform: "none", color: BRAND.gray, "&:hover": { color: BRAND.alert?.error } }}
                        >
                          Reject
                        </Button>
                      </>
                    ) : (
                      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontStyle: "italic" }}>—</Typography>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <PackageDialog
        open={Boolean(reviewIntake)}
        mode="approve"
        item={reviewIntake ? intakeToPackageItem(reviewIntake) : null}
        banner={
          reviewIntake ? (
            <>
              <IntakeVerdictBanner intake={reviewIntake} />
              <IntakeProposalBanner intake={reviewIntake} />
            </>
          ) : null
        }
        submitting={reviewSubmitting}
        onClose={() => (reviewSubmitting ? null : setReviewIntake(null))}
        onSubmit={handleApprove}
      />
    </Drawer>
  );
}
