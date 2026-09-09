// src/components/software-delivery/UninstallDetectedDialog.jsx
//
// ADR-0019 F2 — desinstalar software que salió del INVENTARIO, no del catálogo.
//
// ⚠️ POR QUÉ NO ES `DeployWizardDialog` CON OTRO MODO. Ese wizard ya tiene un
// modo `uninstall`, pero exige un paquete del catálogo: lee `pkg.version`,
// `pkg.arch`, `pkg.format`, `pkg.sha256`, `pkg.detectionRule`… en diez sitios.
// Aquí no hay paquete —Dropbox en cuatro equipos de T111 nunca fue uno— y sobre
// todo hay un paso que el wizard no tiene y que el diseño hace OBLIGATORIO: la
// vista previa por equipo (D5). No es el mismo flujo con una casilla distinta.
//
// El flujo son tres pasos y el del medio no se puede saltar:
//   1. Buscar    — el inventario, y elegir UN nombre exacto.
//   2. Equipos   — los que la tienen; todos marcados, desmarcables.
//   3. Revisar   — qué comando corre en cada uno, y qué equipos NO se tocan.

import * as React from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import DeleteSweepOutlinedIcon from "@mui/icons-material/DeleteSweepOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import { getSoftwareInventoryDetail } from "../../api/inventoryDashboard";
import { previewUninstall, uninstallDetected } from "../../api/softwareDelivery";
import { listFrom } from "../../api/shape";

const STEPS = ["Find", "Devices", "Review"];

// El endpoint de inventario topa `pageSize` en 100. Una app en más equipos que
// eso existe —el agente está en los 77, y un Chrome puede pasar de 100—, así que
// se pagina en vez de leer una página y llamarla «todos».
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

// Motivos del backend traducidos a algo que un operador pueda accionar. Si
// llega uno que no conocemos se enseña crudo: un motivo desconocido escondido
// tras «no se puede» es peor que uno feo.
const BLOCKED_COPY = {
  protected: "Protegido: desinstalarlo dejaría al equipo sin agente.",
  unsupported_source: "Origen no soportado — F1 sólo cubre el registro de Windows.",
  no_identity: "No registró ningún comando de desinstalación.",
  name_not_expressible: "El nombre lleva % o _ y no hay ProductCode con el que identificarlo.",
};

function describeBlocked(plan) {
  if (!plan || plan.ok) return "";
  return BLOCKED_COPY[plan.reason] || plan.detail || plan.reason || "Bloqueado.";
}

export default function UninstallDetectedDialog({ open, onClose, onDone, notify }) {
  const [activeStep, setActiveStep] = React.useState(0);

  const [search, setSearch] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  // Nombres EXACTOS distintos que la búsqueda encontró, con los equipos de cada
  // uno. El backend casa por igualdad, así que «Google Chrome» y «Google Chrome
  // Beta» son dos objetivos y no uno: agruparlos sería desinstalar de más.
  const [candidates, setCandidates] = React.useState([]);
  const [truncated, setTruncated] = React.useState(false);
  const [appName, setAppName] = React.useState("");

  const [selectedIds, setSelectedIds] = React.useState([]);

  const [previewing, setPreviewing] = React.useState(false);
  const [preview, setPreview] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  const reset = React.useCallback(() => {
    setActiveStep(0);
    setSearch("");
    setCandidates([]);
    setTruncated(false);
    setAppName("");
    setSelectedIds([]);
    setPreview(null);
    setError("");
  }, []);

  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const chosen = React.useMemo(
    () => candidates.find((c) => c.name === appName) || null,
    [candidates, appName]
  );

  const runSearch = async () => {
    const term = search.trim();
    if (!term) return;
    setSearching(true);
    setError("");
    try {
      const byName = new Map();
      let page = 1;
      let total = Infinity;
      let seen = 0;

      while (page <= MAX_PAGES && seen < total) {
        const res = await getSoftwareInventoryDetail({
          search: term,
          page,
          pageSize: PAGE_SIZE,
        });
        const rows = listFrom(res, { keys: ["items"], context: "uninstall.search" });
        total = Number(res?.total || rows.length);
        seen += rows.length;

        for (const row of rows) {
          const name = String(row?.name || "").trim();
          if (!name) continue;
          if (!byName.has(name)) {
            byName.set(name, { name, publisher: row?.publisher || null, devices: [] });
          }
          byName.get(name).devices.push({
            deviceId: String(row?.agentId || ""),
            hostname: row?.hostname || null,
            version: row?.version || null,
            source: row?.source || null,
          });
        }

        if (rows.length === 0) break;
        page += 1;
      }

      // Se dice cuando la lista está recortada. Un operador que cree estar
      // viendo la flota entera y ve 1.000 filas de 1.400 apunta a 1.000 y
      // piensa que apuntó a todo.
      setTruncated(seen < total);
      setCandidates([...byName.values()].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      console.error(e);
      setError("No se pudo buscar en el inventario.");
    } finally {
      setSearching(false);
    }
  };

  const pickApp = (candidate) => {
    setAppName(candidate.name);
    // Todos marcados: el caso normal es quitarla de donde esté. Desmarcar es un
    // acto deliberado, y ver la lista completa antes es lo que hace que el
    // operador se dé cuenta de que hay un equipo que no esperaba.
    setSelectedIds(candidate.devices.map((d) => d.deviceId).filter(Boolean));
    setActiveStep(1);
  };

  const toggleDevice = (deviceId) => {
    setSelectedIds((prev) =>
      prev.includes(deviceId) ? prev.filter((id) => id !== deviceId) : [...prev, deviceId]
    );
  };

  const goToReview = async () => {
    setPreviewing(true);
    setError("");
    try {
      const res = await previewUninstall(appName, selectedIds);
      setPreview({
        actionable: Array.isArray(res?.actionable) ? res.actionable : [],
        blocked: Array.isArray(res?.blocked) ? res.blocked : [],
        notInstalled: Array.isArray(res?.notInstalled) ? res.notInstalled : [],
      });
      setActiveStep(2);
    } catch (e) {
      console.error(e);
      setError(e?.body?.message || e?.message || "No se pudo calcular la vista previa.");
    } finally {
      setPreviewing(false);
    }
  };

  const confirm = async () => {
    setSubmitting(true);
    setError("");
    try {
      // Se mandan SÓLO los accionables: los bloqueados ya se explicaron y los
      // que no la tienen no hay que tocarlos. Mandar los 30 y que el backend
      // descarte 4 en silencio dejaría un despliegue con cuatro fallos que no
      // son fallos.
      const deviceIds = preview.actionable.map((r) => r.deviceId);
      const res = await uninstallDetected({ appName, deviceIds });
      notify?.("success", `Uninstall dispatched for ${appName} to ${deviceIds.length} device(s).`);
      onDone?.(res?.deployment || null);
      onClose?.();
    } catch (e) {
      console.error(e);
      // El error se queda AQUÍ y el diálogo abierto: el backend rechaza por
      // motivos que hay que leer —equipo dado de baja, ProductCodes en
      // conflicto— y un snackbar que se va en 4 s no da tiempo.
      setError(e?.body?.message || e?.message || "El despliegue fue rechazado.");
    } finally {
      setSubmitting(false);
    }
  };

  const actionableCount = preview?.actionable?.length || 0;

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <DeleteSweepOutlinedIcon sx={{ color: BRAND.tealText }} />
        Uninstall detected software
      </DialogTitle>

      <DialogContent dividers>
        <Stepper activeStep={activeStep} sx={{ mb: 2.5 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {activeStep === 0 ? (
          <Stack spacing={2}>
            <Typography sx={{ fontSize: TEXT.md, color: "text.secondary" }}>
              Busca en el inventario de la flota. Windows únicamente: las demás
              fuentes se listan pero no se pueden desinstalar todavía.
            </Typography>
            <Stack direction="row" spacing={1}>
              <TextField
                autoFocus
                fullWidth
                size="small"
                label="Application name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
              />
              <Button
                variant="contained"
                onClick={runSearch}
                disabled={searching || !search.trim()}
              >
                {searching ? "Searching…" : "Search"}
              </Button>
            </Stack>

            {truncated ? (
              <Alert severity="warning">
                La búsqueda devolvió más resultados de los que se pueden listar.
                Afina el término antes de elegir, o estarás apuntando a una parte
                de la flota creyendo que es toda.
              </Alert>
            ) : null}

            {candidates.length > 0 ? (
              <Box sx={{ border: `1px solid ${BRAND.gray}`, borderRadius: 1, maxHeight: 320, overflow: "auto" }}>
                <List dense disablePadding>
                  {candidates.map((c) => (
                    <ListItemButton key={c.name} onClick={() => pickApp(c)} divider>
                      <ListItemText
                        primary={c.name}
                        secondary={`${c.publisher || "—"} · ${c.devices.length} device(s)`}
                        primaryTypographyProps={{ fontSize: TEXT.base, fontWeight: 600 }}
                        secondaryTypographyProps={{ fontSize: TEXT.sm }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            ) : !searching && search.trim() ? (
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                Sin resultados. El nombre tiene que coincidir con el del
                inventario, que es el que el equipo registró.
              </Typography>
            ) : null}
          </Stack>
        ) : null}

        {activeStep === 1 && chosen ? (
          <Stack spacing={1.5}>
            <Typography sx={{ fontSize: TEXT.lg, fontWeight: 700 }}>{appName}</Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
              {selectedIds.length} de {chosen.devices.length} equipo(s) seleccionado(s).
            </Typography>
            <Divider />
            <Box sx={{ maxHeight: 340, overflow: "auto" }}>
              <List dense disablePadding>
                {chosen.devices.map((d) => (
                  <ListItem key={d.deviceId} disablePadding divider>
                    <ListItemButton onClick={() => toggleDevice(d.deviceId)}>
                      <Checkbox
                        edge="start"
                        size="small"
                        checked={selectedIds.includes(d.deviceId)}
                        tabIndex={-1}
                        disableRipple
                      />
                      <ListItemText
                        // El hostname es el nombre con el que un operador ubica
                        // un equipo; el ID no le dice nada. Sólo se cae al ID
                        // cuando no hay hostname.
                        primary={d.hostname || d.deviceId}
                        secondary={[d.version ? `v${d.version}` : null, d.source]
                          .filter(Boolean)
                          .join(" · ")}
                        primaryTypographyProps={{ fontSize: TEXT.base }}
                        secondaryTypographyProps={{ fontSize: TEXT.xs }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Box>
          </Stack>
        ) : null}

        {activeStep === 2 && preview ? (
          <Stack spacing={2}>
            <Alert severity="warning">
              <AlertTitle>Esto no se deshace</AlertTitle>
              No hay copia ni «deshacer». Se ejecutará el comando de abajo en
              cada equipo listado como accionable.
            </Alert>

            <Box>
              <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, mb: 0.5 }}>
                Se desinstalará en {actionableCount} equipo(s)
              </Typography>
              <Box sx={{ maxHeight: 220, overflow: "auto", border: `1px solid ${BRAND.gray}`, borderRadius: 1 }}>
                <List dense disablePadding>
                  {preview.actionable.map((r) => (
                    <ListItem key={r.deviceId} divider>
                      <ListItemText
                        primary={r.hostname || r.deviceId}
                        // El comando exacto, no una promesa de que habrá uno.
                        secondary={r.plan?.preview || "—"}
                        primaryTypographyProps={{ fontSize: TEXT.base }}
                        secondaryTypographyProps={{
                          fontSize: TEXT.xs,
                          fontFamily: "monospace",
                          sx: { wordBreak: "break-all" },
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            </Box>

            {/* Los bloqueados y los que no la tienen se ENSEÑAN. Un objetivo que
                desaparece en silencio es cómo se cree haber apuntado a 30
                habiendo apuntado a 26. */}
            {preview.blocked.length > 0 ? (
              <Box>
                <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, mb: 0.5 }}>
                  No se tocarán {preview.blocked.length} equipo(s)
                </Typography>
                <List dense disablePadding>
                  {preview.blocked.map((r) => (
                    <ListItem key={r.deviceId} divider>
                      <ListItemText
                        primary={r.hostname || r.deviceId}
                        secondary={describeBlocked(r.plan)}
                        primaryTypographyProps={{ fontSize: TEXT.base }}
                        secondaryTypographyProps={{ fontSize: TEXT.xs }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            ) : null}

            {preview.notInstalled.length > 0 ? (
              <Chip
                size="small"
                variant="outlined"
                label={`${preview.notInstalled.length} equipo(s) ya no la tienen`}
              />
            ) : null}

            {actionableCount === 0 ? (
              <Alert severity="info">
                No queda ningún equipo sobre el que actuar. No hay nada que
                desplegar.
              </Alert>
            ) : null}
          </Stack>
        ) : null}

        {error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        {activeStep > 0 ? (
          <Button onClick={() => setActiveStep((s) => s - 1)} disabled={submitting || previewing}>
            Back
          </Button>
        ) : null}
        {activeStep === 1 ? (
          <Button
            variant="contained"
            onClick={goToReview}
            disabled={selectedIds.length === 0 || previewing}
            startIcon={previewing ? <CircularProgress size={14} /> : null}
          >
            {previewing ? "Checking…" : "Preview"}
          </Button>
        ) : null}
        {activeStep === 2 ? (
          <Button
            color="error"
            variant="contained"
            onClick={confirm}
            disabled={submitting || actionableCount === 0}
          >
            {submitting ? "Dispatching…" : `Uninstall on ${actionableCount} device(s)`}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
