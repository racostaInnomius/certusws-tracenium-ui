// src/components/patch-management/CatalogDialog.jsx
//
// Create / edit a third-party catalog entry. Dumb component — validates the
// form and calls onSubmit(payload); the parent does the API call. `matchName`
// is optional: left blank, the backend derives it from the title with the same
// normalizer detection uses.

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
  Typography,
} from "@mui/material";
import { BRAND } from "../../theme/brand";

const PLATFORMS = ["windows", "macos", "linux"];

function defaults() {
  return {
    title: "",
    publisher: "",
    platform: "windows",
    matchName: "",
    matchPublisher: "",
    latestVersion: "",
    packageId: "",
    isActive: true,
  };
}

function fromEntry(e) {
  return {
    title: e.title ?? "",
    publisher: e.publisher ?? "",
    platform: e.platform ?? "windows",
    matchName: e.matchName ?? "",
    matchPublisher: e.matchPublisher ?? "",
    latestVersion: e.latestVersion ?? "",
    packageId: e.packageId == null ? "" : String(e.packageId),
    isActive: e.isActive !== false,
  };
}

export default function CatalogDialog({ open, mode, entry, submitting, onClose, onSubmit }) {
  const [form, setForm] = React.useState(defaults);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(mode === "edit" && entry ? fromEntry(entry) : defaults());
  }, [open, mode, entry]);

  const update = (patch) => setForm((p) => ({ ...p, ...patch }));

  const handleSubmit = () => {
    if (!form.title.trim()) return setError("Title is required");
    if (!form.latestVersion.trim()) return setError("Latest version is required");
    let packageId = null;
    if (form.packageId !== "" && form.packageId != null) {
      const n = Number(form.packageId);
      if (!Number.isInteger(n) || n <= 0) return setError("Package ID must be a positive integer (or blank)");
      packageId = n;
    }
    onSubmit?.({
      title: form.title.trim(),
      publisher: form.publisher.trim() || null,
      platform: form.platform,
      matchName: form.matchName.trim() || null,
      matchPublisher: form.matchPublisher.trim() || null,
      latestVersion: form.latestVersion.trim(),
      packageId,
      isActive: form.isActive,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
        {mode === "edit" ? "Edit catalog entry" : "Add catalog entry"}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "1fr 1fr" }}>
            <TextField size="small" label="Title" value={form.title} onChange={(e) => update({ title: e.target.value })} required />
            <TextField size="small" label="Publisher (optional)" value={form.publisher} onChange={(e) => update({ publisher: e.target.value })} />
            <TextField select size="small" label="Platform" value={form.platform} onChange={(e) => update({ platform: e.target.value })}>
              {PLATFORMS.map((p) => (
                <MenuItem key={p} value={p}>{p}</MenuItem>
              ))}
            </TextField>
            <TextField size="small" label="Latest version" placeholder="23.01" value={form.latestVersion} onChange={(e) => update({ latestVersion: e.target.value })} required />
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
            <TextField
              size="small"
              label="Remediation package ID (optional)"
              type="number"
              value={form.packageId}
              onChange={(e) => update({ packageId: e.target.value })}
              helperText="SDP package that updates this app"
            />
          </Box>

          <FormControlLabel
            control={<Switch checked={form.isActive} onChange={(e) => update({ isActive: e.target.checked })} />}
            label="Active (detected + remediable)"
          />

          {error ? (
            <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: BRAND.alert?.errorSoft, color: BRAND.alert?.error, fontSize: 13, fontWeight: 600 }}>
              {error}
            </Box>
          ) : null}
          <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
            Entries created by approving an SDP package are refreshed automatically; manual entries are yours to maintain.
          </Typography>
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
