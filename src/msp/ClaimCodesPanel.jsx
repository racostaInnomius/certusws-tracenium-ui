// src/msp/ClaimCodesPanel.jsx
//
// Reusable claim-code manager for one MSP (vendor or its OWNER). Issue a
// single-use code, copy it, and revoke unused ones. The MSP shares a code
// out-of-band; the client's owner redeems it under Settings → Join a
// partner to attach their tenant. Used both in the vendor MspAdmin detail
// and the MSP-owner "Add a client" dialog.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import { BRAND } from "../theme/brand";
import { fetchClaimCodes, generateClaimCode, revokeClaimCode } from "./mspApi";

function fmtExpiry(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const days = Math.max(0, Math.round((d.getTime() - Date.now()) / 864e5));
  return `expires in ${days}d`;
}

export default function ClaimCodesPanel({ mspId, mspName }) {
  const [codes, setCodes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState("");

  const load = React.useCallback(async () => {
    if (!mspId) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetchClaimCodes(mspId);
      setCodes(resp?.codes ?? []);
    } catch (err) {
      setError(err?.message || "Could not load claim codes.");
      setCodes([]);
    } finally {
      setLoading(false);
    }
  }, [mspId]);

  React.useEffect(() => { load(); }, [load]);

  const doGenerate = React.useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await generateClaimCode(mspId);
      await load();
    } catch (err) {
      setError(err?.message || "Could not generate a code.");
    } finally {
      setBusy(false);
    }
  }, [mspId, load]);

  const doRevoke = React.useCallback(async (code) => {
    setBusy(true);
    setError("");
    try {
      await revokeClaimCode(mspId, code);
      await load();
    } catch (err) {
      setError(err?.message || "Could not revoke the code.");
    } finally {
      setBusy(false);
    }
  }, [mspId, load]);

  const copy = React.useCallback(async (code) => {
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* clipboard may be unavailable; the code is visible to copy manually */
    }
  }, []);

  return (
    <Box>
      <Typography variant="body2" sx={{ color: BRAND.gray, mb: 1.5 }}>
        Issue a single-use code and share it with the client. Their owner redeems it
        under <b>Settings → Join a partner</b> to attach their tenant to
        {mspName ? ` ${mspName}` : " this partner"}.
      </Typography>

      {error ? <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError("")}>{error}</Alert> : null}

      <Button
        variant="contained"
        size="small"
        startIcon={<AddOutlinedIcon />}
        disabled={busy}
        onClick={doGenerate}
        sx={{ textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover }, mb: 2 }}
      >
        {busy ? "Working…" : "Generate a code"}
      </Button>

      {loading ? (
        <Stack alignItems="center" sx={{ py: 3 }}>
          <CircularProgress size={20} sx={{ color: BRAND.teal }} />
        </Stack>
      ) : codes.length === 0 ? (
        <Typography variant="body2" sx={{ color: BRAND.gray }}>No active codes.</Typography>
      ) : (
        <Stack spacing={0.5}>
          {codes.map((c) => (
            <Stack key={c.code} direction="row" alignItems="center" spacing={1}
              sx={{ px: 1, py: 0.75, borderRadius: 1, bgcolor: BRAND.surfaceMuted }}>
              <Typography sx={{ fontFamily: "monospace", fontWeight: 800, letterSpacing: 1, color: BRAND.dark, flex: 1 }}>
                {c.code}
              </Typography>
              <Typography variant="caption" sx={{ color: BRAND.gray }}>{fmtExpiry(c.expiresAt)}</Typography>
              <Tooltip title={copied === c.code ? "Copied!" : "Copy"}>
                <span>
                  <IconButton size="small" onClick={() => copy(c.code)} sx={{ color: copied === c.code ? BRAND.teal : BRAND.gray }}>
                    <ContentCopyOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Revoke">
                <span>
                  <IconButton size="small" disabled={busy} onClick={() => doRevoke(c.code)}
                    sx={{ color: BRAND.gray, "&:hover": { color: BRAND.alert.error } }}>
                    <DeleteOutlineOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}
