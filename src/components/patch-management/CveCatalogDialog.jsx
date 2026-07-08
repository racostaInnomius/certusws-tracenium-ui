// src/components/patch-management/CveCatalogDialog.jsx
//
// Create / edit a CVE catalog entry. Dumb component — validates the form and
// calls onSubmit(payload); the parent does the API call. `matchName` is optional
// (backend derives it from the title). The affected range is [introduced, fixed):
// leave a bound blank for "no lower bound" / "no fix yet".

import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Stack,
  Box,
  Switch,
  FormControlLabel,
} from "@mui/material";
import { BRAND } from "../../theme/brand";

const PLATFORMS = ["windows", "macos", "linux"];
const SEVERITIES = ["critical", "high", "medium", "low", "none"];

function defaults() {
  return {
    cveId: "",
    title: "",
    publisher: "",
    platform: "windows",
    matchName: "",
    matchPublisher: "",
    introducedVersion: "",
    fixedVersion: "",
    cvssScore: "",
    cvssSeverity: "medium",
    cvssVector: "",
    summary: "",
    referenceUrl: "",
    packageId: "",
    isActive: true,
  };
}

function fromEntry(e) {
  return {
    cveId: e.cveId ?? "",
    title: e.title ?? "",
    publisher: e.publisher ?? "",
    platform: e.platform ?? "windows",
    matchName: e.matchName ?? "",
    matchPublisher: e.matchPublisher ?? "",
    introducedVersion: e.introducedVersion ?? "",
    fixedVersion: e.fixedVersion ?? "",
    cvssScore: e.cvssScore == null ? "" : String(e.cvssScore),
    cvssSeverity: e.cvssSeverity ?? "medium",
    cvssVector: e.cvssVector ?? "",
    summary: e.summary ?? "",
    referenceUrl: e.referenceUrl ?? "",
    packageId: e.packageId == null ? "" : String(e.packageId),
    isActive: e.isActive !== false,
  };
}

export default function CveCatalogDialog({ open, mode, entry, submitting, onClose, onSubmit }) {
  const [form, setForm] = React.useState(defaults);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(mode === "edit" && entry ? fromEntry(entry) : defaults());
  }, [open, mode, entry]);

  const update = (patch) => setForm((p) => ({ ...p, ...patch }));

  const handleSubmit = () => {
    if (!form.cveId.trim()) return setError("CVE id is required");
    if (!form.title.trim()) return setError("Title is required");
    let cvssScore = null;
    if (form.cvssScore !== "" && form.cvssScore != null) {
      const n = Number(form.cvssScore);
      if (!Number.isFinite(n) || n < 0 || n > 10) return setError("CVSS score must be between 0 and 10 (or blank)");
      cvssScore = n;
    }
    let packageId = null;
    if (form.packageId !== "" && form.packageId != null) {
      const n = Number(form.packageId);
      if (!Number.isInteger(n) || n <= 0) return setError("Package ID must be a positive integer (or blank)");
      packageId = n;
    }
    onSubmit?.({
      cveId: form.cveId.trim(),
      title: form.title.trim(),
      publisher: form.publisher.trim() || null,
      platform: form.platform,
      matchName: form.matchName.trim() || null,
      matchPublisher: form.matchPublisher.trim() || null,
      introducedVersion: form.introducedVersion.trim() || null,
      fixedVersion: form.fixedVersion.trim() || null,
      cvssScore,
      cvssSeverity: form.cvssSeverity,
      cvssVector: form.cvssVector.trim() || null,
      summary: form.summary.trim() || null,
      referenceUrl: form.referenceUrl.trim() || null,
      packageId,
      isActive: form.isActive,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
        {mode === "edit" ? "Edit CVE entry" : "Add CVE entry"}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "1fr 1fr" }}>
            <TextField size="small" label="CVE id" placeholder="CVE-2024-38063" value={form.cveId} onChange={(e) => update({ cveId: e.target.value })} required />
            <TextField size="small" label="Software title" placeholder="7-Zip" value={form.title} onChange={(e) => update({ title: e.target.value })} required />
            <TextField size="small" label="Publisher (optional)" value={form.publisher} onChange={(e) => update({ publisher: e.target.value })} />
            <TextField select size="small" label="Platform" value={form.platform} onChange={(e) => update({ platform: e.target.value })}>
              {PLATFORMS.map((p) => (
                <MenuItem key={p} value={p}>{p}</MenuItem>
              ))}
            </TextField>
          </Box>

          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "1fr 1fr" }}>
            <TextField size="small" label="Introduced version (optional)" placeholder="none = all earlier" value={form.introducedVersion} onChange={(e) => update({ introducedVersion: e.target.value })} helperText="First affected version (inclusive)" />
            <TextField size="small" label="Fixed version (optional)" placeholder="none = no fix yet" value={form.fixedVersion} onChange={(e) => update({ fixedVersion: e.target.value })} helperText="Installed < this is vulnerable" />
          </Box>

          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "1fr 1fr" }}>
            <TextField select size="small" label="Severity" value={form.cvssSeverity} onChange={(e) => update({ cvssSeverity: e.target.value })}>
              {SEVERITIES.map((s) => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </TextField>
            <TextField size="small" label="CVSS score (optional)" type="number" inputProps={{ step: "0.1", min: 0, max: 10 }} value={form.cvssScore} onChange={(e) => update({ cvssScore: e.target.value })} />
          </Box>

          <TextField
            size="small"
            label="Match name (optional)"
            placeholder="auto from title, e.g. 7 zip"
            value={form.matchName}
            onChange={(e) => update({ matchName: e.target.value })}
            helperText="How installed apps are matched. Leave blank to derive it from the title."
          />
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "1fr 1fr" }}>
            <TextField size="small" label="Match publisher (optional)" value={form.matchPublisher} onChange={(e) => update({ matchPublisher: e.target.value })} />
            <TextField size="small" label="CVSS vector (optional)" value={form.cvssVector} onChange={(e) => update({ cvssVector: e.target.value })} />
          </Box>

          <TextField size="small" label="Reference URL (optional)" placeholder="https://nvd.nist.gov/vuln/detail/CVE-…" value={form.referenceUrl} onChange={(e) => update({ referenceUrl: e.target.value })} />
          <TextField
            size="small"
            label="Remediation package ID (optional)"
            type="number"
            value={form.packageId}
            onChange={(e) => update({ packageId: e.target.value })}
            helperText="SDP package that installs the fixed version — enables one-click Remediate"
          />
          <TextField size="small" label="Summary (optional)" value={form.summary} onChange={(e) => update({ summary: e.target.value })} multiline minRows={2} />

          <FormControlLabel
            control={<Switch checked={form.isActive} onChange={(e) => update({ isActive: e.target.checked })} />}
            label="Active (matched against inventory)"
          />

          {error ? (
            <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: BRAND.alert?.errorSoft, color: BRAND.alert?.error, fontSize: 13, fontWeight: 600 }}>
              {error}
            </Box>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: "none", color: BRAND.gray }}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          variant="contained"
          sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
        >
          {submitting ? "Saving…" : mode === "edit" ? "Save changes" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
