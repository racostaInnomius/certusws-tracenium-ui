// src/components/Alerts/RuleNotifyEditor.jsx
//
// Per-rule proactive email delivery (alert_rules.notify_json). Until this
// existed the alerts feed was pull-only in practice: the backend could
// send mail, but the config was reachable only by hand-crafted API calls,
// so nobody was ever actually notified.
//
// Validation mirrors parseNotifyConfig in the backend's
// alert-notifier.service. The backend re-validates and rejects, so this
// is an authoring aid — but it matters: a typo'd address that saved
// "successfully" and then silently never delivered is the worst possible
// outcome for an alerting feature.

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import NotificationsOffOutlinedIcon from "@mui/icons-material/NotificationsOffOutlined";
import { BRAND } from "../../theme/brand";
import {
  parseRecipients,
  validateRecipients,
  MAX_RECIPIENTS,
  SEVERITIES,
  NOTIFY_ROLES,
  hasAnyTarget,
  describeTargets,
} from "./notifyHelpers";


/** Compact read-only badge for the rule row. */
export function NotifyBadge({ notify }) {
  // Counts every kind of target, not just typed addresses. A rule that
  // notifies the tenant's OWNERs used to render as "No email", which is
  // the opposite of what it does.
  const targeted = hasAnyTarget(notify);
  if (!targeted) {
    return (
      <Tooltip
        title="Nobody is notified. Findings from this rule appear in the dashboard feed and nowhere else."
        arrow
      >
        <Chip
          size="small"
          icon={<NotificationsOffOutlinedIcon sx={{ fontSize: 14 }} />}
          // "No email" stopped being accurate once a rule could target a
          // role: it read as "email is off" when what it means is "no
          // delivery at all". ADR-0007 names this state — console only —
          // and naming it is the point: today an unconfigured rule and a
          // deliberately quiet one look identical.
          label="Console only"
          sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.gray, fontWeight: 600, fontSize: 11 }}
        />
      </Tooltip>
    );
  }
  const summary = describeTargets(notify);
  return (
    <Tooltip title={summary} arrow>
      <Chip
        size="small"
        icon={<NotificationsActiveOutlinedIcon sx={{ fontSize: 14 }} />}
        label={summary}
        sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700, fontSize: 11 }}
      />
    </Tooltip>
  );
}

export default function RuleNotifyEditor({ rule, onSave, busy = false }) {
  // Plain derivation, not useMemo: both values are primitives, so the
  // effect below re-syncs on value change rather than identity.
  const initialEmails = Array.isArray(rule?.notify?.email)
    ? rule.notify.email.join("\n")
    : "";
  const initialSeverity = rule?.notify?.minSeverity ?? "low";
  const initialRoles = Array.isArray(rule?.notify?.roles) ? rule.notify.roles.join(",") : "";

  const [emails, setEmails] = React.useState(initialEmails);
  const [minSeverity, setMinSeverity] = React.useState(initialSeverity);
  const [roles, setRoles] = React.useState(initialRoles);

  // Re-sync when the rule refreshes underneath us (post-save reload).
  React.useEffect(() => {
    setEmails(initialEmails);
    setMinSeverity(initialSeverity);
    setRoles(initialRoles);
  }, [initialEmails, initialSeverity, initialRoles]);

  const selectedRoles = roles ? roles.split(",").filter(Boolean) : [];
  const toggleRole = (role) =>
    setRoles(
      (selectedRoles.includes(role)
        ? selectedRoles.filter((r) => r !== role)
        : [...selectedRoles, role]
      ).join(",")
    );

  const parsed = parseRecipients(emails);
  const { invalid, unique, overCap, ok } = validateRecipients(parsed);

  const dirty =
    emails.trim() !== initialEmails.trim() ||
    minSeverity !== initialSeverity ||
    roles !== initialRoles;

  const helper = invalid.length
    ? `Not a valid address: ${invalid.slice(0, 2).join(", ")}${invalid.length > 2 ? "…" : ""}`
    : overCap
      ? `Too many recipients (${unique.length}). At most ${MAX_RECIPIENTS}.`
      : unique.length === 0
        ? "For mailboxes that are not people — soc@, a ticket queue. For people, target a role above."
        : `${unique.length} recipient${unique.length === 1 ? "" : "s"}. Digest per rule, deduplicated — you are told once per finding.`;

  const handleSave = () => {
    // No targets at all is the documented way to turn delivery off, so it
    // saves as `{}` rather than being treated as "nothing to do".
    const payload = {};
    if (unique.length > 0) payload.email = unique;
    if (selectedRoles.length > 0) payload.roles = selectedRoles;
    onSave(Object.keys(payload).length > 0 ? { ...payload, minSeverity } : {});
  };

  return (
    <Box sx={{ mt: 1.25, pt: 1.25, borderTop: `1px dashed ${BRAND.border}` }}>
      <Typography
        variant="caption"
        sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 1 }}
      >
        Email delivery
      </Typography>

      <Box sx={{ mb: 1.5 }}>
        <Typography sx={{ fontSize: 12, color: BRAND.gray, mb: 0.75 }}>
          Notify by role — the address comes from the member record, so someone who leaves
          the tenant stops being notified without anyone editing this rule.
        </Typography>
        <Stack direction="row" spacing={0.75}>
          {NOTIFY_ROLES.map((role) => {
            const on = selectedRoles.includes(role);
            return (
              <Chip
                key={role}
                size="small"
                label={role}
                onClick={busy ? undefined : () => toggleRole(role)}
                sx={{
                  cursor: busy ? "default" : "pointer",
                  fontWeight: 700,
                  fontSize: 11,
                  bgcolor: on ? BRAND.tealSoft : BRAND.surfaceMuted,
                  color: on ? BRAND.tealText : BRAND.gray,
                }}
              />
            );
          })}
        </Stack>
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems="flex-start">
        <TextField
          size="small"
          label="Recipients"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          disabled={busy}
          error={invalid.length > 0 || overCap}
          helperText={helper}
          multiline
          minRows={2}
          maxRows={6}
          placeholder={"ops@example.com\nsecurity@example.com"}
          sx={{ flex: 1, minWidth: 0, "& textarea": { fontSize: 12.5 } }}
        />
        <TextField
          size="small"
          select
          label="Min severity"
          value={minSeverity}
          onChange={(e) => setMinSeverity(e.target.value)}
          disabled={busy}
          helperText="Below this, no email"
          sx={{ minWidth: 140 }}
        >
          {SEVERITIES.map((s) => (
            <MenuItem key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
        <Button
          size="small"
          variant="contained"
          disabled={busy || !dirty || !ok}
          onClick={handleSave}
          sx={{
            textTransform: "none",
            bgcolor: BRAND.teal,
            "&:hover": { bgcolor: BRAND.tealHover },
          }}
        >
          Save delivery
        </Button>
      </Stack>
    </Box>
  );
}
