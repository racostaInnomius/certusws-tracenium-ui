// src/components/AgentSettings/ApplyOverrideDialog.jsx
//
// "Apply to devices…": one section's settings to a group or to a list of
// devices, in one go (phase C). A group is a way to pick devices, not a
// policy scope: the result is one override per device, stamped with the
// batch it came from, and the tenant policy is untouched.
//
// The form is the same section panel the tenant edits, seeded from the
// tenant policy, so the operator changes what differs and sees the diff
// before applying. Only what differs from the tenant becomes the patch.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import KnownDevicesPicker from "../AssetGroups/KnownDevicesPicker";
import PolicySectionPanel from "./PolicySectionPanel";
import { formToPolicy } from "../Policies/policyTransforms";
import { agentConfigSlice, deviceDomainSlice, DOMAIN_PATHS, formProblems } from "./formGuards";
import { diffPolicies, formatDiffValue } from "./policyDiff";

const KIND_SIGN = { added: "+", removed: "−", changed: "~" };

export default function ApplyOverrideDialog({ open, onClose, onApply, sections, tenantForm, catalog, groups, busy = false }) {
  const applicable = React.useMemo(
    () => (Array.isArray(sections) ? sections : []).filter((s) => DOMAIN_PATHS[s.id] && s.enabled !== false),
    [sections]
  );
  const [domain, setDomain] = React.useState("");
  const [mode, setMode] = React.useState("group");
  const [groupId, setGroupId] = React.useState("");
  const [deviceIds, setDeviceIds] = React.useState(() => new Set());
  const [syncMembership, setSyncMembership] = React.useState(false);
  const [form, setForm] = React.useState(tenantForm);

  // Reset on open: the scratch form starts from the tenant policy as loaded.
  React.useEffect(() => {
    if (!open) return;
    setForm(tenantForm);
    setDomain((d) => (applicable.some((s) => s.id === d) ? d : applicable[0]?.id || ""));
    setMode("group");
    setGroupId("");
    setDeviceIds(new Set());
    setSyncMembership(false);
  }, [open, tenantForm, applicable]);

  const section = applicable.find((s) => s.id === domain) || null;
  const tenantSlice = React.useMemo(() => agentConfigSlice(tenantForm, catalog, formToPolicy), [tenantForm, catalog]);
  const scratchSlice = React.useMemo(() => agentConfigSlice(form, catalog, formToPolicy), [form, catalog]);
  const patch = React.useMemo(() => (domain ? deviceDomainSlice(domain, scratchSlice, tenantSlice) : {}), [domain, scratchSlice, tenantSlice]);
  const diff = React.useMemo(() => diffPolicies(domain ? deviceDomainSlice(domain, tenantSlice, {}) : {}, patch), [domain, tenantSlice, patch]);
  const problems = React.useMemo(() => formProblems(form).filter((p) => p.section === domain), [form, domain]);

  const groupList = Array.isArray(groups) ? groups : [];
  const chosenGroup = groupList.find((g) => String(g.id) === String(groupId)) || null;
  const targetReady = mode === "group" ? Boolean(chosenGroup) : deviceIds.size > 0;
  const canApply = Boolean(domain) && targetReady && Object.keys(patch).length > 0 && problems.length === 0 && !busy;

  const toggleDevice = (id) =>
    setDeviceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    if (!canApply) return;
    onApply({
      domain,
      groupId: mode === "group" ? Number(chosenGroup.id) : null,
      deviceIds: mode === "devices" ? [...deviceIds] : null,
      patch,
      syncMembership: mode === "group" && syncMembership,
      sectionLabel: section?.label || domain,
      targetLabel: mode === "group" ? chosenGroup?.name : `${deviceIds.size} device${deviceIds.size === 1 ? "" : "s"}`,
    });
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>Apply settings to devices</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 2 }}>
          Creates or updates an override on each device with what differs from the tenant policy in one section. The devices keep following the tenant policy for everything else.
        </Typography>

        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
          <TextField
            select
            size="small"
            label="Section"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          >
            {applicable.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </TextField>

          <Box>
            <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_e, v) => { if (v) setMode(v); }} aria-label="Target">
              <ToggleButton value="group" sx={{ textTransform: "none", px: 1.5 }}>A group</ToggleButton>
              <ToggleButton value="devices" sx={{ textTransform: "none", px: 1.5 }}>Chosen devices</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>

        {mode === "group" ? (
          <Box sx={{ mt: 2 }}>
            <TextField
              select
              size="small"
              fullWidth
              label="Group"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              helperText={groupList.length === 0 ? "No asset groups exist yet. Create one in Assets › Groups, or choose devices instead." : "Members are resolved when you apply; retired devices are skipped."}
            >
              <option value="">Choose a group…</option>
              {groupList.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}{g.kind === "dynamic" ? " · dynamic" : ""}{typeof g.memberCount === "number" ? ` · ${g.memberCount} device${g.memberCount === 1 ? "" : "s"}` : ""}
                </option>
              ))}
            </TextField>
            <FormControlLabel
              sx={{ mt: 0.5, alignItems: "flex-start", mx: 0 }}
              control={<Checkbox size="small" checked={syncMembership} onChange={(e) => setSyncMembership(e.target.checked)} disabled={!chosenGroup} />}
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Keep in sync with the group&apos;s membership</Typography>
                  <Typography variant="caption" sx={{ color: BRAND.gray }}>
                    Devices that join the group later get this override; devices that leave lose it. A device whose section is edited by hand afterwards is left alone.
                  </Typography>
                </Box>
              }
            />
          </Box>
        ) : (
          <Box sx={{ mt: 2 }}>
            <KnownDevicesPicker open={open && mode === "devices"} selectedIds={deviceIds} onToggleDevice={toggleDevice} selectedLabel="selected" emptyLabel="No devices match." />
          </Box>
        )}

        {section ? (
          <Box sx={{ mt: 2, p: 1.5, border: `1px solid ${BRAND.border}`, borderRadius: 2 }}>
            <PolicySectionPanel section={section} form={form} onChange={setForm} catalog={catalog} />
          </Box>
        ) : (
          <Alert severity="info" sx={{ mt: 2 }}>No section can be applied: every plugin section is inactive in this policy.</Alert>
        )}

        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: TEXT.sm, fontWeight: 800, color: BRAND.dark, mb: 0.5 }}>What each device will override</Typography>
          {diff.length === 0 ? (
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>Nothing differs from the tenant policy yet. Change a setting above.</Typography>
          ) : (
            <Box component="ul" aria-label="Override patch" sx={{ listStyle: "none", m: 0, p: 0, fontFamily: "monospace", fontSize: TEXT.sm }}>
              {diff.map((e) => (
                <Box component="li" key={e.path} sx={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 1, py: 0.25 }}>
                  <span style={{ color: e.kind === "removed" ? ROLE.critical : ROLE.positive, fontWeight: 800 }}>{KIND_SIGN[e.kind]}</span>
                  <span>
                    <strong>{e.path}</strong>{" "}
                    <span style={{ color: BRAND.gray }}>
                      {e.kind !== "added" ? <s>{formatDiffValue(e.before)}</s> : null}
                      {e.kind === "changed" ? " → " : null}
                      {e.kind !== "removed" ? formatDiffValue(e.after) : null}
                    </span>
                  </span>
                </Box>
              ))}
            </Box>
          )}
          {problems.map((p) => (
            <Typography key={p.message} sx={{ fontSize: TEXT.sm, color: ROLE.critical, mt: 0.5 }}>{p.message}</Typography>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={!canApply}
          sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
        >
          {busy ? "Applying…" : "Apply"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
