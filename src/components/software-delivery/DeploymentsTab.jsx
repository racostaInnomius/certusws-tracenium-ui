// src/components/software-delivery/DeploymentsTab.jsx
//
// History of fan-out deployments, with a drilldown into per-device results.
//
// Extracted from SoftwareDelivery.jsx for the same reason as CatalogTab: it was
// declared inside the page while its siblings were already components.

import * as React from "react";
import {
  Box,
  Stack,
  Button,
  Typography,
  Chip,
  TextField,
  MenuItem,
  CircularProgress,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";

import { BRAND, DATAGRID_SX, TEXT } from "../../theme/brand";
import SectionPaper from "../common/SectionPaper";
import { formatDate } from "../../utils/format";
import { listDeployments } from "../../api/softwareDelivery";
import { listFrom } from "../../api/shape";

import DeploymentDetailDrawer from "./DeploymentDetailDrawer";

export default function DeploymentsTab({ canManage, notify, autoOpenDeploymentId, onConsumedAutoOpen, refreshNonce = 0 }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState("all");

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerDeployment, setDrawerDeployment] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await listDeployments(params);
      setItems(listFrom(res, { keys: ["items"], context: "softwareDelivery.deployments" }));
    } catch (err) {
      notify("error", err?.body?.message || err?.message || "Failed to load deployments");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, notify]);

  React.useEffect(() => {
    load();
  }, [load, refreshNonce]);

  // If the catalog tab fired a deploy and switched us here, auto-open
  // the drawer for the freshly-created deployment so the operator
  // sees the per-device results stream in.
  React.useEffect(() => {
    if (!autoOpenDeploymentId || items.length === 0) return;
    const found = items.find((d) => Number(d.id) === Number(autoOpenDeploymentId));
    if (found) {
      setDrawerDeployment(found);
      setDrawerOpen(true);
      onConsumedAutoOpen?.();
    }
  }, [autoOpenDeploymentId, items, onConsumedAutoOpen]);

  // Auto-refresh while we have non-terminal deployments.
  React.useEffect(() => {
    const hasInflight = items.some(
      (d) => d.status !== "completed" && d.status !== "cancelled" && d.status !== "failed"
    );
    if (!hasInflight) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 12_000);
    return () => clearInterval(id);
  }, [items, load]);

  const columns = [
    {
      field: "id",
      headerName: "#",
      width: 70,
      renderCell: (p) => (
        <Typography sx={{ fontSize: TEXT.sm, fontFamily: "monospace", color: BRAND.dark }}>
          {p.row.id}
        </Typography>
      ),
    },
    {
      field: "package",
      headerName: "Package",
      flex: 1,
      minWidth: 240,
      renderCell: (p) => {
        const pkg = p.row.packageSnapshot || {};

        // ⚠️ UN DESPLIEGUE DE DESINSTALACIÓN NO TIENE PAQUETE (ADR-0019 F1):
        // `package_id` es NULL y el snapshot lleva `uninstallIdentity`, que es
        // el mismo discriminador que usan los CHECK de la base. Su snapshot
        // trae `platform`/`format` de relleno para encajar en la forma, y NO
        // trae `arch` — pintarlos daría «windows/undefined/EXE», que además de
        // feo afirma cosas que nadie recogió. Se enseña lo único que aquí es
        // verdad: el nombre detectado y con qué identidad se quita.
        const identity = pkg.uninstallIdentity;
        if (identity) {
          return (
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
                {pkg.name}
              </Typography>
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
                Detected · {identity.productCode || identity.displayNameLike || "—"}
              </Typography>
            </Box>
          );
        }

        return (
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
              {pkg.name} <span style={{ color: BRAND.gray, fontWeight: 500 }}>v{pkg.version}</span>
            </Typography>
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
              {pkg.platform}/{pkg.arch}/{(pkg.format || "").toUpperCase()}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: "target",
      headerName: "Target",
      width: 200,
      renderCell: (p) => {
        if (p.row.targetKind === "asset_group") {
          return (
            <Typography sx={{ fontSize: TEXT.sm }}>
              Group #{p.row.assetGroupId ?? "?"}
            </Typography>
          );
        }
        return (
          <Typography sx={{ fontSize: TEXT.sm }}>
            {p.row.deviceIds?.length ?? 0} device(s)
          </Typography>
        );
      },
    },
    {
      field: "status",
      headerName: "Status",
      width: 120,
      renderCell: (p) => {
        const map = {
          queued:    { bg: BRAND.darkSoft,           color: BRAND.gray },
          running:   { bg: BRAND.tealSoft,           color: BRAND.tealText },
          completed: { bg: BRAND.alert?.successSoft, color: BRAND.alert?.success },
          cancelled: { bg: BRAND.darkSoft,           color: BRAND.gray },
          failed:    { bg: BRAND.alert?.errorSoft,   color: BRAND.alert?.error },
        };
        const e = map[p.row.status] || { bg: BRAND.darkSoft, color: BRAND.gray };
        return (
          <Chip
            size="small"
            label={p.row.status}
            sx={{ fontWeight: 700, fontSize: TEXT.xs, height: 20, bgcolor: e.bg, color: e.color }}
          />
        );
      },
    },
    {
      field: "counts",
      headerName: "Outcomes",
      flex: 1,
      minWidth: 280,
      // ⚠️ TEXTO, NO PÍLDORAS. Cuatro chips en una celda compiten entre ellos
      // y con la píldora de Status de la columna de al lado: la fila acaba
      // siendo cinco cápsulas de colores donde sólo una es el estado. El
      // recuento se lee mejor plano, con el color puesto en la palabra.
      //
      // ⚠️ Y `height: 100%` NO ES ADORNO. Sin él el contenido se apoya arriba
      // en las filas altas —la celda de Package son dos líneas y estira la
      // fila— y los recuentos quedan desalineados respecto al resto.
      renderCell: (p) => {
        const c = p.row.counts || {};
        const groups = [
          ["ok", (c.success || 0) + (c.already_installed || 0) + (c.reboot_required || 0), BRAND.alert?.success],
          ["pending/running", (c.pending || 0) + (c.running || 0), BRAND.gray],
          ["failed", (c.failed || 0) + (c.rejected || 0) + (c.timed_out || 0), BRAND.alert?.error],
          ["cancelled", c.cancelled || 0, BRAND.gray],
        ];
        const shown = groups.filter(([, n]) => n > 0);
        if (shown.length === 0) return null;
        return (
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ height: "100%", alignItems: "center" }}
          >
            {shown.map(([label, n, color]) => (
              <Typography key={label} sx={{ fontSize: TEXT.xs, fontWeight: 700, color }}>
                {label}: {n}
              </Typography>
            ))}
          </Stack>
        );
      },
    },
    {
      field: "createdAt",
      headerName: "Created",
      width: 130,
      renderCell: (p) => (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
          {formatDate(p.row.createdAt)}
        </Typography>
      ),
    },
  ];

  return (
    <SectionPaper variant="panel" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1.5} sx={{ mb: 1.5, alignItems: "center" }}>
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="queued">Queued</MenuItem>
          <MenuItem value="running">Running</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
          <MenuItem value="failed">Failed</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshOutlinedIcon />}
          onClick={load}
          sx={{ textTransform: "none", color: BRAND.gray, borderColor: BRAND.border }}
        >
          Refresh
        </Button>
      </Stack>

      {loading && items.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} sx={{ color: BRAND.teal }} />
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ p: 4, textAlign: "center", color: BRAND.gray }}>
          <Typography variant="body2">
            No deployments yet. Use the Catalog tab to deploy a package to the fleet.
          </Typography>
        </Box>
      ) : (
        <DataGrid
          rows={items}
          columns={columns}
          density="compact"
          disableRowSelectionOnClick
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{
            ...DATAGRID_SX,
            "& .MuiDataGrid-row:hover": { cursor: "pointer" },
          }}
          autoHeight
          onRowClick={(p) => {
            setDrawerDeployment(p.row);
            setDrawerOpen(true);
          }}
        />
      )}

      <DeploymentDetailDrawer
        open={drawerOpen}
        deployment={drawerDeployment}
        canManage={canManage}
        notify={notify}
        onChanged={load}
        onClose={() => setDrawerOpen(false)}
      />

    </SectionPaper>
  );
}
