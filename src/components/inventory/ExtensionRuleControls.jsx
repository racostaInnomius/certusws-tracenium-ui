// src/components/inventory/ExtensionRuleControls.jsx
//
// Block / allow rules for browser extensions (Chrome and Edge on Windows).
//
// ⚠️ A rule is not a one-off job. It lives in the tenant policy, so a device
// enrolled tomorrow receives it too and removing it retires it everywhere. The
// copy says that, because "block on these 12 devices" would be a promise about
// the wrong thing.
//
// ⚠️ "Applied" is what the agents REPORTED writing, not what the portal asked
// for. A rule saved a second ago shows 0 applied and N pending, which is true.

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";

const RULE_BROWSERS = new Set(["chrome", "edge"]);
const BROWSER_LABEL = { chrome: "Chrome", edge: "Edge" };

// Two different "no": the plan does not include applying rules, or this
// person lacks the capability. Plan first — no capability fixes a plan.
const NOT_ENTITLED = "Blocking and allowing extensions requires Patch Management.";
const NO_CAPABILITY = "Changing rules needs the Security Compliance capability.";

/** "Blocked" / "Allowed" chip for a row that has a rule. */
export function RuleChip({ rule }) {
  if (!rule) return null;
  const blocked = rule.action === "block";
  const meta = blocked ? severityMeta("critical") : severityMeta("low");
  return (
    <Chip
      size="small"
      label={blocked ? "Blocked by rule" : "Allowed by rule"}
      sx={{ height: 18, fontSize: TEXT.xs, fontWeight: 700, bgcolor: meta.bg, color: meta.fg, ml: 1 }}
    />
  );
}

export function RuleStatusLine({ rule, windowsDevices }) {
  if (!rule) return null;
  const s = rule.status || {};
  const failed = Number(s.failed || 0);
  return (
    <Tooltip title="What the agents reported writing on their last inventory. Devices pick up rule changes on their next check-in.">
      <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
        Applied on {Number(s.applied || 0)} of {Number(windowsDevices || 0)} Windows devices
        {Number(s.pending || 0) > 0 ? ` · ${s.pending} pending` : ""}
        {failed > 0 ? (
          <Box component="span" sx={{ color: severityMeta("critical").fg, fontWeight: 700 }}>
            {` · ${failed} failed`}
          </Box>
        ) : null}
      </Typography>
    </Tooltip>
  );
}

/** Confirm dialog with an optional reason, shared by every rule change. */
export function RuleDialog({ open, title, body, confirmLabel, danger, onCancel, onConfirm, busy }) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);
  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: TEXT.base, fontWeight: 800 }}>{title}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, mb: 1.5 }}>{body}</Typography>
        <TextField
          fullWidth
          size="small"
          label="Reason (kept in the audit log)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          inputProps={{ maxLength: 1000 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" color={danger ? "error" : "primary"} onClick={() => onConfirm(reason)} disabled={busy}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Block / Allow / Remove for one extension. Firefox and read-only users get a
 * sentence instead of disabled buttons that explain nothing.
 */
export function ExtensionRuleActions({ extension, rule, canManage, entitled = true, windowsDevices, onSave, onRemove }) {
  const [pending, setPending] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  if (!RULE_BROWSERS.has(extension.browser)) {
    return <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>Rules are available for Chrome and Edge on Windows.</Typography>;
  }

  const browser = BROWSER_LABEL[extension.browser];
  const run = async (fn) => {
    setBusy(true);
    try {
      // Los handlers devuelven false si falló (ya avisaron): el diálogo se queda.
      if ((await fn()) !== false) setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const dialogs = {
    block: {
      title: `Block ${extension.name} in ${browser}?`,
      body: `${browser} disables and removes it on every Windows device that receives the rule — the ${extension.devices} where it is installed now and any device enrolled later. Removing the rule allows it again.`,
      confirmLabel: "Block extension",
      danger: true,
      confirm: (reason) => onSave({ browser: extension.browser, extensionId: extension.extensionId, action: "block", name: extension.name, reason }),
    },
    allow: {
      title: `Allow ${extension.name} in ${browser}?`,
      body: `It stays installable even when "block all other extensions" is on for ${browser}.`,
      confirmLabel: "Allow extension",
      danger: false,
      confirm: (reason) => onSave({ browser: extension.browser, extensionId: extension.extensionId, action: "allow", name: extension.name, reason }),
    },
    remove: {
      title: `Remove the rule for ${extension.name}?`,
      body: `Agents take out the entry they added. An entry a domain GPO put in the same list stays.`,
      confirmLabel: "Remove rule",
      danger: false,
      confirm: () => onRemove(extension.browser, extension.extensionId),
    },
  };
  const d = pending ? dialogs[pending] : null;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: BRAND.dark }}>Policy</Typography>
        {rule ? <RuleStatusLine rule={rule} windowsDevices={windowsDevices} /> : (
          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>No rule for this extension.</Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {entitled && canManage ? (
          <>
            {rule?.action !== "block" ? (
              <Button size="small" color="error" variant="outlined" onClick={() => setPending("block")}>
                Block
              </Button>
            ) : null}
            {rule?.action !== "allow" ? (
              <Button size="small" variant="outlined" onClick={() => setPending("allow")}>
                Allow
              </Button>
            ) : null}
            {rule ? (
              <Button size="small" onClick={() => setPending("remove")}>
                Remove rule
              </Button>
            ) : null}
          </>
        ) : (
          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>{entitled ? NO_CAPABILITY : NOT_ENTITLED}</Typography>
        )}
      </Box>
      {d ? (
        <RuleDialog
          open
          title={d.title}
          body={d.body}
          confirmLabel={d.confirmLabel}
          danger={d.danger}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={(reason) => run(() => d.confirm(reason))}
        />
      ) : null}
    </Box>
  );
}

/**
 * "Block all other extensions" per browser. The dangerous switch of the
 * feature, so it says how many extensions are allowed before it flips.
 */
export function BlockAllOthersControls({ rules, canManage: canManageRaw, entitled = true, windowsDevices, onSave, onRemove }) {
  const canManage = canManageRaw && entitled;
  const [pending, setPending] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const list = Array.isArray(rules) ? rules : [];
  const blocked = list.filter((r) => r.action === "block" && r.extensionId !== "*").length;
  const allowed = list.filter((r) => r.action === "allow").length;

  // Sin plan pero con reglas de antes: se enseñan (y se retiran solas en los
  // equipos); sin reglas y sin poder crearlas, la barra sólo explica por qué.
  if (list.length === 0 && !canManage) {
    return entitled ? null : (
      <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mb: 1 }}>{NOT_ENTITLED}</Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 1.25, p: 1, borderRadius: 1, bgcolor: BRAND.surfaceMuted }}>
      <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: BRAND.dark }}>
        Rules: {blocked} blocked · {allowed} allowed
      </Typography>
      {["chrome", "edge"].map((browser) => {
        const star = list.find((r) => r.browser === browser && r.extensionId === "*");
        const allowedHere = list.filter((r) => r.browser === browser && r.action === "allow").length;
        return (
          <Box key={browser} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.dark }}>{BROWSER_LABEL[browser]}:</Typography>
            {star ? (
              <>
                <Chip size="small" label="Only allowed extensions" sx={{ height: 18, fontSize: TEXT.xs, fontWeight: 700, bgcolor: severityMeta("high").bg, color: severityMeta("high").fg }} />
                <RuleStatusLine rule={star} windowsDevices={windowsDevices} />
                {canManage ? (
                  <Button size="small" onClick={() => setPending({ browser, action: "remove" })}>
                    Turn off
                  </Button>
                ) : null}
              </>
            ) : canManage ? (
              <Button size="small" color="error" onClick={() => setPending({ browser, action: "on", allowedHere })}>
                Block all other extensions
              </Button>
            ) : (
              <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>any extension can be installed</Typography>
            )}
          </Box>
        );
      })}
      {pending ? (
        <RuleDialog
          open
          danger={pending.action === "on"}
          busy={busy}
          title={
            pending.action === "on"
              ? `Block every ${BROWSER_LABEL[pending.browser]} extension that is not allowed?`
              : `Let ${BROWSER_LABEL[pending.browser]} install any extension again?`
          }
          body={
            pending.action === "on"
              ? `${BROWSER_LABEL[pending.browser]} disables and removes every extension without an "Allow" rule on all Windows devices. ${pending.allowedHere} extension${pending.allowedHere === 1 ? " is" : "s are"} allowed for ${BROWSER_LABEL[pending.browser]} right now${pending.allowedHere === 0 ? " — allow the ones people need first" : ""}.`
              : "Extensions without a rule can be installed again. Blocked ones stay blocked."
          }
          confirmLabel={pending.action === "on" ? "Block all others" : "Turn off"}
          onCancel={() => setPending(null)}
          onConfirm={async (reason) => {
            setBusy(true);
            try {
              const ok =
                pending.action === "on"
                  ? await onSave({ browser: pending.browser, extensionId: "*", action: "block", name: "All other extensions", reason })
                  : await onRemove(pending.browser, "*");
              if (ok !== false) setPending(null);
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </Box>
  );
}
