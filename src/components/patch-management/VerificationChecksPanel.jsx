// src/components/patch-management/VerificationChecksPanel.jsx
//
// Post-patch checks (ADR-0038 F1). After every patch, the agent already
// compares the services that were running before with the ones running after
// the restart. These are the things that matter on top of that — the database
// port, the site's health URL, the share the app depends on — declared once per
// asset group (or for every device) and measured before and after each patch.
//
// A check that already failed before patching is reported as such, never as a
// regression: the patch did not break it.

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import {
  listVerificationChecks,
  listVerificationTemplates,
  createVerificationCheck,
  updateVerificationCheck,
  deleteVerificationCheck,
  listVerificationSuggestions,
  discoverListeners,
} from "../../api/patchManagement";
import { listAssetGroups } from "../../api/assetGroups";
import { listFrom } from "../../api/shape";
import { useConfirm } from "../common/ConfirmDialog";
import {
  CHECK_KINDS,
  MAX_CHECKS_PER_DEVICE,
  checksPerGroup,
  describeCheck,
  emptyForm,
  formFromCheck,
  payloadFromForm,
  suggestionScopeText,
  suggestionWhy,
} from "./verificationChecks";

function errMsg(err, fallback) {
  return err?.body?.message || err?.message || fallback;
}

const EVERY_DEVICE = "Every device";

function GroupField({ value, groups, onChange }) {
  return (
    <TextField select size="small" label="Applies to" value={value} onChange={(e) => onChange(e.target.value)} fullWidth>
      <MenuItem value="">{EVERY_DEVICE}</MenuItem>
      {groups.map((g) => (
        <MenuItem key={g.id} value={String(g.id)}>
          {g.name}
        </MenuItem>
      ))}
    </TextField>
  );
}

function CheckDialog({ open, entry, groups, submitting, onClose, onSubmit }) {
  const [form, setForm] = React.useState(emptyForm);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(entry ? formFromCheck(entry) : emptyForm());
  }, [open, entry]);

  const update = (patch) => setForm((p) => ({ ...p, ...patch }));
  const kind = CHECK_KINDS.find((k) => k.value === form.kind);

  const submit = () => {
    const r = payloadFromForm(form);
    if (r.error) return setError(r.error);
    onSubmit(r.payload);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{entry ? "Edit check" : "Add a post-patch check"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField size="small" label="Name" value={form.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. ERP database" fullWidth autoFocus />
          <GroupField value={form.assetGroupId} groups={groups} onChange={(v) => update({ assetGroupId: v })} />
          <TextField select size="small" label="What to check" value={form.kind} onChange={(e) => update({ kind: e.target.value })} helperText={kind?.hint} fullWidth>
            {CHECK_KINDS.map((k) => (
              <MenuItem key={k.value} value={k.value}>
                {k.label}
              </MenuItem>
            ))}
          </TextField>

          {form.kind === "service" || form.kind === "process" ? (
            <TextField size="small" label={form.kind === "service" ? "Service name" : "Process name"} value={form.target} onChange={(e) => update({ target: e.target.value })} fullWidth />
          ) : null}
          {form.kind === "tcp" ? (
            <TextField size="small" label="Host" value={form.host} onChange={(e) => update({ host: e.target.value })} placeholder="sql01.corp.local or 10.0.0.5" fullWidth />
          ) : null}
          {form.kind === "port" || form.kind === "tcp" ? (
            <TextField size="small" label="Port" value={form.port} onChange={(e) => update({ port: e.target.value })} inputProps={{ inputMode: "numeric" }} sx={{ maxWidth: 160 }} />
          ) : null}
          {form.kind === "http" ? (
            <>
              <TextField size="small" label="Address" value={form.url} onChange={(e) => update({ url: e.target.value })} placeholder="https://localhost/health" fullWidth />
              <Stack direction="row" spacing={2}>
                <TextField size="small" label="Expected status" value={form.expectStatus} onChange={(e) => update({ expectStatus: e.target.value })} helperText="e.g. 200 or 200, 302" sx={{ maxWidth: 180 }} />
                <TextField size="small" label="Response contains (optional)" value={form.bodyContains} onChange={(e) => update({ bodyContains: e.target.value })} fullWidth />
              </Stack>
              <FormControlLabel
                control={<Switch checked={form.tlsVerify} onChange={(e) => update({ tlsVerify: e.target.checked })} />}
                label={<Typography sx={{ fontSize: TEXT.sm }}>Verify the certificate (turn off for a self-signed one on an internal site)</Typography>}
              />
            </>
          ) : null}

          <FormControlLabel control={<Switch checked={form.enabled} onChange={(e) => update({ enabled: e.target.checked })} />} label="Enabled" />
          {error ? <Typography sx={{ color: BRAND.alert?.error, fontSize: TEXT.sm }}>{error}</Typography> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: "none", color: BRAND.gray }}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={submitting} variant="contained" sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}>
          {entry ? "Save" : "Add check"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function TemplateDialog({ open, templates, groups, submitting, onClose, onSubmit }) {
  const [key, setKey] = React.useState("");
  const [group, setGroup] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setKey(templates[0]?.key ?? "");
    setGroup("");
  }, [open, templates]);
  const tpl = templates.find((t) => t.key === key);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Add checks for a server role</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select size="small" label="Role" value={key} onChange={(e) => setKey(e.target.value)} fullWidth>
            {templates.map((t) => (
              <MenuItem key={t.key} value={t.key}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>
          <GroupField value={group} groups={groups} onChange={setGroup} />
          {group === "" ? (
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert?.warning ?? BRAND.gray }}>
              Role checks on every device will fail wherever that role is not installed. Pick the group that holds these servers.
            </Typography>
          ) : null}
          {tpl ? (
            <Box component="ul" sx={{ m: 0, pl: 2.5, color: BRAND.dark, fontSize: TEXT.sm }}>
              {tpl.checks.map((c) => (
                <li key={c.name}>
                  <b>{c.name}</b> — {describeCheck(c.kind, c.params)}
                </li>
              ))}
            </Box>
          ) : null}
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>A starting point: each check is added on its own and can be edited or removed.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: "none", color: BRAND.gray }}>
          Cancel
        </Button>
        <Button
          onClick={() => tpl && onSubmit(tpl, group)}
          disabled={submitting || !tpl}
          variant="contained"
          sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
        >
          {tpl ? `Add ${tpl.checks.length} checks` : "Add checks"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * ADR-0038 F2 (D4) — what the devices listen on, as checks to add. Nothing is
 * created on its own: each suggestion is one click, for the scope picked here.
 */
function SuggestionsSection({ groups, canManage, notify, onAdded }) {
  const [scope, setScope] = React.useState("");
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(null); // suggestion key | "discover"

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(await listVerificationSuggestions(scope === "" ? null : Number(scope)));
    } catch (err) {
      setData(null);
      notify?.("error", errMsg(err, "Could not load suggestions"));
    } finally {
      setLoading(false);
    }
  }, [scope, notify]);

  React.useEffect(() => {
    load();
  }, [load]);

  const ask = async () => {
    setBusy("discover");
    try {
      const r = await discoverListeners(scope === "" ? null : Number(scope));
      const old = r?.agentTooOld ? ` ${r.agentTooOld} device(s) run an agent too old to answer.` : "";
      const over = r?.overLimit ? ` ${r.overLimit} more were not asked (limit ${r.asked} at a time).` : "";
      notify?.(
        r?.asked ? "success" : "warning",
        r?.asked
          ? `Asked ${r.asked} device(s). Answers arrive within a minute or two — refresh to see them.${old}${over}`
          : `No device here can answer yet.${old}`
      );
    } catch (err) {
      notify?.("error", errMsg(err, "Could not ask the devices"));
    } finally {
      setBusy(null);
    }
  };

  const add = async (sg) => {
    setBusy(sg.key);
    try {
      await createVerificationCheck({ name: sg.name, kind: sg.kind, params: sg.params, assetGroupId: scope === "" ? null : Number(scope), enabled: true });
      notify?.("success", `Added “${sg.name}”.`);
      await Promise.all([onAdded?.(), load()]);
    } catch (err) {
      notify?.("error", errMsg(err, "Could not add the check"));
    } finally {
      setBusy(null);
    }
  };

  const items = data?.items ?? [];
  return (
    <Box sx={{ mt: 3, pt: 2, borderTop: `1px solid ${BRAND.border}` }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark }}>Suggested from what the devices listen on</Typography>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ minWidth: 220 }}>
          <GroupField value={scope} groups={groups} onChange={setScope} />
        </Box>
        <Button onClick={load} startIcon={<RefreshOutlinedIcon />} sx={{ textTransform: "none", color: BRAND.gray }}>
          Refresh
        </Button>
        {canManage ? (
          <Button onClick={ask} disabled={busy === "discover"} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.teal }}>
            {busy === "discover" ? "Asking…" : "Ask the devices now"}
          </Button>
        ) : null}
      </Box>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1 }}>{loading ? "Loading…" : suggestionScopeText(data)}</Typography>
      {!loading && items.length > 0 ? (
        <Table size="small" aria-label="Suggested checks">
          <TableBody>
            {items.map((sg) => (
              <TableRow key={sg.key} hover>
                <TableCell>
                  <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>{sg.name}</Typography>
                  <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{describeCheck(sg.kind, sg.params)}</Typography>
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>{suggestionWhy(sg)}</Typography>
                </TableCell>
                {canManage ? (
                  <TableCell align="right">
                    <Button
                      size="small"
                      aria-label={`Add ${sg.name}`}
                      onClick={() => add(sg)}
                      disabled={busy != null}
                      startIcon={<AddOutlinedIcon />}
                      sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}
                    >
                      Add
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </Box>
  );
}

export default function VerificationChecksPanel({ canManage, notify }) {
  const [items, setItems] = React.useState([]);
  const [groups, setGroups] = React.useState([]);
  const [templates, setTemplates] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [dialog, setDialog] = React.useState(null); // { entry } | { template: true }
  const [submitting, setSubmitting] = React.useState(false);
  const confirm = useConfirm();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listVerificationChecks();
      setItems(listFrom(res, { context: "verificationChecks" }));
    } catch (err) {
      notify?.("error", errMsg(err, "Failed to load post-patch checks"));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  React.useEffect(() => {
    load();
    listAssetGroups()
      .then((res) => setGroups(listFrom(res, { context: "assetGroups" })))
      .catch(() => setGroups([]));
    listVerificationTemplates()
      .then((res) => setTemplates(listFrom(res, { context: "verificationTemplates" })))
      .catch(() => setTemplates([]));
  }, [load]);

  const groupName = (id) => (id == null ? EVERY_DEVICE : groups.find((g) => Number(g.id) === Number(id))?.name ?? `Group #${id}`);
  const counts = checksPerGroup(items);
  const overCap = [
    ...(counts.everywhere > MAX_CHECKS_PER_DEVICE ? [EVERY_DEVICE] : []),
    ...[...counts.byGroup].filter(([, n]) => n > MAX_CHECKS_PER_DEVICE).map(([id]) => groupName(id)),
  ];

  const saveOne = async (payload) => {
    setSubmitting(true);
    try {
      if (dialog?.entry) await updateVerificationCheck(dialog.entry.id, payload);
      else await createVerificationCheck(payload);
      setDialog(null);
      notify?.("success", dialog?.entry ? "Check updated." : "Check added.");
      await load();
    } catch (err) {
      notify?.("error", errMsg(err, "Save failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const addTemplate = async (tpl, group) => {
    setSubmitting(true);
    let added = 0;
    try {
      for (const c of tpl.checks) {
        await createVerificationCheck({ name: c.name, kind: c.kind, params: c.params, assetGroupId: group === "" ? null : Number(group), enabled: true });
        added += 1;
      }
      setDialog(null);
      notify?.("success", `${added} checks added.`);
    } catch (err) {
      notify?.("error", `${errMsg(err, "Save failed")}${added ? ` (${added} of ${tpl.checks.length} were added)` : ""}`);
    } finally {
      setSubmitting(false);
      await load();
    }
  };

  const remove = async (entry) => {
    const ok = await confirm({
      title: `Delete the check “${entry.name}”?`,
      body: "Patches already scheduled keep the checks they were sent with; later ones will not measure this.",
      confirmText: "Delete check",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteVerificationCheck(entry.id);
      notify?.("success", "Check deleted.");
      await load();
    } catch (err) {
      notify?.("error", errMsg(err, "Delete failed"));
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 2, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray, flex: "1 1 320px" }}>
          What has to still work after a change. Each check is measured right before the change and again once the device has
          settled; one that passed before and fails after raises an alert (and keeps a patch’s snapshot). Patches are always
          verified, comparing running services; software deployments, configuration fixes and restarts are verified on the
          devices these checks apply to.
        </Typography>
        <Button onClick={load} startIcon={<RefreshOutlinedIcon />} sx={{ textTransform: "none", color: BRAND.gray }}>
          Refresh
        </Button>
        {canManage ? (
          <>
            <Button onClick={() => setDialog({ template: true })} disabled={templates.length === 0} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.teal }}>
              From a server role
            </Button>
            <Button
              onClick={() => setDialog({ entry: null })}
              startIcon={<AddOutlinedIcon />}
              variant="contained"
              sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
            >
              Add check
            </Button>
          </>
        ) : null}
      </Box>

      {overCap.length ? (
        <Typography role="alert" sx={{ mb: 2, fontSize: TEXT.sm, color: BRAND.alert?.warning ?? BRAND.dark }}>
          More than {MAX_CHECKS_PER_DEVICE} checks apply to {overCap.join(", ")}. The agent measures the first {MAX_CHECKS_PER_DEVICE} and skips the rest.
        </Typography>
      ) : null}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} sx={{ color: BRAND.teal }} />
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ p: 4, textAlign: "center", color: BRAND.gray }}>
          No checks yet — after a patch, only running services are compared, and other changes are not verified. Add the ports,
          addresses and processes your servers need, or pick from the suggestions below.
        </Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Checks that</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Applies to</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Status</TableCell>
              {canManage ? (
                <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>
                  Actions
                </TableCell>
              ) : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id} hover sx={{ opacity: it.enabled ? 1 : 0.55 }}>
                <TableCell>
                  <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>{it.name}</Typography>
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, wordBreak: "break-all" }}>{describeCheck(it.kind, it.params)}</Typography>
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>{groupName(it.assetGroupId)}</Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={it.enabled ? "Enabled" : "Disabled"}
                    sx={{
                      height: 20,
                      fontSize: TEXT.xs,
                      fontWeight: 700,
                      bgcolor: it.enabled ? BRAND.alert?.successSoft : BRAND.darkSoft,
                      color: it.enabled ? BRAND.alert?.success : BRAND.gray,
                    }}
                  />
                </TableCell>
                {canManage ? (
                  <TableCell align="right">
                    <Button size="small" aria-label={`Edit ${it.name}`} onClick={() => setDialog({ entry: it })} sx={{ minWidth: 0, color: BRAND.gray, "&:hover": { color: BRAND.dark } }}>
                      <EditOutlinedIcon fontSize="small" />
                    </Button>
                    <Button size="small" aria-label={`Delete ${it.name}`} onClick={() => remove(it)} sx={{ minWidth: 0, color: BRAND.gray, "&:hover": { color: BRAND.alert?.error } }}>
                      <DeleteOutlineOutlinedIcon fontSize="small" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <SuggestionsSection groups={groups} canManage={canManage} notify={notify} onAdded={load} />

      <CheckDialog
        open={Boolean(dialog) && !dialog.template}
        entry={dialog?.entry ?? null}
        groups={groups}
        submitting={submitting}
        onClose={() => (submitting ? null : setDialog(null))}
        onSubmit={saveOne}
      />
      <TemplateDialog
        open={Boolean(dialog?.template)}
        templates={templates}
        groups={groups}
        submitting={submitting}
        onClose={() => (submitting ? null : setDialog(null))}
        onSubmit={addTemplate}
      />
    </Box>
  );
}
