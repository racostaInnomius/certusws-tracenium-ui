// src/pages/AssetGroups.jsx
//
// Asset Groups — Phase 1 (static groups only).
//
// Operators with 50+ devices use this surface to organize their fleet
// into named buckets ("Call Center", "TI", "Boardroom Macs"). A device
// can belong to many groups; jobs and policy pushes (Phase 3) target
// groups instead of typing device IDs one by one.
//
// Visibility model: any active tenant member can read groups; only
// ADMIN/OWNER can create/edit/delete (the page hides the create &
// destructive buttons for non-admins, and the API would reject them
// anyway with 403).
//
// Phase 2 (dynamic / criteria-based) and Phase 3 (job dispatch by
// group) attach to this same page — the create dialog already has the
// "kind" radio with a disabled "Dynamic" option to telegraph what's
// coming.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import GroupWorkOutlinedIcon from "@mui/icons-material/GroupWorkOutlined";
import GroupAddOutlinedIcon from "@mui/icons-material/GroupAddOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import RemoveCircleOutlineOutlinedIcon from "@mui/icons-material/RemoveCircleOutlineOutlined";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";

import { BRAND, ROLE, DATAGRID_SX } from "../theme/brand";
import SectionPaper from "../components/common/SectionPaper";
import BrandSnackbar from "../components/common/BrandSnackbar";
import { useConfirm } from "../components/common/ConfirmDialog";
import { useAuthContext } from "../auth/AuthContext";
import {
  listAssetGroups,
  createAssetGroup,
  updateAssetGroup,
  deleteAssetGroup,
  listAssetGroupMembers,
  addAssetGroupMembers,
  removeAssetGroupMember,
  getCriteriaCatalog,
  previewAssetGroupCriteria,
  dispatchAssetGroupJob,
} from "../api/assetGroups";
import { listKnownDevices, listJobTypes } from "../api/jobs";

function formatDate(value) {
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

function KindChip({ kind }) {
  if (kind === "dynamic") {
    return (
      <Chip
        size="small"
        label="Dynamic"
        sx={{
          bgcolor: BRAND.cyanSoft,
          color: BRAND.dark,
          fontWeight: 700,
          border: `1px solid ${BRAND.cyan}88`,
        }}
      />
    );
  }
  return (
    <Chip
      size="small"
      label="Static"
      sx={{
        bgcolor: BRAND.tealSoft,
        color: BRAND.tealText,
        fontWeight: 700,
        border: `1px solid ${BRAND.teal}55`,
      }}
    />
  );
}

// ── Criteria builder (dynamic groups) ────────────────────────────
//
// One row per predicate: [field ▼] [op ▼] [value]. The field
// dropdown drives the available ops (each field exposes its own
// subset). Adding a field to the catalog server-side automatically
// shows up here without a UI change.
//
// Live preview: every change debounces a call to the backend's
// `/preview` endpoint, which validates + evaluates the criteria
// against the tenant DB and returns count + sample. The debounce
// keeps the rate down while the operator types into a value field.

function CriteriaBuilder({ catalog, predicates, onChange, error }) {
  const fields = catalog?.fields || [];

  const updatePredicate = (idx, patch) => {
    const next = predicates.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange(next);
  };
  const removePredicate = (idx) => {
    onChange(predicates.filter((_, i) => i !== idx));
  };
  const addPredicate = () => {
    const firstField = fields[0];
    if (!firstField) return;
    const firstOp = firstField.ops[0];
    onChange([
      ...predicates,
      {
        field: firstField.key,
        op: firstOp?.key || "eq",
        value: firstOp?.expectsArray ? [] : "",
      },
    ]);
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
        <Typography
          variant="caption"
          sx={{
            color: BRAND.gray,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Criteria · all of the following must match
        </Typography>
      </Box>
      <Stack spacing={1}>
        {predicates.map((pred, idx) => {
          const fieldSpec = fields.find((f) => f.key === pred.field);
          const opSpec = fieldSpec?.ops.find((o) => o.key === pred.op);
          return (
            <Stack
              key={idx}
              direction="row"
              spacing={1}
              alignItems="flex-start"
              sx={{
                p: 1,
                bgcolor: BRAND.surfaceMuted,
                borderRadius: 2,
                border: `1px solid ${BRAND.border}`,
              }}
            >
              <TextField
                select
                size="small"
                label="Field"
                value={pred.field}
                onChange={(e) => {
                  const newField = e.target.value;
                  const newSpec = fields.find((f) => f.key === newField);
                  // Reset op + value to safe defaults whenever the
                  // field changes — the previous op might not be
                  // allowed for the new field, and the previous
                  // value's type might not coerce.
                  const firstOp = newSpec?.ops[0];
                  updatePredicate(idx, {
                    field: newField,
                    op: firstOp?.key || "eq",
                    value: firstOp?.expectsArray ? [] : "",
                  });
                }}
                sx={{ minWidth: 160 }}
              >
                {fields.map((f) => (
                  <MenuItem key={f.key} value={f.key}>
                    {f.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Op"
                value={pred.op}
                onChange={(e) => {
                  const newOp = e.target.value;
                  const newOpSpec = fieldSpec?.ops.find((o) => o.key === newOp);
                  // Coerce value shape if the op switched between
                  // single and array variants.
                  const wasArray = Array.isArray(pred.value);
                  const expectsArray = Boolean(newOpSpec?.expectsArray);
                  let newValue = pred.value;
                  if (expectsArray && !wasArray) {
                    newValue = pred.value ? [pred.value] : [];
                  } else if (!expectsArray && wasArray) {
                    newValue = pred.value[0] || "";
                  }
                  updatePredicate(idx, { op: newOp, value: newValue });
                }}
                sx={{ minWidth: 120 }}
              >
                {(fieldSpec?.ops || []).map((o) => (
                  <MenuItem key={o.key} value={o.key}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              {opSpec?.expectsArray ? (
                <TextField
                  size="small"
                  label="Values (comma-separated)"
                  value={
                    Array.isArray(pred.value) ? pred.value.join(", ") : ""
                  }
                  onChange={(e) =>
                    updatePredicate(idx, {
                      value: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter((s) => s.length > 0),
                    })
                  }
                  fullWidth
                  sx={{ flex: 1, minWidth: 200 }}
                  placeholder="e.g. x64, arm64"
                />
              ) : (
                <TextField
                  size="small"
                  label="Value"
                  value={String(pred.value ?? "")}
                  onChange={(e) =>
                    updatePredicate(idx, { value: e.target.value })
                  }
                  fullWidth
                  sx={{ flex: 1, minWidth: 200 }}
                />
              )}
              <IconButton
                size="small"
                onClick={() => removePredicate(idx)}
                sx={{ color: BRAND.gray, "&:hover": { color: ROLE.critical } }}
                title="Remove predicate"
              >
                <RemoveCircleOutlineOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>
          );
        })}
        <Button
          size="small"
          variant="text"
          startIcon={<AddOutlinedIcon />}
          onClick={addPredicate}
          disabled={fields.length === 0}
          sx={{
            textTransform: "none",
            color: BRAND.teal,
            alignSelf: "flex-start",
            "&:hover": { bgcolor: BRAND.tealSoft },
          }}
        >
          Add predicate
        </Button>
      </Stack>
      {error ? (
        <Alert severity="error" variant="outlined" sx={{ mt: 1 }}>
          {error}
        </Alert>
      ) : null}
    </Box>
  );
}

// ── Create / edit dialog ──────────────────────────────────────────

function CreateGroupDialog({ open, onClose, onCreated, devices }) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [kind, setKind] = React.useState("static");
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());
  const [search, setSearch] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");

  // Phase 2: dynamic group state.
  const [criteriaCatalog, setCriteriaCatalog] = React.useState(null);
  const [predicates, setPredicates] = React.useState([]);
  const [previewState, setPreviewState] = React.useState({
    loading: false,
    count: null,
    sample: [],
    error: null,
  });

  // Reset whenever the dialog opens — operators expect a clean slate.
  React.useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setKind("static");
      setSelectedIds(new Set());
      setSearch("");
      setSubmitting(false);
      setErrorMessage("");
      setPredicates([]);
      setPreviewState({ loading: false, count: null, sample: [], error: null });
    }
  }, [open]);

  // Lazy-load the criteria catalog the first time someone opens the
  // dialog. Static across a session — we don't refetch on every open.
  React.useEffect(() => {
    if (!open || criteriaCatalog) return;
    let cancelled = false;
    getCriteriaCatalog()
      .then((res) => {
        if (cancelled) return;
        setCriteriaCatalog(res || { fields: [] });
      })
      .catch(() => {
        if (cancelled) return;
        // Soft-fail: dynamic will just have no fields available.
        // Static path keeps working.
        setCriteriaCatalog({ fields: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, criteriaCatalog]);

  // Debounced live preview when in dynamic mode + at least one
  // predicate is present + all values are non-empty. We don't want
  // to fire previews against half-typed values that would error out
  // on every keystroke.
  React.useEffect(() => {
    if (kind !== "dynamic") {
      setPreviewState({ loading: false, count: null, sample: [], error: null });
      return;
    }
    if (predicates.length === 0) {
      setPreviewState({ loading: false, count: 0, sample: [], error: null });
      return;
    }
    const allValuesPresent = predicates.every((p) => {
      if (Array.isArray(p.value)) return p.value.length > 0;
      return typeof p.value === "string" && p.value.trim().length > 0;
    });
    if (!allValuesPresent) {
      setPreviewState({ loading: false, count: null, sample: [], error: null });
      return;
    }

    setPreviewState((prev) => ({ ...prev, loading: true, error: null }));
    const handle = setTimeout(async () => {
      try {
        const res = await previewAssetGroupCriteria({ all: predicates }, 5);
        setPreviewState({
          loading: false,
          count: Number(res?.count ?? 0),
          sample: Array.isArray(res?.sample) ? res.sample : [],
          error: null,
        });
      } catch (err) {
        setPreviewState({
          loading: false,
          count: null,
          sample: [],
          error: err?.body?.message || err?.message || "Preview failed",
        });
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [kind, predicates]);

  const filteredDevices = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((d) => {
      return (
        (d.hostname || "").toLowerCase().includes(q) ||
        (d.deviceId || "").toLowerCase().includes(q)
      );
    });
  }, [devices, search]);

  const toggleDevice = (deviceId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setErrorMessage("Group name is required");
      return;
    }
    if (kind === "dynamic" && predicates.length === 0) {
      setErrorMessage("Add at least one predicate to define the dynamic group");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        kind,
      };
      if (kind === "static") {
        payload.deviceIds = Array.from(selectedIds);
      } else {
        payload.criteriaJson = { all: predicates };
      }
      const res = await createAssetGroup(payload);
      onCreated(res?.group ?? null);
      onClose();
    } catch (err) {
      const code = err?.body?.error;
      const field = err?.body?.field;
      const msg = err?.body?.message || err?.message || "Failed to create group";
      if (code === "ASSET_GROUP_CONFLICT") {
        setErrorMessage(msg);
      } else if (field) {
        setErrorMessage(`${field}: ${msg}`);
      } else {
        setErrorMessage(msg);
      }
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          border: `1px solid ${BRAND.border}`,
          boxShadow: BRAND.shadow,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          color: BRAND.dark,
          fontWeight: 800,
          fontSize: 18,
          pr: 5,
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 2,
            bgcolor: BRAND.tealSoft,
            color: BRAND.tealText,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <GroupAddOutlinedIcon fontSize="small" />
        </Box>
        New asset group
        <IconButton
          aria-label="close"
          onClick={onClose}
          disabled={submitting}
          size="small"
          sx={{
            position: "absolute",
            top: 12,
            right: 12,
            color: BRAND.gray,
            "&:hover": { color: BRAND.dark },
          }}
        >
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pb: 1.5 }}>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            fullWidth
            inputProps={{ maxLength: 80 }}
          />
          <TextField
            label="Description (optional)"
            size="small"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
            fullWidth
            multiline
            minRows={2}
            inputProps={{ maxLength: 280 }}
          />

          <FormControl disabled={submitting}>
            <Typography
              variant="caption"
              sx={{
                color: BRAND.gray,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                mb: 0.5,
              }}
            >
              Group type
            </Typography>
            <RadioGroup row value={kind} onChange={(e) => setKind(e.target.value)}>
              <FormControlLabel
                value="static"
                control={<Radio sx={{ color: BRAND.teal, "&.Mui-checked": { color: BRAND.teal } }} />}
                label={
                  <Box>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Static</Typography>
                    <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
                      Pick devices manually below.
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="dynamic"
                control={<Radio sx={{ color: BRAND.teal, "&.Mui-checked": { color: BRAND.teal } }} />}
                label={
                  <Box>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Dynamic</Typography>
                    <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
                      Defined by criteria — membership auto-updates.
                    </Typography>
                  </Box>
                }
              />
            </RadioGroup>
          </FormControl>

          {kind === "dynamic" && (
            <Box>
              <CriteriaBuilder
                catalog={criteriaCatalog}
                predicates={predicates}
                onChange={setPredicates}
                error={previewState.error}
              />
              {/* Live preview — count + 5-row sample. The count is the
                  primary signal ("does my filter match what I think
                  it matches?"); the sample is reassurance the right
                  hosts come back. Sample is read-only. */}
              <Box
                sx={{
                  mt: 1.5,
                  p: 1.25,
                  bgcolor: BRAND.tealSoft,
                  borderRadius: 2,
                  border: `1px solid ${BRAND.teal}55`,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: BRAND.tealText,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Preview
                  </Typography>
                  {previewState.loading ? (
                    <CircularProgress size={12} sx={{ color: BRAND.tealText }} />
                  ) : null}
                  <Typography sx={{ fontSize: 13, color: BRAND.dark, ml: "auto" }}>
                    {previewState.count === null
                      ? "complete the predicates to evaluate"
                      : (
                        <>
                          <strong>{previewState.count}</strong> device(s) match
                        </>
                      )}
                  </Typography>
                </Box>
                {previewState.sample.length > 0 ? (
                  <Stack
                    direction="row"
                    spacing={0.5}
                    sx={{ flexWrap: "wrap", gap: 0.5, mt: 0.5 }}
                  >
                    {previewState.sample.map((d) => (
                      <Chip
                        key={d.deviceId}
                        size="small"
                        label={d.hostname || d.deviceId.slice(0, 12)}
                        sx={{
                          height: 20,
                          fontSize: 11,
                          bgcolor: "#fff",
                          border: `1px solid ${BRAND.border}`,
                          color: BRAND.dark,
                        }}
                      />
                    ))}
                    {previewState.count !== null && previewState.count > previewState.sample.length ? (
                      <Typography sx={{ fontSize: 11, color: BRAND.gray, alignSelf: "center" }}>
                        + {previewState.count - previewState.sample.length} more
                      </Typography>
                    ) : null}
                  </Stack>
                ) : null}
              </Box>
            </Box>
          )}

          {kind === "static" && (
            <Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: 1,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: BRAND.gray,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Members
                </Typography>
                <Typography sx={{ fontSize: 12, color: BRAND.dark }}>
                  <strong>{selectedIds.size}</strong> selected · {devices.length} known
                </Typography>
              </Box>
              <TextField
                size="small"
                placeholder="Search hostname / device ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 1 }}
              />
              <Box
                sx={{
                  border: `1px solid ${BRAND.border}`,
                  borderRadius: 2,
                  maxHeight: 280,
                  overflowY: "auto",
                  bgcolor: BRAND.surface,
                }}
              >
                {filteredDevices.length === 0 ? (
                  <Box sx={{ p: 2, textAlign: "center", color: BRAND.gray }}>
                    <Typography variant="body2">No devices match.</Typography>
                  </Box>
                ) : (
                  filteredDevices.map((d) => {
                    const checked = selectedIds.has(d.deviceId);
                    return (
                      <Box
                        key={d.deviceId}
                        onClick={() => toggleDevice(d.deviceId)}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1.5,
                          px: 1.5,
                          py: 0.75,
                          cursor: "pointer",
                          bgcolor: checked ? BRAND.tealSoft : "transparent",
                          borderBottom: `1px solid ${BRAND.border}`,
                          "&:hover": { bgcolor: BRAND.rowHover },
                        }}
                      >
                        <Box
                          sx={{
                            width: 16,
                            height: 16,
                            borderRadius: 0.5,
                            border: `2px solid ${checked ? BRAND.teal : BRAND.gray}`,
                            bgcolor: checked ? BRAND.teal : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontSize: 12,
                            fontWeight: 800,
                            flexShrink: 0,
                          }}
                        >
                          {checked ? "✓" : ""}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            sx={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: BRAND.dark,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {d.hostname || d.deviceId}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: 11,
                              color: BRAND.gray,
                              fontFamily: "monospace",
                            }}
                          >
                            {d.deviceId}
                          </Typography>
                        </Box>
                        {d.connected ? (
                          <Chip
                            size="small"
                            label="online"
                            sx={{
                              height: 18,
                              fontSize: 10.5,
                              bgcolor: ROLE.positiveSoft,
                              color: ROLE.positive,
                              fontWeight: 700,
                            }}
                          />
                        ) : null}
                      </Box>
                    );
                  })
                )}
              </Box>
            </Box>
          )}

          {errorMessage ? (
            <Alert severity="error" variant="outlined">
              {errorMessage}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1, borderTop: `1px solid ${BRAND.border}`, bgcolor: BRAND.surfaceMuted }}>
        <Button
          onClick={onClose}
          disabled={submitting}
          variant="text"
          sx={{ textTransform: "none", color: BRAND.dark, fontWeight: 600 }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          variant="contained"
          sx={{
            textTransform: "none",
            fontWeight: 700,
            bgcolor: BRAND.teal,
            "&:hover": { bgcolor: BRAND.tealHover },
          }}
        >
          {submitting ? "Creating…" : "Create group"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Rename dialog (in-place edit of name + description) ──────────

function RenameGroupDialog({ open, group, onClose, onUpdated }) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");

  React.useEffect(() => {
    if (open && group) {
      setName(group.name || "");
      setDescription(group.description || "");
      setErrorMessage("");
      setSubmitting(false);
    }
  }, [open, group]);

  const handleSubmit = async () => {
    if (!group) return;
    if (!name.trim()) {
      setErrorMessage("Group name is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await updateAssetGroup(group.id, {
        name: name.trim(),
        description: description.trim() || null,
      });
      onUpdated(res?.group ?? null);
      onClose();
    } catch (err) {
      setErrorMessage(err?.body?.message || err?.message || "Update failed");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: BRAND.dark, fontWeight: 800 }}>
        Rename group
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            fullWidth
            inputProps={{ maxLength: 80 }}
          />
          <TextField
            label="Description"
            size="small"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
            fullWidth
            multiline
            minRows={2}
            inputProps={{ maxLength: 280 }}
          />
          {errorMessage ? <Alert severity="error" variant="outlined">{errorMessage}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: "none", color: BRAND.dark }}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          variant="contained"
          sx={{
            textTransform: "none",
            fontWeight: 700,
            bgcolor: BRAND.teal,
            "&:hover": { bgcolor: BRAND.tealHover },
          }}
        >
          {submitting ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Dispatch-job dialog ───────────────────────────────────────────
//
// Phase 3: fires a job at every member of the group. Backend resolves
// membership at request time (static via DB, dynamic via criteria),
// so we don't pre-fetch the device list here — the dialog is just a
// thin wrapper around `POST /asset-groups/:id/jobs`.
//
// Job-type catalog is loaded lazily when the dialog opens (cached in
// the parent across opens to avoid repeating the request). Payload
// fields are rendered per known type — kept tight on purpose: this
// dialog targets fleet operations, not arbitrary one-off jobs. If the
// operator needs more advanced control they can still hit individual
// devices through the existing Jobs page.

const FACT_TYPES = ["inventory", "compliance", "all"];
const PATCH_INSTALL_MODES = ["install", "download"];

function defaultPayloadFor(jobType) {
  switch (jobType) {
    case "facts_snapshot":
      return { factType: "all" };
    case "agent_update":
      return { version: "" };
    case "patch_scan":
      return {};
    case "patch_install":
      return { mode: "install", kbArticleIds: [] };
    default:
      return {};
  }
}

function payloadFieldsValid(jobType, payload) {
  switch (jobType) {
    case "facts_snapshot":
      return FACT_TYPES.includes(payload.factType);
    case "agent_update":
      return typeof payload.version === "string" && payload.version.trim().length > 0;
    case "patch_scan":
      return true;
    case "patch_install":
      return PATCH_INSTALL_MODES.includes(payload.mode);
    default:
      // Unknown job types: backend will reject — don't pre-block.
      return true;
  }
}

function DispatchJobDialog({ open, group, onClose, onDispatched, notify }) {
  const [jobTypes, setJobTypes] = React.useState([]);
  const [catalogLoading, setCatalogLoading] = React.useState(false);
  const [jobType, setJobType] = React.useState("");
  const [payload, setPayload] = React.useState({});
  const [submitting, setSubmitting] = React.useState(false);

  // Reset on open + lazy-load catalog. We don't gate the dialog on
  // catalog load — if the request fails the operator sees an empty
  // dropdown and a notify error; backend would reject the dispatch
  // anyway, so this is just UX polish.
  React.useEffect(() => {
    if (!open) return;
    setJobType("");
    setPayload({});
    if (jobTypes.length > 0) return;
    setCatalogLoading(true);
    listJobTypes()
      .then((res) => {
        const items = Array.isArray(res?.items) ? res.items : [];
        setJobTypes(items);
      })
      .catch((err) => {
        notify?.("error", err?.body?.message || err?.message || "Failed to load job types");
      })
      .finally(() => setCatalogLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleTypeChange = (newType) => {
    setJobType(newType);
    setPayload(defaultPayloadFor(newType));
  };

  const canSubmit =
    !!group &&
    !!jobType &&
    payloadFieldsValid(jobType, payload) &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Normalize patch_install kb list (comma-separated string in UI →
      // string[] on the wire). Trim + drop empties so blank "KB123, ,
      // KB456" doesn't reach the backend.
      let outboundPayload = payload;
      if (jobType === "patch_install" && typeof payload.kbArticleIdsRaw === "string") {
        outboundPayload = {
          mode: payload.mode,
          kbArticleIds: payload.kbArticleIdsRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        };
      }
      const res = await dispatchAssetGroupJob(group.id, {
        jobType,
        payload: outboundPayload,
      });
      notify?.(
        "success",
        `Dispatched ${res?.count ?? 0} job(s) to "${res?.groupName || group.name}"`
      );
      onDispatched?.(res);
      onClose?.();
    } catch (err) {
      notify?.("error", err?.body?.message || err?.error || err?.message || "Dispatch failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
        Dispatch job to {group?.name || "group"}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert
            severity="info"
            sx={{
              bgcolor: BRAND.alert?.infoSoft || BRAND.tealSoft,
              color: BRAND.dark,
              "& .MuiAlert-icon": { color: BRAND.teal },
            }}
          >
            One job will be created per member device. {group?.kind === "dynamic"
              ? "Membership is evaluated now from the group's criteria."
              : "Current membership is read at request time."}
          </Alert>

          <TextField
            select
            size="small"
            fullWidth
            label="Job type"
            value={jobType}
            onChange={(e) => handleTypeChange(e.target.value)}
            disabled={catalogLoading}
            helperText={catalogLoading ? "Loading job types…" : ""}
          >
            {jobTypes.map((t) => (
              <MenuItem key={t.jobType} value={t.jobType}>
                {t.label || t.jobType}
              </MenuItem>
            ))}
          </TextField>

          {jobType === "facts_snapshot" ? (
            <TextField
              select
              size="small"
              fullWidth
              label="Fact type"
              value={payload.factType || ""}
              onChange={(e) => setPayload({ factType: e.target.value })}
            >
              {FACT_TYPES.map((v) => (
                <MenuItem key={v} value={v}>{v}</MenuItem>
              ))}
            </TextField>
          ) : null}

          {jobType === "agent_update" ? (
            <TextField
              size="small"
              fullWidth
              label="Target version"
              placeholder="e.g. 1.1.11"
              value={payload.version || ""}
              onChange={(e) => setPayload({ version: e.target.value })}
              helperText="The agent fetches the matching binary for its platform/arch."
            />
          ) : null}

          {jobType === "patch_install" ? (
            <>
              <TextField
                select
                size="small"
                fullWidth
                label="Mode"
                value={payload.mode || ""}
                onChange={(e) => setPayload({ ...payload, mode: e.target.value })}
              >
                {PATCH_INSTALL_MODES.map((v) => (
                  <MenuItem key={v} value={v}>{v}</MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                fullWidth
                label="KB article IDs (optional)"
                placeholder="KB5034123, KB5034439"
                value={payload.kbArticleIdsRaw || ""}
                onChange={(e) =>
                  setPayload({ ...payload, kbArticleIdsRaw: e.target.value })
                }
                helperText="Comma-separated. Leave blank to install all pending."
              />
            </>
          ) : null}

          {jobType === "patch_scan" ? (
            <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
              No additional parameters — agents will scan and report.
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ color: BRAND.gray, textTransform: "none" }}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          variant="contained"
          startIcon={submitting ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : <RocketLaunchOutlinedIcon />}
          sx={{
            textTransform: "none",
            fontWeight: 700,
            bgcolor: BRAND.teal,
            "&:hover": { bgcolor: BRAND.tealHover },
          }}
        >
          {submitting ? "Dispatching…" : "Dispatch"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Detail drawer (members list + add/remove) ────────────────────

function GroupDetailDrawer({ open, group, onClose, devices, canManage, notify, onMembersChanged }) {
  const [members, setMembers] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [addPickerOpen, setAddPickerOpen] = React.useState(false);
  const [dispatchOpen, setDispatchOpen] = React.useState(false);
  const confirm = useConfirm();

  const loadMembers = React.useCallback(async () => {
    if (!group) return;
    setLoading(true);
    try {
      const res = await listAssetGroupMembers(group.id);
      setMembers(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      notify("error", err?.body?.message || err?.message || "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [group, notify]);

  React.useEffect(() => {
    if (open && group) {
      loadMembers();
    } else {
      setMembers([]);
      setAddPickerOpen(false);
      setDispatchOpen(false);
    }
  }, [open, group, loadMembers]);

  // Decorate device IDs with hostnames using the known-devices index.
  const deviceIndex = React.useMemo(() => {
    const m = new Map();
    for (const d of devices) m.set(d.deviceId, d);
    return m;
  }, [devices]);

  const memberRows = React.useMemo(() => {
    return members.map((m) => {
      const dev = deviceIndex.get(m.deviceId);
      return {
        id: m.deviceId,
        deviceId: m.deviceId,
        hostname: dev?.hostname || null,
        connected: dev?.connected === true,
        addedAt: m.addedAt,
        addedBy: m.addedBy,
      };
    });
  }, [members, deviceIndex]);

  const handleRemove = async (deviceId) => {
    const ok = await confirm({
      title: "Remove device from group?",
      body: `${deviceId} will no longer be a member of "${group?.name}".`,
      confirmText: "Remove",
      danger: true,
    });
    if (!ok || !group) return;
    try {
      await removeAssetGroupMember(group.id, deviceId);
      notify("success", "Device removed from group");
      await loadMembers();
      onMembersChanged?.();
    } catch (err) {
      notify("error", err?.body?.message || err?.message || "Remove failed");
    }
  };

  const handleAddMembers = async (deviceIds) => {
    if (!group || deviceIds.length === 0) {
      setAddPickerOpen(false);
      return;
    }
    try {
      const res = await addAssetGroupMembers(group.id, deviceIds);
      notify(
        "success",
        `${res?.added ?? deviceIds.length} device(s) added to ${group.name}`
      );
      setAddPickerOpen(false);
      await loadMembers();
      onMembersChanged?.();
    } catch (err) {
      notify("error", err?.body?.message || err?.message || "Add failed");
    }
  };

  const memberIds = React.useMemo(
    () => new Set(members.map((m) => m.deviceId)),
    [members]
  );

  const columns = [
    {
      field: "hostname",
      headerName: "Hostname",
      flex: 1,
      minWidth: 180,
      renderCell: (params) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: BRAND.dark }}>
            {params.row.hostname || params.row.deviceId.slice(0, 12)}
          </Typography>
          <Typography sx={{ fontSize: 11, color: BRAND.gray, fontFamily: "monospace" }}>
            {params.row.deviceId}
          </Typography>
        </Box>
      ),
    },
    {
      field: "connected",
      headerName: "Status",
      width: 100,
      renderCell: (params) =>
        params.value ? (
          <Chip
            size="small"
            label="online"
            sx={{
              height: 20,
              fontSize: 11,
              bgcolor: ROLE.positiveSoft,
              color: ROLE.positive,
              fontWeight: 700,
            }}
          />
        ) : (
          <Chip
            size="small"
            label="offline"
            sx={{
              height: 20,
              fontSize: 11,
              bgcolor: BRAND.darkSoft,
              color: BRAND.gray,
              fontWeight: 700,
            }}
          />
        ),
    },
    {
      // For static groups this is when the operator manually added the
      // device. For dynamic groups the same column shows "Evaluated"
      // with the cache snapshot time — not a meaningful per-device
      // datum (membership is computed, not stamped). The header label
      // adapts so operators don't read it as "this device joined the
      // group at that timestamp".
      field: "addedAt",
      headerName: group?.kind === "dynamic" ? "Evaluated" : "Added",
      flex: 0.7,
      minWidth: 140,
      renderCell: (params) => formatDate(params.value),
    },
    // Manual remove only makes sense on static groups. Dynamic
    // members are computed; removing one would just reappear on the
    // next evaluation. We hide the action entirely to avoid the
    // operator wondering why the row keeps coming back.
    canManage && group?.kind === "static"
      ? {
          field: "actions",
          headerName: "",
          width: 60,
          sortable: false,
          renderCell: (params) => (
            <IconButton
              size="small"
              onClick={() => handleRemove(params.row.deviceId)}
              sx={{ color: BRAND.gray, "&:hover": { color: ROLE.critical } }}
              title="Remove from group"
            >
              <RemoveCircleOutlineOutlinedIcon fontSize="small" />
            </IconButton>
          ),
        }
      : null,
  ].filter(Boolean);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: "100%", sm: 560, lg: 640 },
            p: 2,
            bgcolor: "#fff",
          },
        },
      }}
    >
      {group ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, height: "100%" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  bgcolor: BRAND.tealSoft,
                  color: BRAND.tealText,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <GroupWorkOutlinedIcon fontSize="small" />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 18, fontWeight: 800, color: BRAND.dark, lineHeight: 1.2 }}>
                  {group.name}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                  <KindChip kind={group.kind} />
                  <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
                    {memberRows.length} member(s)
                  </Typography>
                </Stack>
              </Box>
            </Box>
            <IconButton onClick={onClose} size="small" sx={{ color: BRAND.gray }}>
              <CloseOutlinedIcon fontSize="small" />
            </IconButton>
          </Box>

          {group.description ? (
            <Typography sx={{ fontSize: 13, color: BRAND.dark, lineHeight: 1.55 }}>
              {group.description}
            </Typography>
          ) : null}

          <Divider sx={{ borderColor: BRAND.border }} />

          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography
              variant="caption"
              sx={{
                color: BRAND.gray,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Members
            </Typography>
            <Stack direction="row" spacing={1}>
              {/* Dispatch is available for both static and dynamic
                  groups (admin-gated). For dynamic the backend
                  re-evaluates criteria at request time, so the count
                  shown in the dialog matches what gets fanned out. */}
              {canManage ? (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<RocketLaunchOutlinedIcon />}
                  onClick={() => setDispatchOpen(true)}
                  disabled={memberRows.length === 0}
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    bgcolor: BRAND.teal,
                    "&:hover": { bgcolor: BRAND.tealHover },
                  }}
                  title={
                    memberRows.length === 0
                      ? "Group is empty — nothing to dispatch to"
                      : "Run a job on every member of this group"
                  }
                >
                  Dispatch job
                </Button>
              ) : null}
              {canManage && group.kind === "static" ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddOutlinedIcon />}
                  onClick={() => setAddPickerOpen(true)}
                  sx={{
                    textTransform: "none",
                    borderColor: BRAND.teal,
                    color: BRAND.teal,
                    "&:hover": { bgcolor: BRAND.tealSoft, borderColor: BRAND.tealHover },
                  }}
                >
                  Add devices
                </Button>
              ) : null}
            </Stack>
          </Box>

          <Box sx={{ flex: 1, overflow: "hidden" }}>
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : memberRows.length === 0 ? (
              <Box sx={{ p: 3, textAlign: "center", color: BRAND.gray }}>
                <Typography variant="body2">
                  This group has no members yet.
                </Typography>
              </Box>
            ) : (
              <DataGrid
                rows={memberRows}
                columns={columns}
                density="compact"
                disableRowSelectionOnClick
                pageSizeOptions={[10, 25, 50]}
                initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                sx={DATAGRID_SX}
                autoHeight
              />
            )}
          </Box>
        </Box>
      ) : null}

      {/* Inline add-device picker reuses the create dialog's UI shape
          so the operator's mental model stays consistent. We keep it
          inside the drawer (not as a sibling Dialog of the page) so
          closing the drawer unmounts both. */}
      <AddMembersDialog
        open={addPickerOpen}
        onClose={() => setAddPickerOpen(false)}
        onConfirm={handleAddMembers}
        devices={devices.filter((d) => !memberIds.has(d.deviceId))}
        groupName={group?.name || ""}
      />

      <DispatchJobDialog
        open={dispatchOpen}
        group={group}
        onClose={() => setDispatchOpen(false)}
        onDispatched={() => {
          // No member-list refetch needed — dispatch doesn't change
          // membership. We still close the dialog and let the
          // operator follow the jobs in the Jobs page.
        }}
        notify={notify}
      />
    </Drawer>
  );
}

function AddMembersDialog({ open, onClose, onConfirm, devices, groupName }) {
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      setSearch("");
    }
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter(
      (d) =>
        (d.hostname || "").toLowerCase().includes(q) ||
        (d.deviceId || "").toLowerCase().includes(q)
    );
  }, [devices, search]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: BRAND.dark, fontWeight: 800 }}>
        Add devices to {groupName}
      </DialogTitle>
      <DialogContent>
        <TextField
          size="small"
          placeholder="Search hostname / device ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 1 }}
        />
        <Box
          sx={{
            border: `1px solid ${BRAND.border}`,
            borderRadius: 2,
            maxHeight: 320,
            overflowY: "auto",
            bgcolor: BRAND.surface,
          }}
        >
          {filtered.length === 0 ? (
            <Box sx={{ p: 2, textAlign: "center", color: BRAND.gray }}>
              <Typography variant="body2">No devices available to add.</Typography>
            </Box>
          ) : (
            filtered.map((d) => {
              const checked = selectedIds.has(d.deviceId);
              return (
                <Box
                  key={d.deviceId}
                  onClick={() =>
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(d.deviceId)) next.delete(d.deviceId);
                      else next.add(d.deviceId);
                      return next;
                    })
                  }
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    px: 1.5,
                    py: 0.75,
                    cursor: "pointer",
                    bgcolor: checked ? BRAND.tealSoft : "transparent",
                    borderBottom: `1px solid ${BRAND.border}`,
                    "&:hover": { bgcolor: BRAND.rowHover },
                  }}
                >
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: 0.5,
                      border: `2px solid ${checked ? BRAND.teal : BRAND.gray}`,
                      bgcolor: checked ? BRAND.teal : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {checked ? "✓" : ""}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: BRAND.dark,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {d.hostname || d.deviceId}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: BRAND.gray, fontFamily: "monospace" }}>
                      {d.deviceId}
                    </Typography>
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: "none", color: BRAND.dark }}>
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm(Array.from(selectedIds))}
          variant="contained"
          disabled={selectedIds.size === 0}
          sx={{
            textTransform: "none",
            fontWeight: 700,
            bgcolor: BRAND.teal,
            "&:hover": { bgcolor: BRAND.tealHover },
          }}
        >
          Add ({selectedIds.size})
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main page component ──────────────────────────────────────────

export default function AssetGroups() {
  const { auth } = useAuthContext();
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;
  const canManage = isActiveMember && (tenantRole === "ADMIN" || tenantRole === "OWNER");

  const [groups, setGroups] = React.useState([]);
  const [devices, setDevices] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState(null);
  const [drawerGroup, setDrawerGroup] = React.useState(null);
  const [snackbar, setSnackbar] = React.useState({ open: false, severity: "success", message: "" });
  const confirm = useConfirm();

  const notify = React.useCallback((severity, message) => {
    setSnackbar({ open: true, severity, message });
  }, []);

  const loadGroups = React.useCallback(async () => {
    try {
      const res = await listAssetGroups();
      setGroups(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      notify("error", err?.body?.message || err?.message || "Failed to load groups");
    }
  }, [notify]);

  const loadDevices = React.useCallback(async () => {
    try {
      const res = await listKnownDevices();
      const items = Array.isArray(res?.items) ? res.items : [];
      setDevices(
        items.map((d) => ({
          deviceId: String(d?.deviceId || "").trim(),
          hostname: String(d?.hostname || "").trim(),
          connected: d?.connected === true,
        })).filter((d) => d.deviceId)
      );
    } catch (err) {
      // Devices list isn't critical for the groups page itself; just
      // means the picker / hostname decoration shows IDs only.
      notify("error", "Failed to load device list");
    }
  }, [notify]);

  React.useEffect(() => {
    setLoading(true);
    Promise.all([loadGroups(), loadDevices()]).finally(() => setLoading(false));
  }, [loadGroups, loadDevices]);

  const handleDelete = async (group) => {
    const ok = await confirm({
      title: "Delete group?",
      body: `"${group.name}" will be removed permanently. Devices will not be affected, just their membership in this group.`,
      confirmText: "Delete group",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAssetGroup(group.id);
      notify("success", `Group "${group.name}" deleted`);
      // If the drawer was open on this group, close it before refresh
      // — the next loadGroups won't include it anymore.
      if (drawerGroup?.id === group.id) setDrawerGroup(null);
      await loadGroups();
    } catch (err) {
      notify("error", err?.body?.message || err?.message || "Delete failed");
    }
  };

  const columns = [
    {
      field: "name",
      headerName: "Name",
      flex: 1.2,
      minWidth: 200,
      renderCell: (params) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: BRAND.dark }}>
            {params.row.name}
          </Typography>
          {params.row.description ? (
            <Typography
              sx={{
                fontSize: 12,
                color: BRAND.gray,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {params.row.description}
            </Typography>
          ) : null}
        </Box>
      ),
    },
    {
      field: "kind",
      headerName: "Type",
      width: 110,
      renderCell: (params) => <KindChip kind={params.value} />,
    },
    {
      field: "memberCount",
      headerName: "Members",
      width: 110,
      // Dynamic groups whose member count hasn't been evaluated yet
      // come back with `memberCount: null` — render as em-dash with a
      // tooltip so operators know what's going on instead of seeing
      // "0" and assuming the criteria match nothing.
      renderCell: (params) => {
        if (params.value == null) {
          return (
            <Tooltip title="Open the group to evaluate its dynamic membership">
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.gray }}>
                —
              </Typography>
            </Tooltip>
          );
        }
        return (
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.dark }}>
            {params.value}
          </Typography>
        );
      },
    },
    {
      field: "updatedAt",
      headerName: "Last update",
      flex: 0.7,
      minWidth: 140,
      renderCell: (params) => (
        <Typography sx={{ fontSize: 12.5, color: BRAND.dark }}>
          {formatDate(params.value)}
        </Typography>
      ),
    },
    canManage
      ? {
          field: "actions",
          headerName: "",
          width: 96,
          sortable: false,
          align: "right",
          renderCell: (params) => (
            <Stack direction="row" spacing={0.5}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenameTarget(params.row);
                }}
                sx={{ color: BRAND.gray, "&:hover": { color: BRAND.dark } }}
                title="Rename"
              >
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(params.row);
                }}
                sx={{ color: BRAND.gray, "&:hover": { color: ROLE.critical } }}
                title="Delete"
              >
                <DeleteOutlineOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>
          ),
        }
      : null,
  ].filter(Boolean);

  return (
    <Box sx={{ pb: 4 }}>
      <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            mb: 1.5,
            flexWrap: "wrap",
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.dark }}>
              Asset Groups
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: BRAND.gray, mt: 0.25 }}>
              Organize the fleet into named buckets for filtering and bulk operations.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshOutlinedIcon />}
              onClick={() => {
                setLoading(true);
                Promise.all([loadGroups(), loadDevices()]).finally(() => setLoading(false));
              }}
              sx={{
                textTransform: "none",
                borderColor: BRAND.border,
                color: BRAND.dark,
                "&:hover": { borderColor: BRAND.teal, bgcolor: BRAND.tealSoft },
              }}
            >
              Refresh
            </Button>
            {canManage ? (
              <Button
                variant="contained"
                startIcon={<GroupAddOutlinedIcon />}
                onClick={() => setCreateOpen(true)}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  bgcolor: BRAND.teal,
                  "&:hover": { bgcolor: BRAND.tealHover },
                }}
              >
                New group
              </Button>
            ) : null}
          </Stack>
        </Box>

        {!canManage ? (
          <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
            Asset Groups are read-only for your role. Contact a tenant admin to create or edit groups.
          </Alert>
        ) : null}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : groups.length === 0 ? (
          <Box sx={{ py: 6, textAlign: "center", color: BRAND.gray }}>
            <GroupWorkOutlinedIcon sx={{ fontSize: 48, color: BRAND.gray, mb: 1 }} />
            <Typography variant="body2">
              No asset groups yet. {canManage ? 'Click "New group" to create your first one.' : ""}
            </Typography>
          </Box>
        ) : (
          <DataGrid
            rows={groups}
            columns={columns}
            density="compact"
            disableRowSelectionOnClick
            onRowClick={(params) => setDrawerGroup(params.row)}
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            sx={{ ...DATAGRID_SX, cursor: "pointer" }}
            autoHeight
          />
        )}
      </SectionPaper>

      <CreateGroupDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        devices={devices}
        onCreated={(group) => {
          notify("success", `Group "${group?.name || ""}" created`);
          loadGroups();
        }}
      />

      <RenameGroupDialog
        open={Boolean(renameTarget)}
        group={renameTarget}
        onClose={() => setRenameTarget(null)}
        onUpdated={(g) => {
          notify("success", `Group renamed to "${g?.name || ""}"`);
          loadGroups();
          if (drawerGroup?.id === g?.id) setDrawerGroup(g);
        }}
      />

      <GroupDetailDrawer
        open={Boolean(drawerGroup)}
        group={drawerGroup}
        onClose={() => setDrawerGroup(null)}
        devices={devices}
        canManage={canManage}
        notify={notify}
        onMembersChanged={loadGroups}
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
