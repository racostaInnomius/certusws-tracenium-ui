// src/components/software-delivery/CoverageDevicesDrawer.jsx
//
// Los equipos detrás de un tramo de la barra de cobertura, y qué hacer con ellos.
//
// ── El problema que resuelve ─────────────────────────────────────────────
//
// El panel contestaba «29 por detrás» y ahí se acababa: la fila entera llevaba
// a la pestaña Catalog, que no contesta nada —el operador ya sabe que publicó
// Chrome—. Para llegar a los equipos había que salir a otra pantalla, cruzar el
// inventario a mano y volver. Con eso, el dato más accionable de la página era
// decorativo, que es exactamente la queja: «el dashboard no es funcional».
//
// Ahora cada tramo se abre y enseña SUS equipos, con el botón que manda el
// paquete a ese conjunto.
//
// ── Decisiones ───────────────────────────────────────────────────────────
//
// ⚠️ NO TODOS LOS TRAMOS LLEVAN A UN BOTÓN, y el que falta importa más que los
// que están: sobre «ahead» un despliegue DEGRADA la flota. Esa regla vive en
// `coverageCells.js`, con sus pruebas, porque es la única parte de esta
// pantalla que puede romper algo.
//
// ⚠️ EL DESPLIEGUE PASA POR EL WIZARD DE SIEMPRE, no por un atajo. Desde aquí
// se elige a QUIÉN; el cómo —anillos, ventana de mantenimiento, programar la
// hora— son las mismas decisiones que en cualquier otro envío, y un camino
// paralelo que se las saltara sería un despliegue de segunda clase.
//
// ⚠️ LA LISTA SE PIDE AL ABRIR, no viene con el panel. Son hasta miles de filas
// que casi nunca se miran; cargarlas con el Overview pagaría ese coste en cada
// visita para el caso en que nadie pulsa.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";

import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { getCoverageDevices } from "../../api/softwareDelivery";
import { cellCopy, deployGroups, hostnamesOf } from "./coverageCells";

const PLATFORM_NAMES = { windows: "Windows", macos: "macOS", linux: "Linux" };

function DeviceRow({ device }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "1.4fr auto auto" },
        gap: 1,
        alignItems: "center",
        py: 0.9,
        borderBottom: `1px solid ${BRAND.border}`,
        "&:last-of-type": { borderBottom: 0 },
      }}
    >
      <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark, fontWeight: 600 }} noWrap>
        {/* Sin hostname se enseña el id: es feo, pero es lo único que
            identifica al equipo, y esconderlo dejaría una fila anónima. */}
        {device.hostname || device.agentId}
      </Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }} noWrap>
        {PLATFORM_NAMES[device.platform] ?? device.platform ?? "—"}
      </Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, textAlign: "right" }} noWrap>
        {device.installedVersion ?? "not installed"}
      </Typography>
    </Box>
  );
}

export default function CoverageDevicesDrawer({
  open,
  titleKey,
  name,
  state,
  canManage,
  onClose,
  onDeploy,
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [devices, setDevices] = React.useState([]);

  React.useEffect(() => {
    if (!open || !titleKey || !state) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    getCoverageDevices(titleKey, state)
      .then((res) => {
        if (cancelled) return;
        setDevices(Array.isArray(res?.devices) ? res.devices : []);
      })
      .catch((err) => {
        if (cancelled) return;
        // ⚠️ Un cajón vacío se lee como «no hay equipos», que es una respuesta
        // distinta de «no pude preguntarlo». Misma lección que el panel de LAN.
        setError(err?.body?.message || err?.message || "Couldn’t load the devices behind this segment.");
        setDevices([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, titleKey, state]);

  const copy = cellCopy(state);
  const groups = React.useMemo(() => deployGroups(devices), [devices]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", md: 620 }, p: 3 } }}
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
            {name}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: "center" }}>
            <Chip
              size="small"
              label={copy.label}
              sx={{ height: 20, fontSize: TEXT.xs, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
            />
            {!loading && !error ? (
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                {devices.length} device{devices.length === 1 ? "" : "s"}
              </Typography>
            ) : null}
          </Stack>
        </Box>
        <IconButton onClick={onClose} aria-label="Close">
          <CloseOutlinedIcon />
        </IconButton>
      </Stack>

      {copy.help ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: 1.5 }}>{copy.help}</Typography>
      ) : null}

      {loading ? (
        <Skeleton variant="rounded" height={220} sx={{ mt: 2 }} />
      ) : error ? (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {error}
        </Alert>
      ) : devices.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray, mt: 2 }}>
          No devices in this segment right now.
        </Typography>
      ) : (
        <Box sx={{ mt: 2 }}>
          {groups.map((group) => (
            <Box key={group.packageId} sx={{ mb: 2.5 }}>
              {groups.length > 1 ? (
                <Typography
                  sx={{
                    fontSize: TEXT.sm,
                    fontWeight: 800,
                    color: BRAND.gray,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    mb: 0.5,
                  }}
                >
                  {PLATFORM_NAMES[group.platform] ?? group.platform} · {group.devices.length}
                </Typography>
              ) : null}

              {copy.deployable && canManage ? (
                <Button
                  variant="contained"
                  size="small"
                  sx={{ textTransform: "none", mb: 1 }}
                  onClick={() =>
                    onDeploy?.({
                      packageId: group.packageId,
                      deviceIds: group.devices.map((d) => d.agentId),
                      hostnames: hostnamesOf(group.devices),
                    })
                  }
                >
                  {copy.action} {group.catalogVersion || ""} on {group.devices.length} device
                  {group.devices.length === 1 ? "" : "s"}
                </Button>
              ) : null}

              <Box sx={{ border: `1px solid ${BRAND.border}`, borderRadius: 1, px: 1.5 }}>
                {group.devices.map((d) => (
                  <DeviceRow key={d.agentId} device={d} />
                ))}
              </Box>
            </Box>
          ))}

          {copy.deployable && !canManage ? (
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
              You do not have permission to deploy software in this tenant.
            </Typography>
          ) : null}

          {state === "ahead" ? (
            <Alert severity="info" icon={false} sx={{ mt: 1, fontSize: TEXT.sm }}>
              {/* No es «no hace falta»: es que el botón haría daño. Se dice
                  entero, porque el operador viene buscando un botón. */}
              Nothing to deploy here. If you want the catalog to match the fleet, publish a newer
              package instead.
            </Alert>
          ) : null}
        </Box>
      )}

      {state === "unknown" && devices.length > 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: ROLE.caution, mt: 1 }}>
          Check a couple of these by hand first: an unreadable version is often a broken inventory
          entry rather than a missing install.
        </Typography>
      ) : null}
    </Drawer>
  );
}
