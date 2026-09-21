// src/components/Alerts/NotifyProfilesPanel.jsx
//
// ADR-0025 — perfiles de notificaciones: audiencias con nombre (roles,
// miembros, direcciones) que las reglas apuntan POR REFERENCIA. Editar un
// perfil cambia a quién avisan todas las reglas que lo usan, sin tocarlas.
//
// Un perfil guarda QUIÉN, nunca cuándo: la matriz canal × severidad se
// queda en cada regla, porque su valor por defecto depende de la fuente.
//
// El backend valida y rechaza con nombre (el correo con errata, el rol que
// no se puede apuntar, las reglas que aún usan un perfil). Este panel lo
// enseña tal cual en vez de un «no se pudo guardar» genérico.

import * as React from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import { useConfirm } from "../common/ConfirmDialog";
import {
  createNotifyProfile,
  patchNotifyProfile,
  deleteNotifyProfile,
  getNotifyProfileRecipients,
} from "../../api/alerts";
import {
  NOTIFY_ROLES,
  MAX_RECIPIENTS,
  parseRecipients,
  validateRecipients,
  describeProfileTargets,
  describeNotifyError,
  summarizeRecipients,
} from "./notifyHelpers";

const NAME_MAX = 80;

function ProfileForm({ profile, members, canListMembers, busy, error, onSubmit, onCancel }) {
  const [name, setName] = React.useState(profile?.name ?? "");
  const [description, setDescription] = React.useState(profile?.description ?? "");
  const [roles, setRoles] = React.useState(profile?.roles ?? []);
  const [picked, setPicked] = React.useState(profile?.members ?? []);
  const [emails, setEmails] = React.useState((profile?.email ?? []).join("\n"));

  const parsed = parseRecipients(emails);
  const { invalid, unique, overCap } = validateRecipients(parsed);
  const targets = roles.length + (canListMembers ? picked.length : (profile?.members?.length ?? 0)) + unique.length;
  const nameOk = name.trim().length > 0 && name.trim().length <= NAME_MAX;
  const ok = nameOk && invalid.length === 0 && !overCap && picked.length <= MAX_RECIPIENTS && targets > 0;

  const toggle = (list, setList, value) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  // Members the profile already has that are not in the active list — they
  // left, or lost their email. Kept visible so removing them is a choice.
  const activeSubjects = new Set(members.map((m) => m.subject));
  const stale = picked.filter((s) => !activeSubjects.has(s));

  const submit = () => {
    const body = { name: name.trim(), description: description.trim() || null, roles, email: unique };
    // ⚠️ Sin permiso para listar miembros, `members` NO se envía: el PATCH
    // es parcial en el servidor y conserva los que ya tenía. Mandar `[]`
    // borraría a esas personas del perfil sin que nadie lo decidiera.
    if (canListMembers) body.members = picked;
    onSubmit(body);
  };

  return (
    <Box sx={{ mt: 1.25, pt: 1.25, borderTop: `1px dashed ${BRAND.border}` }}>
      <Stack spacing={1.5}>
        <TextField
          size="small"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          error={name.trim().length > NAME_MAX}
          helperText={name.trim().length > NAME_MAX ? `At most ${NAME_MAX} characters.` : "e.g. IT on-call, Security, Management"}
          inputProps={{ "aria-label": "Profile name" }}
        />
        <TextField
          size="small"
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          inputProps={{ "aria-label": "Profile description" }}
        />

        <Box>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 0.75 }}>
            Roles — everyone active in the role, read at send time.
          </Typography>
          <Stack direction="row" spacing={0.75}>
            {NOTIFY_ROLES.map((role) => {
              const on = roles.includes(role);
              return (
                <Chip
                  key={role}
                  size="small"
                  label={role}
                  aria-pressed={on}
                  onClick={busy ? undefined : () => toggle(roles, setRoles, role)}
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
          </Stack>
        </Box>

        <Box>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 0.5 }}>
            People — someone who leaves the tenant stops receiving without anyone editing this profile.
          </Typography>
          {canListMembers ? (
            members.length === 0 && stale.length === 0 ? (
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>No active members with an email.</Typography>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column" }}>
                {members.map((m) => (
                  <FormControlLabel
                    key={m.subject}
                    control={
                      <Checkbox
                        size="small"
                        checked={picked.includes(m.subject)}
                        onChange={() => toggle(picked, setPicked, m.subject)}
                        disabled={busy}
                      />
                    }
                    label={
                      <Typography sx={{ fontSize: TEXT.sm }}>
                        {m.email} <span style={{ color: BRAND.gray }}>· {m.role}</span>
                      </Typography>
                    }
                  />
                ))}
                {stale.map((subject) => (
                  <FormControlLabel
                    key={subject}
                    control={
                      <Checkbox size="small" checked onChange={() => toggle(picked, setPicked, subject)} disabled={busy} />
                    }
                    label={
                      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.warningText }}>
                        Inactive or removed member — receives nothing
                      </Typography>
                    }
                  />
                ))}
              </Box>
            )
          ) : (
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
              {profile?.members?.length
                ? `${profile.members.length} member(s) kept as they are — you can't list tenant members, so they can't be edited here.`
                : "You can't list tenant members. Use roles or addresses."}
            </Typography>
          )}
        </Box>

        <TextField
          size="small"
          label="Other addresses"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          disabled={busy}
          error={invalid.length > 0 || overCap}
          helperText={
            invalid.length
              ? `Not a valid address: ${invalid.slice(0, 2).join(", ")}${invalid.length > 2 ? "…" : ""}`
              : overCap
                ? `Too many addresses (${unique.length}). At most ${MAX_RECIPIENTS}.`
                : "Mailboxes that are not people — soc@, a ticket queue."
          }
          multiline
          minRows={2}
          maxRows={6}
          placeholder={"soc@example.com"}
          inputProps={{ "aria-label": "Other addresses" }}
          sx={{ "& textarea": { fontSize: TEXT.sm } }}
        />

        {error ? (
          <Typography role="alert" sx={{ fontSize: TEXT.sm, color: BRAND.alert.errorText }}>
            {error}
          </Typography>
        ) : null}
        {!error && nameOk && targets === 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
            Add a role, a person or an address — a profile has to notify someone.
          </Typography>
        ) : null}

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" onClick={onCancel} disabled={busy} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={submit}
            disabled={busy || !ok}
            sx={{ textTransform: "none", bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
          >
            {profile ? "Save profile" : "Create profile"}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/**
 * `profiles` — the tenant's profiles (already loaded by the caller).
 * `members` — active members with an email, `[]` when not listable.
 * `onChanged()` — refetch after any write.
 */
export default function NotifyProfilesPanel({ profiles, loading, members = [], canListMembers, onChanged, notify }) {
  const confirm = useConfirm();
  // "new" | profile id | null — one form open at a time; the drawer is narrow.
  const [editing, setEditing] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [reach, setReach] = React.useState({}); // id → summary

  const byEmail = React.useMemo(() => new Map(members.map((m) => [m.subject, m.email])), [members]);

  const open = (id) => {
    setError("");
    setEditing(id);
  };

  const save = async (body) => {
    setBusy(true);
    setError("");
    try {
      if (editing === "new") await createNotifyProfile(body);
      else await patchNotifyProfile(editing, body);
      notify?.("success", `Profile "${body.name}" saved`);
      setEditing(null);
      // Un perfil editado cambia a quién llega: los previews viejos mienten.
      setReach({});
      onChanged?.();
    } catch (err) {
      console.error(err);
      setError(describeNotifyError(err, "Could not save the profile"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (profile) => {
    const ok = await confirm({
      title: `Delete "${profile.name}"?`,
      body: "Rules that use it would stop notifying this audience, so a profile still in use cannot be deleted.",
      confirmText: "Delete profile",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteNotifyProfile(profile.id);
      notify?.("success", `Profile "${profile.name}" deleted`);
      onChanged?.();
    } catch (err) {
      console.error(err);
      notify?.("error", describeNotifyError(err, "Could not delete the profile"));
    } finally {
      setBusy(false);
    }
  };

  const preview = async (profile) => {
    setReach((r) => ({ ...r, [profile.id]: { tone: "muted", text: "Checking…" } }));
    try {
      const res = await getNotifyProfileRecipients(profile.id);
      setReach((r) => ({ ...r, [profile.id]: summarizeRecipients(res) }));
    } catch (err) {
      console.error(err);
      setReach((r) => ({ ...r, [profile.id]: { tone: "muted", text: "Could not work out who this reaches right now." } }));
    }
  };

  const tone = { ok: BRAND.tealText, warning: BRAND.alert.warningText, error: BRAND.alert.errorText, muted: BRAND.gray };

  return (
    <Box>
      <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 1.5 }}>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, flex: 1 }}>
          A profile is a named audience. Point rules at it instead of retyping addresses — change it once and every rule
          follows. It decides <strong>who</strong>; each rule still decides <strong>which severities</strong> are emailed.
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddOutlinedIcon />}
          onClick={() => open("new")}
          disabled={busy || editing === "new"}
          sx={{ textTransform: "none", whiteSpace: "nowrap", borderColor: BRAND.border, color: BRAND.dark }}
        >
          New profile
        </Button>
      </Stack>

      {editing === "new" ? (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, borderColor: BRAND.border }}>
          <Typography sx={{ fontWeight: 700, color: BRAND.dark }}>New profile</Typography>
          <ProfileForm
            members={members}
            canListMembers={canListMembers}
            busy={busy}
            error={error}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        </Paper>
      ) : null}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={22} />
        </Box>
      ) : profiles.length === 0 && editing !== "new" ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, py: 2 }}>
          No profiles yet. Create one — for example "IT on-call" with the ADMIN role and soc@ — and pick it in each rule's
          delivery settings.
        </Typography>
      ) : (
        <Stack spacing={1.25}>
          {profiles.map((p) => {
            const people = (p.members ?? []).map((s) => byEmail.get(s)).filter(Boolean);
            const r = reach[p.id];
            return (
              <Paper key={p.id} variant="outlined" sx={{ p: 1.5, borderColor: BRAND.border }}>
                <Stack direction="row" alignItems="flex-start" spacing={1}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, color: BRAND.dark }}>{p.name}</Typography>
                    {p.description ? (
                      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>{p.description}</Typography>
                    ) : null}
                    <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 0.5, overflowWrap: "anywhere" }}>
                      {describeProfileTargets(p)}
                      {people.length ? ` — ${people.join(", ")}` : ""}
                    </Typography>
                    <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
                      {p.ruleCount > 0 ? `Used by ${p.ruleCount} rule${p.ruleCount === 1 ? "" : "s"}` : "Not used by any rule"}
                    </Typography>
                    {r ? (
                      <Typography
                        role="status"
                        sx={{ fontSize: TEXT.xs, color: tone[r.tone] ?? BRAND.gray, mt: 0.5, overflowWrap: "anywhere" }}
                      >
                        {r.text}
                      </Typography>
                    ) : null}
                  </Box>
                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <Button size="small" onClick={() => preview(p)} disabled={busy} sx={{ textTransform: "none" }}>
                      Who gets it
                    </Button>
                    <Button
                      size="small"
                      onClick={() => open(editing === p.id ? null : p.id)}
                      disabled={busy}
                      sx={{ textTransform: "none" }}
                      aria-label={`Edit ${p.name}`}
                    >
                      {editing === p.id ? "Close" : "Edit"}
                    </Button>
                    <Button
                      size="small"
                      onClick={() => remove(p)}
                      disabled={busy}
                      sx={{ textTransform: "none", color: BRAND.alert.errorText }}
                      aria-label={`Delete ${p.name}`}
                    >
                      Delete
                    </Button>
                  </Stack>
                </Stack>
                {editing === p.id ? (
                  <ProfileForm
                    profile={p}
                    members={members}
                    canListMembers={canListMembers}
                    busy={busy}
                    error={error}
                    onSubmit={save}
                    onCancel={() => setEditing(null)}
                  />
                ) : null}
              </Paper>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
