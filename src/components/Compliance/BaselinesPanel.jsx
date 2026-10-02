// src/components/Compliance/BaselinesPanel.jsx
//
// ADR-0037 F1 — los baselines de remediación en la pestaña Remediation.
//
// Un baseline es el estándar del tenant, DECLARADO: una lista de checks que un
// grupo de equipos (o todos los de una plataforma) tiene que pasar. Esta
// sección los crea, los rellena con lo que la flota ya tiene arreglado
// («Propose from fleet») y enseña quién está fuera de línea.
//
// F1 sólo MIDE. Aplicar el baseline a los equipos (con aprobación o solo)
// llega después; la cabecera lo dice para que nadie espere que un equipo
// nuevo se alinee solo todavía.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  LinearProgress,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import { BRAND, ICON, ROLE, TEXT } from "../../theme/brand";
import SectionPaper from "../common/SectionPaper";
import { useConfirm } from "../common/ConfirmDialog";
import { SeverityChip } from "./complianceChips";
import {
  addBaselineEntries,
  createBaseline,
  deleteBaseline,
  getBaselineAlignment,
  getBaselineDetail,
  getBaselineProposals,
  getComplianceCatalog,
  listBaselines,
  removeBaselineEntry,
} from "../../api/compliance";
import { listAssetGroups } from "../../api/assetGroups";

const PLATFORM_LABEL = { windows: "Windows", macos: "macOS", linux: "Linux" };

const errorText = (e, fallback) => e?.body?.message || e?.body?.error || e?.message || fallback;

/** «All Windows devices» / «Group: PCI scope». */
export function scopeLabel(b) {
  if (b?.scopeKind === "platform") return `All ${PLATFORM_LABEL[b.platform] ?? b.platform} devices`;
  return `Group: ${b?.assetGroupName ?? `#${b?.assetGroupId}`}`;
}

/** «48 of 55 aligned», con lo que aún no se ha medido aparte. */
function AlignmentBar({ alignment }) {
  if (!alignment) return <LinearProgress sx={{ height: 6, borderRadius: 3 }} />;
  const { devicesInScope: n, devicesAligned: ok, devicesUnmeasured: unmeasured } = alignment;
  const pct = n > 0 ? Math.round((ok / n) * 100) : 0;
  return (
    <Box sx={{ minWidth: 180 }}>
      <LinearProgress
        variant="determinate"
        value={pct}
        aria-label={`${ok} of ${n} devices aligned`}
        sx={{ height: 6, borderRadius: 3, bgcolor: ROLE.criticalSoft, "& .MuiLinearProgress-bar": { bgcolor: ROLE.positive } }}
      />
      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 0.5 }}>
        {n === 0 ? "No devices in scope" : `${ok} of ${n} aligned`}
        {unmeasured > 0 ? ` · ${unmeasured} not measured yet` : ""}
      </Typography>
    </Box>
  );
}

function CreateDialog({ open, onClose, onCreated, onToast }) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState("asset_group");
  const [groupId, setGroupId] = React.useState("");
  const [platform, setPlatform] = React.useState("windows");
  const [groups, setGroups] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setName("");
    setError(null);
    listAssetGroups({ pageSize: 100 })
      .then((res) => alive && setGroups(Array.isArray(res?.items) ? res.items : []))
      .catch(() => alive && setGroups([]));
    return () => {
      alive = false;
    };
  }, [open]);

  const valid = name.trim() && (kind === "platform" || groupId);
  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await createBaseline(
        kind === "platform" ? { name, scopeKind: "platform", platform } : { name, scopeKind: "asset_group", assetGroupId: Number(groupId) }
      );
      onToast?.({ severity: "success", message: `Baseline "${res?.baseline?.name ?? name}" created. Fill it from your fleet or add checks.` });
      onCreated?.(res?.baseline ?? null);
      onClose();
    } catch (e) {
      setError(errorText(e, "Could not create the baseline."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New baseline</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Name" size="small" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Windows 11 workstations" />
          <RadioGroup value={kind} onChange={(e) => setKind(e.target.value)}>
            <FormControlLabel value="asset_group" control={<Radio size="small" />} label="A device group" />
            {kind === "asset_group" ? (
              <TextField select size="small" label="Group" value={groupId} onChange={(e) => setGroupId(e.target.value)} sx={{ ml: 4 }}>
                {groups.length === 0 ? <MenuItem disabled value="">No device groups yet</MenuItem> : null}
                {groups.map((g) => (
                  <MenuItem key={g.id} value={String(g.id)}>{g.name}</MenuItem>
                ))}
              </TextField>
            ) : null}
            <FormControlLabel value="platform" control={<Radio size="small" />} label="Every device of a platform" />
            {kind === "platform" ? (
              <TextField select size="small" label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)} sx={{ ml: 4 }}>
                {Object.entries(PLATFORM_LABEL).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{v}</MenuItem>
                ))}
              </TextField>
            ) : null}
          </RadioGroup>
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button variant="contained" disableElevation disabled={!valid || saving} onClick={submit} sx={{ textTransform: "none" }}>
          Create baseline
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ProposeDialog({ baseline, open, onClose, onAdded, onToast }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [picked, setPicked] = React.useState(() => new Set());
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open || !baseline) return undefined;
    let alive = true;
    setData(null);
    setError(null);
    getBaselineProposals(baseline.id)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setPicked(new Set((res?.proposals ?? []).map((p) => p.checkId)));
      })
      .catch((e) => alive && setError(errorText(e, "Could not read what your fleet has fixed.")));
    return () => {
      alive = false;
    };
  }, [open, baseline]);

  const proposals = data?.proposals ?? [];
  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const add = async () => {
    setSaving(true);
    try {
      const res = await addBaselineEntries(baseline.id, [...picked], "fleet");
      const n = res?.added?.length ?? 0;
      onToast?.({ severity: "success", message: `Added ${n} check${n === 1 ? "" : "s"} to "${baseline.name}".` });
      onAdded?.();
      onClose();
    } catch (e) {
      onToast?.({ severity: "error", message: errorText(e, "Could not add the checks.") });
    } finally {
      setSaving(false);
    }
  };

  const pct = Math.round((data?.minCoverage ?? 0.8) * 100);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Propose from your fleet</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1.5 }}>
          Fixes already applied on at least {pct}% of the devices this baseline covers (where the check applies) in the last{" "}
          {data?.days ?? 90} days, that still pass on the devices checked again since. A fix that did not hold is not proposed.
        </Typography>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {!data && !error ? <LinearProgress /> : null}
        {data && proposals.length === 0 ? (
          <Alert severity="info">
            Nothing to propose: no fix reaches {pct}% of the {data.scopeDevices} device{data.scopeDevices === 1 ? "" : "s"} in scope, or it is already in the baseline.
          </Alert>
        ) : null}
        {proposals.length > 0 ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell>Check</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>Fixed on</TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>Still passing</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {proposals.map((p) => (
                <TableRow key={p.checkId} hover onClick={() => toggle(p.checkId)} sx={{ cursor: "pointer" }}>
                  <TableCell padding="checkbox">
                    <Checkbox size="small" checked={picked.has(p.checkId)} inputProps={{ "aria-label": `Add ${p.title || p.checkId}` }} />
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600 }}>{p.title || p.checkId}</Typography>
                  </TableCell>
                  <TableCell><SeverityChip severity={p.severity} /></TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {p.fixedDevices} of {p.scopeDevices}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    <Tooltip title="Of the fixed devices scanned again since the fix. Devices not scanned yet are left out, not counted as failures." arrow>
                      <span>{p.measuredDevices != null ? `${p.holdingDevices} of ${p.measuredDevices}` : p.holdingDevices}</span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button variant="contained" disableElevation disabled={picked.size === 0 || saving || proposals.length === 0} onClick={add} sx={{ textTransform: "none" }}>
          {`Add ${picked.size} check${picked.size === 1 ? "" : "s"}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const PICK_LIMIT = 50;

/**
 * Añadir checks a mano: buscar en el catálogo y marcar. Para lo que la flota
 * aún no tiene arreglado (un estándar que se quiere imponer, no sólo
 * recoger). Un baseline de plataforma sólo ofrece checks de su plataforma y
 * los multiplataforma; uno de grupo, todos. Lo que ya está no se ofrece.
 */
export function pickableChecks(catalog, { platform = null, existing = new Set(), query = "" } = {}) {
  const q = query.trim().toLowerCase();
  return (catalog || []).filter(
    (c) =>
      !existing.has(c.checkId) &&
      (!platform || c.platform === platform || c.platform === "cross") &&
      (!q || String(c.title || "").toLowerCase().includes(q) || String(c.checkId).toLowerCase().includes(q))
  );
}

function AddChecksDialog({ baseline, open, existing, onClose, onAdded, onToast }) {
  const [catalog, setCatalog] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState(() => new Set());
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setQuery("");
    setPicked(new Set());
    setError(null);
    getComplianceCatalog()
      .then((res) => alive && setCatalog(Array.isArray(res?.checks) ? res.checks : []))
      .catch((e) => alive && setError(errorText(e, "Could not load the catalog.")));
    return () => {
      alive = false;
    };
  }, [open]);

  const matches = React.useMemo(
    () => pickableChecks(catalog, { platform: baseline?.scopeKind === "platform" ? baseline.platform : null, existing, query }),
    [catalog, baseline, existing, query]
  );
  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const add = async () => {
    setSaving(true);
    try {
      const res = await addBaselineEntries(baseline.id, [...picked], "manual");
      const n = res?.added?.length ?? 0;
      const skipped = (res?.unknown?.length ?? 0) + (res?.alreadyIn?.length ?? 0);
      onToast?.({
        severity: "success",
        message: `Added ${n} check${n === 1 ? "" : "s"} to "${baseline.name}".${skipped ? ` ${skipped} skipped (already in, or not for this platform).` : ""}`,
      });
      onAdded?.();
      onClose();
    } catch (e) {
      onToast?.({ severity: "error", message: errorText(e, "Could not add the checks.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Add checks</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1.5 }}>
          {baseline?.scopeKind === "platform"
            ? `Checks for ${PLATFORM_LABEL[baseline.platform] ?? baseline.platform} and cross-platform checks.`
            : "Any check in the catalog."}{" "}
          Each one is added with the value the catalog expects today.
        </Typography>
        <TextField
          size="small"
          fullWidth
          autoFocus
          placeholder="Search by title or check id"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputProps={{ "aria-label": "Search checks" }}
          sx={{ mb: 1 }}
        />
        {error ? <Alert severity="error">{error}</Alert> : null}
        {!catalog && !error ? <LinearProgress /> : null}
        {catalog ? (
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mb: 0.5 }}>
            {matches.length > PICK_LIMIT
              ? `${matches.length} matches — showing the first ${PICK_LIMIT}. Narrow the search to see the rest.`
              : `${matches.length} match${matches.length === 1 ? "" : "es"}`}
            {picked.size ? ` · ${picked.size} selected` : ""}
          </Typography>
        ) : null}
        {catalog && matches.length > 0 ? (
          <Table size="small">
            <TableBody>
              {matches.slice(0, PICK_LIMIT).map((c) => (
                <TableRow key={c.checkId} hover onClick={() => toggle(c.checkId)} sx={{ cursor: "pointer" }}>
                  <TableCell padding="checkbox">
                    <Checkbox size="small" checked={picked.has(c.checkId)} inputProps={{ "aria-label": `Select ${c.title || c.checkId}` }} />
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600 }}>{c.title || c.checkId}</Typography>
                    <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontFamily: "monospace" }}>{c.checkId}</Typography>
                  </TableCell>
                  <TableCell sx={{ width: 110 }}>{c.severity ? <SeverityChip severity={c.severity} /> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button variant="contained" disableElevation disabled={picked.size === 0 || saving} onClick={add} sx={{ textTransform: "none" }}>
          {`Add ${picked.size} check${picked.size === 1 ? "" : "s"}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Lo que dice una entrada además de su nombre. */
function EntryFlags({ entry }) {
  const flags = [];
  if (entry.missing) flags.push(["Not in the catalog", "This check is no longer in the catalog. Remove it from the baseline."]);
  else if (entry.catalogChanged) flags.push(["Catalog changed", "The catalog changed this check since it was added: a different value, fix or safeguard. Review it before the baseline is applied to devices."]);
  if (!entry.missing && !entry.fixable) {
    flags.push([
      "Manual fix",
      entry.guard
        ? `Tracenium will not apply this one on its own: ${entry.guard}`
        : "This check has no automatic fix. The baseline tracks it; fixing it is done by hand.",
    ]);
  }
  return flags.map(([label, title]) => (
    <Tooltip key={label} title={title} arrow>
      <Chip size="small" variant="outlined" label={label} sx={{ ml: 0.75, height: 20, fontSize: TEXT.xs }} />
    </Tooltip>
  ));
}

function BaselineDetail({ baseline, alignment, canManage, onChanged, onToast }) {
  const confirm = useConfirm();
  const [detail, setDetail] = React.useState(null);
  const [proposeOpen, setProposeOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setDetail(await getBaselineDetail(baseline.id));
    } catch (e) {
      onToast?.({ severity: "error", message: errorText(e, "Could not load the baseline.") });
    }
  }, [baseline.id, onToast]);
  React.useEffect(() => {
    load();
  }, [load]);

  const entries = React.useMemo(() => detail?.entries ?? [], [detail]);
  const existingIds = React.useMemo(() => new Set(entries.map((e) => e.checkId)), [entries]);
  const byCheck = new Map((alignment?.byCheck ?? []).map((c) => [c.checkId, c]));
  const titleOf = new Map(entries.map((e) => [e.checkId, e.title || e.checkId]));
  const outOfLine = (alignment?.devices ?? []).filter((d) => d.counts.deviation > 0);

  const remove = async (entry) => {
    try {
      await removeBaselineEntry(baseline.id, entry.checkId);
      await load();
      onChanged?.();
    } catch (e) {
      onToast?.({ severity: "error", message: errorText(e, "Could not remove the check.") });
    }
  };
  const destroy = async () => {
    const ok = await confirm({
      title: `Delete "${baseline.name}"?`,
      body: "The baseline and its list of checks are removed. Devices and findings are not touched.",
      confirmText: "Delete baseline",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteBaseline(baseline.id);
      onToast?.({ severity: "success", message: `Baseline "${baseline.name}" deleted.` });
      onChanged?.({ deleted: baseline.id });
    } catch (e) {
      onToast?.({ severity: "error", message: errorText(e, "Could not delete the baseline.") });
    }
  };

  return (
    <Box sx={{ px: 2, pb: 2 }}>
      {canManage ? (
        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
          <Button size="small" variant="outlined" startIcon={<AutoFixHighOutlinedIcon />} onClick={() => setProposeOpen(true)} sx={{ textTransform: "none" }}>
            Propose from fleet
          </Button>
          <Button size="small" variant="outlined" startIcon={<AddOutlinedIcon />} onClick={() => setAddOpen(true)} sx={{ textTransform: "none" }}>
            Add checks
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button size="small" color="error" onClick={destroy} sx={{ textTransform: "none" }}>
            Delete baseline
          </Button>
        </Stack>
      ) : null}

      {!detail ? <LinearProgress /> : null}
      {detail && entries.length === 0 ? (
        <Alert severity="info">
          No checks yet. Use «Propose from fleet» to start from what your devices already have fixed, or «Add checks» to pick them from the catalog.
        </Alert>
      ) : null}

      {outOfLine.length > 0 ? (
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>
            {`${outOfLine.length} device${outOfLine.length === 1 ? "" : "s"} out of line`}
          </Typography>
          <Table size="small">
            <TableBody>
              {outOfLine.slice(0, 25).map((d) => (
                <TableRow key={d.deviceId}>
                  <TableCell sx={{ width: 220, fontWeight: 600 }}>{d.hostname || d.deviceId}</TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.errorText }}>
                      {`${d.counts.deviation} deviation${d.counts.deviation === 1 ? "" : "s"}: `}
                      <Box component="span" sx={{ color: BRAND.gray }}>
                        {d.deviations.slice(0, 3).map((c) => titleOf.get(c) ?? c).join(" · ")}
                        {d.deviations.length > 3 ? ` · +${d.deviations.length - 3} more` : ""}
                      </Box>
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {outOfLine.length > 25 ? (
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 0.5 }}>{`+${outOfLine.length - 25} more devices`}</Typography>
          ) : null}
        </Box>
      ) : null}

      {entries.length > 0 ? (
        <>
          <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>
            {`${entries.length} check${entries.length === 1 ? "" : "s"}`}
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Check</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell align="right">Out of line</TableCell>
                {canManage ? <TableCell padding="checkbox" /> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((e) => {
                const stat = byCheck.get(e.checkId);
                return (
                  <TableRow key={e.checkId}>
                    <TableCell>
                      <Typography component="span" sx={{ fontSize: TEXT.sm, fontWeight: 600 }}>{e.title || e.checkId}</Typography>
                      <EntryFlags entry={e} />
                    </TableCell>
                    <TableCell>{e.severity ? <SeverityChip severity={e.severity} /> : "—"}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", color: stat?.deviations ? BRAND.alert.errorText : BRAND.gray }}>
                      {stat ? stat.deviations : "—"}
                    </TableCell>
                    {canManage ? (
                      <TableCell padding="checkbox">
                        <IconButton size="small" aria-label={`Remove ${e.title || e.checkId}`} onClick={() => remove(e)}>
                          <DeleteOutlineIcon sx={{ fontSize: ICON.sm }} />
                        </IconButton>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      ) : null}

      <AddChecksDialog
        baseline={baseline}
        open={addOpen}
        existing={existingIds}
        onClose={() => setAddOpen(false)}
        onAdded={async () => {
          await load();
          onChanged?.();
        }}
        onToast={onToast}
      />
      <ProposeDialog
        baseline={baseline}
        open={proposeOpen}
        onClose={() => setProposeOpen(false)}
        onAdded={async () => {
          await load();
          onChanged?.();
        }}
        onToast={onToast}
      />
    </Box>
  );
}

export default function BaselinesPanel({ reloadKey, onToast, canManage = false }) {
  const [baselines, setBaselines] = React.useState(null);
  const [alignments, setAlignments] = React.useState({});
  const [error, setError] = React.useState(null);
  const [openId, setOpenId] = React.useState(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  const loadAlignment = React.useCallback(async (id) => {
    try {
      const res = await getBaselineAlignment(id);
      setAlignments((prev) => ({ ...prev, [id]: res?.alignment ?? null }));
    } catch {
      setAlignments((prev) => ({ ...prev, [id]: null }));
    }
  }, []);

  const load = React.useCallback(async () => {
    try {
      setError(null);
      const res = await listBaselines();
      const list = Array.isArray(res?.baselines) ? res.baselines : [];
      setBaselines(list);
      list.forEach((b) => loadAlignment(b.id));
    } catch (e) {
      setError(errorText(e, "Could not load the baselines."));
    }
  }, [loadAlignment]);

  React.useEffect(() => {
    load();
  }, [load, reloadKey]);

  return (
    <SectionPaper variant="panel" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <RuleOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
          <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark }}>Baselines</Typography>
        </Stack>
        {canManage ? (
          <Button size="small" onClick={() => setCreateOpen(true)} sx={{ textTransform: "none" }}>
            New baseline
          </Button>
        ) : null}
      </Stack>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1.5 }}>
        Your standard configuration, written down: the checks a group of devices must pass, and which devices are out of line. For now
        a baseline shows alignment only; applying it to new or drifted devices comes in a later release.
      </Typography>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {!baselines && !error ? (
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={18} />
          <Typography sx={{ color: "text.secondary" }}>Loading baselines…</Typography>
        </Stack>
      ) : null}
      {baselines && baselines.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
          No baselines yet. Create one for a group of devices, then fill it from what your fleet already has fixed.
        </Typography>
      ) : null}

      {baselines && baselines.length > 0 ? (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 34 }} />
              <TableCell>Baseline</TableCell>
              <TableCell>Covers</TableCell>
              <TableCell align="right">Checks</TableCell>
              <TableCell>Alignment</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {baselines.map((b) => {
              const open = openId === b.id;
              return (
                <React.Fragment key={b.id}>
                  <TableRow hover onClick={() => setOpenId(open ? null : b.id)} sx={{ cursor: "pointer", "& > td": { borderBottom: open ? "none" : undefined } }}>
                    <TableCell>
                      <IconButton size="small" aria-label={open ? `Collapse ${b.name}` : `Expand ${b.name}`}>
                        <ExpandMoreIcon sx={{ fontSize: ICON.sm, transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{b.name}</TableCell>
                    <TableCell sx={{ color: BRAND.gray }}>{scopeLabel(b)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{b.entryCount}</TableCell>
                    <TableCell>
                      <AlignmentBar alignment={alignments[b.id]} />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} sx={{ p: 0, borderBottom: open ? undefined : "none" }}>
                      <Collapse in={open} unmountOnExit>
                        <BaselineDetail
                          baseline={b}
                          alignment={alignments[b.id]}
                          canManage={canManage}
                          onToast={onToast}
                          onChanged={(change) => {
                            if (change?.deleted) {
                              setOpenId(null);
                              load();
                              return;
                            }
                            load();
                          }}
                        />
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      ) : null}

      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onToast={onToast}
        onCreated={(b) => {
          load();
          if (b?.id) setOpenId(b.id);
        }}
      />
    </SectionPaper>
  );
}
