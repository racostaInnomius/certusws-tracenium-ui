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
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import NotificationsOffOutlinedIcon from "@mui/icons-material/NotificationsOffOutlined";
import { BRAND, ICON, TEXT } from "../../theme/brand";
import {
  parseRecipients,
  validateRecipients,
  MAX_RECIPIENTS,
  NOTIFY_CHANNELS,
  PENDING_CHANNELS,
  MATRIX_SEVERITIES,
  normalizeMatrix,
  severitiesFor,
  hasAnyTarget,
  describeTargets,
  profileIdsOf,
  buildNotifyPayload,
  summarizeRecipients,
  describeDeliveryGap,
} from "./notifyHelpers";
import { getAlertRuleRecipients } from "../../api/alerts";
import RoleChips from "./RoleChips";


/** Compact read-only badge for the rule row. */
export function NotifyBadge({ notify, profileNames = null }) {
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
          icon={<NotificationsOffOutlinedIcon sx={{ fontSize: ICON.sm }} />}
          // "No email" stopped being accurate once a rule could target a
          // role: it read as "email is off" when what it means is "no
          // delivery at all". ADR-0007 names this state — console only —
          // and naming it is the point: today an unconfigured rule and a
          // deliberately quiet one look identical.
          label="Console only"
          sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.gray, fontWeight: 600, fontSize: TEXT.xs }}
        />
      </Tooltip>
    );
  }
  const summary = describeTargets(notify, profileNames);
  return (
    <Tooltip title={summary} arrow>
      <Chip
        size="small"
        icon={<NotificationsActiveOutlinedIcon sx={{ fontSize: ICON.sm }} />}
        label={summary}
        sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700, fontSize: TEXT.xs }}
      />
    </Tooltip>
  );
}

/**
 * `profiles` — the tenant's notification profiles (ADR-0025), or `null`
 * when they are not available to this user (no `alerts` capability) or
 * not loaded yet. `null` hides the picker; `[]` shows the empty state.
 */
export default function RuleNotifyEditor({
  rule,
  onSave,
  busy = false,
  profiles = null,
  onManageProfiles,
  roleOptions = null,
}) {
  // Plain derivation, not useMemo: both values are primitives, so the
  // effect below re-syncs on value change rather than identity.
  const initialEmails = Array.isArray(rule?.notify?.email)
    ? rule.notify.email.join("\n")
    : "";
  const initialSeverity = rule?.notify?.minSeverity ?? "low";
  // JSON, not a comma-joined string: a custom role name can contain a comma
  // (ADR-0025 F3), and a string keeps the re-sync effect keyed on value.
  const initialRoles = JSON.stringify(Array.isArray(rule?.notify?.roles) ? rule.notify.roles : []);
  const initialMatrix = JSON.stringify(normalizeMatrix(rule?.notify?.channels));
  const initialProfiles = profileIdsOf(rule?.notify).map((id) => id.toLowerCase()).join(",");

  const [emails, setEmails] = React.useState(initialEmails);
  // Ya no es editable. La matriz gobierna el enrutado; dejar el selector
  // habría sido enseñar dos controles que gobiernan lo mismo y discrepan
  // — con la matriz diciendo "correo en critical y high" y el desplegable
  // diciendo "Low: por debajo, sin correo". Se conserva el valor guardado
  // para no reescribir la configuración de una regla que nadie tocó, y
  // porque el backend lo sigue leyendo para derivar la matriz de reglas
  // anteriores a la fase 2.
  const [minSeverity] = React.useState(initialSeverity);
  const [roles, setRoles] = React.useState(initialRoles);
  const [matrixJson, setMatrixJson] = React.useState(initialMatrix);
  const [profileIds, setProfileIds] = React.useState(initialProfiles);

  // Re-sync when the rule refreshes underneath us (post-save reload).
  React.useEffect(() => {
    setEmails(initialEmails);
    setRoles(initialRoles);
    setMatrixJson(initialMatrix);
    setProfileIds(initialProfiles);
  }, [initialEmails, initialRoles, initialMatrix, initialProfiles]);

  // Who this rule reaches TODAY, as saved. Re-read after every save
  // (`updatedAt` moves) — it is the number ADR-0025 asks the UI to show,
  // because with profiles the recipient cap stops being theoretical.
  const canPreview = profiles !== null && Boolean(rule?.id);
  const [reach, setReach] = React.useState(null);
  React.useEffect(() => {
    if (!canPreview) return undefined;
    let alive = true;
    setReach(null);
    getAlertRuleRecipients(rule.id)
      .then((res) => alive && setReach(summarizeRecipients(res)))
      .catch(() => alive && setReach({ tone: "muted", text: "Could not work out who this reaches right now." }));
    return () => {
      alive = false;
    };
  }, [canPreview, rule?.id, rule?.updatedAt]);

  const matrix = JSON.parse(matrixJson);
  const toggleChannel = (severity, channel) => {
    if (channel === "console") return; // el feed es el registro, no una entrega
    const current = matrix[severity] ?? ["console"];
    const next = current.includes(channel)
      ? current.filter((c) => c !== channel)
      : [...current, channel];
    setMatrixJson(JSON.stringify({ ...matrix, [severity]: next }));
  };

  const selectedRoles = JSON.parse(roles);
  const selectedProfiles = profileIds ? profileIds.split(",").filter(Boolean) : [];
  const toggleProfile = (id) =>
    setProfileIds(
      (selectedProfiles.includes(id)
        ? selectedProfiles.filter((p) => p !== id)
        : [...selectedProfiles, id]
      ).join(",")
    );
  const knownProfileIds = new Set((profiles ?? []).map((p) => String(p.id).toLowerCase()));
  // Selected but gone — deleted after the rule saved, or never this
  // tenant's. Shown so they can be removed, never silently dropped.
  const missingProfiles = profiles ? selectedProfiles.filter((id) => !knownProfileIds.has(id)) : [];

  const parsed = parseRecipients(emails);
  const { invalid, unique, overCap, ok } = validateRecipients(parsed);

  const dirty =
    emails.trim() !== initialEmails.trim() ||
    roles !== initialRoles ||
    profileIds !== initialProfiles ||
    matrixJson !== initialMatrix;

  const mailSeverities = severitiesFor(matrix, "email");

  const helper = invalid.length
    ? `Not a valid address: ${invalid.slice(0, 2).join(", ")}${invalid.length > 2 ? "…" : ""}`
    : overCap
      ? `Too many recipients (${unique.length}). At most ${MAX_RECIPIENTS}.`
      : unique.length === 0
        ? "For mailboxes that are not people — soc@, a ticket queue. For people, use a profile or a role above."
        : `${unique.length} recipient${unique.length === 1 ? "" : "s"}. Digest per rule, deduplicated — you are told once per finding.`;

  const handleSave = () => {
    // buildNotifyPayload carries `members` over from the saved rule — this
    // editor has no control for it, and rebuilding the object from email +
    // roles alone used to erase it on every save.
    onSave(
      buildNotifyPayload({
        current: rule?.notify,
        emails: unique,
        roles: selectedRoles,
        profiles: selectedProfiles,
        matrix,
        minSeverity,
      })
    );
  };

  // Cuenta TODOS los destinos, incluidos los `members` que este editor no
  // enseña pero conserva: si los hay, la regla apunta a alguien.
  const targetCount =
    unique.length +
    selectedRoles.length +
    selectedProfiles.length +
    (Array.isArray(rule?.notify?.members) ? rule.notify.members.length : 0);
  const gap = describeDeliveryGap({ targetCount, mailSeverities });

  const reachColor = { ok: BRAND.tealText, warning: BRAND.alert.warningText, error: BRAND.alert.errorText, muted: BRAND.gray };

  return (
    <Box sx={{ mt: 1.25, pt: 1.25, borderTop: `1px dashed ${BRAND.border}` }}>
      <Typography
        variant="caption"
        sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 1 }}
      >
        Delivery
      </Typography>

      <Box sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 0.75 }}>
          Where each severity goes. <strong>Console cannot be switched off</strong> — the feed is
          the record; the other columns are deliveries.
        </Typography>

        <Box sx={{ display: "grid", gridTemplateColumns: "auto repeat(3, 76px)", gap: 0.5, alignItems: "center" }}>
          <Box />
          {NOTIFY_CHANNELS.map((channel) => (
            <Typography
              key={channel}
              sx={{ fontSize: TEXT.xs, fontWeight: 700, color: BRAND.gray, textAlign: "center", textTransform: "uppercase" }}
            >
              {channel}
              {PENDING_CHANNELS.includes(channel) ? " *" : ""}
            </Typography>
          ))}

          {MATRIX_SEVERITIES.map((severity) => (
            <React.Fragment key={severity}>
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600, color: BRAND.dark, pr: 1 }}>
                {severity}
              </Typography>
              {NOTIFY_CHANNELS.map((channel) => {
                const on = (matrix[severity] ?? []).includes(channel);
                const locked = channel === "console" || PENDING_CHANNELS.includes(channel);
                return (
                  <Box key={channel} sx={{ textAlign: "center" }}>
                    <Chip
                      size="small"
                      label={on ? "on" : "·"}
                      onClick={busy || locked ? undefined : () => toggleChannel(severity, channel)}
                      sx={{
                        width: 54,
                        cursor: busy || locked ? "default" : "pointer",
                        fontWeight: 700,
                        fontSize: TEXT.xs,
                        opacity: PENDING_CHANNELS.includes(channel) ? 0.45 : 1,
                        bgcolor: on ? BRAND.tealSoft : BRAND.surfaceMuted,
                        color: on ? BRAND.tealText : BRAND.gray,
                      }}
                    />
                  </Box>
                );
              })}
            </React.Fragment>
          ))}
        </Box>

        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 0.75 }}>
          {mailSeverities.length === 0
            ? "Console only — nothing is delivered for this rule. That is a choice, and it reads as one."
            : `Email for ${mailSeverities.join(", ")}.`}
          {" * push is not built yet (ADR-0007 phase 3)."}
        </Typography>
      </Box>

      {profiles !== null ? (
        <Box sx={{ mb: 1.5 }}>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 0.75 }}>
            Notify a profile — a named audience you edit once and every rule that uses it follows.
          </Typography>
          {profiles.length === 0 && missingProfiles.length === 0 ? (
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
              No profiles yet.{" "}
              {onManageProfiles ? (
                <Button size="small" onClick={onManageProfiles} sx={{ textTransform: "none", p: 0, minWidth: 0 }}>
                  Create one
                </Button>
              ) : null}
            </Typography>
          ) : (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              {profiles.map((p) => {
                const id = String(p.id).toLowerCase();
                const on = selectedProfiles.includes(id);
                return (
                  <Chip
                    key={id}
                    size="small"
                    label={p.name}
                    aria-pressed={on}
                    onClick={busy ? undefined : () => toggleProfile(id)}
                    sx={{
                      cursor: busy ? "default" : "pointer",
                      fontWeight: 700,
                      fontSize: TEXT.xs,
                      bgcolor: on ? BRAND.tealSoft : BRAND.surfaceMuted,
                      color: on ? BRAND.tealText : BRAND.gray,
                    }}
                  />
                );
              })}
              {missingProfiles.map((id) => (
                <Tooltip key={id} title="This profile no longer exists. Click to remove it from the rule." arrow>
                  <Chip
                    size="small"
                    label="Missing profile"
                    onDelete={busy ? undefined : () => toggleProfile(id)}
                    sx={{ fontWeight: 700, fontSize: TEXT.xs, bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.errorText }}
                  />
                </Tooltip>
              ))}
            </Stack>
          )}
        </Box>
      ) : null}

      <Box sx={{ mb: 1.5 }}>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 0.75 }}>
          Notify by role — the address comes from the member record, so someone who leaves
          the tenant stops being notified without anyone editing this rule.
        </Typography>
        <RoleChips
          options={roleOptions}
          selected={selectedRoles}
          onChange={(next) => setRoles(JSON.stringify(next))}
          busy={busy}
        />
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
          sx={{ flex: 1, minWidth: 0, "& textarea": { fontSize: TEXT.sm } }}
        />
      </Stack>

      {gap ? (
        <Typography
          role="alert"
          sx={{ fontSize: TEXT.sm, color: BRAND.alert.warningText, mt: 1, overflowWrap: "anywhere" }}
        >
          ⚠ {gap.text}
        </Typography>
      ) : null}

      {canPreview && reach ? (
        <Typography
          role="status"
          sx={{ fontSize: TEXT.xs, color: reachColor[reach.tone] ?? BRAND.gray, mt: 1, overflowWrap: "anywhere" }}
        >
          {dirty ? "As saved — " : ""}
          {reach.text}
        </Typography>
      ) : null}

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
