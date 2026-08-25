// src/pages/DeviceManagement.jsx
//
// Enterprise device management — MDM/MAM. Promoted out of the old
// Policies page (where it was one card among a dozen) into a top-level
// surface, because this is where first-party MDM will land: Tracenium
// issues its own device management rather than assuming every customer
// already runs Jamf/Intune.
//
// Today it authors the MAM slice (`policyJson.mam`, consumed by the
// T-iOS / T-Android managed clients) and shows the mobile fleet. Per-
// device actions (lock / selective wipe / alert / locate) live on the
// device itself in Asset Management — they're per-device commands, not
// tenant policy, and they already have a home there.
//
// Writes through the domain-scoped PATCH: a save here cannot touch the
// agent-config or security blocks.

import * as React from "react";
import Grid from "@mui/material/Grid";
import { Alert, Box, Button, Chip, Divider, Tab, Tabs, Typography } from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import PhonelinkSetupOutlinedIcon from "@mui/icons-material/PhonelinkSetupOutlined";
import DevicesOtherOutlinedIcon from "@mui/icons-material/DevicesOtherOutlined";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";

import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import BrandSnackbar from "../components/common/BrandSnackbar";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import { useAuthContext } from "../auth/AuthContext";
import { useConfirm } from "../components/common/ConfirmDialog";
import { BRAND, TEXT } from "../theme/brand";
import { formatDate } from "../utils/format";
import {
  getTenantPolicy,
  patchTenantPolicyDomain,
  pushTenantPolicy,
} from "../api/policies";
import { listKnownDevices } from "../api/jobs";
import {
  readManagedAppFromPolicy,
  managedAppFormToPolicy,
  extractPolicyEnvelope,
} from "../components/Policies/policyTransforms";
import { DetailRow, shortHash } from "../components/Policies/policyDisplay";
import ManagedAppSection from "../components/Policies/ManagedAppSection";
import MdmPlatformSection from "../components/Policies/MdmPlatformSection";
import useMdmCatalog from "../hooks/useMdmCatalog";

const MOBILE_PLATFORMS = new Set(["ios", "android"]);

function isMobileRow(d) {
  const p = String(d?.platform || d?.os || "").toLowerCase();
  return MOBILE_PLATFORMS.has(p);
}

// Roadmap for the first-party MDM. Static and deliberately honest —
// these are NOT built. Shown so operators (and us) can see where this
// surface is heading instead of wondering why "Device Management" only
// manages an app policy.
const MDM_ROADMAP = [
  {
    title: "Servidor MDM + enrolamiento",
    body: "Protocolo MDM de Apple, perfiles de configuración firmados e identidad por dispositivo (ACME + attestation). Es lo que convierte la intención de arriba en algo que el sistema impone.",
  },
  {
    title: "Actualizaciones vía DDM",
    body: "Apple eliminó la gestión de actualizaciones por MDM clásico en OS 27, así que este dominio va por Declarative Device Management desde el inicio.",
  },
  {
    title: "Supervisión (ABM / ADE)",
    body: "Enrolamiento sin fricción desde la compra y gestión no removible. Los equipos ya desplegados se enrolan sin supervisión y migran en cada reimagen.",
  },
];

export default function DeviceManagement({ onNavigate }) {
  const { auth } = useAuthContext();
  const confirm = useConfirm();

  const tenantId = auth?.tenantId;
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;
  const canManage = isActiveMember && (tenantRole === "ADMIN" || tenantRole === "OWNER");

  const [policyRow, setPolicyRow] = React.useState(null);
  // ManagedAppSection is props-driven against `form.managedApp`.
  const [form, setForm] = React.useState(() => ({ managedApp: readManagedAppFromPolicy({}) }));
  const [loadedMam, setLoadedMam] = React.useState(null);

  // ── Modelo de intención MDM (por plataforma) ────────────────────────
  // Un estado por plataforma porque cada una guarda su PROPIO dominio de
  // política: así una edición de macOS no puede pisar iOS ni MAM.
  const { groupsFor, loading: catalogLoading } = useMdmCatalog();
  const [mdmTab, setMdmTab] = React.useState(0); // 0 = macOS, 1 = iOS
  const [mdmBlocks, setMdmBlocks] = React.useState({ macos: {}, ios: {} });
  const [loadedMdm, setLoadedMdm] = React.useState({ macos: "{}", ios: "{}" });
  const [savingMdm, setSavingMdm] = React.useState(null); // plataforma en curso
  const [devices, setDevices] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  // Ver el comentario homólogo en SecurityBaselines: "no pude leerla" y
  // "todavía no hay" colapsaban en el mismo null, y ese null desarma el
  // If-Match además de pintar defaults sin avisar.
  const [loadError, setLoadError] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [pushing, setPushing] = React.useState(false);
  const [snackbar, setSnackbar] = React.useState({ open: false, message: "", severity: "success" });

  const showSnack = React.useCallback((message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  }, []);

  const load = React.useCallback(async () => {
    if (!canManage || !tenantId) return;
    try {
      setLoading(true);
      const [policyRes, devicesRes] = await Promise.all([
        getTenantPolicy(tenantId).then(
          (r) => { setLoadError(null); return r; },
          (err) => { setLoadError(err?.message || "Could not load the tenant policy."); return null; }
        ),
        listKnownDevices().catch(() => ({ items: [] })),
      ]);
      const env = extractPolicyEnvelope(policyRes);
      const policy = env.raw ?? {};
      setPolicyRow(policyRes ?? null);
      setForm({ managedApp: readManagedAppFromPolicy(policy) });
      setLoadedMam(JSON.stringify(managedAppFormToPolicy(readManagedAppFromPolicy(policy))));

      // Bloques MDM tal cual vienen del documento — el catálogo decide qué
      // se renderiza, así que aquí no se normaliza nada.
      const macos = policy?.macos && typeof policy.macos === "object" ? policy.macos : {};
      const ios = policy?.ios && typeof policy.ios === "object" ? policy.ios : {};
      setMdmBlocks({ macos, ios });
      setLoadedMdm({ macos: JSON.stringify(macos), ios: JSON.stringify(ios) });

      setDevices(Array.isArray(devicesRes?.items) ? devicesRes.items : []);
    } catch (e) {
      console.error(e);
      showSnack("Failed to load device management policy", "error");
    } finally {
      setLoading(false);
    }
  }, [canManage, tenantId, showSnack]);

  React.useEffect(() => {
    load();
  }, [load]);

  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(load, "deviceManagementAutoRefresh");

  const currentSerialized = React.useMemo(
    () => JSON.stringify(managedAppFormToPolicy(form.managedApp)),
    [form.managedApp]
  );
  const dirty = loadedMam !== null && currentSerialized !== loadedMam;

  const mobileDevices = React.useMemo(() => devices.filter(isMobileRow), [devices]);
  const mobileCounts = React.useMemo(() => {
    let ios = 0;
    let android = 0;
    for (const d of mobileDevices) {
      const p = String(d?.platform || d?.os || "").toLowerCase();
      if (p === "ios") ios += 1;
      else if (p === "android") android += 1;
    }
    return { ios, android, total: mobileDevices.length };
  }, [mobileDevices]);

  const handleSave = async () => {
    if (!canManage || !tenantId) return;
    if (loadError) {
      showSnack("The current policy could not be read — reload before saving.", "error");
      return;
    }
    try {
      setSaving(true);
      const mam = managedAppFormToPolicy(form.managedApp);
      // Replace-slice. Note the legacy `managedApp` alias is in this
      // domain's whitelist too, so omitting it here removes it — the UI
      // authors the canonical `mam` key only.
      const slice = mam ? { mam } : {};
      const expectedVersion = extractPolicyEnvelope(policyRow).version;
      await patchTenantPolicyDomain(tenantId, "device-management", slice, { expectedVersion });
      showSnack("Managed app policy saved", "success");
      await load();
    } catch (e) {
      if (e?.status === 409) {
        showSnack(
          "Policy was modified by someone else. Reloaded — review your changes and save again.",
          "warning"
        );
        await load();
      } else {
        console.error(e);
        showSnack(e?.body?.message || "Failed to save managed app policy", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  // Guardado del bloque MDM de UNA plataforma. Cada una va a su propio
  // dominio (`mdm-macos` / `mdm-ios`), que es lo que garantiza que un
  // guardado no pueda tocar la otra plataforma ni el bloque MAM.
  const handleSaveMdm = async (platform) => {
    if (!canManage || !tenantId) return;
    if (loadError) {
      showSnack("The current policy could not be read — reload before saving.", "error");
      return;
    }
    try {
      setSavingMdm(platform);
      const block = mdmBlocks[platform] || {};
      // Slice de reemplazo: un bloque vacío borra la sección entera, que
      // es justo lo que el operador espera al dejar todo "sin definir".
      const slice = Object.keys(block).length > 0 ? { [platform]: block } : {};
      const expectedVersion = extractPolicyEnvelope(policyRow).version;
      await patchTenantPolicyDomain(tenantId, `mdm-${platform}`, slice, { expectedVersion });
      showSnack(`Política de ${platform === "macos" ? "macOS" : "iOS"} guardada`, "success");
      await load();
    } catch (e) {
      if (e?.status === 409) {
        showSnack(
          "Otra persona modificó la política. Se recargó — revisa tus cambios y vuelve a guardar.",
          "warning"
        );
        await load();
      } else {
        console.error(e);
        // El backend rechaza claves fuera del catálogo con el detalle por
        // campo; mostrarlo tal cual evita que el operador adivine.
        const issues = e?.body?.issues;
        const detail = Array.isArray(issues) && issues.length
          ? issues.map((i) => `${i.field}: ${i.message}`).join(" · ")
          : e?.body?.message;
        showSnack(detail || "No se pudo guardar la política", "error");
      }
    } finally {
      setSavingMdm(null);
    }
  };

  const handlePush = async () => {
    if (!canManage || !tenantId) return;
    const ok = await confirm({
      title: "Push tenant policy?",
      body:
        "Mobile clients are woken with a refresh signal and re-fetch their " +
        "effective policy.\n\nThis pushes the WHOLE tenant policy to every " +
        "device, and any pre-existing device-level overrides will be reset.",
      confirmText: "Push to all devices",
      danger: true,
    });
    if (!ok) return;
    try {
      setPushing(true);
      const res = await pushTenantPolicy(tenantId);
      const parts = [`${res?.targeted ?? 0} targeted`, `${res?.sent ?? 0} delivered immediately`];
      const cleared = res?.clearedOverrides ?? 0;
      if (cleared > 0) parts.push(`${cleared} device override${cleared === 1 ? "" : "s"} reset`);
      showSnack(`Policy push: ${parts.join(" · ")}`, "success");
      await load();
    } catch (e) {
      console.error(e);
      showSnack("Failed to push policy", "error");
    } finally {
      setPushing(false);
    }
  };

  if (!canManage) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          Device management is restricted to active tenant admins and owners.
        </Alert>
      </Box>
    );
  }

  const env = extractPolicyEnvelope(policyRow);

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 }, minWidth: 0 }}>
      <PageHeader
        title="Device Management"
        subtitle="Mobile and managed-device policy (MDM / MAM). Per-device actions — lock, selective wipe, alert — are on each device in Asset Management."
        icon={<PhonelinkSetupOutlinedIcon />}
        actions={
          <RefreshControl
            refreshSeconds={refreshSeconds}
            onRefreshSecondsChange={setRefreshSeconds}
            onRefresh={load}
            loading={loading}
          />
        }
      />

      <Grid container spacing={2} alignItems="stretch" sx={{ mb: 2 }}>
        {/* ── Mobile fleet snapshot ─────────────────────────────────── */}
        <Grid size={{ xs: 12, md: 4 }}>
          <SectionPaper variant="panel" sx={{ p: 2, height: "100%" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
              <DevicesOtherOutlinedIcon sx={{ color: BRAND.tealText }} />
              <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>Mobile fleet</Typography>
            </Box>

            {mobileCounts.total === 0 ? (
              <Box>
                <Typography variant="body2" sx={{ color: BRAND.gray, mb: 1.5 }}>
                  No mobile devices are enrolled yet. The managed-app policy below
                  applies as soon as the first iOS or Android client enrolls.
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => onNavigate?.("enrollment")}
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    borderColor: BRAND.teal,
                    color: BRAND.tealText,
                  }}
                >
                  Go to enrollment
                </Button>
              </Box>
            ) : (
              <Box>
                <Typography sx={{ fontSize: TEXT["4xl"], fontWeight: 900, color: BRAND.dark, lineHeight: 1 }}>
                  {mobileCounts.total}
                </Typography>
                <Typography variant="caption" sx={{ color: BRAND.gray }}>
                  managed mobile device{mobileCounts.total === 1 ? "" : "s"}
                </Typography>
                <Box sx={{ mt: 1.5, display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                  <Chip size="small" label={`iOS · ${mobileCounts.ios}`} sx={{ fontWeight: 700 }} />
                  <Chip
                    size="small"
                    label={`Android · ${mobileCounts.android}`}
                    sx={{ fontWeight: 700 }}
                  />
                </Box>
                <Button
                  size="small"
                  onClick={() => onNavigate?.("assets")}
                  sx={{ mt: 1.5, textTransform: "none", color: BRAND.gray }}
                >
                  Open in Asset Management →
                </Button>
              </Box>
            )}
          </SectionPaper>
        </Grid>

        {/* ── MAM policy authoring ──────────────────────────────────── */}
        <Grid size={{ xs: 12, md: 8 }}>
          <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 }, height: "100%" }}>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 1.5 }}>
              <DetailRow label="Policy version" value={env.version ?? "—"} mono />
              <DetailRow label="Hash" value={shortHash(env.hash)} mono />
              <DetailRow label="Updated" value={formatDate(env.updatedAt)} />
            </Box>

            <ManagedAppSection form={form} onChange={setForm} readOnly={loading} />

            <Box sx={{ mt: 2, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <Button
                variant="contained"
                startIcon={<SaveOutlinedIcon />}
                onClick={handleSave}
                disabled={saving || loading || !dirty}
                sx={{
                  textTransform: "none",
                  fontWeight: 800,
                  bgcolor: BRAND.teal,
                  "&:hover": { bgcolor: BRAND.tealHover },
                }}
              >
                {saving ? "Saving…" : "Save policy"}
              </Button>
              <Button
                variant="outlined"
                startIcon={<SendOutlinedIcon />}
                onClick={handlePush}
                disabled={pushing || loading}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  borderColor: BRAND.teal,
                  color: BRAND.tealText,
                }}
              >
                {pushing ? "Pushing…" : "Push now"}
              </Button>
              {dirty ? (
                <Typography variant="caption" sx={{ color: BRAND.alert.warning, fontWeight: 700 }}>
                  Unsaved changes
                </Typography>
              ) : null}
            </Box>
          </SectionPaper>
        </Grid>
      </Grid>

      {/* ── Intención MDM por plataforma ──────────────────────────────
          Secciones separadas macOS / iOS: las políticas NO son las mismas
          en ambas, y cada una guarda su propio dominio de política. Los
          controles se renderizan desde el catálogo del backend — esta
          página no conoce ningún ajuste por su nombre. */}
      <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
          <PhonelinkSetupOutlinedIcon sx={{ color: BRAND.tealText }} />
          <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>
            Configuración del sistema (MDM)
          </Typography>
          <Chip
            size="small"
            label="beta"
            sx={{ height: 18, fontSize: TEXT.xs, fontWeight: 800, color: BRAND.gray }}
          />
        </Box>
        <Typography variant="body2" sx={{ color: BRAND.gray, mb: 1.5 }}>
          Estado deseado a nivel de sistema operativo. Se autora por plataforma
          porque las políticas de macOS e iOS no son equivalentes. Se entregará
          por perfiles de configuración cuando el MDM propio esté operativo;
          hoy queda registrado como intención.
        </Typography>

        <Tabs
          value={mdmTab}
          onChange={(_e, v) => setMdmTab(v)}
          sx={{
            mb: 2,
            borderBottom: `1px solid ${BRAND.border}`,
            "& .MuiTab-root": { textTransform: "none", fontWeight: 800, minHeight: 42 },
            "& .MuiTabs-indicator": { bgcolor: BRAND.teal, height: 3, borderRadius: 999 },
          }}
        >
          <Tab label="macOS" />
          <Tab label="iOS" />
          <Tab label="Android" disabled />
        </Tabs>

        {catalogLoading ? (
          <Typography variant="body2" sx={{ color: BRAND.gray }}>
            Cargando catálogo…
          </Typography>
        ) : (
          (() => {
            const platform = mdmTab === 1 ? "ios" : "macos";
            const block = mdmBlocks[platform] || {};
            const isDirty = JSON.stringify(block) !== loadedMdm[platform];
            // Hoy ningún equipo está supervisado (no hay MDM operativo aún),
            // así que el aviso de aplicabilidad cuenta toda la flota de esa
            // plataforma. Cuando exista enrolamiento real, esto pasa a leer
            // el estado de supervisión reportado por el dispositivo.
            const unsupervised =
              platform === "ios" ? mobileCounts.ios : devices.filter((d) => {
                const p = String(d?.platform || d?.os || "").toLowerCase();
                return p === "macos" || p === "darwin";
              }).length;

            return (
              <Box>
                <MdmPlatformSection
                  platform={platform}
                  groups={groupsFor(platform)}
                  block={block}
                  onChangeBlock={(next) =>
                    setMdmBlocks((prev) => ({ ...prev, [platform]: next }))
                  }
                  readOnly={loading}
                  unsupervisedCount={unsupervised}
                />
                <Box sx={{ mt: 1, display: "flex", gap: 1, alignItems: "center" }}>
                  <Button
                    variant="contained"
                    startIcon={<SaveOutlinedIcon />}
                    onClick={() => handleSaveMdm(platform)}
                    disabled={savingMdm !== null || loading || !isDirty}
                    sx={{
                      textTransform: "none",
                      fontWeight: 800,
                      bgcolor: BRAND.teal,
                      "&:hover": { bgcolor: BRAND.tealHover },
                    }}
                  >
                    {savingMdm === platform
                      ? "Guardando…"
                      : `Guardar política de ${platform === "macos" ? "macOS" : "iOS"}`}
                  </Button>
                  {isDirty ? (
                    <Typography
                      variant="caption"
                      sx={{ color: BRAND.alert.warning, fontWeight: 700 }}
                    >
                      Cambios sin guardar
                    </Typography>
                  ) : null}
                </Box>
              </Box>
            );
          })()
        )}
      </SectionPaper>

      {/* ── Roadmap ───────────────────────────────────────────────────── */}
      <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <RocketLaunchOutlinedIcon sx={{ color: BRAND.gray }} />
          <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>
            MDM propio — lo que falta
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ color: BRAND.gray, mb: 1.5 }}>
          El bloque MAM lo aplica la propia app sobre sí misma. La sección de
          configuración del sistema ya permite <strong>declarar</strong> la
          intención, pero <strong>todavía no hay quien la entregue</strong>: eso
          exige el protocolo MDM de Apple. Nada de lo de abajo está construido.
        </Typography>
        <Divider sx={{ borderColor: BRAND.border, mb: 1.5 }} />
        <Grid container spacing={2}>
          {MDM_ROADMAP.map((item) => (
            <Grid size={{ xs: 12, md: 4 }} key={item.title}>
              <Box
                sx={{
                  p: 1.5,
                  height: "100%",
                  border: `1px dashed ${BRAND.border}`,
                  borderRadius: 2,
                  bgcolor: BRAND.surfaceMuted,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5 }}>
                  <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>
                    {item.title}
                  </Typography>
                  <Chip
                    size="small"
                    label="planned"
                    sx={{ height: 18, fontSize: TEXT.xs, fontWeight: 800, color: BRAND.gray }}
                  />
                </Box>
                <Typography variant="caption" sx={{ color: BRAND.gray, lineHeight: 1.6 }}>
                  {item.body}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </SectionPaper>

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}
