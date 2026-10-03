// src/components/DeviceManagement/MdmDevicesTab.jsx
//
// Los equipos gestionados, por los dos canales:
//   - MDM: Macs, iPhones y iPads enrolados con perfil (`/api/v1/mdm/devices`).
//   - App (MAM): la app de Tracenium en iPhone o Android, que reporta como un
//     cliente más (Asset Management).
//
// El cajón enseña lo que el servidor sabe del equipo y sus acciones: las MDM
// (MdmDeviceActionsPanel) y, en un equipo con la app, las de la app —bloquearla,
// borrado selectivo, mensaje— (MobileCommandsPanel). Éstas vivían en Asset
// Management y se enlazaban desde aquí con un botón que no abría el equipo; se
// mudaron el 3-oct-2026 para que MDM / MAM sea un sitio completo (App Review
// entra sólo aquí, con la capacidad `enrollment`).
//
// `?mdmDevice=<clave de fila>` abre ese equipo al llegar (Asset Management
// manda aquí los móviles con la app).

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";

import SectionPaper from "../common/SectionPaper";
import { wakeMdmDevice } from "../../api/mdm";
import PlatformChip from "../common/PlatformChip";
import { BRAND, TEXT } from "../../theme/brand";
import { formatDate, formatRelative } from "../../utils/format";
import {
  appDeviceView,
  mdmDeviceName,
  mdmDeviceStatus,
  mdmPlatform,
  ownershipLabel,
  describeDevicePush,
  describeWakeResult,
} from "./mdmModel";
import { Field, FieldGrid, StatusChip } from "./mdmAtoms";
import MdmOsUpdatePanel from "./MdmOsUpdatePanel";
import MdmOrgProfilePanel from "./MdmOrgProfilePanel";
import MdmDeclarativePanel from "./MdmDeclarativePanel";
import MdmDeviceActionsPanel from "./MdmDeviceActionsPanel";
import MobileCommandsPanel from "./MobileCommandsPanel";
import { getSearchParam, updateSearchParams } from "../../utils/browserState";

function rowsFrom(mdmDevices, appDevices) {
  const mdm = mdmDevices.map((d) => ({
    key: `mdm:${d.udid}`,
    channel: "mdm",
    name: mdmDeviceName(d),
    serial: d.serialNumber,
    platform: mdmPlatform(d),
    channelLabel: `MDM · ${ownershipLabel(d.ownership)}`,
    status: mdmDeviceStatus(d),
    lastSeenAt: d.lastSeenAt,
    device: d,
  }));
  const app = appDevices.map((row) => {
    const v = appDeviceView(row);
    return {
      key: `app:${v.id || v.name}`,
      channel: "app",
      name: v.name,
      serial: null,
      platform: v.platform,
      channelLabel: "App (MAM)",
      status: { label: "Reporting", tone: "positive" },
      lastSeenAt: v.lastSeenAt,
      device: v,
    };
  });
  return [...mdm, ...app];
}

export default function MdmDevicesTab({
  mdm,
  appDevices,
  onOpenTab,
  canConfigure = false,
  /** Órdenes a la app (bloquear, borrado selectivo, mensaje): `enrollment` o `device_management`. */
  canCommandApp = false,
  /** Localizar el teléfono: sólo `device_management`. */
  canLocateApp = false,
  notify,
  onChanged,
}) {
  const [channel, setChannel] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState(null);

  const all = React.useMemo(() => rowsFrom(mdm.devices, appDevices), [mdm.devices, appDevices]);

  // Abrir el equipo que pide la URL en cuanto su fila exista (las dos fuentes
  // llegan por separado), y olvidar el parámetro: si no, cerrar el cajón y
  // recargar lo volvería a abrir.
  const [requestedKey, setRequestedKey] = React.useState(() => getSearchParam("mdmDevice", "") || null);
  React.useEffect(() => {
    if (!requestedKey) return;
    const row = all.find((r) => r.key === requestedKey);
    if (!row) return;
    setSelected(row);
    setRequestedKey(null);
    updateSearchParams({ mdmDevice: null });
  }, [requestedKey, all]);
  // El cajón enseña la fila de ESTA carga: tras recargar (p. ej. al pedir la
  // baja) su estado cambia sin cerrarlo.
  const current = selected ? all.find((r) => r.key === selected.key) ?? selected : null;
  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((r) => {
      if (channel !== "all" && r.channel !== channel) return false;
      if (!q) return true;
      return [r.name, r.serial, r.device?.udid].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [all, channel, query]);

  const counts = React.useMemo(
    () => ({ all: all.length, mdm: all.filter((r) => r.channel === "mdm").length, app: all.filter((r) => r.channel === "app").length }),
    [all]
  );

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {mdm.access === "forbidden" ? (
        <Alert severity="info" sx={{ borderRadius: 3 }}>
          Devices enrolled by MDM are only listed for roles with the Enrollment capability.
        </Alert>
      ) : null}

      <SectionPaper variant="panel" sx={{ p: 0, overflow: "hidden" }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center", p: { xs: 1.5, sm: 2 } }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark, mr: "auto" }}>Managed devices</Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={channel}
            onChange={(_e, v) => v && setChannel(v)}
            aria-label="Management channel"
          >
            <ToggleButton value="all" sx={{ textTransform: "none", fontWeight: 700 }}>All · {counts.all}</ToggleButton>
            <ToggleButton value="mdm" sx={{ textTransform: "none", fontWeight: 700 }}>MDM · {counts.mdm}</ToggleButton>
            <ToggleButton value="app" sx={{ textTransform: "none", fontWeight: 700 }}>App · {counts.app}</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            size="small"
            placeholder="Search name or serial"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputProps={{ "aria-label": "Search devices" }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 220 }}
          />
        </Box>
        <Divider sx={{ borderColor: BRAND.border }} />

        {all.length === 0 ? (
          <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>
              No managed devices yet. Macs, iPhones and iPads appear here when they enroll with a
              link from Enrollment; phones with the Tracenium app, when the app enrolls.
            </Typography>
            <Button
              variant="outlined"
              onClick={() => onOpenTab("enrollment")}
              sx={{ textTransform: "none", fontWeight: 700, borderColor: BRAND.teal, color: BRAND.tealText }}
            >
              Go to Enrollment
            </Button>
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" sx={{ minWidth: 760 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Device</TableCell>
                  <TableCell>Platform</TableCell>
                  <TableCell>Channel</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last check-in</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.key}
                    hover
                    selected={selected?.key === r.key}
                    onClick={() => setSelected(r)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark }}>{r.name}</Typography>
                      {r.serial ? (
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>{r.serial}</Typography>
                      ) : null}
                    </TableCell>
                    <TableCell><PlatformChip platform={r.platform} /></TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{r.channelLabel}</TableCell>
                    <TableCell><StatusChip status={r.status} /></TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{formatRelative(r.lastSeenAt)}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        No devices match this filter.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionPaper>

      <Drawer
        anchor="right"
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        // Como los demás cajones de detalle: a 380 px se veía encimado (1-oct).
        PaperProps={{ sx: { width: { xs: "100%", sm: 600, lg: 720 }, maxWidth: "100%", p: { xs: 2, sm: 3 } } }}
      >
        {current ? (
          <DeviceDetail
            row={current}
            commands={mdm.status?.commands ?? null}
            onClose={() => setSelected(null)}
            onOpenTab={onOpenTab}
            canConfigure={canConfigure}
            canCommandApp={canCommandApp}
            canLocateApp={canLocateApp}
            notify={notify}
            onChanged={onChanged}
          />
        ) : null}
      </Drawer>
    </Box>
  );
}

function DeviceDetail({ row, commands, onClose, onOpenTab, canConfigure, canCommandApp, canLocateApp, notify, onChanged }) {
  const d = row.device;
  const [waking, setWaking] = React.useState(false);
  // Cómo le llegan las órdenes: con Apple push en segundos; sin él, un Mac en
  // su conexión automática (~4 h) y un iPhone/iPad nunca por su cuenta.
  const push = row.channel === "mdm" ? describeDevicePush(d, row.platform, commands, formatRelative) : null;

  async function askToCheckIn() {
    setWaking(true);
    try {
      const r = describeWakeResult(await wakeMdmDevice(d.udid), row.name);
      notify?.(r.text, r.severity);
    } catch (err) {
      notify?.(err?.body?.message || err?.message || "Could not ask the device to check in.", "error");
    } finally {
      setWaking(false);
    }
  }
  return (
    <Box sx={{ display: "grid", gap: 2 }} aria-label="Device detail">
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.lg }}>{row.name}</Typography>
          <Box sx={{ display: "flex", gap: 0.75, mt: 0.75, flexWrap: "wrap" }}>
            <StatusChip status={row.status} />
            <StatusChip status={{ label: row.channelLabel, tone: "muted" }} />
          </Box>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {row.channel === "mdm" ? (
        <>
          <FieldGrid>
            <Field label="Serial number" mono>{d.serialNumber || "—"}</Field>
            <Field label="Model" mono>{d.productName || d.model || "—"}</Field>
            <Field label="Operating system">
              {d.osVersion ? `${d.osVersion}${d.buildVersion ? ` (${d.buildVersion})` : ""}` : "—"}
            </Field>
            <Field label="Ownership">{ownershipLabel(d.ownership)}</Field>
            <Field label="Enrolled">{formatDate(d.enrolledAt)}</Field>
            <Field label="Last check-in">{formatRelative(d.lastSeenAt)}</Field>
            {row.platform === "macos" ? (
              // La credencial de propietario del volumen que el Mac nos confía:
              // en Apple silicon autoriza actualizaciones de macOS sin contraseña.
              // Sólo la fecha — el token no sale nunca del servidor.
              <Field label="Bootstrap token">
                {d.bootstrapTokenEscrowedAt ? `Escrowed ${formatDate(d.bootstrapTokenEscrowedAt)}` : "Not escrowed"}
              </Field>
            ) : null}
          </FieldGrid>
          <Field label="UDID" mono>{d.udid}</Field>
          {d.enrollmentState === "checked_out" && d.removal ? (
            // «Remove from management»: lo pidió TI, no es un perfil quitado a mano.
            <Typography variant="body2" sx={{ color: "text.secondary" }} aria-label="Removed from management">
              Removed from management {formatRelative(d.checkedOutAt)} · requested by an admin
              {d.removal.reason ? `: “${d.removal.reason}”` : ""}.
            </Typography>
          ) : null}
          <Divider sx={{ borderColor: BRAND.border }} />
          <Box>
            <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700 }}>
              Commands
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: push.error ? BRAND.alert.errorText : "text.secondary", fontWeight: push.error ? 600 : 400, mt: 0.5 }}
            >
              {push.text}
            </Typography>
            {canConfigure && d.enrollmentState === "enrolled" && d.pushReady && d.needsReEnrollment !== true ? (
              <Button
                variant="outlined"
                onClick={askToCheckIn}
                disabled={waking}
                sx={{ mt: 1, mr: 1, textTransform: "none", fontWeight: 700 }}
              >
                {waking ? "Asking…" : "Ask to check in"}
              </Button>
            ) : null}
            {d.needsReEnrollment === true ? (
              <Button
                variant="outlined"
                onClick={() => onOpenTab?.("enrollment")}
                sx={{ mt: 1, textTransform: "none", fontWeight: 700, borderColor: BRAND.teal, color: BRAND.tealText }}
              >
                Create enrollment link
              </Button>
            ) : null}
          </Box>
          {d.enrollmentState === "enrolled" ? (
            <MdmDeviceActionsPanel
              udid={d.udid}
              name={row.name}
              serialNumber={d.serialNumber}
              platform={row.platform}
              canConfigure={canConfigure}
              notify={notify}
              onDeviceChanged={onChanged}
            />
          ) : null}
          {d.enrollmentState === "enrolled" ? <MdmDeclarativePanel udid={d.udid} platform={row.platform} /> : null}
          {d.enrollmentState === "enrolled" ? (
            <MdmOrgProfilePanel udid={d.udid} canConfigure={canConfigure} notify={notify} platform={row.platform} />
          ) : null}
          {/* Forzar una versión a mano elige de lo que encontró el AGENTE del
              Mac; un iPhone/iPad no tiene agente: su mínima va por la política. */}
          {d.enrollmentState === "enrolled" && row.platform === "macos" ? (
            <MdmOsUpdatePanel udid={d.udid} canConfigure={canConfigure} notify={notify} />
          ) : null}
        </>
      ) : (
        <>
          <FieldGrid>
            <Field label="Platform"><PlatformChip platform={d.platform} /></Field>
            <Field label="Last check-in">{formatRelative(d.lastSeenAt)}</Field>
          </FieldGrid>
          <Divider sx={{ borderColor: BRAND.border }} />
          <MobileCommandsPanel
            deviceId={d.id || null}
            platform={d.platform}
            disabled={!canCommandApp}
            allowLocate={canLocateApp}
          />
        </>
      )}
    </Box>
  );
}
