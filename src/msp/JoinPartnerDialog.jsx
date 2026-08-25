// src/msp/JoinPartnerDialog.jsx
//
// Client-side redeem: an OWNER of an unassigned client tenant enters the
// claim code their MSP gave them to attach their tenant to that MSP.
// Reflects current status first (already managed vs joinable) so the input
// only appears when it's actionable.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import { BRAND, ICON } from "../theme/brand";
import { fetchMyPartner, redeemClaimCode } from "./mspApi";

function errorText(err) {
  const code = err?.code || err?.body?.code || "";
  const map = {
    INVALID_CODE: "That code isn't valid.",
    CODE_EXPIRED: "That code has expired. Ask your provider for a new one.",
    CODE_USED: "That code has already been used.",
    ALREADY_ASSIGNED: "This tenant is already managed by a partner.",
    NOT_A_CLIENT: "This tenant can't join a partner.",
    OWNER_REQUIRED: "Only an owner of this tenant can join a partner.",
    CODE_REQUIRED: "Enter a code.",
  };
  return map[code] || err?.message || "Something went wrong.";
}

export default function JoinPartnerDialog({ open, onClose, onJoined }) {
  const [status, setStatus] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [joined, setJoined] = React.useState(null); // { mspName } after success

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    setJoined(null);
    try {
      const resp = await fetchMyPartner();
      setStatus(resp?.status ?? null);
    } catch (err) {
      setError(errorText(err));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) { setCode(""); load(); }
  }, [open, load]);

  const doJoin = React.useCallback(async () => {
    const c = code.trim();
    if (!c) { setError("Enter a code."); return; }
    setBusy(true);
    setError("");
    try {
      const resp = await redeemClaimCode(c);
      setJoined({ mspName: resp?.mspName || "your partner" });
      onJoined?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, [code, onJoined]);

  const canJoin = status?.canJoin && !joined;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <HandshakeOutlinedIcon fontSize="small" sx={{ color: BRAND.teal }} />
        <Typography sx={{ fontWeight: 800, color: BRAND.dark, flex: 1 }}>Join a partner</Typography>
        <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ color: BRAND.gray }}>
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={24} sx={{ color: BRAND.teal }} />
          </Stack>
        ) : joined ? (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 3, textAlign: "center" }}>
            <CheckCircleOutlineOutlinedIcon sx={{ fontSize: ICON["3xl"], color: BRAND.alert.success }} />
            <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>
              You're now managed by {joined.mspName}.
            </Typography>
            <Typography variant="body2" sx={{ color: BRAND.gray }}>
              Your partner can now see this tenant in their portfolio.
            </Typography>
            <Button onClick={onClose} variant="contained"
              sx={{ mt: 1, textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}>
              Done
            </Button>
          </Stack>
        ) : status?.managed ? (
          <Box sx={{ py: 2 }}>
            <Alert severity="info">
              This tenant is managed by <b>{status.msp?.name || "a partner"}</b>. To change partners,
              contact your provider.
            </Alert>
          </Box>
        ) : !canJoin ? (
          <Box sx={{ py: 2 }}>
            <Alert severity="info">Joining a partner isn't available for this tenant.</Alert>
          </Box>
        ) : (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" sx={{ color: BRAND.gray }}>
              Enter the claim code your service provider gave you. This links your tenant to them
              for management.
            </Typography>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Claim code"
              placeholder="XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") doJoin(); }}
              disabled={busy}
              inputProps={{ style: { fontFamily: "monospace", letterSpacing: 2 } }}
            />
            {error ? <Alert severity="error" onClose={() => setError("")}>{error}</Alert> : null}
            <Box sx={{ textAlign: "right" }}>
              <Button onClick={onClose} disabled={busy} sx={{ textTransform: "none", color: BRAND.dark, mr: 1 }}>
                Cancel
              </Button>
              <Button onClick={doJoin} disabled={busy || !code.trim()} variant="contained"
                sx={{ textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}>
                {busy ? "Joining…" : "Join"}
              </Button>
            </Box>
          </Stack>
        )}

        {error && !canJoin && !joined ? (
          <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError("")}>{error}</Alert>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
