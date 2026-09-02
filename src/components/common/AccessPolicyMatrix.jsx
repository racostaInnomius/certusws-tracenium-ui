// src/components/common/AccessPolicyMatrix.jsx
//
// The privileged-access policy matrix: (device class × capability) → does
// this need a second person's approval?
//
// ── Why it is shared, and why it is filtered ─────────────────────────
//
// ADR-0009 phase 2 gives every privileged capability ONE matrix, not one per
// plugin: the table, the endpoint and the gate are common. So the backend
// returns all of them together — `rcp.shell`, `rcp.file`, `rcp.screen`,
// `cdp.cert.install`, `cdp.anchor.distrust`.
//
// Rendering that whole list wherever the matrix appears is what put Crypto
// Discovery's two capabilities inside Remote Control, where they read as
// somebody else's settings leaking into your screen. One shared matrix in
// the DATA does not mean one screen: each plugin shows the rows it owns.
//
// ⚠️ The prefix is explicit on purpose, and that has a consequence: a
// capability from a THIRD plugin — say `sdp.*` — would appear on neither
// screen until someone adds a matrix there. The alternative (one screen
// showing "everything that isn't mine") is what this change is undoing, so
// the gap is deliberate. The backend remains the single source; if rows go
// missing from the UI, look for a prefix nobody claimed.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import { BRAND } from "../../theme/brand";
// The endpoint lives under the /remote-control router because that is where
// ADR-0009 phase 2 landed first; the matrix it serves was never RCP-specific.
// Importing it from here rather than duplicating a client for the same URL.
import { getAccessPolicy, setAccessPolicyCell } from "../../api/remoteControl";

/**
 * @param {string} prefix   only capabilities starting with this are shown
 *   ("rcp." / "cdp."). Required — there is no "show everything" mode.
 * @param {string} title
 * @param {string} description  what a "yes" in this matrix costs, in the
 *   vocabulary of the plugin that owns these capabilities.
 * @param {Function} notify   (severity, message)
 */
export default function AccessPolicyMatrix({ prefix, title, description, notify }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState("");
  // Fallback for a host with no snackbar. `notify` is optional, and a save
  // that fails silently would leave the operator believing they changed who
  // needs approval when they did not — the one failure this screen cannot
  // afford to swallow.
  const [saveError, setSaveError] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    getAccessPolicy()
      .then((r) => alive && setRows(Array.isArray(r?.items) ? r.items : []))
      .catch(() => alive && setRows([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const mine = React.useMemo(
    () => rows.filter((r) => String(r.capability || "").startsWith(prefix)),
    [rows, prefix]
  );

  const toggle = async (row) => {
    const key = `${row.capability}:${row.deviceClass}`;
    setBusy(key);
    setSaveError("");
    try {
      await setAccessPolicyCell({
        capability: row.capability,
        deviceClass: row.deviceClass,
        requiresApproval: !row.requiresApproval,
        jitMinutes: row.jitMinutes
      });
      setRows((prev) =>
        prev.map((r) =>
          r.capability === row.capability && r.deviceClass === row.deviceClass
            ? { ...r, requiresApproval: !r.requiresApproval }
            : r
        )
      );
    } catch (e) {
      const message = e?.message || "Could not save the policy";
      if (notify) notify("error", message);
      else setSaveError(message);
    } finally {
      setBusy("");
    }
  };

  const capabilities = [...new Set(mine.map((r) => r.capability))];

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}` }}>
      <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 2 }}>
        {description}
      </Typography>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={22} sx={{ color: BRAND.teal }} />
        </Box>
      ) : null}

      {/* Two different empty states. "The matrix didn't load" and "the matrix
          loaded but has nothing for this plugin" have different causes and
          different fixes, and one message for both would send whoever reads
          it looking in the wrong place. */}
      {!loading && rows.length === 0 ? (
        <Alert severity="info">
          No policy loaded. If you have just deployed, the migration that seeds the matrix
          may not have run yet.
        </Alert>
      ) : null}

      {!loading && rows.length > 0 && mine.length === 0 ? (
        <Alert severity="info">
          No capability of this plugin is in the access policy yet.
        </Alert>
      ) : null}

      {saveError ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {saveError}
        </Alert>
      ) : null}

      {capabilities.map((cap) => (
        <Box key={cap} sx={{ mb: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: BRAND.dark }}>
            {cap}
          </Typography>
          {mine
            .filter((r) => r.capability === cap)
            .map((r) => (
              <Stack
                key={r.deviceClass}
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ pl: 1, py: 0.5 }}
              >
                <Typography variant="caption" sx={{ width: 90, color: BRAND.textMuted }}>
                  {r.deviceClass === "server" ? "Servers" : "Endpoints"}
                </Typography>
                <Button
                  size="small"
                  variant={r.requiresApproval ? "contained" : "outlined"}
                  disabled={busy === `${r.capability}:${r.deviceClass}`}
                  onClick={() => toggle(r)}
                >
                  {r.requiresApproval ? "Approval required" : "No approval"}
                </Button>
              </Stack>
            ))}
        </Box>
      ))}
    </Paper>
  );
}
