// src/msp/MspTeamDialog.jsx
//
// Self-service team management for an MSP OWNER. Lists the MSP's operators
// and lets an OWNER add / remove / re-role them — scoped to their own MSP.
// Reuses the same operator endpoints the vendor admin uses (now authorized
// for vendor OR OWNER). The backend blocks removing/demoting the last
// OWNER (LAST_OWNER) so a team can't lock itself out.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import PersonRemoveOutlinedIcon from "@mui/icons-material/PersonRemoveOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import { BRAND } from "../theme/brand";
import { fetchMspOperators, addMspOperator, removeMspOperator } from "./mspApi";

const ROLES = ["OWNER", "ADMIN", "USER"];

function roleColor(role) {
  if (role === "OWNER") return { bg: BRAND.cyanSoft, fg: BRAND.tealText };
  if (role === "USER") return { bg: BRAND.darkSoft, fg: BRAND.dark };
  return { bg: BRAND.tealSoft, fg: BRAND.tealText };
}

// Friendly copy for the backend error codes this surface can hit.
function errorText(err) {
  const code = err?.code || err?.body?.code || "";
  if (code === "LAST_OWNER") return "You can't remove or demote the last owner of this partner.";
  if (code === "SELF_SERVICE_FORBIDDEN") return "Only an owner of this partner can manage its team.";
  return err?.message || "Something went wrong.";
}

export default function MspTeamDialog({ open, mspId, mspName, onClose }) {
  const [operators, setOperators] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [subject, setSubject] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("ADMIN");
  const [addError, setAddError] = React.useState("");

  const load = React.useCallback(async () => {
    if (!mspId) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetchMspOperators(mspId);
      setOperators(resp?.operators ?? []);
    } catch (err) {
      setError(errorText(err));
      setOperators([]);
    } finally {
      setLoading(false);
    }
  }, [mspId]);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  const doAdd = React.useCallback(async () => {
    const s = subject.trim();
    if (!s) { setAddError("Subject (IDP user id) is required."); return; }
    setBusy(true);
    setAddError("");
    try {
      await addMspOperator(mspId, { subject: s, email: email.trim() || null, role });
      setSubject("");
      setEmail("");
      setRole("ADMIN");
      await load();
    } catch (err) {
      setAddError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, [subject, email, role, mspId, load]);

  const doRemove = React.useCallback(async (memberId) => {
    setBusy(true);
    setError("");
    try {
      await removeMspOperator(mspId, memberId);
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, [mspId, load]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <GroupsOutlinedIcon fontSize="small" sx={{ color: BRAND.teal }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark }} noWrap>Team</Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>{mspName || `Partner ${mspId}`}</Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: BRAND.gray }}>
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert> : null}

        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={22} sx={{ color: BRAND.teal }} />
          </Stack>
        ) : (
          <>
            {operators.length === 0 ? (
              <Typography variant="body2" sx={{ color: BRAND.gray, mb: 2 }}>No operators yet.</Typography>
            ) : (
              <Stack spacing={0.5} sx={{ mb: 2 }}>
                {operators.map((op) => {
                  const rc = roleColor(op.role);
                  return (
                    <Stack key={op.id} direction="row" alignItems="center" spacing={1}
                      sx={{ px: 1, py: 0.75, borderRadius: 1, "&:hover": { bgcolor: BRAND.darkSoft } }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, color: BRAND.dark }} noWrap>{op.email || op.subject}</Typography>
                        {op.email ? <Typography variant="caption" sx={{ color: BRAND.gray }} noWrap>{op.subject}</Typography> : null}
                      </Box>
                      <Chip label={op.role} size="small" sx={{ bgcolor: rc.bg, color: rc.fg, fontWeight: 800, fontSize: 11 }} />
                      {op.isActive ? null : <Chip label="inactive" size="small" sx={{ bgcolor: BRAND.darkSoft, color: BRAND.gray, fontSize: 11 }} />}
                      <Tooltip title="Remove operator">
                        <span>
                          <IconButton size="small" disabled={busy} onClick={() => doRemove(op.id)}
                            sx={{ color: BRAND.gray, "&:hover": { color: BRAND.alert.error } }}>
                            <PersonRemoveOutlinedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  );
                })}
              </Stack>
            )}

            <Divider sx={{ mb: 1.5 }} />
            <Stack spacing={1}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField size="small" label="Subject (IDP user id)" value={subject}
                  onChange={(e) => setSubject(e.target.value)} disabled={busy} sx={{ flex: 1 }} />
                <TextField size="small" label="Email (optional)" value={email}
                  onChange={(e) => setEmail(e.target.value)} disabled={busy} sx={{ flex: 1 }} />
                <Select size="small" value={role} onChange={(e) => setRole(e.target.value)} disabled={busy} sx={{ minWidth: 110 }}>
                  {ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                </Select>
              </Stack>
              {addError ? <Alert severity="error" onClose={() => setAddError("")}>{addError}</Alert> : null}
              <Box>
                <Button variant="contained" size="small" disabled={busy || !subject.trim()} onClick={doAdd}
                  startIcon={<AddOutlinedIcon />}
                  sx={{ textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}>
                  Add operator
                </Button>
              </Box>
            </Stack>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
