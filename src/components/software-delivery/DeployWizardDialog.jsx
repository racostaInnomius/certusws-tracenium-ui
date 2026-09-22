// src/components/software-delivery/DeployWizardDialog.jsx
//
// SDP — Phase 1-H. Two-step deploy wizard for fanning a catalog
// package out to a target.
//
// Steps:
//   1. Target — pick an Asset Group (filtered by package platform when
//              possible) OR enter a manual list of device IDs.
//   2. Review — package summary, target summary, fire button.
//
// Why only two steps: the package is already chosen (the wizard is opened
// from a row's "Deploy" button, so packageId is known). The operator picks a
// mode (install / reinstall / uninstall) and WHEN it goes out on the Target
// step — ahora o a una hora concreta, con la ventana de mantenimiento como
// opción de las dos.

import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Box,
  TextField,
  MenuItem,
  Chip,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Radio,
  RadioGroup,
  FormControlLabel,
  Checkbox,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Tooltip,
  FormHelperText,
} from "@mui/material";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import BrandTimeField from "../common/BrandTimeField";
import { listAssetGroups } from "../../api/assetGroups";
import { listAllKnownDevices } from "../../api/jobs";
import KnownDevicesPicker from "../AssetGroups/KnownDevicesPicker";
import { listFrom } from "../../api/shape";
import { formatDate } from "../../utils/format";
import {
  MAX_SCHEDULE_HORIZON_DAYS,
  parseScheduleInput,
  toLocalInputValue,
  dispatchSentence as buildDispatchSentence,
} from "./deploymentSchedule";

const STEPS = ["Target", "Review"];

// Detection-rule types that carry a removable identity the agent can uninstall
// by (MSI ProductCode / app bundle / pkg receipt / dpkg / rpm). file_exists and
// command_exit are presence probes with nothing to remove.
const REMOVABLE_RULE_TYPES = new Set([
  "registry_uninstall",
  "bundle_version",
  "pkg_receipt",
  "dpkg_installed",
  "rpm_installed",
]);

// A package is uninstallable when its detection rule yields a removable
// identity, or it ships explicit silent uninstall args (Windows EXE path).
function canUninstall(pkg) {
  if (!pkg) return false;
  if (pkg.silentUninstallArgs && String(pkg.silentUninstallArgs).trim()) return true;
  return Boolean(pkg.detectionRule && REMOVABLE_RULE_TYPES.has(pkg.detectionRule.type));
}

const MODE_LABELS = { install: "Install", reinstall: "Reinstall", uninstall: "Uninstall" };

// Phase C — ring rollout presets. "fast" = single 100% wave (no rollout body);
// "conservative" = 1% canary → 10% early → 100% broad with success gates.
const CONSERVATIVE_ROLLOUT = {
  rings: [
    { percent: 1, minSuccessRate: 0.9, soakMinutes: 30 },
    { percent: 10, minSuccessRate: 0.9, soakMinutes: 60 },
    { percent: 100 },
  ],
};

export default function DeployWizardDialog({
  open,
  pkg,           // SoftwarePackageDto (the row the operator clicked Deploy on)
  onClose,
  onConfirm,     // async (deployBody) → handled by parent
  notify,
}) {
  const [activeStep, setActiveStep] = React.useState(0);

  // ── Deployment mode ───────────────────────────────────────────
  const [mode, setMode] = React.useState("install");
  const uninstallable = React.useMemo(() => canUninstall(pkg), [pkg]);

  // ── Rollout preset (Phase C) ──────────────────────────────────
  const [rolloutPreset, setRolloutPreset] = React.useState("fast");

  // ── ¿Esperar a la ventana de mantenimiento? ───────────────────
  //
  // ⚠️ APAGADO POR DEFECTO, y antes era obligatorio y ni se veía. Las ventanas
  // son de Patch Management: existen para reinicios y parches. Heredarlas aquí
  // hacía que un software enviado a las 17:12 llegara a las 22:00, mientras el
  // MISMO paquete pedido por el usuario desde su bandeja salía al instante.
  // Quien sí quiere esperar —desinstalar, instaladores que reinician, envíos
  // grandes por WAN— lo marca aquí.
  const [waitForWindow, setWaitForWindow] = React.useState(false);

  // ── ¿Ahora, o a una hora? ─────────────────────────────────────
  //
  // «now» por defecto: programar es la excepción, y un asistente que abre con
  // un selector de fecha invita a rellenarlo.
  const [scheduleMode, setScheduleMode] = React.useState("now");
  // Fecha y hora por separado: la hora es un BrandTimeField (el desplegable
  // del `datetime-local` nativo lo pinta el navegador en azul y ningún CSS lo
  // alcanza). La cadena de siempre —«YYYY-MM-DDTHH:MM», hora de pared local—
  // se deriva de las dos, así que `parseScheduleInput` y lo que viaja al
  // backend no cambian. Mientras falte una de las dos, no hay hora.
  const [scheduleDate, setScheduleDate] = React.useState("");
  const [scheduleTime, setScheduleTime] = React.useState("");
  const scheduleAt = scheduleDate && scheduleTime ? `${scheduleDate}T${scheduleTime}` : "";

  // Límites del selector, en hora de pared local. Con `min`/`max` el navegador
  // ya impide lo imposible; la validación de abajo es la que da el porqué.
  const scheduleBounds = React.useMemo(() => {
    // Se recalculan al abrir: unos límites congelados desde hace horas dejarían
    // elegir una hora que ya pasó.
    if (!open) return { min: "", max: "" };
    const now = new Date();
    return {
      min: toLocalInputValue(new Date(now.getTime() + 60_000)),
      max: toLocalInputValue(
        new Date(now.getTime() + MAX_SCHEDULE_HORIZON_DAYS * 24 * 3600_000)
      ),
    };
  }, [open]);

  const localZoneLabel = React.useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
    } catch {
      return "local time";
    }
  }, []);

  // Se valida mientras escribe, pero el error sólo aparece cuando hay algo
  // escrito: un campo recién abierto no es un campo mal rellenado.
  const schedule = React.useMemo(
    () => (scheduleMode === "later" ? parseScheduleInput(scheduleAt) : { ok: true, iso: null }),
    [scheduleMode, scheduleAt]
  );
  // Con sólo una de las dos puestas también se avisa («Pick a date and time.»):
  // si no, el botón queda apagado sin decir por qué.
  const scheduleError =
    scheduleMode === "later" && (scheduleDate || scheduleTime) && !schedule.ok ? schedule.message : "";

  const dispatchSentence = React.useMemo(
    () => buildDispatchSentence({ at: schedule.ok ? schedule.at : null, waitForWindow }, formatDate),
    [schedule.ok, schedule.at, waitForWindow]
  );

  // ── Target state ──────────────────────────────────────────────
  const [targetMode, setTargetMode] = React.useState("asset_group");
  const [groupCatalog, setGroupCatalog] = React.useState([]);
  const [groupId, setGroupId] = React.useState("");
  const [deviceIdsRaw, setDeviceIdsRaw] = React.useState("");
  // Devices chosen from the picker. A Set because the picker owns toggling and
  // the parent owns the selection — same contract Asset Groups uses.
  const [pickedIds, setPickedIds] = React.useState(() => new Set());
  // deviceId → hostname, para poder rotular la revisión con el nombre con el
  // que el operador ubica el equipo en vez de con su UUID.
  //
  // ⚠️ SE ACUMULA Y NO SE PODA AL DESELECCIONAR. Un id que sale de la
  // selección puede volver a entrar, y volver a pedir su hostname para
  // reconstruir lo que ya sabíamos sería trabajo por nada. La revisión sólo
  // lee las claves que están en `parsedDeviceIds`, así que sobrar aquí no
  // enseña de más.
  const [hostnameById, setHostnameById] = React.useState(() => new Map());
  // "picker" | "paste". Pasting stays available for lists that arrive from a
  // ticket or a CSV, but it is no longer the only way in.
  const [manualMode, setManualMode] = React.useState("picker");
  // Device IDs from the pasted list that no known device matches. Surfaced
  // BEFORE dispatch: an unknown id used to be accepted, dispatched and left to
  // die as `stream_not_found`, so the operator believed they had targeted five
  // machines when they had targeted four.
  const [unknownPastedIds, setUnknownPastedIds] = React.useState([]);
  const [validatingPaste, setValidatingPaste] = React.useState(false);

  const [submitting, setSubmitting] = React.useState(false);

  // Reset whenever the dialog opens
  React.useEffect(() => {
    if (!open) return;
    setActiveStep(0);
    setMode("install");
    setRolloutPreset("fast");
    setTargetMode("asset_group");
    setGroupId("");
    setDeviceIdsRaw("");
    setPickedIds(new Set());
    setHostnameById(new Map());
    setManualMode("picker");
    setUnknownPastedIds([]);
    setSubmitting(false);
  }, [open]);

  // Lazy-load asset groups
  React.useEffect(() => {
    if (!open) return;
    listAssetGroups()
      .then((res) => {
        const items = listFrom(res, { context: "deployWizardTargets" });
        setGroupCatalog(items);
      })
      .catch((err) => {
        notify?.("error", err?.body?.message || err?.message || "Failed to load asset groups");
        setGroupCatalog([]);
      });
  }, [open, notify]);

  const selectedGroup = React.useMemo(
    () => groupCatalog.find((g) => String(g.id) === String(groupId)) || null,
    [groupCatalog, groupId]
  );

  const pastedDeviceIds = React.useMemo(() => {
    return deviceIdsRaw
      .split(/[\s,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [deviceIdsRaw]);

  // The devices we will actually dispatch to: whichever manual sub-mode is
  // active. One derived value so validation, the summary and the payload can
  // never disagree about who is being targeted.
  const parsedDeviceIds = React.useMemo(
    () => (manualMode === "picker" ? Array.from(pickedIds) : pastedDeviceIds),
    [manualMode, pickedIds, pastedDeviceIds]
  );

  // Check pasted ids against the fleet. Debounced because it runs while the
  // operator is still typing/pasting. Fail-open: if the lookup itself errors we
  // clear the warning rather than blocking a dispatch on a flaky read.
  React.useEffect(() => {
    if (targetMode !== "device_list" || manualMode !== "paste") return;
    if (pastedDeviceIds.length === 0) {
      setUnknownPastedIds([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setValidatingPaste(true);
      try {
        // ⚠️ `pageSize: 500` era una ilusión: el backend recorta a 100 en
        // silencio. Con 101 equipos, pegar el id del 101 lo marcaba como
        // DESCONOCIDO y el despliegue lo rechazaba — un equipo real dado
        // por inexistente porque la lista contra la que se comprueba
        // venía truncada.
        const res = await listAllKnownDevices();
        const rows = listFrom(res, { context: "deployWizardKnownDevices" });
        const known = new Set(
          rows.map((d) => String(d?.deviceId || "").trim()).filter(Boolean)
        );
        if (!cancelled) {
          setUnknownPastedIds(pastedDeviceIds.filter((id) => !known.has(id)));
          // Esta respuesta YA trae el hostname de cada equipo, así que la vía
          // de pegado se rotula gratis: sin esto haría falta una segunda
          // consulta para traducir exactamente los mismos ids.
          setHostnameById((prev) => {
            const next = new Map(prev);
            for (const d of rows) {
              const id = String(d?.deviceId || "").trim();
              const host = String(d?.hostname || "").trim();
              if (id && host) next.set(id, host);
            }
            return next;
          });
        }
      } catch {
        if (!cancelled) setUnknownPastedIds([]);
      } finally {
        if (!cancelled) setValidatingPaste(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [targetMode, manualMode, pastedDeviceIds]);

  // Validation per step
  const canAdvanceFromTarget = React.useMemo(() => {
    if (targetMode === "asset_group") return Boolean(groupId);
    return parsedDeviceIds.length > 0;
  }, [targetMode, groupId, parsedDeviceIds.length]);

  const canFire = React.useMemo(() => {
    if (submitting) return false;
    // ⚠️ Una hora inválida NO puede llegar a disparar: el backend la rechaza,
    // pero el operador se lleva un 400 en vez de un envío, después de haber
    // recorrido el asistente entero.
    if (scheduleMode === "later" && !schedule.ok) return false;
    if (targetMode === "asset_group") return Boolean(groupId);
    return parsedDeviceIds.length > 0;
  }, [submitting, targetMode, groupId, parsedDeviceIds.length, scheduleMode, schedule.ok]);

  const handleFire = async () => {
    if (!canFire) return;
    setSubmitting(true);
    try {
      const rollout = rolloutPreset === "conservative" ? { rollout: CONSERVATIVE_ROLLOUT } : {};
      // Sólo se manda cuando se pide: ausente = enviar ya (el servidor decide
      // igual, pero el cuerpo dice lo que el operador eligió).
      const window = waitForWindow ? { waitForMaintenanceWindow: true } : {};
      // ⚠️ El instante, no lo que escribió. `datetime-local` da una hora de
      // pared sin zona y el backend la rechaza a propósito: sin offset
      // significaría la hora local del servidor. Ver `parseScheduleInput`.
      const when = scheduleMode === "later" && schedule.ok && schedule.iso
        ? { scheduledAt: schedule.iso }
        : {};
      const body =
        targetMode === "asset_group"
          ? { mode, assetGroupId: Number(groupId), ...rollout, ...window, ...when }
          : { mode, deviceIds: parsedDeviceIds, ...rollout, ...window, ...when };
      await onConfirm?.(body);
      // Parent closes the dialog on success
    } catch (err) {
      // Surface error inline so the operator can adjust without losing
      // the wizard state.
      notify?.(
        "error",
        err?.body?.message || err?.body?.error || err?.message || "Deploy failed"
      );
      setSubmitting(false);
    }
  };

  if (!pkg) return null;

  const platformMatchesGroups =
    targetMode === "asset_group" && selectedGroup
      ? `Note: backend evaluates membership at dispatch time. Devices in this group whose platform/arch don't match (${pkg.platform}/${pkg.arch}) will be rejected per-device with reason platform_mismatch.`
      : null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
        Deploy {pkg.name} v{pkg.version}
      </DialogTitle>

      <DialogContent dividers>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {activeStep === 0 ? (
          <Stack spacing={2}>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                border: `1px solid ${BRAND.border}`,
                bgcolor: BRAND.surfaceMuted,
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip
                  size="small"
                  label={`${pkg.platform} / ${pkg.arch}`}
                  sx={{ fontWeight: 700, bgcolor: BRAND.tealSoft, color: BRAND.tealText }}
                />
                <Chip
                  size="small"
                  label={pkg.format.toUpperCase()}
                  sx={{ fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
                />
                {pkg.requiresReboot ? (
                  <Chip
                    size="small"
                    label="reboot required"
                    sx={{
                      fontWeight: 700,
                      bgcolor: BRAND.alert?.warningSoft,
                      color: BRAND.alert?.warning,
                    }}
                  />
                ) : null}
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, ml: 1 }}>
                  {pkg.detectionRule
                    ? `Detection: ${pkg.detectionRule.type}`
                    : "No detection rule (will install on every dispatch)"}
                </Typography>
              </Stack>
            </Box>

            <TextField
              select
              size="small"
              fullWidth
              label="Mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              helperText={
                mode === "uninstall"
                  ? "Removes the package from targeted devices that have it installed."
                  : mode === "reinstall"
                  ? "Re-runs the installer even on devices already up to date."
                  : "Installs on devices that don't already have the package."
              }
            >
              <MenuItem value="install">{MODE_LABELS.install}</MenuItem>
              <MenuItem value="reinstall">{MODE_LABELS.reinstall}</MenuItem>
              <MenuItem value="uninstall" disabled={!uninstallable}>
                {MODE_LABELS.uninstall}
                {!uninstallable ? " — needs an uninstall identity or args" : ""}
              </MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              fullWidth
              label="Rollout"
              value={rolloutPreset}
              onChange={(e) => setRolloutPreset(e.target.value)}
              helperText={
                rolloutPreset === "conservative"
                  ? "Rings: 1% canary (90% success, 30m soak) → 10% (90%, 60m) → 100%. Auto-halts on a failed gate."
                  : "Everything dispatches in a single wave."
              }
            >
              <MenuItem value="fast">Fast — single wave</MenuItem>
              <MenuItem value="conservative">Conservative — canary rings</MenuItem>
            </TextField>

            {/* ── Cuándo sale ─────────────────────────────────────────────
                Las dos formas de no salir ya, juntas y en el mismo sitio: una
                hora concreta, y la ventana del tenant. Estaban separadas
                —la casilla aquí, la hora en ninguna parte— y son la MISMA
                pregunta. */}
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                border: `1px solid ${BRAND.border}`,
              }}
            >
              <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>
                When
              </Typography>

              <RadioGroup
                value={scheduleMode}
                onChange={(e) => setScheduleMode(e.target.value)}
              >
                <FormControlLabel
                  value="now"
                  control={<Radio size="small" />}
                  label={
                    <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>
                      Send now
                      <Typography component="span" sx={{ fontSize: TEXT.sm, color: BRAND.gray, ml: 1 }}>
                        Devices that are offline pick it up when they reconnect.
                      </Typography>
                    </Typography>
                  }
                />
                <FormControlLabel
                  value="later"
                  control={<Radio size="small" />}
                  label={
                    <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>
                      Schedule for a specific time
                    </Typography>
                  }
                />
              </RadioGroup>

              {scheduleMode === "later" ? (
                <Box sx={{ pl: 3.75, pt: 0.5 }}>
                  <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                    <TextField
                      type="date"
                      size="small"
                      label="Date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      // Los límites son del `datetime-local`; aquí sólo cuenta el día.
                      inputProps={{ min: scheduleBounds.min.slice(0, 10), max: scheduleBounds.max.slice(0, 10) }}
                      InputLabelProps={{ shrink: true }}
                      error={Boolean(scheduleError)}
                      sx={{ minWidth: 170 }}
                    />
                    <BrandTimeField
                      label="Time"
                      value={scheduleTime}
                      onChange={setScheduleTime}
                      error={Boolean(scheduleError)}
                      sx={{ minWidth: 140 }}
                    />
                  </Box>
                  <FormHelperText error={Boolean(scheduleError)} sx={{ mx: 0 }}>
                    {scheduleError ||
                      // ⚠️ DECIR EN QUÉ HORA SE ESTÁ HABLANDO. El operador y el
                      // tenant pueden estar en husos distintos, y una hora sin
                      // huso es la vía rápida a un envío a las 4 de la mañana.
                      `Your local time (${localZoneLabel}). Up to ${MAX_SCHEDULE_HORIZON_DAYS} days out — the package is frozen when the deployment is created.`}
                  </FormHelperText>
                </Box>
              ) : null}

              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={waitForWindow}
                    onChange={(e) => setWaitForWindow(e.target.checked)}
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>
                      Wait for the maintenance window
                    </Typography>
                    <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                      {waitForWindow
                        ? scheduleMode === "later"
                          ? "Goes out at the later of the two: your time, or the next window after it."
                          : "Held until the tenant's next window opens. Use it when the install interrupts — a reboot, closing the app, or a large download."
                        : "The tenant's maintenance windows are ignored — they exist for patching."}
                    </Typography>
                  </Box>
                }
                sx={{ alignItems: "flex-start", m: 0, mt: 1 }}
              />
            </Box>

            <RadioGroup
              row
              value={targetMode}
              onChange={(e) => setTargetMode(e.target.value)}
            >
              <FormControlLabel
                value="asset_group"
                control={<Radio />}
                label="Asset group"
              />
              <FormControlLabel
                value="device_list"
                control={<Radio />}
                label="Manual device list"
              />
            </RadioGroup>

            {targetMode === "asset_group" ? (
              <TextField
                select
                size="small"
                fullWidth
                label="Asset group"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                helperText={
                  groupCatalog.length === 0
                    ? "No asset groups available — create one from the Asset Groups page or use a manual device list"
                    : "Membership is evaluated at dispatch time (dynamic groups re-query criteria)."
                }
              >
                {groupCatalog.map((g) => (
                  <MenuItem key={g.id} value={String(g.id)}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography sx={{ fontSize: TEXT.md, fontWeight: 600 }}>{g.name}</Typography>
                      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
                        {g.kind === "dynamic" ? "dyn" : "static"}
                        {Number.isFinite(g.memberCount) ? ` · ${g.memberCount}` : ""}
                      </Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <Stack spacing={1.5}>
                {/*
                  This used to be a bare textarea asking for device IDs. Nobody
                  knows those by heart, so the only way to target five loose
                  machines was to leave for Asset Management and copy-paste an
                  opaque UUID five times. The picker below already existed —
                  Asset Groups uses it to choose members — it was simply never
                  wired in here.
                */}
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={manualMode}
                  onChange={(_e, v) => v && setManualMode(v)}
                >
                  <ToggleButton value="picker">Select devices</ToggleButton>
                  <ToggleButton value="paste">Paste IDs</ToggleButton>
                </ToggleButtonGroup>

                {manualMode === "picker" ? (
                  <KnownDevicesPicker
                    open={open}
                    selectedIds={pickedIds}
                    onToggleDevice={(deviceId, device) => {
                      // El hostname llega con la fila y se guarda al vuelo:
                      // pedirlo otra vez en la revision seria una consulta
                      // para recuperar algo que ya tuvimos en la mano.
                      if (device?.hostname) {
                        setHostnameById((prev) => {
                          if (prev.get(deviceId) === device.hostname) return prev;
                          const next = new Map(prev);
                          next.set(deviceId, device.hostname);
                          return next;
                        });
                      }
                      setPickedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(deviceId)) next.delete(deviceId);
                        else next.add(deviceId);
                        return next;
                      });
                    }}
                    selectedLabel="target(s)"
                    emptyLabel="No devices match this package's platform."
                    // Offering a macOS .pkg to Windows hosts is a guaranteed
                    // failure the operator only discovers when the job returns.
                    platformFilter={pkg?.platform}
                  />
                ) : (
                  <>
                    <TextField
                      size="small"
                      fullWidth
                      label="Device IDs"
                      multiline
                      minRows={3}
                      maxRows={8}
                      value={deviceIdsRaw}
                      onChange={(e) => setDeviceIdsRaw(e.target.value)}
                      placeholder={"agent-001\nagent-002\nagent-003"}
                      helperText={
                        pastedDeviceIds.length > 0
                          ? `${pastedDeviceIds.length} device(s) — split by whitespace, comma, semicolon or newline`
                          : "For lists that arrive from a ticket or a CSV. Otherwise use Select devices."
                      }
                    />
                    {validatingPaste ? (
                      <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                        Checking these IDs against the fleet…
                      </Typography>
                    ) : null}
                    {unknownPastedIds.length > 0 ? (
                      <Alert severity="warning">
                        {unknownPastedIds.length} of {pastedDeviceIds.length} IDs match no
                        known device and will never be delivered:{" "}
                        {unknownPastedIds.slice(0, 5).join(", ")}
                        {unknownPastedIds.length > 5
                          ? ` and ${unknownPastedIds.length - 5} more`
                          : ""}
                      </Alert>
                    ) : null}
                  </>
                )}
              </Stack>
            )}

            {platformMatchesGroups ? (
              <Alert
                severity="info"
                sx={{
                  bgcolor: BRAND.alert?.infoSoft,
                  color: BRAND.dark,
                  "& .MuiAlert-icon": { color: BRAND.teal },
                }}
              >
                {platformMatchesGroups}
              </Alert>
            ) : null}
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Box>
              <Typography
                variant="caption"
                sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}
              >
                Package
              </Typography>
              <Box sx={{ p: 1.5, mt: 0.5, borderRadius: 1, border: `1px solid ${BRAND.border}` }}>
                <Typography sx={{ fontWeight: 700, color: BRAND.dark }}>
                  {pkg.name} <span style={{ color: BRAND.gray, fontWeight: 500 }}>v{pkg.version}</span>
                </Typography>
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: 0.5 }}>
                  {pkg.platform} / {pkg.arch} / {pkg.format.toUpperCase()}
                  {pkg.sizeBytes ? ` · ${formatBytes(pkg.sizeBytes)}` : ""}
                </Typography>
                <Typography
                  sx={{
                    fontSize: TEXT.xs,
                    fontFamily: "monospace",
                    color: BRAND.gray,
                    mt: 0.5,
                    wordBreak: "break-all",
                  }}
                >
                  sha256 {pkg.sha256?.slice(0, 16)}…{pkg.sha256?.slice(-8)}
                </Typography>
              </Box>
            </Box>

            <Box>
              <Typography
                variant="caption"
                sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}
              >
                Target
              </Typography>
              <Box sx={{ p: 1.5, mt: 0.5, borderRadius: 1, border: `1px solid ${BRAND.border}` }}>
                {targetMode === "asset_group" ? (
                  <>
                    <Typography sx={{ fontWeight: 700, color: BRAND.dark }}>
                      Asset group: {selectedGroup?.name || groupId}
                    </Typography>
                    <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: 0.5 }}>
                      {selectedGroup?.kind === "dynamic"
                        ? "Dynamic — backend re-evaluates criteria at dispatch."
                        : "Static — current member list will be used."}
                      {Number.isFinite(selectedGroup?.memberCount)
                        ? ` ~${selectedGroup.memberCount} device(s) at last evaluation.`
                        : ""}
                    </Typography>
                  </>
                ) : (
                  <>
                    <Typography sx={{ fontWeight: 700, color: BRAND.dark }}>
                      Device list ({parsedDeviceIds.length})
                    </Typography>
                    <Box sx={{ mt: 0.75, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {/* ⚠️ HOSTNAME, NO UUID. Un `3b397991-f870-…` no le dice
                          a nadie a qué máquina va a llegar el instalador, y
                          esta es la última pantalla antes de dispararlo: es
                          justo donde el operador comprueba que son las que
                          creía. El id queda en el tooltip, porque a veces es
                          lo que hay que copiar a un ticket. Cuando no lo
                          conocemos —una lista pegada de ids que no están en
                          la flota— se enseña el id: inventar un nombre sería
                          peor que enseñar el crudo. */}
                      {parsedDeviceIds.slice(0, 30).map((id) => {
                        const host = hostnameById.get(id);
                        return (
                          <Tooltip key={id} title={host ? id : ""} placement="top">
                            <Chip
                              size="small"
                              label={host || id}
                              sx={{
                                fontFamily: host ? "inherit" : "monospace",
                                fontWeight: host ? 700 : 400,
                                fontSize: TEXT.xs,
                                bgcolor: BRAND.tealSoft,
                                color: BRAND.tealText,
                              }}
                            />
                          </Tooltip>
                        );
                      })}
                      {parsedDeviceIds.length > 30 ? (
                        <Chip
                          size="small"
                          label={`+ ${parsedDeviceIds.length - 30} more`}
                          sx={{ bgcolor: BRAND.darkSoft, color: BRAND.dark }}
                        />
                      ) : null}
                    </Box>
                  </>
                )}
              </Box>
            </Box>

            <Alert
              severity="warning"
              sx={{
                bgcolor: BRAND.alert?.warningSoft,
                color: BRAND.dark,
                "& .MuiAlert-icon": { color: BRAND.alert?.warning },
              }}
            >
              <Typography sx={{ fontSize: TEXT.md }}>
                Firing will create one <strong>{MODE_LABELS[mode].toLowerCase()}</strong> job per device.
                {pkg.detectionRule
                  ? mode === "uninstall"
                    ? " Detection will skip devices that don't have the package."
                    : mode === "reinstall"
                    ? " Detection is bypassed — the installer re-runs on every device."
                    : " Detection will skip devices that already have the package."
                  : " No detection rule — the action runs on every device."}
                {" "}Per-device cap is 1000 — split larger groups.
              </Typography>
              {/* Cuándo sale, en la misma pantalla donde se dispara: un envío
                  retenido sin decirlo se lee como que se colgó. */}
              <Typography sx={{ fontSize: TEXT.md, mt: 1 }}>
                {dispatchSentence}
              </Typography>
            </Alert>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          onClick={onClose}
          disabled={submitting}
          sx={{ textTransform: "none", color: BRAND.gray }}
        >
          Cancel
        </Button>
        {activeStep > 0 ? (
          <Button
            onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
            disabled={submitting}
            sx={{ textTransform: "none" }}
          >
            Back
          </Button>
        ) : null}
        {activeStep < STEPS.length - 1 ? (
          <Button
            onClick={() => setActiveStep((s) => Math.min(STEPS.length - 1, s + 1))}
            disabled={!canAdvanceFromTarget}
            variant="contained"
            sx={{
              textTransform: "none",
              fontWeight: 700,
              bgcolor: BRAND.teal,
              "&:hover": { bgcolor: BRAND.tealHover },
            }}
          >
            Next
          </Button>
        ) : (
          <Button
            onClick={handleFire}
            disabled={!canFire}
            variant="contained"
            startIcon={
              submitting ? (
                <CircularProgress size={14} sx={{ color: BRAND.surface }} />
              ) : (
                <RocketLaunchOutlinedIcon />
              )
            }
            sx={{
              textTransform: "none",
              fontWeight: 700,
              bgcolor: BRAND.teal,
              "&:hover": { bgcolor: BRAND.tealHover },
            }}
          >
            {submitting ? "Dispatching…" : MODE_LABELS[mode]}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
