// src/msp/MspAdmin.jsx
//
// F3 — vendor-only hierarchy management. Reachable from the vendor
// Portfolio ("Manage partners"). Three jobs, all vendor-scoped:
//   * create MSPs (structural container tenants under the vendor root)
//   * assign existing client tenants to an MSP (build the tree) / detach
//   * manage each MSP's operators (TenantMember rows that grant derived
//     access to every client under that MSP)
//
// Master-detail: the MSP list on the left, the selected MSP's clients +
// operators on the right. Clients auto-provision from IDP logins, so this
// screen never creates clients — it only sorts them under partners.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import PersonRemoveOutlinedIcon from "@mui/icons-material/PersonRemoveOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import { Switch, FormControlLabel, InputAdornment } from "@mui/material";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import { BRAND } from "../theme/brand";
import {
  fetchAdminMsps,
  createMsp as apiCreateMsp,
  fetchMspClients,
  fetchUnassignedClients,
  assignClient,
  fetchMspOperators,
  addMspOperator as apiAddOperator,
  removeMspOperator as apiRemoveOperator,
  fetchMspSettings,
  saveMspSettings,
} from "./mspApi";
import MspBilling from "./MspBilling";
import ClientReportDialog from "./ClientReportDialog";

const ROLES = ["ADMIN", "OWNER", "USER"];

function roleColor(role) {
  if (role === "OWNER") return { bg: BRAND.cyanSoft, fg: BRAND.tealText };
  if (role === "USER") return { bg: BRAND.darkSoft, fg: BRAND.dark };
  return { bg: BRAND.tealSoft, fg: BRAND.tealText }; // ADMIN
}

export default function MspAdmin({ onClose }) {
  // MSP list
  const [msps, setMsps] = React.useState([]);
  const [loadingMsps, setLoadingMsps] = React.useState(true);
  const [listError, setListError] = React.useState("");

  const [selected, setSelected] = React.useState(null); // { id, name }
  const [toast, setToast] = React.useState("");
  const [billingOpen, setBillingOpen] = React.useState(false);

  // Create-MSP dialog
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState("");

  const loadMsps = React.useCallback(async () => {
    setLoadingMsps(true);
    setListError("");
    try {
      const resp = await fetchAdminMsps();
      setMsps(resp?.msps ?? []);
    } catch (err) {
      setListError(err?.message || "Could not load MSPs.");
      setMsps([]);
    } finally {
      setLoadingMsps(false);
    }
  }, []);

  React.useEffect(() => {
    loadMsps();
  }, [loadMsps]);

  const handleCreate = React.useCallback(async () => {
    const name = createName.trim();
    if (!name) {
      setCreateError("Name is required.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const resp = await apiCreateMsp(name);
      setCreateOpen(false);
      setCreateName("");
      setToast(`Partner “${name}” created.`);
      await loadMsps();
      if (resp?.msp) setSelected({ id: resp.msp.id, name: resp.msp.name });
    } catch (err) {
      setCreateError(err?.message || "Could not create the partner.");
    } finally {
      setCreating(false);
    }
  }, [createName, loadMsps]);

  if (billingOpen) {
    return <MspBilling onClose={() => setBillingOpen(false)} />;
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: "auto" }}>
      <PageHeader
        title="Partner administration"
        subtitle="Create MSP partners, assign client tenants, and manage each partner's operators."
        icon={<BusinessOutlinedIcon />}
        actions={
          <Stack direction="row" spacing={1}>
            {onClose ? (
              <Button
                size="small"
                startIcon={<ArrowBackOutlinedIcon />}
                onClick={onClose}
                sx={{ color: BRAND.gray, textTransform: "none" }}
              >
                Back to portfolio
              </Button>
            ) : null}
            <Button
              size="small"
              variant="outlined"
              startIcon={<ReceiptLongOutlinedIcon />}
              onClick={() => setBillingOpen(true)}
              sx={{ textTransform: "none", fontWeight: 800, borderColor: BRAND.teal, color: BRAND.tealText, "&:hover": { borderColor: BRAND.tealText, bgcolor: BRAND.tealSoft } }}
            >
              Billing
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<AddOutlinedIcon />}
              onClick={() => { setCreateName(""); setCreateError(""); setCreateOpen(true); }}
              sx={{ textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
            >
              New partner
            </Button>
          </Stack>
        }
      />

      {listError ? <Alert severity="error" sx={{ mb: 2 }}>{listError}</Alert> : null}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "340px 1fr" }, gap: 2, alignItems: "start" }}>
        {/* ── MSP list ─────────────────────────────────────────────── */}
        <SectionPaper variant="panel" sx={{ p: 0, overflow: "hidden" }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${BRAND.border}` }}>
            <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>
              Partners{msps.length ? ` (${msps.length})` : ""}
            </Typography>
          </Box>
          {loadingMsps ? (
            <Stack alignItems="center" sx={{ py: 6 }}>
              <CircularProgress size={24} sx={{ color: BRAND.teal }} />
            </Stack>
          ) : msps.length === 0 ? (
            <Box sx={{ p: 3, textAlign: "center" }}>
              <Typography variant="body2" sx={{ color: BRAND.gray }}>
                No partners yet. Create one to start building your hierarchy.
              </Typography>
            </Box>
          ) : (
            <Stack divider={<Divider />}>
              {msps.map((m) => {
                const active = selected?.id === m.id;
                return (
                  <Box
                    key={m.id}
                    onClick={() => setSelected({ id: m.id, name: m.name })}
                    sx={{
                      px: 2, py: 1.5, cursor: "pointer",
                      bgcolor: active ? BRAND.tealSoft : "transparent",
                      borderLeft: `3px solid ${active ? BRAND.teal : "transparent"}`,
                      "&:hover": { bgcolor: active ? BRAND.tealSoft : BRAND.rowHover },
                    }}
                  >
                    <Typography sx={{ fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>
                      {m.name || `MSP ${m.id}`}
                    </Typography>
                    <Stack direction="row" spacing={1.5}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <DevicesOutlinedIcon sx={{ fontSize: 15, color: BRAND.gray }} />
                        <Typography variant="caption" sx={{ color: BRAND.gray }}>
                          {m.clientCount} client{m.clientCount === 1 ? "" : "s"}
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <GroupsOutlinedIcon sx={{ fontSize: 15, color: BRAND.gray }} />
                        <Typography variant="caption" sx={{ color: BRAND.gray }}>
                          {m.operatorCount} operator{m.operatorCount === 1 ? "" : "s"}
                        </Typography>
                      </Stack>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          )}
        </SectionPaper>

        {/* ── Detail ───────────────────────────────────────────────── */}
        {selected ? (
          <MspDetail
            key={selected.id}
            msp={selected}
            onChanged={loadMsps}
            onToast={setToast}
          />
        ) : (
          <SectionPaper variant="panel">
            <Box sx={{ py: 6, textAlign: "center" }}>
              <BusinessOutlinedIcon sx={{ fontSize: 40, color: BRAND.gray, mb: 1 }} />
              <Typography sx={{ color: BRAND.gray }}>
                Select a partner to manage its clients and operators.
              </Typography>
            </Box>
          </SectionPaper>
        )}
      </Box>

      {/* Create-MSP dialog */}
      <Dialog open={createOpen} onClose={() => (creating ? null : setCreateOpen(false))} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>New partner (MSP)</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: BRAND.gray, mb: 2 }}>
            A partner is a container for clients. It holds no devices of its own — you
            attach existing client tenants to it after it's created.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Partner name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            disabled={creating}
          />
          {createError ? <Alert severity="error" sx={{ mt: 2 }}>{createError}</Alert> : null}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)} disabled={creating} sx={{ textTransform: "none", color: BRAND.dark }}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !createName.trim()}
            variant="contained"
            sx={{ textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
          >
            {creating ? "Creating…" : "Create partner"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={() => setToast("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setToast("")} sx={{ fontWeight: 700 }}>
          {toast}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ── Detail panel: one MSP's clients + operators ─────────────────────────
function MspDetail({ msp, onChanged, onToast }) {
  const [clients, setClients] = React.useState([]);
  const [unassigned, setUnassigned] = React.useState([]);
  const [operators, setOperators] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // Assign-client picker
  const [pickClient, setPickClient] = React.useState("");

  // Add-operator form
  const [opSubject, setOpSubject] = React.useState("");
  const [opEmail, setOpEmail] = React.useState("");
  const [opRole, setOpRole] = React.useState("ADMIN");
  const [opError, setOpError] = React.useState("");

  // Per-client report dialog
  const [reportClient, setReportClient] = React.useState(null); // { id, name } | null

  // Settings form (billing rate + report delivery)
  const [settings, setSettings] = React.useState(null);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [settingsError, setSettingsError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cl, un, ops, st] = await Promise.all([
        fetchMspClients(msp.id),
        fetchUnassignedClients(),
        fetchMspOperators(msp.id),
        fetchMspSettings(msp.id),
      ]);
      setClients(cl?.items ?? []);
      setUnassigned(un?.clients ?? []);
      setOperators(ops?.operators ?? []);
      // Seed the dollar input from the stored cents so an unedited save
      // round-trips the existing price instead of clearing it.
      const s = st?.settings ?? null;
      setSettings(
        s
          ? { ...s, unitPriceInput: s.unitPriceCents != null ? String(s.unitPriceCents / 100) : "" }
          : null
      );
    } catch (err) {
      setError(err?.message || "Could not load this partner's detail.");
    } finally {
      setLoading(false);
    }
  }, [msp.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const doAssign = React.useCallback(async () => {
    if (!pickClient) return;
    setBusy(true);
    setError("");
    try {
      await assignClient(pickClient, msp.id);
      setPickClient("");
      onToast?.("Client assigned.");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.message || "Could not assign the client.");
    } finally {
      setBusy(false);
    }
  }, [pickClient, msp.id, load, onChanged, onToast]);

  const doUnassign = React.useCallback(async (clientId) => {
    setBusy(true);
    setError("");
    try {
      await assignClient(clientId, null);
      onToast?.("Client detached.");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.message || "Could not detach the client.");
    } finally {
      setBusy(false);
    }
  }, [load, onChanged, onToast]);

  const doAddOperator = React.useCallback(async () => {
    const subject = opSubject.trim();
    if (!subject) {
      setOpError("Subject (IDP user id) is required.");
      return;
    }
    setBusy(true);
    setOpError("");
    try {
      await apiAddOperator(msp.id, { subject, email: opEmail.trim() || null, role: opRole });
      setOpSubject("");
      setOpEmail("");
      setOpRole("ADMIN");
      onToast?.("Operator added.");
      await load();
      onChanged?.();
    } catch (err) {
      setOpError(err?.message || "Could not add the operator.");
    } finally {
      setBusy(false);
    }
  }, [opSubject, opEmail, opRole, msp.id, load, onChanged, onToast]);

  const doRemoveOperator = React.useCallback(async (memberId) => {
    setBusy(true);
    setError("");
    try {
      await apiRemoveOperator(msp.id, memberId);
      onToast?.("Operator removed.");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.message || "Could not remove the operator.");
    } finally {
      setBusy(false);
    }
  }, [msp.id, load, onChanged, onToast]);

  const patchSettings = React.useCallback((partial) => {
    setSettings((s) => ({ ...(s || {}), ...partial }));
  }, []);

  const doSaveSettings = React.useCallback(async () => {
    if (!settings) return;
    setSavingSettings(true);
    setSettingsError("");
    try {
      // dollars in the field → cents on the wire.
      const dollars = settings.unitPriceInput;
      const unitPriceCents =
        dollars == null || dollars === "" ? null : Math.round(Number(dollars) * 100);
      const resp = await saveMspSettings(msp.id, {
        unitPriceCents,
        currency: (settings.currency || "USD").toUpperCase(),
        reportEnabled: Boolean(settings.reportEnabled),
        reportEmail: settings.reportEmail || null,
      });
      setSettings(resp?.settings ?? settings);
      onToast?.("Settings saved.");
    } catch (err) {
      setSettingsError(err?.message || "Could not save settings.");
    } finally {
      setSavingSettings(false);
    }
  }, [settings, msp.id, onToast]);

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error" onClose={() => setError("")}>{error}</Alert> : null}

      {/* Clients */}
      <SectionPaper variant="panel">
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <DevicesOutlinedIcon fontSize="small" sx={{ color: BRAND.teal }} />
          <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>
            Clients of {msp.name || `MSP ${msp.id}`}
          </Typography>
        </Stack>

        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={22} sx={{ color: BRAND.teal }} />
          </Stack>
        ) : (
          <>
            {clients.length === 0 ? (
              <Typography variant="body2" sx={{ color: BRAND.gray, mb: 2 }}>
                No clients assigned yet.
              </Typography>
            ) : (
              <Stack spacing={0.5} sx={{ mb: 2 }}>
                {clients.map((c) => (
                  <Stack
                    key={c.tenantId}
                    direction="row"
                    alignItems="center"
                    sx={{ px: 1, py: 0.75, borderRadius: 1, "&:hover": { bgcolor: BRAND.darkSoft } }}
                  >
                    <Typography sx={{ fontWeight: 700, color: BRAND.dark, flex: 1, minWidth: 0 }}>
                      {c.name || `Tenant ${c.tenantId}`}
                    </Typography>
                    <Tooltip title="Service report">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => setReportClient({ id: c.tenantId, name: c.name })}
                          sx={{ color: BRAND.gray, "&:hover": { color: BRAND.teal } }}
                        >
                          <AssessmentOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Detach from this partner">
                      <span>
                        <IconButton
                          size="small"
                          disabled={busy}
                          onClick={() => doUnassign(c.tenantId)}
                          sx={{ color: BRAND.gray, "&:hover": { color: BRAND.alert.error } }}
                        >
                          <LinkOffOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                ))}
              </Stack>
            )}

            {/* Assign picker */}
            <Divider sx={{ mb: 1.5 }} />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
              <Select
                size="small"
                displayEmpty
                value={pickClient}
                onChange={(e) => setPickClient(e.target.value)}
                disabled={busy || unassigned.length === 0}
                sx={{ minWidth: 240, flex: 1 }}
              >
                <MenuItem value="" disabled>
                  {unassigned.length === 0 ? "No unassigned clients" : "Select a client to assign…"}
                </MenuItem>
                {unassigned.map((u) => (
                  <MenuItem key={u.id} value={u.id}>
                    {u.name || `Tenant ${u.id}`}
                  </MenuItem>
                ))}
              </Select>
              <Button
                variant="contained"
                size="small"
                disabled={busy || !pickClient}
                onClick={doAssign}
                startIcon={<AddOutlinedIcon />}
                sx={{ textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
              >
                Assign
              </Button>
            </Stack>
          </>
        )}
      </SectionPaper>

      {/* Operators */}
      <SectionPaper variant="panel">
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <GroupsOutlinedIcon fontSize="small" sx={{ color: BRAND.teal }} />
          <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>Operators</Typography>
        </Stack>
        <Typography variant="body2" sx={{ color: BRAND.gray, mb: 1.5 }}>
          Operators added here get access to every client under this partner.
        </Typography>

        {loading ? null : operators.length === 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.gray, mb: 2 }}>
            No operators yet.
          </Typography>
        ) : (
          <Stack spacing={0.5} sx={{ mb: 2 }}>
            {operators.map((op) => {
              const rc = roleColor(op.role);
              return (
                <Stack
                  key={op.id}
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{ px: 1, py: 0.75, borderRadius: 1, "&:hover": { bgcolor: BRAND.darkSoft } }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, color: BRAND.dark }} noWrap>
                      {op.email || op.subject}
                    </Typography>
                    {op.email ? (
                      <Typography variant="caption" sx={{ color: BRAND.gray }} noWrap>
                        {op.subject}
                      </Typography>
                    ) : null}
                  </Box>
                  <Chip
                    label={op.role}
                    size="small"
                    sx={{ bgcolor: rc.bg, color: rc.fg, fontWeight: 800, fontSize: 11 }}
                  />
                  {op.isActive ? null : (
                    <Chip label="inactive" size="small" sx={{ bgcolor: BRAND.darkSoft, color: BRAND.gray, fontSize: 11 }} />
                  )}
                  <Tooltip title="Remove operator">
                    <span>
                      <IconButton
                        size="small"
                        disabled={busy}
                        onClick={() => doRemoveOperator(op.id)}
                        sx={{ color: BRAND.gray, "&:hover": { color: BRAND.alert.error } }}
                      >
                        <PersonRemoveOutlinedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              );
            })}
          </Stack>
        )}

        {/* Add-operator form */}
        <Divider sx={{ mb: 1.5 }} />
        <Stack spacing={1}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TextField
              size="small"
              label="Subject (IDP user id)"
              value={opSubject}
              onChange={(e) => setOpSubject(e.target.value)}
              disabled={busy}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label="Email (optional)"
              value={opEmail}
              onChange={(e) => setOpEmail(e.target.value)}
              disabled={busy}
              sx={{ flex: 1 }}
            />
            <Select
              size="small"
              value={opRole}
              onChange={(e) => setOpRole(e.target.value)}
              disabled={busy}
              sx={{ minWidth: 120 }}
            >
              {ROLES.map((r) => (
                <MenuItem key={r} value={r}>{r}</MenuItem>
              ))}
            </Select>
          </Stack>
          {opError ? <Alert severity="error" onClose={() => setOpError("")}>{opError}</Alert> : null}
          <Box>
            <Button
              variant="contained"
              size="small"
              disabled={busy || !opSubject.trim()}
              onClick={doAddOperator}
              startIcon={<AddOutlinedIcon />}
              sx={{ textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
            >
              Add operator
            </Button>
          </Box>
        </Stack>
      </SectionPaper>

      {/* Settings — billing rate + scheduled report delivery */}
      <SectionPaper variant="panel">
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <TuneOutlinedIcon fontSize="small" sx={{ color: BRAND.teal }} />
          <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>Billing &amp; reports</Typography>
        </Stack>

        {loading || !settings ? (
          <Typography variant="body2" sx={{ color: BRAND.gray }}>Loading…</Typography>
        ) : (
          <Stack spacing={1.5}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                size="small"
                type="number"
                label="Price per device"
                value={settings.unitPriceInput ?? ""}
                onChange={(e) => patchSettings({ unitPriceInput: e.target.value })}
                disabled={savingSettings}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                sx={{ width: 180 }}
                helperText="Blank = quantities only (no amount)."
              />
              <TextField
                size="small"
                label="Currency"
                value={settings.currency ?? "USD"}
                onChange={(e) => patchSettings({ currency: e.target.value.toUpperCase().slice(0, 3) })}
                disabled={savingSettings}
                sx={{ width: 110 }}
                inputProps={{ maxLength: 3 }}
              />
            </Stack>

            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(settings.reportEnabled)}
                  onChange={(e) => patchSettings({ reportEnabled: e.target.checked })}
                  disabled={savingSettings}
                />
              }
              label={<Typography variant="body2" sx={{ color: BRAND.dark }}>Email a monthly report to this partner</Typography>}
            />
            <TextField
              size="small"
              label="Report recipient email"
              value={settings.reportEmail ?? ""}
              onChange={(e) => patchSettings({ reportEmail: e.target.value })}
              disabled={savingSettings || !settings.reportEnabled}
              placeholder="ops@partner.example"
              sx={{ maxWidth: 360 }}
            />

            {settingsError ? <Alert severity="error" onClose={() => setSettingsError("")}>{settingsError}</Alert> : null}
            <Box>
              <Button
                variant="contained"
                size="small"
                disabled={savingSettings}
                onClick={doSaveSettings}
                sx={{ textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
              >
                {savingSettings ? "Saving…" : "Save settings"}
              </Button>
            </Box>
          </Stack>
        )}
      </SectionPaper>

      <ClientReportDialog
        open={Boolean(reportClient)}
        clientId={reportClient?.id}
        clientName={reportClient?.name}
        onClose={() => setReportClient(null)}
      />
    </Stack>
  );
}
