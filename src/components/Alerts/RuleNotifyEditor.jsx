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
} from "./notifyHelpers";


/** Compact read-only badge for the rule row. */
export function NotifyBadge({ notify }) {
  const count = Array.isArray(notify?.email) ? notify.email.length : 0;
  if (count === 0) {
    return (
      <Tooltip title="No email delivery — this rule only appears in the dashboard feed" arrow>
        <Chip
          size="small"
          icon={<NotificationsOffOutlinedIcon sx={{ fontSize: 14 }} />}
          label="No email"
          sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.gray, fontWeight: 600, fontSize: 11 }}
        />
      </Tooltip>
    );
  }
  return (
    <Tooltip title={notify.email.join(", ")} arrow>
      <Chip
        size="small"
        icon={<NotificationsActiveOutlinedIcon sx={{ fontSize: 14 }} />}
        label={`${count} recipient${count === 1 ? "" : "s"}`}
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

  const [emails, setEmails] = React.useState(initialEmails);
  const [minSeverity, setMinSeverity] = React.useState(initialSeverity);

  // Re-sync when the rule refreshes underneath us (post-save reload).
  React.useEffect(() => {
    setEmails(initialEmails);
    setMinSeverity(initialSeverity);
  }, [initialEmails, initialSeverity]);

  const parsed = parseRecipients(emails);
  const { invalid, unique, overCap, ok } = validateRecipients(parsed);

  const dirty = emails.trim() !== initialEmails.trim() || minSeverity !== initialSeverity;

  const helper = invalid.length
    ? `Not a valid address: ${invalid.slice(0, 2).join(", ")}${invalid.length > 2 ? "…" : ""}`
    : overCap
      ? `Too many recipients (${unique.length}). At most ${MAX_RECIPIENTS}.`
      : unique.length === 0
        ? "Empty = no email for this rule. One address per line (commas and semicolons work too)."
        : `${unique.length} recipient${unique.length === 1 ? "" : "s"}. Digest per rule, deduplicated — you are told once per finding.`;

  const handleSave = () => {
    // An empty list is the documented way to turn delivery off, so it is
    // saved as `{}` rather than being treated as "nothing to do".
    onSave(unique.length > 0 ? { email: unique, minSeverity } : {});
  };

  return (
    <Box sx={{ mt: 1.25, pt: 1.25, borderTop: `1px dashed ${BRAND.border}` }}>
      <Typography
        variant="caption"
        sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 1 }}
      >
        Email delivery
      </Typography>

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
