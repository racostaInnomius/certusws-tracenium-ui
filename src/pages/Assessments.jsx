// src/pages/Assessments.jsx
//
// ADR-0022 — Assessment Suite (clave interna `asp`; en pantalla, nunca las
// siglas). Página propia: nada de esto aparece en Security Compliance, porque
// el sujeto es la INSTANCIA DE SERVICIO —un dominio de AD—, no el equipo.
//
//   · Lista: instancias con estado, score (con su fecha), última corrida,
//     cobertura y colector. Las `detected` van en un bloque aparte, con
//     «Activate»: son propuestas, sin score, sin corridas y sin coste.
//   · Detalle: hallazgos vivos por criticidad, trend, corridas y «Run now».
//
// Refresco: el botón pide `cache: "reload"` —la caché de 60 s de httpGetJson se
// tragaba el refresco en otras páginas— y los diálogos no se refrescan mientras
// están abiertos.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import DomainVerificationOutlinedIcon from "@mui/icons-material/DomainVerificationOutlined";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { useAuthContext } from "../auth/AuthContext";
import { BRAND, LAYOUT, TEXT } from "../theme/brand";
import { formatDate, formatRelative } from "../utils/format";
import PageHeader from "../components/common/PageHeader";
import GoToReportButton from "../components/common/GoToReportButton";
import SectionPaper from "../components/common/SectionPaper";
import AsyncState from "../components/common/AsyncState";
import BrandSnackbar from "../components/common/BrandSnackbar";
import { useConfirm } from "../components/common/ConfirmDialog";
import StatusChip from "../components/Assessments/StatusChip";
import ActivateDialog from "../components/Assessments/ActivateDialog";
import InstanceDetail from "../components/Assessments/InstanceDetail";
import { tierLabel } from "../components/Billing/billingModel";
import {
  INSTANCE_STATUS,
  RUN_STATUS,
  coverageText,
  describeRunNow,
  scheduleText,
} from "../components/Assessments/assessmentModel";
import {
  deactivateAssessmentInstance,
  deleteAssessmentInstance,
  getAssessmentInstance,
  listAssessmentInstances,
  runAssessmentNow,
} from "../api/assessments";

function readInitialInstance() {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("instance");
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function upgradeMessage(error) {
  if (error?.status === 402) {
    const tier = error?.body?.tierRequired || error?.body?.tier_required || "business";
    return `Assessment Suite is not included in your plan. It requires the ${tierLabel(tier)} tier.`;
  }
  return null;
}

/** El informe del motor de esta página (G3/N4). Pide ADMIN/OWNER, como activar. */
const ASP_REPORT_KEY = "asp.assessment";

export default function Assessments({ onNavigate }) {
  const { auth } = useAuthContext();
  const role = String(auth?.tenantMember?.role || "");
  const canEdit = role === "OWNER" || role === "ADMIN";
  const canDelete = role === "OWNER";
  const confirm = useConfirm();

  const [list, setList] = React.useState(null);
  const [listError, setListError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState(readInitialInstance);
  const [detail, setDetail] = React.useState(null);
  const [detailError, setDetailError] = React.useState(null);
  const [activateFor, setActivateFor] = React.useState(null);
  const [runNowBusy, setRunNowBusy] = React.useState(false);
  const [snackbar, setSnackbar] = React.useState({ open: false, severity: "success", message: "" });

  const loadList = React.useCallback(async (reload = false) => {
    setLoading(true);
    setListError(null);
    try {
      setList(await listAssessmentInstances(reload ? { cache: "reload" } : {}));
    } catch (e) {
      setListError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = React.useCallback(async (id, reload = false) => {
    if (!id) return;
    setDetailError(null);
    try {
      setDetail(await getAssessmentInstance(id, reload ? { cache: "reload" } : {}));
    } catch (e) {
      setDetailError(e);
    }
  }, []);

  React.useEffect(() => {
    loadList();
  }, [loadList]);

  React.useEffect(() => {
    setDetail(null);
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const refresh = () => {
    loadList(true);
    if (selectedId) loadDetail(selectedId, true);
  };

  const openInstance = (id) => {
    setSelectedId(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("instance", String(id));
      window.history.replaceState({}, "", url);
    } catch {
      /* sin URL: la navegación sigue funcionando */
    }
  };

  const backToList = () => {
    setSelectedId(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("instance");
      window.history.replaceState({}, "", url);
    } catch {
      /* idem */
    }
  };

  async function runNow() {
    if (!detail?.instance) return;
    setRunNowBusy(true);
    let result = null;
    let error = null;
    try {
      result = await runAssessmentNow(detail.instance.id);
    } catch (e) {
      error = e;
    }
    setRunNowBusy(false);
    const d = describeRunNow(result, error);
    setSnackbar({ open: true, severity: d.severity, message: d.message });
    refresh();
  }

  async function deactivate() {
    const ok = await confirm({
      title: `Deactivate ${detail.instance.displayName}?`,
      body: "Scheduled runs stop and the domain stops counting toward your license. History and findings are kept.",
      confirmText: "Deactivate",
    });
    if (!ok) return;
    try {
      await deactivateAssessmentInstance(detail.instance.id);
      setSnackbar({ open: true, severity: "success", message: "Deactivated." });
      refresh();
    } catch (e) {
      setSnackbar({ open: true, severity: "error", message: e?.body?.message || e?.message || "Could not deactivate." });
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ${detail.instance.displayName}?`,
      body: "Deletes every run, finding, exception and the score history of this domain. This is recorded in the audit log and cannot be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAssessmentInstance(detail.instance.id);
      setSnackbar({ open: true, severity: "success", message: "Deleted." });
      backToList();
      loadList(true);
    } catch (e) {
      setSnackbar({ open: true, severity: "error", message: e?.body?.message || e?.message || "Could not delete." });
    }
  }

  const instances = list?.instances || [];
  const detected = list?.detected || [];
  const upgrade = upgradeMessage(listError);

  return (
    <Box sx={LAYOUT.page}>
      {selectedId ? (
        detailError ? (
          <>
            <Button onClick={backToList} sx={{ textTransform: "none", color: BRAND.tealText, ml: -1 }}>
              ← All instances
            </Button>
            <AsyncState error={detailError} onRetry={() => loadDetail(selectedId, true)} />
          </>
        ) : !detail ? (
          <AsyncState loading loadingText="Loading assessment…" />
        ) : (
          <InstanceDetail
            detail={detail}
            canEdit={canEdit}
            canDelete={canDelete}
            onBack={backToList}
            onRunNow={runNow}
            runNowBusy={runNowBusy}
            onChangeCollector={() => setActivateFor(detail.instance)}
            onDeactivate={deactivate}
            onDelete={remove}
            onChanged={() => loadDetail(selectedId, true)}
          />
        )
      ) : (
        <>
          <PageHeader
            title="Assessment Suite"
            subtitle="Security and best-practice assessments of your services, starting with Active Directory — run by a domain controller you choose, with no credentials to hand over."
            icon={<DomainVerificationOutlinedIcon />}
            actions={
              <>
                {canEdit && !upgrade ? (
                  <GoToReportButton onNavigate={onNavigate} reportKey={ASP_REPORT_KEY} tooltip="Assessment Suite report" />
                ) : null}
                <Button variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={refresh} disabled={loading} sx={{ textTransform: "none", color: BRAND.tealText, borderColor: BRAND.borderStrong }}>
                  Refresh
                </Button>
              </>
            }
          />

          {upgrade ? (
            <Alert
              severity="info"
              action={onNavigate ? <Button color="inherit" size="small" onClick={() => onNavigate("billing")}>Plans</Button> : null}
            >
              {upgrade}
            </Alert>
          ) : (
            <AsyncState loading={loading && !list} error={list ? null : listError} onRetry={() => loadList(true)}>
              {list ? (
                <Stack spacing={2}>
                  {detected.length > 0 ? (
                    <SectionPaper>
                      <Typography component="h2" sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
                        Detected domains
                      </Typography>
                      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1 }}>
                        Found from domain controllers that run the agent. Nothing runs and nothing is billed until you activate one and choose its collector.
                      </Typography>
                      <Table size="small" aria-label="Detected domains">
                        <TableBody>
                          {detected.map((d) => (
                            <TableRow key={d.id}>
                              <TableCell sx={{ fontWeight: 700 }}>{d.displayName}</TableCell>
                              <TableCell><StatusChip meta={INSTANCE_STATUS.detected} /></TableCell>
                              <TableCell sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
                                {d.lastDetectedAt ? `Seen ${formatRelative(d.lastDetectedAt)}` : ""}
                              </TableCell>
                              <TableCell align="right">
                                {canEdit ? (
                                  <Button
                                    size="small"
                                    variant="contained"
                                    onClick={() => setActivateFor(d)}
                                    sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
                                  >
                                    Activate
                                  </Button>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </SectionPaper>
                  ) : null}

                  <SectionPaper>
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline" flexWrap="wrap" gap={1}>
                      <Typography component="h2" sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
                        Service instances
                      </Typography>
                      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
                        {list.license?.activeInstances ?? 0} active · licensed per active instance
                      </Typography>
                    </Stack>
                    {instances.length === 0 ? (
                      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 1 }}>
                        {detected.length > 0
                          ? "Activate a detected domain to run its first assessment."
                          : "No domain controller with the agent has been detected yet. Install the agent on a domain controller; its domain appears here within half an hour."}
                      </Typography>
                    ) : (
                      <Box sx={{ overflowX: "auto" }}>
                        <Table size="small" aria-label="Service instances">
                          <TableHead>
                            <TableRow>
                              <TableCell>Domain</TableCell>
                              <TableCell>Status</TableCell>
                              <TableCell align="right">Score</TableCell>
                              <TableCell>Last run</TableCell>
                              <TableCell>Coverage</TableCell>
                              <TableCell>Collector</TableCell>
                              <TableCell>Schedule</TableCell>
                              <TableCell align="right">Open findings</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {instances.map((i) => (
                              <TableRow key={i.id} hover onClick={() => openInstance(i.id)} sx={{ cursor: "pointer" }}>
                                <TableCell sx={{ fontWeight: 700 }}>{i.displayName}</TableCell>
                                <TableCell><StatusChip meta={INSTANCE_STATUS[i.status]} /></TableCell>
                                <TableCell align="right">
                                  <Typography sx={{ fontSize: TEXT.md, fontWeight: 800 }}>{i.lastScore?.score ?? "—"}</Typography>
                                  {i.lastScore?.scoredAt ? (
                                    <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{formatDate(i.lastScore.scoredAt)}</Typography>
                                  ) : null}
                                </TableCell>
                                <TableCell>
                                  {i.lastRun ? (
                                    <Stack direction="row" alignItems="center" gap={0.75}>
                                      <StatusChip meta={RUN_STATUS[i.lastRun.status]} help={i.lastRun.errorText || null} />
                                      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{formatRelative(i.lastRun.startedAt)}</Typography>
                                    </Stack>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                                <TableCell sx={{ fontSize: TEXT.xs }}>{coverageText(i.coverage)}</TableCell>
                                <TableCell sx={{ fontSize: TEXT.xs }}>{i.collectorHostname || i.collectorDeviceId || "—"}</TableCell>
                                <TableCell sx={{ fontSize: TEXT.xs }}>{scheduleText(i.schedule)}</TableCell>
                                <TableCell align="right">{i.openFindings}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Box>
                    )}
                  </SectionPaper>
                </Stack>
              ) : null}
            </AsyncState>
          )}
        </>
      )}

      <ActivateDialog
        open={Boolean(activateFor)}
        instance={activateFor}
        onClose={() => setActivateFor(null)}
        onActivated={(result) => {
          setActivateFor(null);
          const run = result?.firstRun;
          setSnackbar({
            open: true,
            severity: run?.status === "missed" ? "warning" : "success",
            message:
              run?.status === "missed"
                ? "Activated. The first run was recorded as missed because no collector was online."
                : run
                  ? "Activated. The first assessment is running."
                  : "Collector saved.",
          });
          refresh();
          if (result?.instance?.id && !selectedId) openInstance(result.instance.id);
        }}
      />

      <BrandSnackbar open={snackbar.open} severity={snackbar.severity} message={snackbar.message} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} />
    </Box>
  );
}
