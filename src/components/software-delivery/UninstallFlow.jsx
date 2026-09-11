// src/components/software-delivery/UninstallFlow.jsx
//
// ADR-0019 F2 — desinstalar software que salió del INVENTARIO, no del catálogo.
//
// ⚠️ ERA UN DIÁLOGO DETRÁS DE UN BOTÓN EN LA BARRA DE «DEPLOYMENTS», Y EL OWNER
// NO LO ENCONTRÓ. El código estaba desplegado —la cadena aparecía en el chunk
// del portal— y aun así la función era inalcanzable: pidió explícitamente
// «separa Uninstall detected software a su propia tab» y se dejó para más
// adelante. Una función que el usuario no puede encontrar no está entregada.
//
// Ahora es una VISTA, no un diálogo, y vive en su propia pestaña. El paso 1
// —buscar en el inventario y elegir un nombre— es una vista de pleno derecho:
// tiene búsqueda, lista de candidatos y recuento por equipo, y estaba apretado
// dentro de un modal.
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
  Divider,
  List,
  ListItem,
  MenuItem,
  ListItemButton,
  ListItemText,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import DeleteSweepOutlinedIcon from "@mui/icons-material/DeleteSweepOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import { getSoftwareInventoryDetail } from "../../api/inventoryDashboard";
import { previewUninstall, uninstallDetected } from "../../api/softwareDelivery";
import { listAssetGroups } from "../../api/assetGroups";
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

export default function UninstallFlow({ onDone, notify, refreshNonce = 0 }) {
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

  // ADR-0020 D2 — «a uno, varios o un grupo de devices». Los grupos se cargan
  // una vez: son pocos, y cargarlos al pulsar el selector añadiría una espera
  // justo en el paso donde el operador decide.
  const [targetMode, setTargetMode] = React.useState("devices");
  const [groups, setGroups] = React.useState([]);
  const [groupId, setGroupId] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    listAssetGroups()
      .then((res) => {
        if (alive) setGroups(listFrom(res, { context: "uninstall.groups" }));
      })
      .catch(() => {
        // Sin grupos el modo «equipos» sigue funcionando entero; el selector
        // de grupo simplemente dice que no hay.
        if (alive) setGroups([]);
      });
    return () => {
      alive = false;
    };
  }, []);

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
    setTargetMode("devices");
    setGroupId("");
    setPreview(null);
    setError("");
  }, []);

  // ⚠️ Toda pestaña nueva tiene que responder al Refresh de la cabecera; una
  // que lo ignora enseña datos viejos con el gesto de actualizarlos.
  React.useEffect(() => {
    if (refreshNonce) reset();
  }, [refreshNonce, reset]);

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
      // Con grupo, lo resuelve el backend con la MISMA función que el
      // despliegue. Resolverlo aquí con la lista de miembros de la UI sería
      // una segunda respuesta a «¿a quién?».
      const res =
        targetMode === "group"
          ? await previewUninstall(appName, [], { assetGroupId: Number(groupId) })
          : await previewUninstall(appName, selectedIds);
      setPreview({
        actionable: Array.isArray(res?.actionable) ? res.actionable : [],
        blocked: Array.isArray(res?.blocked) ? res.blocked : [],
        notInstalled: Array.isArray(res?.notInstalled) ? res.notInstalled : [],
        retired: Array.isArray(res?.retired) ? res.retired : [],
        group: res?.group || null,
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
      //
      // ⚠️ También con grupo se mandan los ACCIONABLES y no el `assetGroupId`.
      // La vista previa es el contrato: un grupo dinámico puede cambiar entre
      // mirar y confirmar, y mandar el grupo lo re-resolvería y ejecutaría sobre
      // otra población. El precio es que el despliegue queda como «N devices»
      // en vez de con el nombre del grupo.
      const deviceIds = preview.actionable.map((r) => r.deviceId);
      const res = await uninstallDetected({ appName, deviceIds });
      notify?.("success", `Uninstall dispatched for ${appName} to ${deviceIds.length} device(s).`);
      onDone?.(res?.deployment || null);
      reset();
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
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <DeleteSweepOutlinedIcon sx={{ color: BRAND.tealText }} />
        <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark }}>
          Uninstall detected software
        </Typography>
      </Stack>

      <Box>
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
            <ToggleButtonGroup
              size="small"
              exclusive
              value={targetMode}
              onChange={(_e, v) => {
                if (v) setTargetMode(v);
              }}
              aria-label="Uninstall target"
            >
              <ToggleButton value="devices">Devices that have it</ToggleButton>
              <ToggleButton value="group">Asset group</ToggleButton>
            </ToggleButtonGroup>
            {targetMode === "devices" ? (
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                {selectedIds.length} de {chosen.devices.length} equipo(s) seleccionado(s).
              </Typography>
            ) : null}
            <Divider />
            {targetMode === "group" ? (
              <Stack spacing={1}>
                <TextField
                  select
                  size="small"
                  fullWidth
                  label="Asset group"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  helperText={
                    groups.length === 0
                      ? "No hay grupos de activos en este tenant."
                      : "Se mira cada miembro del grupo: los que no la tienen y los dados de baja se listan aparte en la revisión."
                  }
                >
                  {groups.map((g) => (
                    <MenuItem key={g.id} value={String(g.id)}>
                      {g.name}
                      {Number.isFinite(g.memberCount) ? ` · ${g.memberCount}` : ""}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            ) : (
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
            )}
          </Stack>
        ) : null}

        {activeStep === 2 && preview ? (
          <Stack spacing={2}>
            {preview.group ? (
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                Grupo «{preview.group.name}» · {preview.group.memberCount} miembro(s) ahora mismo
              </Typography>
            ) : null}
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

            {preview.retired.length > 0 ? (
              <Box>
                {/* Dados de baja: se ENSEÑAN y no se mandan. El despliegue
                    rechaza entero si lleva uno solo, y esconderlos sería
                    apuntar a menos equipos de los que el operador cree. */}
                <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, mb: 0.5 }}>
                  Dados de baja — no se tocarán {preview.retired.length} equipo(s)
                </Typography>
                <List dense disablePadding>
                  {preview.retired.map((r) => (
                    <ListItem key={r.deviceId} divider>
                      <ListItemText
                        primary={r.hostname || r.deviceId}
                        secondary={r.status}
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
      </Box>

      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 3 }}>
        <Button onClick={reset} disabled={submitting}>
          Start over
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
            disabled={
              (targetMode === "group" ? !groupId : selectedIds.length === 0) || previewing
            }
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
      </Stack>
    </Box>
  );
}
