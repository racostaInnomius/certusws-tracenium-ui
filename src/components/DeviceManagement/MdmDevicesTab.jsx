// src/components/DeviceManagement/MdmDevicesTab.jsx
//
// Los equipos gestionados, por los dos canales:
//   - MDM: Macs, iPhones y iPads enrolados con perfil (`/api/v1/mdm/devices`).
//   - App (MAM): la app de Tracenium en iPhone o Android, que reporta como un
//     cliente más (Asset Management).
//
// El cajón enseña lo que el servidor sabe del equipo. Las acciones MDM
// (bloquear, borrar) no existen todavía y no se pintan; las de la app viven
// en Asset Management y se enlazan.

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
import PlatformChip from "../common/PlatformChip";
import { BRAND, TEXT } from "../../theme/brand";
import { formatDate, formatRelative } from "../../utils/format";
import {
  appDeviceView,
  mdmDeviceName,
  mdmDeviceStatus,
  mdmPlatform,
  ownershipLabel,
} from "./mdmModel";
import { Field, StatusChip } from "./mdmAtoms";
import MdmOsUpdatePanel from "./MdmOsUpdatePanel";
import MdmOrgProfilePanel from "./MdmOrgProfilePanel";
import MdmDeclarativePanel from "./MdmDeclarativePanel";

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

export default function MdmDevicesTab({ mdm, appDevices, onNavigate, onOpenTab, canConfigure = false, notify }) {
  const [channel, setChannel] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState(null);

  const all = React.useMemo(() => rowsFrom(mdm.devices, appDevices), [mdm.devices, appDevices]);
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
        PaperProps={{ sx: { width: { xs: "100%", sm: 380 }, p: 2 } }}
      >
        {selected ? (
          <DeviceDetail
            row={selected}
            commandsReason={mdm.status?.commands?.reason ?? null}
            commandsDeliverable={mdm.status?.commands?.deliverable === true}
            onClose={() => setSelected(null)}
            onNavigate={onNavigate}
            onOpenTab={onOpenTab}
            canConfigure={canConfigure}
            notify={notify}
          />
        ) : null}
      </Drawer>
    </Box>
  );
}

/**
 * Cómo le llegan los comandos a un equipo MDM. Llegan SIEMPRE —la cola se
 * entrega cuando el equipo se conecta—; Apple push sólo cambia CUÁNDO: en
 * segundos, o en su conexión automática, cada unas 4 h (30-sep: el texto
 * anterior decía que no se le podían mandar, y el DDM de macOS ya salía así).
 */
function commandsText(device, commandsReason, deliverable) {
  if (device.needsReEnrollment === true) {
    return "Commands reach this device on its automatic check-in, about every 4 hours. It enrolled with a different push topic than your organization's Apple push certificate, so Tracenium can't wake it to deliver them within seconds — enroll it again with a new link for that.";
  }
  if (!device.pushReady) return "The device hasn't registered for push yet.";
  if (deliverable) return "Tracenium sends commands to this device through Apple push: they arrive within seconds.";
  if (commandsReason === "sender_not_available") {
    return "Tracenium sends commands to this device. They arrive on its automatic check-in, about every 4 hours: delivery within seconds through Apple push isn't switched on yet.";
  }
  return "Tracenium sends commands to this device. They arrive on its automatic check-in, about every 4 hours; with the Apple push certificate set up, within seconds.";
}

function DeviceDetail({ row, commandsReason, commandsDeliverable, onClose, onNavigate, onOpenTab, canConfigure, notify }) {
  const d = row.device;
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
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
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
          </Box>
          <Field label="UDID" mono>{d.udid}</Field>
          <Divider sx={{ borderColor: BRAND.border }} />
          <Box>
            <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700 }}>
              Commands
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
              {commandsText(d, commandsReason, commandsDeliverable)}
            </Typography>
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
          {d.enrollmentState === "enrolled" ? <MdmDeclarativePanel udid={d.udid} /> : null}
          {d.enrollmentState === "enrolled" ? (
            <MdmOrgProfilePanel udid={d.udid} canConfigure={canConfigure} notify={notify} />
          ) : null}
          {d.enrollmentState === "enrolled" ? (
            <MdmOsUpdatePanel udid={d.udid} canConfigure={canConfigure} notify={notify} />
          ) : null}
        </>
      ) : (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <Field label="Platform"><PlatformChip platform={d.platform} /></Field>
            <Field label="Last check-in">{formatRelative(d.lastSeenAt)}</Field>
          </Box>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            App actions — lock the app, selective wipe, send a message — are on the device in Asset
            Management.
          </Typography>
          <Box>
            <Button
              variant="outlined"
              onClick={() => onNavigate?.("assets")}
              sx={{ textTransform: "none", fontWeight: 700, borderColor: BRAND.teal, color: BRAND.tealText }}
            >
              Open in Asset Management
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}
