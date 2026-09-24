// src/components/Assessments/InstanceDetail.jsx
//
// ADR-0022 — el detalle de una instancia: score con su fecha y cobertura,
// hallazgos vivos por criticidad (con estado, remediación y excepción), trend
// de asp_score_history, corridas (complete / missed / incomplete / failed
// visibles) y «Run now».
//
// El score anterior se enseña SIEMPRE con su fecha, aunque la última corrida
// sea `missed`: nunca se oculta el fallo ni se recalcula con datos parciales.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Collapse,
  Divider,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { BRAND, TEXT } from "../../theme/brand";
import { SEVERITY_META } from "../../theme/severity";
import { formatDate, formatRelative } from "../../utils/format";
import SectionPaper from "../common/SectionPaper";
import StatusChip from "./StatusChip";
import ExceptionDialog from "./ExceptionDialog";
import ScoreCard from "./ScoreCard";
import { useComplianceBands } from "../../hooks/useComplianceBands";
import {
  INSTANCE_STATUS,
  RUN_STATUS,
  VERDICT,
  coverageText,
  effectiveTarget,
  evidenceLine,
  notAssessedReason,
  openBySeverity,
  scheduleText,
  sortFindings,
} from "./assessmentModel";

function SeverityChip({ severity }) {
  const meta = SEVERITY_META[severity] || SEVERITY_META.none;
  return (
    <Box component="span" sx={{ px: 0.75, py: 0.25, borderRadius: 1, fontSize: TEXT.xs, fontWeight: 800, color: meta.fg, bgcolor: meta.bg, whiteSpace: "nowrap" }}>
      {meta.label}
    </Box>
  );
}

function FindingRow({ finding, canEdit, onException }) {
  const [open, setOpen] = React.useState(false);
  const ex = finding.exception;
  // ⚠️ Una pendiente NO es una excepción: se dice aparte y en tono de aviso,
  // porque el hallazgo sigue contando como fallo mientras espera.
  const pending = finding.pendingException || null;
  const sample = Array.isArray(finding.evidence?.sample) ? finding.evidence.sample : [];
  return (
    <>
      <TableRow hover sx={{ "& > td": { borderBottom: open ? 0 : undefined } }}>
        <TableCell sx={{ width: 36, p: 0.5 }}>
          <IconButton size="small" aria-label={open ? "Hide details" : "Show details"} onClick={() => setOpen((v) => !v)}>
            {open ? <KeyboardArrowUpRoundedIcon fontSize="small" /> : <KeyboardArrowDownRoundedIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell><StatusChip meta={VERDICT[finding.status]} /></TableCell>
        <TableCell><SeverityChip severity={finding.severity} /></TableCell>
        <TableCell sx={{ minWidth: 240 }}>
          <Typography sx={{ fontSize: TEXT.md, fontWeight: 600, color: BRAND.dark }}>{finding.title}</Typography>
          <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{finding.controlId} · {finding.section}</Typography>
        </TableCell>
        <TableCell align="right">{finding.affectedCount ?? "—"}</TableCell>
        <TableCell>
          {pending ? (
            <Tooltip title={`${pending.reason} — requested by ${pending.requestedBy || "unknown"}`} arrow>
              <Typography component="span" sx={{ fontSize: TEXT.xs, fontWeight: 700, color: BRAND.alert.warningText }}>
                Awaiting approval
              </Typography>
            </Tooltip>
          ) : ex ? (
            <Tooltip title={`${ex.reason} — ${ex.author || "unknown"}`} arrow>
              <Typography component="span" sx={{ fontSize: TEXT.xs, fontWeight: 700, color: ex.active ? BRAND.tealText : BRAND.alert.errorText }}>
                {ex.active ? `Excepted until ${formatDate(ex.expiresAt)}` : `Exception expired ${formatDate(ex.expiresAt)}`}
              </Typography>
            </Tooltip>
          ) : (
            <Typography component="span" sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>—</Typography>
          )}
        </TableCell>
        <TableCell align="right">
          {canEdit && (finding.status === "fail" || finding.status === "needs_review" || ex || pending) ? (
            <Button size="small" onClick={() => onException(finding)} sx={{ textTransform: "none", color: pending ? BRAND.alert.warningText : BRAND.tealText }}>
              {pending ? "Review request" : ex ? "Edit exception" : "Exception…"}
            </Button>
          ) : null}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={7} sx={{ py: 0, bgcolor: BRAND.surfaceMuted }}>
          <Collapse in={open} unmountOnExit>
            <Box sx={{ py: 1.5, px: 1 }}>
              {finding.status === "not_assessed" ? (
                <Alert severity="info" sx={{ mb: 1 }}>
                  {notAssessedReason(finding.reason)}
                  {finding.evidence?.collectorError?.message ? (
                    <Box component="code" sx={{ display: "block", mt: 0.5, fontSize: TEXT.xs, wordBreak: "break-word" }}>
                      {finding.evidence.collectorError.type ? `${finding.evidence.collectorError.type}: ` : ""}
                      {finding.evidence.collectorError.message}
                    </Box>
                  ) : null}
                </Alert>
              ) : null}
              {finding.remediation ? (
                <>
                  <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700 }}>{finding.remediation.summary}</Typography>
                  <Box component="ol" sx={{ m: 0, mt: 0.5, pl: 3, fontSize: TEXT.sm }}>
                    {(finding.remediation.steps || []).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </Box>
                  {finding.remediation.gpoPath ? (
                    <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 0.5 }}>Group Policy: {finding.remediation.gpoPath}</Typography>
                  ) : null}
                  <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.errorText, mt: 0.5 }}>Risk: {finding.remediation.risk}</Typography>
                </>
              ) : null}
              {sample.length > 0 ? (
                <Box sx={{ mt: 1 }}>
                  <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700 }}>
                    Affected ({finding.affectedCount ?? sample.length}{finding.evidence?.truncated ? `, first ${sample.length} shown` : ""})
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 3, fontSize: TEXT.xs, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", maxHeight: 160, overflow: "auto" }}>
                    {sample.slice(0, 50).map((s, i) => (
                      <li key={i}>{evidenceLine(s)}</li>
                    ))}
                  </Box>
                </Box>
              ) : null}
              {Array.isArray(finding.references) && finding.references.length > 0 ? (
                <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 1 }}>
                  References:{" "}
                  {finding.references.map((r, i) => (
                    <React.Fragment key={i}>
                      {i > 0 ? " · " : ""}
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer noopener">
                          {r.id ? `${r.source} ${r.id}` : r.title}
                        </a>
                      ) : (
                        `${r.source}${r.id ? ` ${r.id}` : ""} — ${r.title}`
                      )}
                    </React.Fragment>
                  ))}
                </Typography>
              ) : null}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function InstanceDetail({ detail, canEdit, canDelete, viewer, onBack, onRunNow, runNowBusy, onChangeCollector, onDeactivate, onDelete, onChanged }) {
  const [exceptionFor, setExceptionFor] = React.useState(null);
  const bands = useComplianceBands();
  const inst = detail?.instance;
  if (!inst) return null;
  const target = effectiveTarget(inst, bands);

  const findings = sortFindings(detail.findings);
  const open = openBySeverity(detail.findings);
  const history = (detail.history || []).map((h) => ({ at: h.scoredAt, score: h.score, label: formatDate(h.scoredAt) }));
  const lastRun = detail.runs?.[0] || null;

  return (
    <Box>
      <Button startIcon={<ArrowBackRoundedIcon />} onClick={onBack} sx={{ textTransform: "none", color: BRAND.tealText, mb: 1, ml: -1 }}>
        All instances
      </Button>

      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Typography component="h1" sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: BRAND.dark }}>{inst.displayName}</Typography>
            <StatusChip meta={INSTANCE_STATUS[inst.status]} />
          </Stack>
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
            Active Directory domain · collector {inst.collectorHostname || inst.collectorDeviceId || "—"}
            {inst.collectorSecondaryDeviceId ? ` (secondary ${inst.collectorSecondaryHostname || inst.collectorSecondaryDeviceId})` : ""} · {scheduleText(inst.schedule)}
          </Typography>
        </Box>
        {canEdit ? (
          <Stack direction="row" gap={1} flexWrap="wrap">
            {inst.status === "active" ? (
              <Button
                variant="contained"
                startIcon={<PlayArrowRoundedIcon />}
                onClick={onRunNow}
                disabled={runNowBusy || lastRun?.status === "running"}
                sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
              >
                {lastRun?.status === "running" ? "Running…" : "Run now"}
              </Button>
            ) : null}
            <Button variant="outlined" onClick={onChangeCollector} sx={{ textTransform: "none", color: BRAND.tealText, borderColor: BRAND.borderStrong }}>
              {inst.status === "active" ? "Change collector" : "Activate"}
            </Button>
            {inst.status === "active" || inst.status === "orphaned" ? (
              <Button variant="outlined" onClick={onDeactivate} sx={{ textTransform: "none", color: BRAND.dark, borderColor: BRAND.borderStrong }}>
                Deactivate
              </Button>
            ) : null}
            {canDelete ? (
              <Button variant="outlined" color="error" onClick={onDelete} sx={{ textTransform: "none" }}>
                Delete
              </Button>
            ) : null}
          </Stack>
        ) : null}
      </Stack>

      {inst.status === "orphaned" ? <Alert severity="warning" sx={{ mb: 2 }}>{INSTANCE_STATUS.orphaned.help}</Alert> : null}
      {lastRun && (lastRun.status === "missed" || lastRun.status === "failed" || lastRun.status === "incomplete") ? (
        <Alert severity={lastRun.status === "incomplete" ? "warning" : "error"} sx={{ mb: 2 }}>
          The last run ({formatRelative(lastRun.startedAt)}) was <strong>{RUN_STATUS[lastRun.status].label.toLowerCase()}</strong>
          {lastRun.errorText ? `: ${lastRun.errorText}` : ""}. The score below is from the last complete run.
        </Alert>
      ) : null}

      <ScoreCard detail={detail} bands={bands} open={open} canEdit={canEdit} onChanged={onChanged} />

      {history.length > 1 ? (
        <SectionPaper sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark, mb: 1 }}>Score over time</Typography>
          <Box sx={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                <XAxis dataKey="label" tick={{ fontSize: TEXT.xs }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: TEXT.xs }} />
                <RechartsTooltip />
                <ReferenceLine y={target.value} stroke={BRAND.dark} strokeDasharray="4 4" label={{ value: `Target ${target.value}`, position: "insideTopRight", fontSize: TEXT.xs, fill: BRAND.dark }} />
                <Line type="monotone" dataKey="score" stroke={BRAND.teal} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </SectionPaper>
      ) : null}

      <SectionPaper sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark, mb: 1 }}>Findings</Typography>
        {findings.length === 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>No results yet. Findings appear after the first complete run.</Typography>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Findings">
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell>Status</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Check</TableCell>
                  <TableCell align="right">Affected</TableCell>
                  <TableCell>Exception</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {findings.map((f) => (
                  <FindingRow key={f.controlId} finding={f} canEdit={canEdit} onException={setExceptionFor} />
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </SectionPaper>

      <SectionPaper>
        <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark, mb: 1 }}>Runs</Typography>
        <Divider sx={{ mb: 1 }} />
        {(detail.runs || []).length === 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>No runs yet.</Typography>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Runs">
              <TableHead>
                <TableRow>
                  <TableCell>Status</TableCell>
                  <TableCell>Trigger</TableCell>
                  <TableCell>Started</TableCell>
                  <TableCell>Finished</TableCell>
                  <TableCell align="right">Score</TableCell>
                  <TableCell>Detail</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {detail.runs.map((r) => (
                  <TableRow key={r.runId}>
                    <TableCell><StatusChip meta={RUN_STATUS[r.status]} /></TableCell>
                    <TableCell sx={{ textTransform: "capitalize" }}>{r.trigger}</TableCell>
                    <TableCell>{formatDate(r.startedAt)}</TableCell>
                    <TableCell>{r.completedAt ? formatDate(r.completedAt) : "—"}</TableCell>
                    <TableCell align="right">{r.score ?? "—"}</TableCell>
                    <TableCell sx={{ fontSize: TEXT.xs, color: "text.secondary", maxWidth: 360 }}>
                      {r.status === "running" && r.indicatorsTotal
                        ? `${r.indicatorsDone ?? 0} of ${r.indicatorsTotal} checks`
                        : r.errorText || (r.summary?.coverage ? coverageText(r.summary.coverage) : "")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </SectionPaper>

      <ExceptionDialog
        open={Boolean(exceptionFor)}
        instanceId={inst.id}
        finding={exceptionFor}
        viewer={viewer}
        onClose={() => setExceptionFor(null)}
        onSaved={() => {
          setExceptionFor(null);
          onChanged?.();
        }}
      />
    </Box>
  );
}
