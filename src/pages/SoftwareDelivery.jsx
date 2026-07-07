// src/pages/SoftwareDelivery.jsx
//
// SDP — Phase 1-H. Operator surface for the Software Delivery
// Plugin: catalog of third-party packages + history of fan-out
// deployments. Distinct from `AgentReleases` (catalog of Tracenium
// agent installer binaries — different feature, different table).
//
// Two tabs:
//   * Catalog      — CRUD + Deploy button per row
//   * Deployments  — historical list, drilldown into per-device results

import * as React from "react";
import {
  Box,
  Tabs,
  Tab,
  Stack,
  Button,
  Typography,
  Chip,
  TextField,
  MenuItem,
  IconButton,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import InventoryOutlinedIcon from "@mui/icons-material/InventoryOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined";

import { BRAND, DATAGRID_SX } from "../theme/brand";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import BrandSnackbar from "../components/common/BrandSnackbar";
import { useAuthContext } from "../auth/AuthContext";
import {
  listPackages,
  createPackage,
  updatePackage,
  deletePackage,
  deployPackage,
  listDeployments,
} from "../api/softwareDelivery";
import { getTenantPolicy } from "../api/policies";
import { usePluginCatalog } from "../hooks/usePluginCatalog";

import PackageDialog from "../components/software-delivery/PackageDialog";
import DeletePackageDialog from "../components/software-delivery/DeletePackageDialog";
import DeployWizardDialog from "../components/software-delivery/DeployWizardDialog";
import IntakeTab from "../components/software-delivery/IntakeTab";
import DeploymentDetailDrawer from "../components/software-delivery/DeploymentDetailDrawer";

const TAB_SX = {
  textTransform: "none",
  fontWeight: 700,
  minHeight: 56,
  color: "text.secondary",
  "&.Mui-selected": { color: BRAND.dark },
};

function formatTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "2-digit",
    month: "short",
    day: "2-digit",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Catalog tab ───────────────────────────────────────────────────

function CatalogTab({ canManage, notify, onDeployFire }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [platform, setPlatform] = React.useState("all");

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorMode, setEditorMode] = React.useState("create");
  const [editorItem, setEditorItem] = React.useState(null);
  const [editorSubmitting, setEditorSubmitting] = React.useState(false);

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteItem, setDeleteItem] = React.useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = React.useState(false);

  const [deployOpen, setDeployOpen] = React.useState(false);
  const [deployItem, setDeployItem] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (platform !== "all") params.platform = platform;
      const res = await listPackages(params);
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      notify("error", err?.body?.message || err?.message || "Failed to load packages");
    } finally {
      setLoading(false);
    }
  }, [search, platform, notify]);

  React.useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditorMode("create");
    setEditorItem(null);
    setEditorOpen(true);
  };
  const openEdit = (item) => {
    setEditorMode("edit");
    setEditorItem(item);
    setEditorOpen(true);
  };
  const handleSubmit = async (payload) => {
    setEditorSubmitting(true);
    try {
      if (editorMode === "edit" && editorItem) {
        await updatePackage(editorItem.id, payload);
        notify("success", "Package updated");
      } else {
        await createPackage(payload);
        notify("success", "Package created");
      }
      setEditorOpen(false);
      load();
    } catch (err) {
      const code = err?.body?.error;
      const msg =
        code === "SOFTWARE_PACKAGE_CONFLICT"
          ? "A package with this (name, version, platform, arch) already exists"
          : err?.body?.message || err?.message || "Save failed";
      notify("error", msg);
    } finally {
      setEditorSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleteSubmitting(true);
    try {
      await deletePackage(deleteItem.id);
      notify("success", `Deleted ${deleteItem.name}`);
      setDeleteOpen(false);
      setDeleteItem(null);
      load();
    } catch (err) {
      const code = err?.body?.error;
      const msg =
        code === "SOFTWARE_PACKAGE_CONFLICT"
          ? "Cannot delete: still referenced by one or more deployments. Mark inactive instead."
          : err?.body?.message || err?.message || "Delete failed";
      notify("error", msg);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleDeployFire = async (body) => {
    if (!deployItem) return;
    const res = await deployPackage(deployItem.id, body);
    notify(
      "success",
      `Deployment #${res?.deployment?.id} created — ${res?.deployment?.counts?.pending ?? 0} job(s) queued`
    );
    setDeployOpen(false);
    setDeployItem(null);
    onDeployFire?.(res?.deployment?.id);
  };

  const columns = [
    {
      field: "name",
      headerName: "Name",
      flex: 1,
      minWidth: 220,
      renderCell: (params) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}>
            {params.row.name}
          </Typography>
          {params.row.vendor ? (
            <Typography sx={{ fontSize: 11, color: BRAND.gray }}>
              {params.row.vendor}
            </Typography>
          ) : null}
        </Box>
      ),
    },
    {
      field: "version",
      headerName: "Version",
      width: 110,
      renderCell: (p) => (
        <Typography sx={{ fontSize: 12, fontFamily: "monospace" }}>
          {p.row.version}
        </Typography>
      ),
    },
    {
      field: "platform",
      headerName: "Target",
      width: 170,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          <Chip
            size="small"
            label={p.row.platform}
            sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: BRAND.tealSoft, color: BRAND.tealText }}
          />
          <Chip
            size="small"
            label={p.row.arch}
            sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
          />
          <Chip
            size="small"
            label={(p.row.format || "").toUpperCase()}
            sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: BRAND.cyanSoft, color: BRAND.dark }}
          />
        </Stack>
      ),
    },
    {
      field: "detectionRule",
      headerName: "Detection",
      width: 160,
      renderCell: (p) => {
        const r = p.row.detectionRule;
        if (!r) {
          return (
            <Typography sx={{ fontSize: 11, color: BRAND.gray, fontStyle: "italic" }}>
              none
            </Typography>
          );
        }
        return (
          <Tooltip title={JSON.stringify(r, null, 2)} placement="top">
            <Chip
              size="small"
              label={r.type}
              sx={{
                height: 20,
                fontSize: 11,
                fontWeight: 700,
                bgcolor: BRAND.darkSoft,
                color: BRAND.dark,
                fontFamily: "monospace",
              }}
            />
          </Tooltip>
        );
      },
    },
    {
      field: "isActive",
      headerName: "Active",
      width: 90,
      renderCell: (p) =>
        p.row.isActive ? (
          <Chip
            size="small"
            label="active"
            sx={{
              height: 20,
              fontSize: 11,
              fontWeight: 700,
              bgcolor: BRAND.alert?.successSoft,
              color: BRAND.alert?.success,
            }}
          />
        ) : (
          <Chip
            size="small"
            label="inactive"
            sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.gray }}
          />
        ),
    },
    {
      field: "updatedAt",
      headerName: "Updated",
      width: 130,
      renderCell: (p) => (
        <Typography sx={{ fontSize: 11, color: BRAND.gray }}>
          {formatTime(p.row.updatedAt)}
        </Typography>
      ),
    },
    {
      field: "actions",
      headerName: "",
      width: 150,
      sortable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.25}>
          {canManage && p.row.isActive ? (
            <Tooltip title="Deploy to fleet">
              <IconButton
                size="small"
                onClick={() => {
                  setDeployItem(p.row);
                  setDeployOpen(true);
                }}
                sx={{ color: BRAND.teal, "&:hover": { color: BRAND.tealHover } }}
              >
                <RocketLaunchOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}
          {canManage ? (
            <>
              <IconButton
                size="small"
                onClick={() => openEdit(p.row)}
                sx={{ color: BRAND.gray, "&:hover": { color: BRAND.dark } }}
              >
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => {
                  setDeleteItem(p.row);
                  setDeleteOpen(true);
                }}
                sx={{ color: BRAND.gray, "&:hover": { color: BRAND.alert?.error } }}
              >
                <DeleteOutlineOutlinedIcon fontSize="small" />
              </IconButton>
            </>
          ) : null}
        </Stack>
      ),
    },
  ];

  return (
    <SectionPaper variant="panel" sx={{ p: 2 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 1.5, alignItems: { sm: "center" } }}>
        <TextField
          size="small"
          placeholder="Search by name / version / vendor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 280, flex: 1 }}
        />
        <TextField
          select
          size="small"
          label="Platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="windows">Windows</MenuItem>
          <MenuItem value="macos">macOS</MenuItem>
          <MenuItem value="linux">Linux</MenuItem>
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
        {canManage ? (
          <Button
            variant="contained"
            size="small"
            startIcon={<AddOutlinedIcon />}
            onClick={openCreate}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              bgcolor: BRAND.teal,
              "&:hover": { bgcolor: BRAND.tealHover },
            }}
          >
            New package
          </Button>
        ) : null}
      </Stack>

      {loading && items.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} sx={{ color: BRAND.teal }} />
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ p: 4, textAlign: "center", color: BRAND.gray }}>
          <Typography variant="body2">
            No packages in the catalog yet.
            {canManage ? " Click 'New package' to add one." : ""}
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
          sx={DATAGRID_SX}
          autoHeight
        />
      )}

      <PackageDialog
        open={editorOpen}
        mode={editorMode}
        item={editorItem}
        submitting={editorSubmitting}
        onClose={() => setEditorOpen(false)}
        onSubmit={handleSubmit}
      />

      <DeletePackageDialog
        open={deleteOpen}
        item={deleteItem}
        submitting={deleteSubmitting}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteItem(null);
        }}
        onConfirm={handleDelete}
      />

      <DeployWizardDialog
        open={deployOpen}
        pkg={deployItem}
        onClose={() => {
          setDeployOpen(false);
          setDeployItem(null);
        }}
        onConfirm={handleDeployFire}
        notify={notify}
      />
    </SectionPaper>
  );
}

// ── Deployments tab ──────────────────────────────────────────────

function DeploymentsTab({ canManage, notify, autoOpenDeploymentId, onConsumedAutoOpen }) {
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
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      notify("error", err?.body?.message || err?.message || "Failed to load deployments");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, notify]);

  React.useEffect(() => {
    load();
  }, [load]);

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
        <Typography sx={{ fontSize: 12, fontFamily: "monospace", color: BRAND.dark }}>
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
        return (
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}>
              {pkg.name} <span style={{ color: BRAND.gray, fontWeight: 500 }}>v{pkg.version}</span>
            </Typography>
            <Typography sx={{ fontSize: 11, color: BRAND.gray }}>
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
            <Typography sx={{ fontSize: 12 }}>
              Group #{p.row.assetGroupId ?? "?"}
            </Typography>
          );
        }
        return (
          <Typography sx={{ fontSize: 12 }}>
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
            sx={{ fontWeight: 700, fontSize: 11, height: 20, bgcolor: e.bg, color: e.color }}
          />
        );
      },
    },
    {
      field: "counts",
      headerName: "Outcomes",
      flex: 1,
      minWidth: 280,
      renderCell: (p) => {
        const c = p.row.counts || {};
        const groups = [
          ["ok", (c.success || 0) + (c.already_installed || 0) + (c.reboot_required || 0), BRAND.alert?.successSoft, BRAND.alert?.success],
          ["pending/running", (c.pending || 0) + (c.running || 0), BRAND.darkSoft, BRAND.gray],
          ["failed", (c.failed || 0) + (c.rejected || 0) + (c.timed_out || 0), BRAND.alert?.errorSoft, BRAND.alert?.error],
          ["cancelled", c.cancelled || 0, BRAND.darkSoft, BRAND.gray],
        ];
        return (
          <Stack direction="row" spacing={0.5}>
            {groups.map(([label, n, bg, color]) =>
              n > 0 ? (
                <Chip
                  key={label}
                  size="small"
                  label={`${label}: ${n}`}
                  sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: bg, color: color }}
                />
              ) : null
            )}
          </Stack>
        );
      },
    },
    {
      field: "createdAt",
      headerName: "Created",
      width: 130,
      renderCell: (p) => (
        <Typography sx={{ fontSize: 11, color: BRAND.gray }}>
          {formatTime(p.row.createdAt)}
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

// ── Page shell ────────────────────────────────────────────────────

export default function SoftwareDelivery({ onNavigate }) {
  const { auth } = useAuthContext();
  const tenantId = auth?.tenantId;
  const tenantRole = auth?.tenantMember?.role;
  const isActive = auth?.tenantMember?.isActive === true;
  const isAdmin =
    isActive && (String(tenantRole ?? "") === "ADMIN" || String(tenantRole ?? "") === "OWNER");

  // Plugin catalog from the backend — needed for the required-plugin
  // semantics in getEnabledPluginSet (AMP is always enabled even if
  // missing from policy.plugins.enabled).
  const { getEnabledPluginSet } = usePluginCatalog();

  // Plugin entitlement gate. SDP is opt-in per tenant — if the
  // tenant's policy doesn't list "sdp" in `plugins.enabled[]`, we
  // render the page in read-only mode with a banner pointing to
  // Plugin Control. This mirrors how the backend gates writes
  // (403 SOFTWARE_DELIVERY_PLUGIN_DISABLED on POST /:id/deploy).
  //
  // Tri-valued state during load:
  //   null  → still fetching the tenant policy (don't render
  //           write-enabling controls yet to avoid a flash).
  //   true  → enabled, full UI.
  //   false → disabled, banner + read-only.
  const [sdpEnabled, setSdpEnabled] = React.useState(null);
  const [policyError, setPolicyError] = React.useState(false);

  React.useEffect(() => {
    if (!tenantId) {
      setSdpEnabled(false);
      return undefined;
    }
    let cancelled = false;
    getTenantPolicy(tenantId)
      .then((res) => {
        if (cancelled) return;
        // Backend returns 404 → http helper resolves null. The
        // helper also accepts the policy json directly; both shapes
        // route through the same getEnabledPluginSet logic.
        const policyJson = res?.policy_json ?? res?.policyJson ?? null;
        const enabled = getEnabledPluginSet(policyJson);
        setSdpEnabled(enabled.has("sdp"));
        setPolicyError(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // Soft-fail: if we can't read the tenant policy, treat as
        // not enabled and surface a generic banner. We DON'T silently
        // assume enabled — better to block deploys than leak ones we
        // shouldn't allow.
        console.warn("[SoftwareDelivery] tenant policy fetch failed", err);
        setSdpEnabled(false);
        setPolicyError(true);
      });
    return () => {
      cancelled = true;
    };
    // getEnabledPluginSet identity changes when the plugin catalog
    // finally loads — re-run so a Required plugin like AMP that
    // wasn't yet known when the policy fetched gets resolved
    // correctly on the second pass.
  }, [tenantId, getEnabledPluginSet]);

  // Effective `canManage` is the AND of admin role + plugin enabled.
  // Reads stay open even when the plugin is disabled (so the operator
  // can browse what they had pre-disable, and so the disabled-state
  // banner shows alongside any existing rows for context).
  const canManage = isAdmin && sdpEnabled === true;

  const [activeTab, setActiveTab] = React.useState(0);
  const [snackbar, setSnackbar] = React.useState({
    open: false,
    severity: "success",
    message: "",
  });
  const [autoOpenDeploymentId, setAutoOpenDeploymentId] = React.useState(null);

  const notify = React.useCallback((severity, message) => {
    setSnackbar({ open: true, severity, message });
  }, []);

  const handleDeployFired = React.useCallback((id) => {
    setAutoOpenDeploymentId(id);
    setActiveTab(1);
  }, []);

  const goToPluginControl = () => {
    if (typeof onNavigate === "function") {
      onNavigate("plugin-control");
    } else if (typeof window !== "undefined") {
      // AppShell passes onNavigate; this fallback covers a direct
      // route or embedded usage.
      const url = new URL(window.location.href);
      url.searchParams.set("page", "plugin-control");
      window.location.href = url.toString();
    }
  };

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
      <PageHeader
        title="Software Delivery"
        subtitle="Deploy third-party software to the fleet — catalog, target groups, per-device results"
        icon={<CloudDownloadOutlinedIcon />}
      />

      {/* Plugin-disabled banner. Renders only after we've resolved
          the policy state — sdpEnabled === false means a confirmed
          off, NOT loading. */}
      {sdpEnabled === false ? (
        <SectionPaper
          variant="panel"
          sx={{
            mb: 2,
            p: 2,
            borderLeft: `4px solid ${BRAND.alert?.warning || BRAND.teal}`,
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            alignItems={{ xs: "flex-start", sm: "center" }}
            justifyContent="space-between"
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: 14 }}>
                {policyError
                  ? "Could not verify SDP entitlement"
                  : "Software Delivery plugin is disabled for this tenant"}
              </Typography>
              <Typography sx={{ fontSize: 13, color: BRAND.gray, mt: 0.5 }}>
                {policyError
                  ? "We couldn't fetch the tenant policy. Page is read-only until the check succeeds. Refresh or reach out to support if this persists."
                  : isAdmin
                    ? "Enable SDP from Plugin Control to start managing the catalog and deploying software to the fleet. Reads stay open."
                    : "Ask an ADMIN to enable SDP from Plugin Control. Reads stay open."}
              </Typography>
            </Box>
            {isAdmin && !policyError ? (
              <Button
                variant="contained"
                onClick={goToPluginControl}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  bgcolor: BRAND.teal,
                  "&:hover": { bgcolor: BRAND.tealHover },
                  whiteSpace: "nowrap",
                }}
              >
                Open Plugin Control
              </Button>
            ) : null}
          </Stack>
        </SectionPaper>
      ) : null}

      <SectionPaper variant="panel" sx={{ mb: 2, p: 0, overflow: "hidden" }}>
        <Tabs
          value={activeTab}
          onChange={(_e, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: { xs: 1, sm: 2 },
            minHeight: 56,
            "& .MuiTabs-indicator": {
              height: 3,
              borderRadius: 999,
              backgroundColor: BRAND.teal,
            },
          }}
        >
          <Tab
            icon={<InventoryOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Catalog"
            sx={TAB_SX}
          />
          <Tab
            icon={<LocalShippingOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Deployments"
            sx={TAB_SX}
          />
          <Tab
            icon={<AutoAwesomeOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="AI Intake"
            sx={TAB_SX}
          />
        </Tabs>
      </SectionPaper>

      {activeTab === 0 ? (
        <CatalogTab
          canManage={canManage}
          notify={notify}
          onDeployFire={handleDeployFired}
        />
      ) : activeTab === 1 ? (
        <DeploymentsTab
          canManage={canManage}
          notify={notify}
          autoOpenDeploymentId={autoOpenDeploymentId}
          onConsumedAutoOpen={() => setAutoOpenDeploymentId(null)}
        />
      ) : (
        <IntakeTab canManage={canManage} notify={notify} />
      )}

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      />
    </Box>
  );
}
