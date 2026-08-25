// src/components/software-delivery/IntakeTab.jsx
//
// The SDP AI-intake review queue. Operators upload an installer; the backend
// verifies it (integrity gate), stores it, and — if distributable — asks the AI
// to propose a silent-install config. This tab lists those intakes with their
// security verdict and lets an admin review (approve → creates a catalog
// package) or reject each pending proposal.

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { BRAND, TEXT } from "../../theme/brand";
import {
  listIntakes,
  uploadIntake,
  approveIntake,
  rejectIntake,
} from "../../api/softwareDelivery";
import VerdictBadge from "./VerdictBadge";
import IntakeUploadDialog from "./IntakeUploadDialog";
import IntakeVerdictBanner from "./IntakeVerdictBanner";
import IntakeProposalBanner from "./IntakeProposalBanner";
import PackageDialog from "./PackageDialog";
import { intakeToPackageItem } from "./intakeMapping";
import { listFrom } from "../../api/shape";

const STATUS_STYLES = {
  pending_review: { label: "Pending review", bg: BRAND.tealSoft, color: BRAND.tealText },
  approved: { label: "Approved", bg: BRAND.alert?.successSoft, color: BRAND.alert?.success },
  rejected: { label: "Rejected", bg: BRAND.darkSoft, color: BRAND.gray },
  blocked: { label: "Blocked", bg: BRAND.alert?.errorSoft, color: BRAND.alert?.error },
};

function formatTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function errorMessage(err, fallback) {
  return err?.body?.message || err?.message || fallback;
}

export default function IntakeTab({ canManage, notify }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  const [reviewIntake, setReviewIntake] = React.useState(null);
  const [reviewSubmitting, setReviewSubmitting] = React.useState(false);
  // Pipeline stage the operator drilled into; null = show everything.
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

  React.useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (file, hints) => {
    setUploading(true);
    try {
      const res = await uploadIntake(file, hints);
      const verdict = res?.intake?.verification?.verdict ?? res?.intake?.verdict;
      setUploadOpen(false);
      if (verdict === "blocked") {
        notify?.("error", `Upload blocked by the integrity gate — not distributable.`);
      } else {
        notify?.("success", `Uploaded and analyzed (${verdict}). Review the proposal to publish it.`);
      }
      await load();
    } catch (err) {
      notify?.("error", errorMessage(err, "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async (payload) => {
    if (!reviewIntake) return;
    setReviewSubmitting(true);
    try {
      await approveIntake(reviewIntake.id, payload);
      setReviewIntake(null);
      notify?.("success", "Approved — package added to the catalog.");
      await load();
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
    } catch (err) {
      notify?.("error", errorMessage(err, "Reject failed"));
    }
  };

  // ── Pipeline stages ────────────────────────────────────────────
  //
  // The intake flow is upload → verify → review → catalog, but a flat table
  // never communicated that. Each stage is a predicate over data the list
  // already returns; clicking one filters the table below it.
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

  const STAGE_TONES = {
    ok: { bg: BRAND.alert?.successSoft, border: BRAND.alert?.success, color: BRAND.alert?.success },
    warn: { bg: BRAND.alert?.warningSoft, border: BRAND.alert?.warning, color: BRAND.alert?.warning },
    crit: { bg: BRAND.alert?.errorSoft, border: BRAND.alert?.error, color: BRAND.alert?.error },
    neutral: { bg: BRAND.surface, border: BRAND.border, color: BRAND.dark },
  };

  return (
    <Box>
      {/* Pipeline */}
      {!loading && items.length > 0 ? (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            mb: 2,
            overflowX: "auto",
            pb: 0.5,
          }}
        >
          {stages.map((stage, idx) => {
            const tone = STAGE_TONES[stage.tone] || STAGE_TONES.neutral;
            const selected = (stageFilter ?? "all") === stage.key;
            return (
              <React.Fragment key={stage.key}>
                <Box
                  role="button"
                  tabIndex={0}
                  onClick={() => setStageFilter(stage.key === "all" ? null : stage.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setStageFilter(stage.key === "all" ? null : stage.key);
                    }
                  }}
                  sx={{
                    flex: "1 1 0",
                    minWidth: 116,
                    cursor: "pointer",
                    borderRadius: 2,
                    px: 1.5,
                    py: 1.25,
                    textAlign: "center",
                    bgcolor: tone.bg,
                    border: `1px solid ${selected ? tone.border : BRAND.border}`,
                    outline: selected ? `1px solid ${tone.border}` : "none",
                    transition: "transform .12s ease",
                    "&:hover": { transform: "translateY(-1px)" },
                    "&:focus-visible": { outline: `2px solid ${BRAND.teal}` },
                  }}
                >
                  <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, lineHeight: 1, color: tone.color }}>
                    {stage.count}
                  </Typography>
                  <Typography sx={{ fontSize: TEXT.xs, fontWeight: 600, color: BRAND.gray, mt: 0.5 }}>
                    {stage.label}
                  </Typography>
                </Box>
                {idx < stages.length - 1 ? (
                  <Box sx={{ display: "flex", alignItems: "center", color: BRAND.border, flex: "0 0 auto" }}>
                    <ChevronRightIcon fontSize="small" />
                  </Box>
                ) : null}
              </React.Fragment>
            );
          })}
        </Box>
      ) : null}

      {/* Toolbar */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray }}>
          Upload an installer — it's verified, then AI proposes an install config for your review.
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          onClick={load}
          startIcon={<RefreshOutlinedIcon />}
          sx={{ textTransform: "none", color: BRAND.gray, borderColor: BRAND.border }}
        >
          Refresh
        </Button>
        {canManage ? (
          <Button
            onClick={() => setUploadOpen(true)}
            startIcon={<AutoAwesomeOutlinedIcon />}
            variant="contained"
            sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
          >
            Upload installer
          </Button>
        ) : null}
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} sx={{ color: BRAND.teal }} />
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ p: 4, textAlign: "center", color: BRAND.gray }}>
          No intakes yet. Upload an installer to get an AI-proposed configuration.
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
              const status = STATUS_STYLES[it.status] || { label: it.status, bg: BRAND.darkSoft, color: BRAND.gray };
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
                    <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>{formatTime(it.createdAt)}</Typography>
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

      <IntakeUploadDialog
        open={uploadOpen}
        submitting={uploading}
        onClose={() => (uploading ? null : setUploadOpen(false))}
        onSubmit={handleUpload}
      />

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
    </Box>
  );
}
