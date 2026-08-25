// src/msp/CreateClientPanel.jsx
//
// MSP-provisioned client: create a client tenant + assign an admin (by IDP
// user id). The tenant is created immediately (so the MSP can pre-configure
// it from the portfolio) and binds to the admin on their first Tracenium
// login. If the admin already has a tenant, the backend rejects with
// ADMIN_ALREADY_HAS_TENANT → we steer the MSP to the claim-code tab instead.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import { BRAND, TEXT } from "../theme/brand";
import { fetchPendingClients, createManagedClient } from "./mspApi";

export default function CreateClientPanel({ mspId, mspName, onSwitchToCodes }) {
  const [name, setName] = React.useState("");
  const [adminSubject, setAdminSubject] = React.useState("");
  const [adminEmail, setAdminEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [alreadyHasTenant, setAlreadyHasTenant] = React.useState(false);

  const [pending, setPending] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const loadPending = React.useCallback(async () => {
    if (!mspId) return;
    setLoading(true);
    try {
      const resp = await fetchPendingClients(mspId);
      setPending(resp?.pending ?? []);
    } catch {
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [mspId]);

  React.useEffect(() => { loadPending(); }, [loadPending]);

  const doCreate = React.useCallback(async () => {
    const n = name.trim();
    const s = adminSubject.trim();
    if (!n || !s) { setError("Name and admin user id are required."); return; }
    setBusy(true);
    setError("");
    setAlreadyHasTenant(false);
    try {
      await createManagedClient(mspId, { name: n, adminSubject: s, adminEmail: adminEmail.trim() || null });
      setName("");
      setAdminSubject("");
      setAdminEmail("");
      await loadPending();
    } catch (err) {
      const code = err?.code || err?.body?.code || "";
      if (code === "ADMIN_ALREADY_HAS_TENANT") {
        setAlreadyHasTenant(true);
      } else {
        setError(err?.message || "Could not create the client.");
      }
    } finally {
      setBusy(false);
    }
  }, [name, adminSubject, adminEmail, mspId, loadPending]);

  return (
    <Box>
      <Typography variant="body2" sx={{ color: BRAND.gray, mb: 1.5 }}>
        Create a client tenant under {mspName ? mspName : "this partner"} and assign an admin (an
        existing IDP user id). You can configure it right away from the portfolio; the admin lands
        in it on their first Tracenium login.
      </Typography>

      {alreadyHasTenant ? (
        <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setAlreadyHasTenant(false)}>
          That admin already has a Tracenium tenant. You can't pre-create one for them — use{" "}
          <b>Invite existing</b> and send them a claim code instead.
          {onSwitchToCodes ? (
            <Box sx={{ mt: 1 }}>
              <Button size="small" variant="outlined" onClick={onSwitchToCodes}
                sx={{ textTransform: "none", borderColor: BRAND.teal, color: BRAND.tealText }}>
                Go to Invite existing
              </Button>
            </Box>
          ) : null}
        </Alert>
      ) : null}
      {error ? <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError("")}>{error}</Alert> : null}

      <Stack spacing={1.5}>
        <TextField
          size="small"
          label="Client name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          fullWidth
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <TextField
            size="small"
            label="Admin user id (IDP subject)"
            value={adminSubject}
            onChange={(e) => setAdminSubject(e.target.value)}
            disabled={busy}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            label="Admin email (optional)"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            disabled={busy}
            sx={{ flex: 1 }}
          />
        </Stack>
        <Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddOutlinedIcon />}
            disabled={busy || !name.trim() || !adminSubject.trim()}
            onClick={doCreate}
            sx={{ textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
          >
            {busy ? "Creating…" : "Create client"}
          </Button>
        </Box>
      </Stack>

      {/* Pending (awaiting the admin's first login) */}
      <Divider sx={{ my: 2 }} />
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <HourglassEmptyOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
        <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark }}>
          Awaiting first login
        </Typography>
      </Stack>
      {loading ? (
        <CircularProgress size={18} sx={{ color: BRAND.teal }} />
      ) : pending.length === 0 ? (
        <Typography variant="body2" sx={{ color: BRAND.gray }}>None.</Typography>
      ) : (
        <Stack spacing={0.5}>
          {pending.map((p) => (
            <Stack key={p.tenantId} direction="row" alignItems="center" spacing={1}
              sx={{ px: 1, py: 0.5, borderRadius: 1, bgcolor: BRAND.surfaceMuted }}>
              <Typography sx={{ fontWeight: 700, color: BRAND.dark, flex: 1, minWidth: 0 }} noWrap>
                {p.name || `Tenant ${p.tenantId}`}
              </Typography>
              <Typography variant="caption" sx={{ color: BRAND.gray }} noWrap>
                {p.adminEmail || p.adminSubject}
              </Typography>
              <Chip label="pending" size="small" sx={{ bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warning, fontWeight: 700, fontSize: TEXT.xs }} />
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}
