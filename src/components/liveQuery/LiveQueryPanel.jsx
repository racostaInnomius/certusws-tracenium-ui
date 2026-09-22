// src/components/liveQuery/LiveQueryPanel.jsx
//
// ADR-0029 F3 — pestaña «Live Query» de Asset Management: una pregunta de
// lectura a los equipos conectados AHORA, y su respuesta mientras llega.
//
// Vive en Asset Management y no en la barra lateral a propósito: hoy son seis
// preguntas fijas sobre el estado del equipo (proceso, servicio, fichero,
// registro, puerto, sesiones), no «pregúntale lo que quieras». Una entrada
// propia prometería más de lo que hay.
//
// Lo que la pantalla dice sin que nadie pregunte:
//   · sólo se pregunta a los conectados; un apagado sale aparte y NUNCA cuenta
//     como un «no» (no se le preguntó);
//   · pasados 2 minutos, el que no contestó es «No answer», no «no»;
//   · «Could not check» es que el equipo no pudo mirarlo, tampoco un «no»;
//   · nada se cambia en los equipos, y cada pregunta queda en la auditoría.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ManageSearchOutlinedIcon from "@mui/icons-material/ManageSearchOutlined";
import SectionPaper from "../common/SectionPaper";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import { formatRelative } from "../../utils/format";
import { listFrom } from "../../api/shape";
import { listAssetGroups } from "../../api/assetGroups";
import { createLiveQuery, getLiveQuery, listLiveQueries } from "../../api/liveQuery";
import KnownDevicesPicker from "../AssetGroups/KnownDevicesPicker";
import {
  PROBES,
  PROBE_BY_KEY,
  STATUS_LABEL,
  STATUS_META,
  answerKeyLabel,
  answerSummary,
  deviceReason,
  emptyParams,
  paramsForRequest,
  paramsProblem,
  questionSummary,
  targetSummary,
} from "./liveQueryModel";

const POLL_MS = 2000;
/** El tope del backend (ADR-0029 D4): más allá, la pregunta se rechaza entera. */
export const MAX_SELECTED_DEVICES = 500;
const PAGE_SIZE = 50;
const MONO = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };

function errorText(err) {
  return err?.body?.message || err?.body?.error || err?.message || "Something went wrong";
}

function StatusChip({ status, count, active, onClick }) {
  const meta = STATUS_META.find((s) => s.key === status);
  const sev = severityMeta(count > 0 ? meta?.sev : "none");
  return (
    <Chip
      size="small"
      label={`${STATUS_LABEL[status] ?? status} · ${count}`}
      onClick={onClick}
      variant={active ? "filled" : "outlined"}
      data-testid={`lq-status-${status}`}
      sx={{ fontSize: TEXT.xs, fontWeight: 700, ...(active ? { bgcolor: sev.bg, color: sev.fg } : { borderColor: BRAND.border }) }}
    />
  );
}

/**
 * La respuesta de una pregunta: recuento por estado, agregado por respuesta y
 * el detalle por equipo. Se relee cada 2 s mientras hay equipos a tiempo.
 */
function QueryResult({ queryId, groups = [] }) {
  const [q, setQ] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [filter, setFilter] = React.useState({ status: null, key: null, page: 1 });

  React.useEffect(() => {
    setQ(null);
    setFilter({ status: null, key: null, page: 1 });
  }, [queryId]);

  React.useEffect(() => {
    let alive = true;
    let timer = null;
    const load = async () => {
      try {
        const res = await getLiveQuery(queryId, { ...filter, pageSize: PAGE_SIZE });
        if (!alive) return;
        setQ(res?.query ?? null);
        setError(null);
        // Mientras quede alguien a tiempo de contestar; y un último vistazo
        // justo después del plazo, cuando los «pending» pasan a «no answer».
        const answerBy = Date.parse(res?.query?.answerBy ?? "");
        if (res?.query?.open || (Number.isFinite(answerBy) && Date.now() < answerBy + POLL_MS * 2)) {
          timer = window.setTimeout(load, POLL_MS);
        }
      } catch (err) {
        if (!alive) return;
        setError(errorText(err));
      }
    };
    load();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [queryId, filter]);

  if (error && !q) return <Alert severity="error">{error}</Alert>;
  if (!q) return <CircularProgress size={20} sx={{ color: BRAND.teal }} />;

  const counts = q.counts ?? {};
  const answered = counts.answered ?? 0;
  const maxAnswer = Math.max(1, ...q.answers.map((a) => a.devices));
  const asked = q.targeted - (counts.offline ?? 0) - (counts.unsupported ?? 0);
  const setStatus = (status) => setFilter((f) => ({ status: f.status === status ? null : status, key: null, page: 1 }));
  const setKey = (key) => setFilter((f) => ({ status: null, key: f.key === key ? null : key, page: 1 }));
  const totalPages = Math.max(1, Math.ceil((q.devices.total || 0) / PAGE_SIZE));

  return (
    <Stack spacing={2} data-testid="lq-result">
      <Box>
        <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark, ...MONO, wordBreak: "break-all" }}>
          {questionSummary(q.probe, q.params)}
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
          {targetSummary(q.target, groups)} · asked {formatRelative(q.createdAt)} · {asked} connected device{asked === 1 ? "" : "s"} asked
          {q.open ? " · waiting for answers…" : ""}
        </Typography>
        {q.open ? <LinearProgress sx={{ mt: 1, height: 3, borderRadius: 2, "& .MuiLinearProgress-bar": { bgcolor: BRAND.teal } }} /> : null}
      </Box>

      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
        {STATUS_META.map((s) =>
          (counts[s.key] ?? 0) > 0 || s.key === "answered" ? (
            <StatusChip key={s.key} status={s.key} count={counts[s.key] ?? 0} active={filter.status === s.key} onClick={() => setStatus(s.key)} />
          ) : null
        )}
      </Box>

      <Box>
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.75 }}>
          Answers {answered ? `(${answered} device${answered === 1 ? "" : "s"})` : ""}
        </Typography>
        {q.answers.length === 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>{q.open ? "No answer yet." : "No device answered."}</Typography>
        ) : (
          <Stack spacing={0.5} data-testid="lq-answers">
            {q.answers.map((a) => (
              <Box
                key={a.key}
                role="button"
                tabIndex={0}
                onClick={() => setKey(a.key)}
                onKeyDown={(e) => (e.key === "Enter" ? setKey(a.key) : null)}
                data-testid="lq-answer-row"
                sx={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) 120px 48px",
                  alignItems: "center",
                  gap: 1,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  cursor: "pointer",
                  bgcolor: filter.key === a.key ? BRAND.tealSoft : "transparent",
                  "&:hover": { bgcolor: BRAND.tealSoft },
                }}
              >
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...(q.probe === "registry" ? MONO : {}) }}>
                  {answerKeyLabel(q.probe, a.key)}
                </Typography>
                <Box sx={{ height: 8, borderRadius: 4, bgcolor: BRAND.border, overflow: "hidden" }}>
                  <Box sx={{ width: `${(a.devices / maxAnswer) * 100}%`, height: "100%", bgcolor: BRAND.teal }} />
                </Box>
                <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, textAlign: "right" }}>{a.devices}</Typography>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <Box>
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>
          Devices
          {filter.status ? ` · ${STATUS_LABEL[filter.status]}` : ""}
          {filter.key != null ? ` · ${answerKeyLabel(q.probe, filter.key)}` : ""}
        </Typography>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" data-testid="lq-devices">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Device</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Answer</TableCell>
                <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>Answered</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {q.devices.items.map((d) => (
                <TableRow key={d.deviceId}>
                  <TableCell sx={{ fontSize: TEXT.sm }}>{d.hostname || d.deviceId}</TableCell>
                  <TableCell sx={{ fontSize: TEXT.sm, whiteSpace: "nowrap" }}>{STATUS_LABEL[d.status] ?? d.status}</TableCell>
                  <TableCell sx={{ fontSize: TEXT.sm, ...(q.probe === "registry" || q.probe === "file" ? MONO : {}), wordBreak: "break-all" }}>
                    {d.status === "answered" ? answerSummary(q.probe, d.answer) : deviceReason(d.status, d.error, d.platform)}
                  </TableCell>
                  <TableCell sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, whiteSpace: "nowrap" }}>{d.answeredAt ? formatRelative(d.answeredAt) : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        {totalPages > 1 ? (
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", justifyContent: "flex-end", mt: 1 }}>
            <Button size="small" disabled={filter.page <= 1} onClick={() => setFilter((f) => ({ ...f, page: f.page - 1 }))}>Previous</Button>
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>Page {filter.page} of {totalPages}</Typography>
            <Button size="small" disabled={filter.page >= totalPages} onClick={() => setFilter((f) => ({ ...f, page: f.page + 1 }))}>Next</Button>
          </Box>
        ) : null}
      </Box>
      {error ? <Alert severity="warning">{error}</Alert> : null}
    </Stack>
  );
}

/**
 * @param initialTarget  objetivo que traen los atajos: { scope: "devices", deviceIds, label } o { scope: "group", groupId }
 * @param targetNonce    cambia cada vez que se usa un atajo con la pestaña ya montada
 */
export default function LiveQueryPanel({ initialTarget = null, targetNonce = 0 }) {
  const [probe, setProbe] = React.useState("process");
  const [params, setParams] = React.useState(() => emptyParams("process"));
  const [scope, setScope] = React.useState(initialTarget?.scope ?? "all");
  const [groupId, setGroupId] = React.useState(initialTarget?.scope === "group" ? String(initialTarget.groupId) : "");
  // «Selected devices»: el mismo selector que Asset Groups y Software Delivery
  // (búsqueda en servidor, paginado, casillas). La selección vive aquí, así
  // que sobrevive a cambiar de página y de búsqueda.
  const [pickedIds, setPickedIds] = React.useState(() => new Set(initialTarget?.scope === "devices" ? initialTarget.deviceIds : []));
  // Hostname de lo marcado, para los chips: lo marcado puede estar en otra
  // página del listado (el equipo que trae «Ask this device», p. ej.).
  const [pickedNames, setPickedNames] = React.useState(() =>
    initialTarget?.scope === "devices" && initialTarget.label ? new Map([[initialTarget.deviceIds[0], initialTarget.label]]) : new Map()
  );
  const [groups, setGroups] = React.useState([]);
  const [history, setHistory] = React.useState([]);
  const [current, setCurrent] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [formError, setFormError] = React.useState(null);

  // Un atajo usado con la pestaña ya abierta reescribe el objetivo.
  React.useEffect(() => {
    if (!initialTarget) return;
    setScope(initialTarget.scope);
    if (initialTarget.scope === "group") setGroupId(String(initialTarget.groupId));
    // «Ask this device» ya no es una opción aparte de un solo equipo: marca ESE
    // equipo en la selección, y se pueden añadir más.
    if (initialTarget.scope === "devices") {
      setPickedIds(new Set(initialTarget.deviceIds));
      if (initialTarget.label) setPickedNames(new Map([[initialTarget.deviceIds[0], initialTarget.label]]));
    }
  }, [initialTarget, targetNonce]);

  const loadHistory = React.useCallback(async () => {
    try {
      const res = await listLiveQueries();
      setHistory(Array.isArray(res?.queries) ? res.queries : []);
    } catch {
      /* el historial es secundario: la pregunta sigue funcionando */
    }
  }, []);

  React.useEffect(() => {
    loadHistory();
    listAssetGroups()
      .then((res) => setGroups(listFrom(res, { context: "assetGroups" })))
      .catch(() => setGroups([]));
  }, [loadHistory]);

  const def = PROBE_BY_KEY[probe];
  const target =
    scope === "group" ? { scope: "group", groupId: Number(groupId) } : scope === "devices" ? { scope: "devices", deviceIds: [...pickedIds] } : { scope: "all" };

  const toggleDevice = (deviceId, device) => {
    if (!pickedIds.has(deviceId) && pickedIds.size >= MAX_SELECTED_DEVICES) {
      setFormError(`A live query can ask up to ${MAX_SELECTED_DEVICES} devices. Use a group for more.`);
      return;
    }
    if (device?.hostname) setPickedNames((prev) => (prev.get(deviceId) === device.hostname ? prev : new Map(prev).set(deviceId, device.hostname)));
    setPickedIds((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };
  const PICKED_CHIPS = 12;

  const ask = async () => {
    const problem =
      paramsProblem(probe, params) ||
      (scope === "group" && !groupId ? "Choose a group." : null) ||
      (scope === "devices" && pickedIds.size === 0 ? "Select at least one device." : null);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      const res = await createLiveQuery({ probe, params: paramsForRequest(probe, params), target });
      setCurrent(res?.query?.queryId ?? null);
      loadHistory();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 320px" }, gap: 2, alignItems: "start" }} data-testid="live-query-panel">
      <Stack spacing={2} sx={{ minWidth: 0 }}>
        <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
          <Stack spacing={1.5} data-testid="lq-form">
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <ManageSearchOutlinedIcon sx={{ color: BRAND.teal }} />
              <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark }}>Ask connected devices one question</Typography>
            </Box>
            <Alert severity="info" sx={{ fontSize: TEXT.sm }}>
              Only devices connected right now are asked, and they answer in seconds. Offline devices are listed apart —
              they were not asked, so they never count as a “no”. After 2 minutes, a device that has not answered shows as
              “No answer”. Six read-only questions: nothing is changed on the devices, and every question is recorded in
              the audit log. For installed software, patches or compliance, use their pages — those are already known.
            </Alert>

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <Select
                size="small"
                value={probe}
                onChange={(e) => {
                  setProbe(e.target.value);
                  setParams(emptyParams(e.target.value));
                  setFormError(null);
                }}
                inputProps={{ "aria-label": "Question" }}
                sx={{ minWidth: 220 }}
              >
                {PROBES.map((p) => (
                  <MenuItem key={p.key} value={p.key}>{p.label}</MenuItem>
                ))}
              </Select>
              <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>{def.question} · {def.platforms}</Typography>
            </Box>

            {def.fields.map((f) => (
              <TextField
                key={f.name}
                size="small"
                label={f.label}
                placeholder={f.placeholder}
                helperText={f.help}
                value={params[f.name] ?? ""}
                onChange={(e) => setParams((p) => ({ ...p, [f.name]: e.target.value }))}
                onKeyDown={(e) => (e.key === "Enter" && !busy ? ask() : null)}
                inputProps={{ style: MONO }}
              />
            ))}

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <Typography sx={{ fontSize: TEXT.sm }}>Ask</Typography>
              <Select size="small" value={scope} onChange={(e) => setScope(e.target.value)} inputProps={{ "aria-label": "Who to ask" }} sx={{ minWidth: 180 }}>
                <MenuItem value="all">All devices</MenuItem>
                <MenuItem value="group">A group</MenuItem>
                <MenuItem value="devices">Selected devices{pickedIds.size ? ` (${pickedIds.size})` : ""}</MenuItem>
              </Select>
              {scope === "group" ? (
                <Select size="small" value={groupId} displayEmpty onChange={(e) => setGroupId(e.target.value)} inputProps={{ "aria-label": "Group" }} sx={{ minWidth: 220 }}>
                  <MenuItem value="" disabled>Choose a group</MenuItem>
                  {groups.map((g) => (
                    <MenuItem key={g.id} value={String(g.id)}>{g.name}</MenuItem>
                  ))}
                </Select>
              ) : null}
              <Box sx={{ flex: 1 }} />
              <Button
                variant="contained"
                onClick={ask}
                disabled={busy}
                startIcon={busy ? <CircularProgress size={14} /> : <ManageSearchOutlinedIcon />}
                sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
              >
                Ask
              </Button>
            </Box>
            {scope === "devices" ? (
              <Box data-testid="lq-device-picker">
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                  <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, flex: 1 }}>
                    Up to {MAX_SELECTED_DEVICES}. Only the ones connected when you press Ask are asked; the rest show as offline.
                  </Typography>
                  {pickedIds.size ? (
                    <Button size="small" onClick={() => setPickedIds(new Set())} sx={{ textTransform: "none" }}>
                      Clear selection
                    </Button>
                  ) : null}
                </Box>
                {pickedIds.size ? (
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1 }} data-testid="lq-picked">
                    {[...pickedIds].slice(0, PICKED_CHIPS).map((id) => (
                      <Chip key={id} size="small" label={pickedNames.get(id) || id} onDelete={() => toggleDevice(id)} sx={{ fontSize: TEXT.xs }} />
                    ))}
                    {pickedIds.size > PICKED_CHIPS ? (
                      <Chip size="small" variant="outlined" label={`+${pickedIds.size - PICKED_CHIPS} more`} sx={{ fontSize: TEXT.xs }} />
                    ) : null}
                  </Box>
                ) : null}
                <KnownDevicesPicker
                  open={scope === "devices"}
                  selectedIds={pickedIds}
                  onToggleDevice={toggleDevice}
                  selectedLabel="selected"
                  emptyLabel="No device matches this search."
                />
              </Box>
            ) : null}
            {formError ? <Alert severity="error">{formError}</Alert> : null}
          </Stack>
        </SectionPaper>

        {current ? (
          <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
            <QueryResult queryId={current} groups={groups} />
          </SectionPaper>
        ) : null}
      </Stack>

      <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 800, color: BRAND.dark, mb: 1 }}>Recent questions</Typography>
        {history.length === 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>No question asked yet. Answers are kept for 30 days.</Typography>
        ) : (
          <Stack spacing={0.5} data-testid="lq-history">
            {history.map((h) => (
              <Box
                key={h.queryId}
                role="button"
                tabIndex={0}
                onClick={() => setCurrent(h.queryId)}
                onKeyDown={(e) => (e.key === "Enter" ? setCurrent(h.queryId) : null)}
                sx={{ p: 1, borderRadius: 1, cursor: "pointer", bgcolor: current === h.queryId ? BRAND.tealSoft : "transparent", "&:hover": { bgcolor: BRAND.tealSoft } }}
              >
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, ...MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {questionSummary(h.probe, h.params)}
                </Typography>
                <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                  {formatRelative(h.createdAt)} · {h.answered} answered · {h.targeted} targeted{h.offline ? ` · ${h.offline} offline` : ""}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </SectionPaper>
    </Box>
  );
}
