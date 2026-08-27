// src/components/software-delivery/CatalogTab.jsx
//
// The catalog of third-party packages: CRUD plus a Deploy action per row.
//
// Lived inside SoftwareDelivery.jsx until now — 437 lines of state, dialogs and
// effects declared inside the page component, while its three sibling tabs
// (Intake, Distribution, Overview) already lived out here. That was not a
// design decision, just where it happened to be written, and it is the reason
// the page grew past a thousand lines.

import * as React from "react";
import {
  Box,
  Stack,
  Button,
  Typography,
  Chip,
  TextField,
  MenuItem,
  IconButton,
  CircularProgress,
  Tooltip,
  Switch,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";

import { BRAND, DATAGRID_SX, TEXT } from "../../theme/brand";
import SectionPaper from "../common/SectionPaper";
import { formatDate } from "../../utils/format";
import {
  listPackages,
  createPackage,
  updatePackage,
  deletePackage,
  deployPackage,
} from "../../api/softwareDelivery";
import { listFrom } from "../../api/shape";

import PackageDialog from "./PackageDialog";
import DeletePackageDialog from "./DeletePackageDialog";
import DeployWizardDialog from "./DeployWizardDialog";

export default function CatalogTab({ canManage, notify, onDeployFire }) {
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
  const [deleteError, setDeleteError] = React.useState("");

  const [deployOpen, setDeployOpen] = React.useState(false);
  const [deployItem, setDeployItem] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (platform !== "all") params.platform = platform;
      const res = await listPackages(params);
      setItems(listFrom(res, { keys: ["items"], context: "softwareDelivery.catalog" }));
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
    setDeleteError("");
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
          ? "Cannot delete: still referenced by one or more deployments. Mark it inactive instead — that stops new deployments without breaking the history of past ones."
          : err?.body?.message || err?.message || "Delete failed";
      // Shown INSIDE the dialog, not only as a toast. On failure the dialog
      // stays open, so a refusal that only spoke through a snackbar read as
      // "the delete button does nothing" — which is how this was reported.
      setDeleteError(msg);
      notify("error", msg);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleToggleSelfService = async (row) => {
    const next = !row.selfServiceEnabled;
    // Optimistic — this toggle lives in a dense grid an admin may click
    // several times in a row; waiting for the round-trip before the
    // switch visibly flips reads as broken.
    setItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, selfServiceEnabled: next } : it)));
    try {
      await updatePackage(row.id, { selfServiceEnabled: next });
      notify(
        "success",
        next
          ? `${row.name} is now self-installable from the tray`
          : `${row.name} removed from the self-service catalog`
      );
    } catch (err) {
      setItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, selfServiceEnabled: !next } : it)));
      notify("error", err?.body?.message || err?.message || "Failed to update self-service");
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
          <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
            {params.row.name}
          </Typography>
          {params.row.vendor ? (
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
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
        <Typography sx={{ fontSize: TEXT.sm, fontFamily: "monospace" }}>
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
            sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.tealSoft, color: BRAND.tealText }}
          />
          <Chip
            size="small"
            label={p.row.arch}
            sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
          />
          <Chip
            size="small"
            label={(p.row.format || "").toUpperCase()}
            sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.cyanSoft, color: BRAND.dark }}
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
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontStyle: "italic" }}>
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
                fontSize: TEXT.xs,
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
              fontSize: TEXT.xs,
              fontWeight: 700,
              bgcolor: BRAND.alert?.successSoft,
              color: BRAND.alert?.success,
            }}
          />
        ) : (
          <Chip
            size="small"
            label="inactive"
            sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.gray }}
          />
        ),
    },
    {
      field: "selfServiceEnabled",
      headerName: "Self-Service",
      width: 120,
      sortable: false,
      renderCell: (p) => (
        <Tooltip
          title={
            p.row.selfServiceEnabled
              ? "Users can install this from the Tracenium tray without an admin dispatching it"
              : "Only admin-dispatched — not offered in the tray's self-service catalog"
          }
        >
          <span>
            <Switch
              size="small"
              checked={Boolean(p.row.selfServiceEnabled)}
              disabled={!canManage}
              onChange={() => handleToggleSelfService(p.row)}
              inputProps={{ "aria-label": `Self-service install for ${p.row.name}` }}
            />
          </span>
        </Tooltip>
      ),
    },
    {
      field: "updatedAt",
      headerName: "Updated",
      width: 130,
      renderCell: (p) => (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
          {formatDate(p.row.updatedAt)}
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
                aria-label="Deploy to fleet"
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
                aria-label="Edit package"
                size="small"
                onClick={() => openEdit(p.row)}
                sx={{ color: BRAND.gray, "&:hover": { color: BRAND.dark } }}
              >
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
              <IconButton
                aria-label="Delete package"
                size="small"
                onClick={() => {
                  setDeleteItem(p.row);
                  setDeleteError("");
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
        error={deleteError}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteItem(null);
          setDeleteError("");
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
