// src/components/DeviceManagement/MdmEnrollmentTab.jsx
//
// Dar de alta un Mac, iPhone o iPad en MDM: un enlace por equipo.
//
// ── Por qué por número de serie ─────────────────────────────────────────
// El perfil lleva un identificador que la atestación de Apple tiene que
// confirmar (ACME device-attest-01): el enlace sólo sirve en ESE equipo. Por
// eso no hay enlaces genéricos «para todo Ventas» — el servidor no los
// admitiría (certusws-tracenium, modules/mdm/acme/README.md).
//
// ── Lo que ve quien abre el enlace ──────────────────────────────────────
// Antes del perfil, el aviso de datos en tracenium.com/enroll/ (guía 5.5 de
// App Review), con el nombre de la organización y lo que el modo elegido
// permite. La tabla de permisos de abajo es la misma verdad que ese aviso:
// sale de RIGHTS_CORPORATE / RIGHTS_BYOD (modules/mdm/enrollment-profile.ts).

import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import AddLinkOutlinedIcon from "@mui/icons-material/AddLinkOutlined";

import SectionPaper from "../common/SectionPaper";
import { useConfirm } from "../common/ConfirmDialog";
import { BRAND, TEXT } from "../../theme/brand";
import { formatDate, formatRelative } from "../../utils/format";
import { createMdmEnrollment, revokeMdmEnrollment } from "../../api/mdm";
import {
  CLIENT_IDENTIFIER_RE,
  EXPIRY_OPTIONS,
  canRevokeEnrollment,
  describeMissing,
  enrollmentStatus,
  isEnrollmentActive,
  ownershipLabel,
} from "./mdmModel";
import { StatusChip } from "./mdmAtoms";

// Lo que la organización PUEDE en cada modo. Fuente: AccessRights del perfil.
const CAPABILITIES = [
  { what: "Install and remove configuration profiles and apps", corporate: true, byod: true },
  { what: "Device details and installed apps", corporate: true, byod: true },
  { what: "Security state and network information", corporate: true, byod: false },
  { what: "Lock or erase the device", corporate: true, byod: false },
];

const BUTTON_SX = { textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } };

export default function MdmEnrollmentTab({ mdm, canEnroll, onChanged, notify, onNavigate }) {
  const confirm = useConfirm();
  const [serial, setSerial] = React.useState("");
  const [mode, setMode] = React.useState("corporate");
  const [expiresInHours, setExpiresInHours] = React.useState(24);
  const [displayName, setDisplayName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState(null);
  const [touched, setTouched] = React.useState(false);

  const available = mdm.status?.enrollment?.available === true;
  const deliverable = mdm.status?.commands?.deliverable === true;
  const serialTrim = serial.trim();
  const serialValid = CLIENT_IDENTIFIER_RE.test(serialTrim);
  const disabled = !canEnroll || !available || creating;

  const copy = React.useCallback(
    (text) => {
      navigator.clipboard?.writeText(text).then(
        () => notify("Link copied", "success"),
        () => notify("Could not copy — select the link and copy it", "warning")
      );
    },
    [notify]
  );

  const submit = async (event) => {
    event.preventDefault();
    setTouched(true);
    if (!serialValid || disabled) return;
    try {
      setCreating(true);
      const res = await createMdmEnrollment({
        clientIdentifier: serialTrim,
        mode,
        expiresInHours,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      });
      setCreated(res);
      setSerial("");
      setDisplayName("");
      setTouched(false);
      notify("Enrollment link created", "success");
      await onChanged();
    } catch (e) {
      const code = e?.body?.error;
      notify(
        code === "mdm_not_configured"
          ? "Device enrollment isn't set up on this server yet."
          : e?.body?.message || "Could not create the enrollment link.",
        "error"
      );
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (enrollment) => {
    const ok = await confirm({
      title: "Revoke this enrollment link?",
      body:
        "The link stops working: nobody can download the profile with it.\n\n" +
        "A device that already enrolled stays enrolled — to remove it, remove the profile on the device.",
      confirmText: "Revoke link",
      danger: true,
    });
    if (!ok) return;
    try {
      await revokeMdmEnrollment(enrollment.token);
      if (created?.token === enrollment.token) setCreated(null);
      notify("Enrollment link revoked", "success");
      await onChanged();
    } catch (e) {
      notify(e?.body?.message || "Could not revoke the link.", "error");
    }
  };

  if (mdm.access === "forbidden") {
    return (
      <Alert severity="info" sx={{ borderRadius: 3 }}>
        Creating enrollment links needs the Enrollment capability. Ask a tenant admin.
      </Alert>
    );
  }

  // Bloques normales (no CSS grid) alrededor del `Grid` de MUI: ver MdmOverviewTab.
  return (
    <Box>
      {mdm.status && !available ? (
        <Alert severity="warning" sx={{ borderRadius: 3, mb: 2 }}>
          Device enrollment isn&apos;t set up on this server yet: it still needs{" "}
          {describeMissing(mdm.status.enrollment?.missing)}.
        </Alert>
      ) : null}
      {mdm.status && available && !deliverable && mdm.status.enrollment?.topicSource !== "organization" ? (
        <Alert severity="info" sx={{ borderRadius: 3, mb: 2 }}>
          Devices you enroll now report to Tracenium, but can&apos;t receive commands or policies until
          the Apple push certificate is set up — and will need to enroll again then.
        </Alert>
      ) : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 }, height: "100%" }}>
            <Box component="form" onSubmit={submit} noValidate sx={{ display: "grid", gap: 2 }}>
              <Box>
                <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>New enrollment link</Typography>
                <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
                  One link per device. It only works on the device with this serial number.
                </Typography>
              </Box>

              <TextField
                label="Serial number"
                size="small"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                onBlur={() => setTouched(true)}
                required
                disabled={disabled}
                error={touched && !serialValid}
                helperText={
                  touched && !serialValid
                    ? "Letters, digits, dots, dashes and underscores only."
                    : "Mac: Apple menu › About This Mac. iPhone or iPad: Settings › General › About."
                }
                inputProps={{ autoCapitalize: "characters", spellCheck: false }}
              />

              <Box>
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700 }}>
                  Ownership
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  value={mode}
                  onChange={(_e, v) => v && setMode(v)}
                  disabled={disabled}
                  aria-label="Ownership"
                  sx={{ mt: 0.5 }}
                >
                  <ToggleButton value="corporate" sx={{ textTransform: "none", fontWeight: 700 }}>
                    Organization-owned
                  </ToggleButton>
                  <ToggleButton value="byod" sx={{ textTransform: "none", fontWeight: 700 }}>
                    Personal (BYOD)
                  </ToggleButton>
                </ToggleButtonGroup>
                <Table size="small" sx={{ mt: 1 }} aria-label="What the organization can do">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>What your organization can do</TableCell>
                      <TableCell align="center" sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>Organization</TableCell>
                      <TableCell align="center" sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>Personal</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {CAPABILITIES.map((c) => (
                      <TableRow key={c.what}>
                        <TableCell sx={{ fontSize: TEXT.sm }}>{c.what}</TableCell>
                        {["corporate", "byod"].map((m) => (
                          <TableCell
                            key={m}
                            align="center"
                            sx={{
                              fontSize: TEXT.sm,
                              fontWeight: 700,
                              color: c[m] ? BRAND.alert.successText : "text.secondary",
                              bgcolor: m === mode ? BRAND.tealSoft : undefined,
                            }}
                          >
                            {c[m] ? "Yes" : "No"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>

              <FormControl size="small" disabled={disabled}>
                <InputLabel id="mdm-expiry-label">Link expires in</InputLabel>
                <Select
                  labelId="mdm-expiry-label"
                  label="Link expires in"
                  value={expiresInHours}
                  onChange={(e) => setExpiresInHours(Number(e.target.value))}
                >
                  {EXPIRY_OPTIONS.map((o) => (
                    <MenuItem key={o.hours} value={o.hours}>{o.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Profile name on the device (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={disabled}
                size="small"
                inputProps={{ maxLength: 120 }}
              />

              <Box>
                <Button type="submit" variant="contained" startIcon={<AddLinkOutlinedIcon />} disabled={disabled} sx={BUTTON_SX}>
                  {creating ? "Creating…" : "Create enrollment link"}
                </Button>
              </Box>
              {/* La app (MAM) no se enrola con perfil sino con un token: otra
                  pantalla, y es fácil venir aquí buscándola. */}
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Enrolling the Tracenium app on a phone instead?{" "}
                <Box
                  component="button"
                  type="button"
                  onClick={() => onNavigate?.("enrollment")}
                  sx={{ border: 0, p: 0, bgcolor: "transparent", color: BRAND.tealText, fontWeight: 700, cursor: "pointer", font: "inherit" }}
                >
                  Create a token in Device Enrollment
                </Box>
                .
              </Typography>
            </Box>
          </SectionPaper>
        </Grid>

        <Grid size={{ xs: 12, lg: 7 }}>
          <Box sx={{ display: "grid", gap: 2 }}>
            {created ? <CreatedLink created={created} onCopy={copy} /> : null}
            <EnrollmentLinks enrollments={mdm.enrollments} onCopy={copy} onRevoke={revoke} canEnroll={canEnroll} />
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}

function CreatedLink({ created, onCopy }) {
  return (
    <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 }, borderColor: BRAND.teal }}>
      <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>
        Link for {created.clientIdentifier}
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
        Open it on that device — Safari on iPhone or iPad, any browser on a Mac. The user reads what
        Tracenium collects, downloads the profile and approves it in Settings.
      </Typography>
      {created.url ? (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 1.5 }}>
          <TextField
            value={created.url}
            size="small"
            fullWidth
            InputProps={{ readOnly: true, sx: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: TEXT.sm } }}
            inputProps={{ "aria-label": "Enrollment link" }}
            onFocus={(e) => e.target.select()}
          />
          <Button
            variant="outlined"
            startIcon={<ContentCopyOutlinedIcon />}
            onClick={() => onCopy(created.url)}
            sx={{ textTransform: "none", fontWeight: 700, borderColor: BRAND.teal, color: BRAND.tealText, flex: "none" }}
          >
            Copy
          </Button>
        </Box>
      ) : (
        <Alert severity="warning" sx={{ mt: 1.5, borderRadius: 2 }}>
          The server didn&apos;t return a link address. Check the enrollment configuration.
        </Alert>
      )}
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1 }}>
        {ownershipLabel(created.mode)} · expires {formatDate(created.expiresAt)}
      </Typography>
    </SectionPaper>
  );
}

function EnrollmentLinks({ enrollments, onCopy, onRevoke, canEnroll }) {
  return (
    <SectionPaper variant="panel" sx={{ p: 0, overflow: "hidden" }}>
      <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>Enrollment links</Typography>
      </Box>
      {enrollments.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary", px: { xs: 1.5, sm: 2 }, pb: 2 }}>
          No enrollment links yet.
        </Typography>
      ) : (
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 620 }}>
            <TableHead>
              <TableRow>
                <TableCell>Device</TableCell>
                <TableCell>Ownership</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Expires</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {enrollments.map((e) => {
                const status = enrollmentStatus(e);
                return (
                  <TableRow key={e.token}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark }}>{e.clientIdentifier}</Typography>
                      {e.displayName ? (
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>{e.displayName}</Typography>
                      ) : null}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{ownershipLabel(e.mode)}</TableCell>
                    <TableCell><StatusChip status={status} /></TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{formatRelative(e.createdAt)}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDate(e.expiresAt)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {isEnrollmentActive(e) && e.url ? (
                        <Tooltip title="Copy link">
                          <IconButton size="small" aria-label={`Copy link for ${e.clientIdentifier}`} onClick={() => onCopy(e.url)}>
                            <ContentCopyOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                      {canEnroll && canRevokeEnrollment(e) ? (
                        <Tooltip title="Revoke link">
                          <IconButton
                            size="small"
                            aria-label={`Revoke link for ${e.clientIdentifier}`}
                            onClick={() => onRevoke(e)}
                            sx={{ color: BRAND.alert.errorText }}
                          >
                            <LinkOffOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </SectionPaper>
  );
}
