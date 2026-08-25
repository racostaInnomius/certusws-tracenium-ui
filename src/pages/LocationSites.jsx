// src/pages/LocationSites.jsx
//
// Phase 1b of device geolocation: the operator-maintained map from a network
// range to a site name. With no mappings the device drawer falls back to the
// raw subnet, so this page is entirely optional — it exists to turn
// "10.20.30.0/24" into "Oficina CDMX".
//
// Matching is by containment and the most specific rule wins, so an operator
// can map a broad range once and override a slice of it. The list is ordered
// broad-first to mirror that.

import * as React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";

import { BRAND, TEXT } from "../theme/brand";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import AsyncState from "../components/common/AsyncState";
import BrandSnackbar from "../components/common/BrandSnackbar";
import { useConfirm } from "../components/common/ConfirmDialog";
import { listFrom } from "../api/shape";
import {
  listLocationSites,
  createLocationSite,
  updateLocationSite,
  deleteLocationSite,
} from "../api/locationSites";

const EMPTY_DRAFT = { cidr: "", siteName: "", description: "", city: "", lat: "", lon: "" };

export default function LocationSites({ onNavigate }) {
  const confirm = useConfirm();

  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [snack, setSnack] = React.useState(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null); // null = creating
  const [draft, setDraft] = React.useState(EMPTY_DRAFT);
  const [saving, setSaving] = React.useState(false);
  // Field-level error from the backend (it names the offending field), so a
  // bad CIDR highlights the CIDR input instead of a generic toast.
  const [fieldError, setFieldError] = React.useState({ field: null, message: "" });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listLocationSites();
      setItems(listFrom(res, { context: "locationSites" }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setFieldError({ field: null, message: "" });
    setDialogOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setDraft({
      cidr: row.cidr ?? "",
      siteName: row.siteName ?? "",
      description: row.description ?? "",
      city: row.city ?? "",
      // Empty string rather than null: these feed text inputs, and a null would
      // flip them from controlled to uncontrolled on edit.
      lat: row.lat ?? "",
      lon: row.lon ?? "",
    });
    setFieldError({ field: null, message: "" });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setFieldError({ field: null, message: "" });
    try {
      const res = editing
        ? await updateLocationSite(editing.id, draft)
        : await createLocationSite(draft);

      if (res?.ok === false) {
        // Backend rejected it with a structured field error — surface it on
        // the input rather than as a toast the operator has to correlate.
        setFieldError({ field: res.field ?? null, message: res.message || "Could not save." });
        return;
      }
      setDialogOpen(false);
      setSnack({ severity: "success", message: editing ? "Site updated." : "Site added." });
      await load();
    } catch (err) {
      setFieldError({
        field: err?.body?.field ?? null,
        message: err?.body?.message || err?.message || "Could not save.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row) {
    const ok = await confirm({
      title: "Remove site mapping?",
      // Say plainly what is and is not lost — deleting a mapping never touches
      // the recorded positions.
      body: `Devices on ${row.cidr} will show the raw subnet again. Location history is not affected.`,
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteLocationSite(row.id);
      setSnack({ severity: "success", message: "Site mapping removed." });
      await load();
    } catch (err) {
      setSnack({ severity: "error", message: err?.body?.message || err?.message || "Could not remove." });
    }
  }

  return (
    <Box>
      <PageHeader
        title="Location sites"
        subtitle="Map network ranges to site names. Devices on a mapped range show the site instead of the raw subnet."
        icon={<PlaceOutlinedIcon />}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            {onNavigate ? (
              <Button
                size="small"
                variant="text"
                onClick={() => onNavigate("configurations")}
                sx={{ color: BRAND.gray }}
              >
                ← Settings
              </Button>
            ) : null}
            <Button
              variant="contained"
              startIcon={<AddOutlinedIcon />}
              onClick={openCreate}
              sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
            >
              Add site
            </Button>
          </Stack>
        }
      />

      <SectionPaper variant="panel">
        <AsyncState
          loading={loading}
          error={error}
          isEmpty={items.length === 0}
          emptyText="No site mappings yet. Devices show their raw subnet until you add one."
          onRetry={load}
          minHeight={220}
        >
          <Stack spacing={1}>
            {/* NOTE: children evaluate eagerly, so this must tolerate an empty
                list even while AsyncState is rendering another branch. */}
            {items.map((row) => (
              <Stack
                key={row.id}
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                alignItems={{ xs: "flex-start", sm: "center" }}
                sx={{
                  p: 1.25,
                  border: `1px solid ${BRAND.border}`,
                  borderRadius: 2,
                  bgcolor: BRAND.surface,
                }}
              >
                <Typography
                  sx={{ fontFamily: "monospace", fontSize: TEXT.md, color: BRAND.dark, minWidth: 150 }}
                >
                  {row.cidr}
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: TEXT.base, fontWeight: 700, color: BRAND.dark }}>
                    {row.siteName}
                    {row.city ? (
                      <Typography component="span" sx={{ fontSize: TEXT.md, color: "text.secondary", ml: 1 }}>
                        {row.city}
                      </Typography>
                    ) : null}
                  </Typography>
                  {row.description ? (
                    <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                      {row.description}
                    </Typography>
                  ) : null}
                </Box>
                <Stack direction="row" spacing={0.5}>
                  <IconButton
                    aria-label={`Edit ${row.siteName}`}
                    size="small"
                    onClick={() => openEdit(row)}
                    sx={{ color: BRAND.gray, "&:hover": { color: BRAND.dark } }}
                  >
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    aria-label={`Remove ${row.siteName}`}
                    size="small"
                    onClick={() => handleDelete(row)}
                    sx={{ color: BRAND.gray, "&:hover": { color: BRAND.alert.error } }}
                  >
                    <DeleteOutlineOutlinedIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>
            ))}
          </Stack>
        </AsyncState>
      </SectionPaper>

      <Dialog open={dialogOpen} onClose={saving ? undefined : () => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
          {editing ? "Edit site mapping" : "Add site mapping"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Network range (CIDR)"
              placeholder="10.20.30.0/24"
              value={draft.cidr}
              onChange={(e) => setDraft((d) => ({ ...d, cidr: e.target.value }))}
              disabled={saving}
              error={fieldError.field === "cidr"}
              helperText={
                fieldError.field === "cidr"
                  ? fieldError.message
                  : "A broader range can be overridden by a more specific one — the most specific match wins."
              }
              fullWidth
            />
            <TextField
              label="Site name"
              placeholder="Oficina CDMX"
              value={draft.siteName}
              onChange={(e) => setDraft((d) => ({ ...d, siteName: e.target.value }))}
              disabled={saving}
              error={fieldError.field === "siteName"}
              helperText={fieldError.field === "siteName" ? fieldError.message : " "}
              fullWidth
            />
            <TextField
              label="City"
              placeholder="Ciudad de México"
              value={draft.city}
              onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
              disabled={saving}
              error={fieldError.field === "city"}
              helperText={
                fieldError.field === "city"
                  ? fieldError.message
                  : "Shown as the device's location. Declared here on purpose — a device's public IP reports its internet exit (Starlink, VPN), not where it is."
              }
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Latitude (optional)"
                placeholder="19.432608"
                value={draft.lat}
                onChange={(e) => setDraft((d) => ({ ...d, lat: e.target.value }))}
                disabled={saving}
                error={fieldError.field === "lat"}
                helperText={fieldError.field === "lat" ? fieldError.message : "Both or neither — used to pin the site on the map."}
                fullWidth
              />
              <TextField
                label="Longitude (optional)"
                placeholder="-99.133209"
                value={draft.lon}
                onChange={(e) => setDraft((d) => ({ ...d, lon: e.target.value }))}
                disabled={saving}
                error={fieldError.field === "lon"}
                helperText={fieldError.field === "lon" ? fieldError.message : " "}
                fullWidth
              />
            </Stack>
            <TextField
              label="Description (optional)"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              disabled={saving}
              error={fieldError.field === "description"}
              helperText={fieldError.field === "description" ? fieldError.message : " "}
              fullWidth
            />
            {fieldError.message && !fieldError.field ? (
              <Typography sx={{ fontSize: TEXT.md, color: BRAND.alert.error }}>{fieldError.message}</Typography>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDialogOpen(false)} disabled={saving} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="contained"
            sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <BrandSnackbar
        open={Boolean(snack)}
        severity={snack?.severity}
        message={snack?.message}
        onClose={() => setSnack(null)}
      />
    </Box>
  );
}
