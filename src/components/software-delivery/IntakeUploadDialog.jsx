// src/components/software-delivery/IntakeUploadDialog.jsx
//
// Upload an installer for the AI intake pipeline. The operator picks a binary
// (.msi/.exe/.pkg/.deb/…) and optionally supplies hints (name/vendor/version)
// and a declared SHA-256 to check the upload against. The dialog is dumb — the
// parent performs the upload via api/softwareDelivery.uploadIntake.

import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Box,
  Typography,
} from "@mui/material";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import { BRAND } from "../../theme/brand";

const SHA256_RE = /^[0-9a-f]{64}$/i;

function emptyHints() {
  return { name: "", vendor: "", version: "", declaredSha256: "" };
}

export default function IntakeUploadDialog({ open, submitting, onClose, onSubmit }) {
  const [file, setFile] = React.useState(null);
  const [hints, setHints] = React.useState(emptyHints);
  const [error, setError] = React.useState(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    setFile(null);
    setHints(emptyHints());
    setError(null);
  }, [open]);

  const update = (patch) => setHints((p) => ({ ...p, ...patch }));

  const handleSubmit = () => {
    if (!file) {
      setError("Choose an installer file to upload.");
      return;
    }
    const sha = hints.declaredSha256.trim();
    if (sha && !SHA256_RE.test(sha)) {
      setError("Declared SHA-256 must be a 64-char hex string (or left blank).");
      return;
    }
    onSubmit?.(file, {
      name: hints.name.trim() || undefined,
      vendor: hints.vendor.trim() || undefined,
      version: hints.version.trim() || undefined,
      declaredSha256: sha || undefined,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>Upload installer for AI intake</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography sx={{ fontSize: 13, color: BRAND.gray }}>
            The file is verified (signature + threat-intel) before anything else, then AI proposes a
            silent-install configuration for your review. Nothing is distributed until you approve it.
          </Typography>

          <Box>
            <input
              ref={inputRef}
              type="file"
              hidden
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
            />
            <Button
              onClick={() => inputRef.current?.click()}
              startIcon={<UploadFileOutlinedIcon />}
              variant="outlined"
              sx={{ textTransform: "none", color: BRAND.dark, borderColor: BRAND.border }}
            >
              {file ? "Change file" : "Choose file…"}
            </Button>
            {file ? (
              <Typography sx={{ mt: 1, fontSize: 13, color: BRAND.dark, fontWeight: 600 }}>
                {file.name}{" "}
                <span style={{ color: BRAND.gray, fontWeight: 400 }}>
                  ({Math.max(1, Math.round(file.size / 1024)).toLocaleString()} KB)
                </span>
              </Typography>
            ) : null}
          </Box>

          <Typography
            variant="caption"
            sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}
          >
            Hints (optional — extracted values win)
          </Typography>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "1fr 1fr" }}>
            <TextField size="small" label="Name" value={hints.name} onChange={(e) => update({ name: e.target.value })} />
            <TextField size="small" label="Vendor" value={hints.vendor} onChange={(e) => update({ vendor: e.target.value })} />
            <TextField size="small" label="Version" value={hints.version} onChange={(e) => update({ version: e.target.value })} />
            <TextField
              size="small"
              label="Declared SHA-256"
              value={hints.declaredSha256}
              onChange={(e) => update({ declaredSha256: e.target.value })}
              inputProps={{ style: { fontFamily: "monospace", fontSize: 12 } }}
            />
          </Box>

          {error ? (
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: BRAND.alert?.errorSoft,
                color: BRAND.alert?.error,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
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
          disabled={submitting || !file}
          variant="contained"
          sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
        >
          {submitting ? "Uploading…" : "Upload & analyze"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
