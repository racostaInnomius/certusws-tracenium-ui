// src/pages/LocationSites.jsx
//
// Los SITIOS del tenant: un lugar, con sus redes. Sin sitios el detalle del
// equipo muestra la subred cruda, asi que esta pagina es opcional — existe para
// convertir "10.20.30.0/24" en "Oficina CDMX".
//
// El emparejamiento es por contencion y gana la regla mas especifica, asi que
// un rango amplio puede declararse una vez y afinarse con un trozo suyo.
//
// ⚠️ Un sitio es un LUGAR CON N REDES desde 20260909_sites_not_ranges. Antes
// era una red: cada subred era su propia fila, con el nombre, la ciudad y el
// pin repetidos. Un sitio con cinco subredes eran cinco filas que habia que
// mantener en sincronia a mano.
//
// Esta pagina tenia una alerta para cuando esas copias divergian, y existia por
// un caso real: en el tenant 111, una de las cinco reglas de "Mountainside IG"
// tenia la longitud +97.973760 en vez de -97.973760 —un signo menos que faltaba
// al capturar—, y como lat 26.17 con longitud positiva cae en la frontera de
// Myanmar con China, dos equipos de esa VLAN aparecian en Asia en el mapa.
//
// Esa alerta ya no esta, y no porque se haya dejado de vigilar: con un solo pin
// por sitio, el error que detectaba no puede ocurrir. Se quito la comprobacion
// entera (locationSiteChecks) porque un aviso sobre un estado imposible es peor
// que ninguno — hace creer que sigue habiendo algo que vigilar.

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
  Chip,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";

import { BRAND, TEXT } from "../theme/brand";
import PageHeader from "../components/common/PageHeader";
import BackToSettings from "../components/common/BackToSettings";
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

// `ranges` es un arreglo de cadenas en el borrador, con una entrada vacia para
// que el formulario siempre ofrezca donde escribir la primera. Se limpia al
// guardar: una fila en blanco no es un rango.
const EMPTY_DRAFT = { siteName: "", description: "", city: "", lat: "", lon: "", ranges: [""] };

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
      siteName: row.siteName ?? "",
      description: row.description ?? "",
      city: row.city ?? "",
      // Empty string rather than null: these feed text inputs, and a null would
      // flip them from controlled to uncontrolled on edit.
      lat: row.lat ?? "",
      lon: row.lon ?? "",
      ranges: (row.ranges ?? []).length ? row.ranges.map((r) => r.cidr) : [""],
    });
    setFieldError({ field: null, message: "" });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setFieldError({ field: null, message: "" });
    // Las filas en blanco del formulario no son rangos. Se descartan aqui y no
    // en el backend para que el operador no reciba un "A network range is
    // required" por un campo que dejo vacio a proposito.
    const payload = {
      ...draft,
      ranges: draft.ranges.map((r) => r.trim()).filter(Boolean),
    };
    try {
      const res = editing
        ? await updateLocationSite(editing.id, payload)
        : await createLocationSite(payload);

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
      title: `Remove ${row.siteName}?`,
      // Decir sin rodeos que se va y que no. Borrar un sitio se lleva TODAS sus
      // redes (la FK cascadea), y eso hay que decirlo con el numero delante:
      // "quitar un sitio" suena a una cosa y son cinco reglas.
      body: `Its ${(row.ranges ?? []).length} network range${
        (row.ranges ?? []).length === 1 ? "" : "s"
      } go with it, and devices on them show the raw subnet again. Location history is not affected.`,
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteLocationSite(row.id);
      setSnack({ severity: "success", message: "Site removed." });
      await load();
    } catch (err) {
      setSnack({ severity: "error", message: err?.body?.message || err?.message || "Could not remove." });
    }
  }

  return (
    <Box>
      <PageHeader
        title="Location sites"
        subtitle="A site is a place with one or more networks. Devices on any of them show the site instead of the raw subnet."
        icon={<PlaceOutlinedIcon />}
        back={<BackToSettings onNavigate={onNavigate} />}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
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
          emptyText="No sites yet. Devices show their raw subnet until you add one."
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
                  {/* Las redes del sitio, juntas y a la vista. Antes eran N
                      filas separadas y el nombre se repetia en todas. */}
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: "wrap", rowGap: 0.5 }}>
                    {(row.ranges ?? []).map((r) => (
                      <Chip
                        key={r.id ?? r.cidr}
                        size="small"
                        label={r.cidr}
                        sx={{
                          height: 20,
                          fontFamily: "monospace",
                          fontSize: TEXT.xs,
                          bgcolor: BRAND.tealSoft,
                          color: BRAND.tealText,
                        }}
                      />
                    ))}
                    {(row.ranges ?? []).length === 0 ? (
                      /* Un sitio sin redes es legitimo si tiene pin: etiqueta
                         por cercania. Sin pin no etiqueta nada, y eso si hay
                         que decirlo en vez de dejar un hueco. */
                      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                        {row.lat !== null && row.lat !== undefined
                          ? "No ranges — matched by proximity to its pin."
                          : "No ranges and no pin — this site cannot match any device yet."}
                      </Typography>
                    ) : null}
                  </Stack>
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
          {editing ? "Edit site" : "Add site"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
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
            <Box>
              <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>
                Network ranges
              </Typography>
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1 }}>
                {/* Lo que cambia respecto al modelo viejo, dicho donde importa:
                    un sitio tiene TODAS sus redes aqui, y el nombre, la ciudad
                    y el pin se declaran una sola vez para todas. */}
                One site, all its networks. A broader range can be overridden by a more specific
                one — the most specific match wins. A site with no ranges still matches by
                proximity if it has a pin.
              </Typography>
              <Stack spacing={1}>
                {draft.ranges.map((cidr, idx) => (
                  <Stack key={idx} direction="row" spacing={1} alignItems="center">
                    <TextField
                      label={idx === 0 ? "Network range (CIDR)" : " "}
                      placeholder="10.20.30.0/24"
                      value={cidr}
                      onChange={(e) =>
                        setDraft((d) => {
                          const ranges = [...d.ranges];
                          ranges[idx] = e.target.value;
                          return { ...d, ranges };
                        })
                      }
                      disabled={saving}
                      error={fieldError.field === "ranges"}
                      size="small"
                      fullWidth
                    />
                    <IconButton
                      aria-label={`Remove range ${idx + 1}`}
                      size="small"
                      disabled={saving || draft.ranges.length === 1}
                      onClick={() =>
                        setDraft((d) => ({ ...d, ranges: d.ranges.filter((_, i) => i !== idx) }))
                      }
                      sx={{ color: BRAND.gray, "&:hover": { color: BRAND.alert.error } }}
                    >
                      <CloseOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
              {fieldError.field === "ranges" ? (
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.error, mt: 0.5 }}>
                  {fieldError.message}
                </Typography>
              ) : null}
              <Button
                size="small"
                startIcon={<AddOutlinedIcon />}
                disabled={saving}
                onClick={() => setDraft((d) => ({ ...d, ranges: [...d.ranges, ""] }))}
                sx={{ textTransform: "none", mt: 1 }}
              >
                Add range
              </Button>
            </Box>
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
