// src/pages/RolesAdministrator.jsx
//
// ADR-0011 (backend certusws-tracenium) — tenant OWNER/ADMIN create
// custom roles beyond the 3 built-ins (OWNER/ADMIN/USER) and choose
// exactly which capabilities each one grants. Reached from Settings'
// "Roles & permissions" card.
//
// The 3 built-in roles are always listed (server-seeded) but locked —
// can't be edited or deleted here, same as the backend enforces
// server-side regardless of what this UI shows. Deleting a custom role
// that's still assigned to a member is blocked (409) with the member
// count, not a generic error — the operator needs to know WHY before
// they can act on it.
//
// The permission matrix in the create/edit dialog never hides a
// capability the tenant isn't entitled to or the caller doesn't hold
// themselves — it disables the toggle with an inline explanation. This
// mirrors the product's core UX requirement for END USERS (don't hide,
// explain on attempt) applied to the admin's OWN role-editing screen.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

import { useAuthContext } from "../auth/AuthContext";
import {
  listTenantRoles,
  listCapabilities,
  createTenantRole,
  updateTenantRole,
  deleteTenantRole,
} from "../api/roles";
import { BRAND, ICON, TEXT } from "../theme/brand";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import BrandSnackbar from "../components/common/BrandSnackbar";

const GROUP_ORDER = ["Operations", "Visibility", "Administration"];

function RoleRow({ role, onEdit, onDelete }) {
  const count = role.permissions?.length ?? 0;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1.5,
        p: 1.5,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 2,
        bgcolor: role.isSystem ? BRAND.darkSoft : "#ffffff",
        flexWrap: "wrap",
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography sx={{ fontSize: TEXT.base, fontWeight: 700, color: BRAND.dark }}>
            {role.name}
          </Typography>
          {role.isSystem ? (
            <Tooltip title="Built-in role — can't be edited or deleted">
              <LockOutlinedIcon sx={{ fontSize: ICON.md, color: BRAND.gray }} />
            </Tooltip>
          ) : null}
        </Stack>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          {count} capabilit{count === 1 ? "y" : "ies"} granted
        </Typography>
      </Box>
      <Stack direction="row" spacing={0.5}>
        <Tooltip title={role.isSystem ? "Built-in roles can't be edited" : "Edit"}>
          <span>
            <IconButton
              size="small"
              disabled={role.isSystem}
              onClick={() => onEdit(role)}
              aria-label={`Edit ${role.name}`}
            >
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={role.isSystem ? "Built-in roles can't be deleted" : "Delete"}>
          <span>
            <IconButton
              size="small"
              disabled={role.isSystem}
              onClick={() => onDelete(role)}
              aria-label={`Delete ${role.name}`}
            >
              <DeleteOutlineOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Box>
  );
}

function CapabilityRow({ capability, granted, callerHasIt, onToggle }) {
  const disabled = !capability.entitled || !callerHasIt;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1.5,
        py: 1,
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 600, color: BRAND.dark }}>
          {capability.label}
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          {capability.description}
        </Typography>
        {!capability.entitled ? (
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.warningText, mt: 0.25 }}>
            Not included in your tenant's current plan
          </Typography>
        ) : !callerHasIt ? (
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.warningText, mt: 0.25 }}>
            You don't have this permission yourself
          </Typography>
        ) : null}
      </Box>
      <Switch
        checked={granted}
        disabled={disabled}
        onChange={() => onToggle(capability.key)}
        sx={{
          "& .MuiSwitch-switchBase.Mui-checked": { color: BRAND.teal },
          "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
            backgroundColor: BRAND.teal,
          },
        }}
      />
    </Box>
  );
}

function RoleDialog({
  open,
  role,
  capabilities,
  existingNames,
  callerPermissions,
  submitting,
  onClose,
  onSubmit,
}) {
  const isEdit = Boolean(role);
  const [name, setName] = React.useState("");
  const [permissions, setPermissions] = React.useState(new Set());

  React.useEffect(() => {
    if (open) {
      setName(role?.name || "");
      setPermissions(new Set(role?.permissions || []));
    } else {
      setName("");
      setPermissions(new Set());
    }
  }, [open, role]);

  const togglePermission = (key) => {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const grouped = React.useMemo(() => {
    const byGroup = {};
    for (const cap of capabilities) {
      if (!byGroup[cap.group]) byGroup[cap.group] = [];
      byGroup[cap.group].push(cap);
    }
    return byGroup;
  }, [capabilities]);

  const trimmedName = name.trim();
  const nameCollision =
    trimmedName && (!isEdit || trimmedName.toUpperCase() !== role?.name?.toUpperCase())
      ? existingNames.has(trimmedName.toUpperCase())
      : false;
  const isDisabled = !trimmedName || nameCollision;

  const handleSubmit = () => {
    onSubmit({ name: trimmedName, permissions: Array.from(permissions) });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? "Edit role" : "New role"}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
          <TextField
            label="Role name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            error={nameCollision}
            helperText={nameCollision ? "A role with this name already exists" : ""}
          />

          {GROUP_ORDER.map((group) =>
            grouped[group]?.length ? (
              <Box key={group}>
                <Typography
                  sx={{
                    fontSize: TEXT.xs,
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    color: "text.secondary",
                    mb: 0.5,
                  }}
                >
                  {group}
                </Typography>
                <Stack divider={<Box sx={{ borderBottom: `1px solid ${BRAND.border}` }} />}>
                  {grouped[group].map((capability) => (
                    <CapabilityRow
                      key={capability.key}
                      capability={capability}
                      granted={permissions.has(capability.key)}
                      callerHasIt={callerPermissions.has(capability.key)}
                      onToggle={togglePermission}
                    />
                  ))}
                </Stack>
              </Box>
            ) : null
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting || isDisabled}>
          {isEdit ? "Save changes" : "Create role"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteRoleDialog({ open, role, submitting, error, onClose, onConfirm }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Delete role</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary">
          Delete "{role?.name}"? This can't be undone.
        </Typography>
        {error ? (
          <Alert
            severity="error"
            sx={{
              mt: 2,
              bgcolor: BRAND.alert.errorSoft,
              color: BRAND.alert.errorText,
              border: `1px solid ${BRAND.alert.error}`,
              "& .MuiAlert-message": { color: BRAND.alert.errorText, fontWeight: 600 },
            }}
          >
            {error}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" onClick={onConfirm} disabled={submitting}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function RolesAdministrator() {
  const { auth } = useAuthContext();
  const tenantId = auth?.tenantId;
  // Same simple pattern PKI.jsx and others already use — this page
  // doesn't need Sidebar's deeper multi-shape lookup since AuthContext
  // is already resolved by the time an OWNER/ADMIN reaches this page
  // (requireTenantRoleByParam gates the API calls regardless).
  const callerRoleName = String(auth?.tenantMember?.role || "").toUpperCase();

  const [roles, setRoles] = React.useState([]);
  const [capabilities, setCapabilities] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState(null);
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [deleteError, setDeleteError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [snackbar, setSnackbar] = React.useState({ open: false, message: "", severity: "success" });

  const load = React.useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const [rolesResp, capsResp] = await Promise.all([
        listTenantRoles(tenantId),
        listCapabilities(tenantId),
      ]);
      setRoles(Array.isArray(rolesResp?.items) ? rolesResp.items : []);
      setCapabilities(Array.isArray(capsResp?.items) ? capsResp.items : []);
    } catch (e) {
      console.error(e);
      setSnackbar({ open: true, message: "Failed to load roles", severity: "error" });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  React.useEffect(() => {
    load();
  }, [load]);

  // The caller's OWN effective permission set — drives the "you don't
  // have this permission yourself" disabled state in the matrix. The
  // server re-validates this regardless (ADR-0011 escalation guard);
  // this is purely so the operator sees why a toggle won't move,
  // instead of clicking it and getting a 400 with no context.
  const callerPermissions = React.useMemo(() => {
    const own = roles.find((r) => r.name === callerRoleName);
    return new Set(own?.permissions || []);
  }, [roles, callerRoleName]);

  const existingNames = React.useMemo(
    () => new Set(roles.map((r) => r.name.toUpperCase())),
    [roles]
  );

  const handleOpenCreate = () => {
    setEditingRole(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (role) => {
    setEditingRole(role);
    setDialogOpen(true);
  };

  const handleSubmit = async ({ name, permissions }) => {
    try {
      setSubmitting(true);
      if (editingRole) {
        await updateTenantRole(tenantId, editingRole.id, { name, permissions });
        setSnackbar({ open: true, message: "Role updated", severity: "success" });
      } else {
        await createTenantRole(tenantId, { name, permissions });
        setSnackbar({ open: true, message: "Role created", severity: "success" });
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      console.error(e);
      const code = e?.body?.error;
      const message =
        code === "NAME_RESERVED"
          ? "That name is reserved for a built-in role."
          : code === "ROLE_NAME_ALREADY_EXISTS"
            ? "A role with this name already exists."
            : code === "PERMISSIONS_EXCEED_ASSIGNER"
              ? "You can't grant more permissions than you have yourself."
              : code === "CAPABILITY_NOT_ENTITLED"
                ? "One of the selected capabilities isn't included in your tenant's plan."
                : code === "CAPABILITY_NOT_ASSIGNABLE"
                  ? "One of the selected capabilities can't be granted to a custom role."
                  : "Failed to save role.";
      setSnackbar({ open: true, message, severity: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setSubmitting(true);
      setDeleteError(null);
      await deleteTenantRole(tenantId, deleteTarget.id);
      setSnackbar({ open: true, message: "Role deleted", severity: "success" });
      setDeleteTarget(null);
      await load();
    } catch (e) {
      if (e?.status === 409) {
        const count = e?.body?.memberCount ?? 0;
        setDeleteError(
          `${count} member${count === 1 ? "" : "s"} currently ${count === 1 ? "has" : "have"} this role — reassign them first.`
        );
      } else {
        console.error(e);
        setDeleteError("Failed to delete role.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Create custom roles and choose exactly which parts of Tracenium each one can use."
        icon={<AdminPanelSettingsOutlinedIcon />}
        actions={
          <Button
            variant="contained"
            startIcon={<AddOutlinedIcon />}
            onClick={handleOpenCreate}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderRadius: 2,
              bgcolor: BRAND.teal,
              "&:hover": { bgcolor: BRAND.tealHover },
            }}
          >
            New role
          </Button>
        }
      />

      <SectionPaper variant="panel" sx={{ p: 2 }}>
        <Stack spacing={1.25}>
          {loading ? (
            <Typography sx={{ color: "text.secondary", p: 1 }}>Loading…</Typography>
          ) : roles.length === 0 ? (
            <Typography sx={{ color: "text.secondary", p: 1 }}>No roles yet.</Typography>
          ) : (
            roles.map((role) => (
              <RoleRow
                key={role.id}
                role={role}
                onEdit={handleOpenEdit}
                onDelete={(r) => {
                  setDeleteTarget(r);
                  setDeleteError(null);
                }}
              />
            ))
          )}
        </Stack>
      </SectionPaper>

      <RoleDialog
        open={dialogOpen}
        role={editingRole}
        capabilities={capabilities}
        existingNames={existingNames}
        callerPermissions={callerPermissions}
        submitting={submitting}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
      />

      <DeleteRoleDialog
        open={Boolean(deleteTarget)}
        role={deleteTarget}
        submitting={submitting}
        error={deleteError}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={handleDelete}
      />

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      />
    </Box>
  );
}
