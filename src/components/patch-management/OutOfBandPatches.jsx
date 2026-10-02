// src/components/patch-management/OutOfBandPatches.jsx
//
// ADR-0038 F3 (D11) — out-of-band patches (.msu from the Microsoft Update
// Catalog, like KB5129237, the fix for KB5122882's Remote Desktop hang). They
// are PATCHES: uploaded and registered here, not in Software Delivery, and
// installed through the same gate as any patch (window, snapshot, blocks,
// one at a time, verification afterwards).
//
// A .msu does not say which build it applies to, so whoever registers it says
// so — from the KB page: "OS Build 20348.5655" → build 10.0.20348, revision
// 5655. Devices on that build below that revision are the ones missing it.

import * as React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
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
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import { formatDate } from "../../utils/format";
import { installOutOfBandPatch, listOutOfBandPatches, registerOutOfBandPatch, uploadOutOfBandMsu } from "../../api/patchManagement";
import { guessFromMsuName, registrationPayload } from "./patchCatalog";
import { blockReasonText } from "./patchGateOutcome";

function errMsg(err, fallback) {
  return err?.body?.message || err?.message || fallback;
}

function RegisterDialog({ upload, onClose, onRegistered, notify }) {
  const [form, setForm] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (!upload) return;
    const g = guessFromMsuName(upload.filename);
    setError(null);
    setForm({ intakeId: upload.intakeId, patchId: g.patchId, arch: g.arch, title: "", severity: "important", osBuild: "", fixedRevision: "", fixes: "", supersedes: "" });
  }, [upload]);
  if (!upload || !form) return null;
  const update = (p) => setForm((f) => ({ ...f, ...p }));
  const save = async () => {
    const r = registrationPayload(form);
    if (r.error) return setError(r.error);
    setSaving(true);
    try {
      await registerOutOfBandPatch(r.body);
      notify?.("success", `${r.body.patchId} registered. Devices missing it now show in the catalog.`);
      onRegistered?.();
    } catch (err) {
      setError(errMsg(err, "Could not register it."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onClose={() => (saving ? null : onClose())} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Register {upload.filename}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1.5 }}>
          From the KB article: its number, title and the OS build it brings the system to (“OS Build 20348.5655”).
        </Typography>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" label="KB" value={form.patchId} onChange={(e) => update({ patchId: e.target.value })} sx={{ maxWidth: 160 }} />
            <TextField select size="small" label="Severity" value={form.severity} onChange={(e) => update({ severity: e.target.value })} sx={{ minWidth: 150 }}>
              {["critical", "important", "moderate", "low"].map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField size="small" label="Title" value={form.title} onChange={(e) => update({ title: e.target.value })} fullWidth />
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" label="OS build" placeholder="10.0.20348" value={form.osBuild} onChange={(e) => update({ osBuild: e.target.value })} sx={{ maxWidth: 170 }} />
            <TextField size="small" label="Brings revision to" placeholder="5655" value={form.fixedRevision} onChange={(e) => update({ fixedRevision: e.target.value })} sx={{ maxWidth: 160 }} />
            <TextField select size="small" label="Architecture" value={form.arch} onChange={(e) => update({ arch: e.target.value })} sx={{ minWidth: 130 }}>
              {["x64", "arm64", "x86"].map((a) => (
                <MenuItem key={a} value={a}>
                  {a}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" label="Fixes the issue in (optional)" placeholder="KB5122882" value={form.fixes} onChange={(e) => update({ fixes: e.target.value })} sx={{ maxWidth: 230 }} />
            <TextField size="small" label="Supersedes (optional)" value={form.supersedes} onChange={(e) => update({ supersedes: e.target.value })} sx={{ maxWidth: 200 }} />
          </Stack>
          {error ? (
            <Typography role="alert" sx={{ fontSize: TEXT.sm, color: BRAND.alert.errorText }}>
              {error}
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none", color: BRAND.gray }}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving} variant="contained" sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}>
          Register patch
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function InstallDialog({ pkg, pending, onClose, onDone, notify }) {
  const [reboot, setReboot] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [outcome, setOutcome] = React.useState(null);
  React.useEffect(() => {
    setReboot(false);
    setOutcome(null);
  }, [pkg]);
  if (!pkg) return null;
  const run = async () => {
    setBusy(true);
    try {
      const r = await installOutOfBandPatch(pkg.patchId, { rebootIfRequired: reboot });
      const jobs = Array.isArray(r?.jobs) ? r.jobs : [];
      const sent = jobs.filter((j) => j.jobId).length;
      const blocked = jobs.filter((j) => !j.jobId);
      notify?.(sent ? "success" : "warning", `${pkg.patchId}: ${sent} job(s) created${blocked.length ? `, ${blocked.length} device(s) not sent` : ""}.`);
      if (blocked.length) setOutcome(blocked);
      else onDone?.();
    } catch (err) {
      const jobs = Array.isArray(err?.body?.jobs) ? err.body.jobs : null;
      if (jobs) setOutcome(jobs);
      notify?.("error", errMsg(err, "Could not install it."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={() => (busy ? null : onClose())} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Install {pkg.patchId}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: TEXT.base, color: BRAND.dark, mb: 1 }}>
          On the {pending ?? "—"} device(s) missing it. Same rules as any patch: maintenance window, snapshot, blocked patches, one install at a
          time, and a health check afterwards.
        </Typography>
        <FormControlLabel control={<Switch checked={reboot} onChange={(e) => setReboot(e.target.checked)} />} label="Restart if the update asks for it" />
        {outcome ? (
          <Box component="ul" sx={{ mt: 1, pl: 2.5, fontSize: TEXT.sm, color: BRAND.dark }}>
            {outcome.map((j) => (
              <li key={j.deviceId}>
                {j.deviceId}: {j.reason === "agent_too_old_for_out_of_band" ? "its agent is too old to install out-of-band patches — update it" : blockReasonText(j.reason)}
              </li>
            ))}
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: "none", color: BRAND.gray }}>
          {outcome ? "Close" : "Cancel"}
        </Button>
        {!outcome ? (
          <Button onClick={run} disabled={busy} variant="contained" sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}>
            Install
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}

export default function OutOfBandPatches({ canManage, notify, catalogItems = [], onChanged }) {
  const [data, setData] = React.useState(null);
  const [progress, setProgress] = React.useState(null);
  const [registering, setRegistering] = React.useState(null);
  const [installing, setInstalling] = React.useState(null);
  const fileRef = React.useRef(null);

  const load = React.useCallback(async () => {
    try {
      setData(await listOutOfBandPatches());
    } catch {
      setData({ packages: [], uploads: [] });
    }
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  const pendingOf = (kb) => catalogItems.find((i) => i.patchId === kb)?.devicesPending ?? 0;

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.msu$/i.test(file.name)) return notify?.("error", "Only a Windows update package (.msu).");
    setProgress(0);
    try {
      const r = await uploadOutOfBandMsu(file, { onProgress: (p) => setProgress(Math.round((p ?? 0) * 100)) });
      const intake = r?.intake;
      if (intake?.status === "blocked") {
        notify?.("error", "The file failed verification (signature or hash) and cannot be distributed.");
      } else if (intake?.id) {
        setRegistering({ intakeId: intake.id, filename: intake.filename ?? file.name });
      }
      await load();
    } catch (err) {
      notify?.("error", errMsg(err, "Upload failed."));
    } finally {
      setProgress(null);
    }
  };

  const packages = data?.packages ?? [];
  const uploads = data?.uploads ?? [];
  return (
    <Box sx={{ mt: 3, pt: 2, borderTop: `1px solid ${BRAND.border}` }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark }}>Out-of-band patches</Typography>
        <Box sx={{ flex: 1 }} />
        {canManage ? (
          <>
            <input ref={fileRef} type="file" accept=".msu" hidden onChange={pick} data-testid="msu-input" />
            <Button onClick={() => fileRef.current?.click()} disabled={progress != null} startIcon={<UploadFileOutlinedIcon />} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.teal }}>
              Upload .msu
            </Button>
          </>
        ) : null}
      </Stack>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1 }}>
        Windows updates from the Microsoft Update Catalog that Windows Update does not offer — the fix for a known issue, for example.
        They are patches: same gate, same health check, same targets.
      </Typography>
      {progress != null ? <LinearProgress variant="determinate" value={progress} sx={{ mb: 1 }} /> : null}

      {uploads.length > 0 && canManage ? (
        <Box sx={{ mb: 1.5 }}>
          {uploads.map((u) => (
            <Stack key={u.intakeId} direction="row" spacing={1} alignItems="center">
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
                Uploaded, not registered yet: <b>{u.filename}</b> ({formatDate(u.uploadedAt)})
              </Typography>
              <Button size="small" onClick={() => setRegistering(u)} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}>
                Register
              </Button>
            </Stack>
          ))}
        </Box>
      ) : null}

      {packages.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>None registered.</Typography>
      ) : (
        <Table size="small" aria-label="Out-of-band patches">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Patch</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Applies to</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Fixes</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Missing on</TableCell>
              {canManage ? <TableCell /> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {packages.map((p) => {
              const n = pendingOf(p.patchId);
              return (
                <TableRow key={p.patchId}>
                  <TableCell>
                    <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>{p.patchId}</Typography>
                    <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{p.title}</Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: TEXT.sm }}>
                    {p.osBuild} below .{p.fixedRevision} · {p.arch}
                  </TableCell>
                  <TableCell sx={{ fontSize: TEXT.sm }}>{p.fixes ?? "—"}</TableCell>
                  <TableCell sx={{ fontSize: TEXT.sm }}>{n ? `${n} device${n === 1 ? "" : "s"}` : "None"}</TableCell>
                  {canManage ? (
                    <TableCell align="right">
                      <Button size="small" disabled={!n} aria-label={`Install ${p.patchId}`} onClick={() => setInstalling(p)} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}>
                        Install
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <RegisterDialog
        upload={registering}
        notify={notify}
        onClose={() => setRegistering(null)}
        onRegistered={() => {
          setRegistering(null);
          load();
          onChanged?.();
        }}
      />
      <InstallDialog
        pkg={installing}
        pending={installing ? pendingOf(installing.patchId) : null}
        notify={notify}
        onClose={() => setInstalling(null)}
        onDone={() => {
          setInstalling(null);
          onChanged?.();
        }}
      />
    </Box>
  );
}
