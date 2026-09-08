// src/components/common/CreateDeviceGroupButton.jsx
//
// Convierte una lista de equipos de CUALQUIER pantalla en un grupo de activos.
//
// ⚠️ Existe porque el inventario terminaba en un callejón. "23 equipos con
// Chrome atrasado" es un hallazgo, y lo que seguía era copiar los hostnames a
// mano y armar el deploy equipo por equipo. Con 23 es tedioso; con 230 nadie
// lo hace, y el hallazgo se queda en la pantalla.
//
// ⚠️ Es GENÉRICO a propósito, no un botón de navegadores. La misma forma
// —"tengo N equipos que cumplen algo, quiero desplegarles algo"— aparece en el
// software desactualizado de PMP y en los equipos sin reiniciar hace 30 días.
// Un botón por pantalla habría sido tres botones y tres formas de nombrar el
// grupo.
//
// Nada de esto inventa concepto: `POST /asset-groups` ya crea grupos estáticos
// con sus miembros en una sola llamada, y `deployments.service` ya acepta
// `assetGroupId` como destino. Lo único que faltaba era la puerta entre las dos.

import * as React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  Alert,
  Box,
} from "@mui/material";
import GroupAddOutlinedIcon from "@mui/icons-material/GroupAddOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import { createAssetGroup } from "../../api/assetGroups";
import { sealedGroupName, sealedGroupDescription } from "../../utils/deviceGroupName";

export default function CreateDeviceGroupButton({
  deviceIds = [],
  /** Describe el criterio; encabeza el nombre del grupo. */
  namePrefix = "Devices",
  /** De qué lista salió, para la descripción del grupo. */
  origin = "",
  notify,
  onCreated,
  size = "small",
}) {
  const ids = React.useMemo(
    () => Array.from(new Set((deviceIds || []).map((x) => String(x)).filter(Boolean))),
    [deviceIds]
  );

  const [abierto, setAbierto] = React.useState(false);
  const [nombre, setNombre] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);

  const abrir = () => {
    // El nombre se sella en el momento de ABRIR, no al montar: si la tabla se
    // refresca detrás, el sello sigue correspondiendo a lo que el operador ve.
    setNombre(sealedGroupName(namePrefix, ids.length, new Date()));
    setAbierto(true);
  };

  const crear = async () => {
    setGuardando(true);
    try {
      const res = await createAssetGroup({
        name: nombre.trim(),
        description: sealedGroupDescription(origin, new Date()),
        kind: "static",
        deviceIds: ids,
      });
      const grupo = res?.group ?? res?.data ?? res;
      notify?.("success", `Group created with ${ids.length} device${ids.length === 1 ? "" : "s"} — pick it as the target in Software Delivery`);
      setAbierto(false);
      onCreated?.(grupo);
    } catch (err) {
      // 403 aquí significa que crear grupos pide ADMIN. Decirlo, en vez de un
      // "failed" genérico que manda a alguien a leer logs.
      const msg =
        err?.status === 403
          ? "Creating groups requires an admin role"
          : err?.body?.message || err?.message || "Could not create the group";
      notify?.("error", msg);
    } finally {
      setGuardando(false);
    }
  };

  if (ids.length === 0) return null;

  return (
    <>
      <Button
        size={size}
        variant="outlined"
        startIcon={<GroupAddOutlinedIcon />}
        onClick={abrir}
        sx={{
          textTransform: "none",
          fontSize: TEXT.xs,
          fontWeight: 700,
          borderColor: BRAND.border,
          color: BRAND.dark,
          "&:hover": { borderColor: BRAND.teal },
        }}
      >
        Create device group ({ids.length})
      </Button>

      <Dialog open={abierto} onClose={() => !guardando && setAbierto(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>Create device group</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: TEXT.md, color: "text.secondary", mb: 2 }}>
            {ids.length} device{ids.length === 1 ? "" : "s"} from{" "}
            <Box component="span" sx={{ fontWeight: 700 }}>{origin || "this list"}</Box>. Software
            Delivery can then target the group instead of picking devices one by one.
          </Typography>

          <TextField
            autoFocus
            fullWidth
            label="Group name"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            disabled={guardando}
            sx={{ mb: 2 }}
          />

          {/* ⚠️ El aviso es la mitad del diseño. Un grupo estático es una FOTO,
              y quien lo despliegue dentro de un mes tiene que saberlo. */}
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Membership is a snapshot taken now. It does <strong>not</strong> refresh: devices that
            update themselves stay in the group, and devices that fall behind later will not join
            it. That is why the name carries the date.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAbierto(false)} disabled={guardando} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            onClick={crear}
            disabled={guardando || nombre.trim().length === 0}
            variant="contained"
            sx={{ textTransform: "none", bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealText } }}
          >
            {guardando ? "Creating…" : "Create group"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
