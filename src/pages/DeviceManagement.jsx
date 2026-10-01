// src/pages/DeviceManagement.jsx
//
// MDM / MAM — gestión de equipos Apple por MDM y de la app de Tracenium (MAM).
//
// Rediseño en pestañas (plan MDM/MAM, 16-sep-2026; primera parte hecha el
// 28-sep): misma piel que Patch Management o Crypto Discovery — cabecera,
// `PageTabs` con icono y estado en la URL (`?mdmTab=`):
//   - Overview: qué funciona hoy (lo dice `/api/v1/mdm/status`) y las cifras.
//   - Devices: equipos por MDM y por la app, con su detalle.
//   - Enrollment: dar de alta un Mac/iPhone/iPad por su número de serie.
//   - Policies: la política de la app (MAM) y los ajustes macOS / iOS.
//   - Apple setup: el certificado de push de APNs de la organización (28-sep).
//     Sólo con la capacidad `enrollment`, como toda la API de MDM; descargar
//     la solicitud e instalar el `.pem` piden además ADMIN/OWNER.
//
// Las políticas se escriben por el PATCH de dominio: guardar aquí no puede
// tocar los bloques de configuración del agente ni de seguridad.

import * as React from "react";
import { Alert, Box, Button, Chip, Tab, Tabs, Tooltip, Typography } from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import PhonelinkSetupOutlinedIcon from "@mui/icons-material/PhonelinkSetupOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import AddLinkOutlinedIcon from "@mui/icons-material/AddLinkOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import AppleIcon from "@mui/icons-material/Apple";

import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import BrandSnackbar from "../components/common/BrandSnackbar";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import GoToReportButton from "../components/common/GoToReportButton";
import PageTabs from "../components/common/PageTabs";
import MdmOverviewTab from "../components/DeviceManagement/MdmOverviewTab";
import MdmDevicesTab from "../components/DeviceManagement/MdmDevicesTab";
import MdmEnrollmentTab from "../components/DeviceManagement/MdmEnrollmentTab";
import MdmAppleSetupTab from "../components/DeviceManagement/MdmAppleSetupTab";
import { getMdmStatus, listMdmDevices, listMdmEnrollments } from "../api/mdm";
import { getSearchParam, updateSearchParams } from "../utils/browserState";

// No hay un tipo "mdm" en el catálogo de informes, y no se inventa uno aquí:
// la clave tiene que existir en `REPORT_REGISTRY` o Reports avisa de que no
// está disponible. Los equipos gestionados son parte de la flota, y el informe
// de flota es el que los cuenta.
const FLEET_HEALTH_KEY = "global.fleet-health";
import { useAuthContext } from "../auth/AuthContext";
import { useEffectiveTenantId } from "../hooks/useEffectiveTenantId";
import { getMyCapabilities } from "../api/roles";
import { useConfirm } from "../components/common/ConfirmDialog";
import { BRAND, TEXT } from "../theme/brand";
import { formatDate } from "../utils/format";
import {
  downloadMacosOrganizationProfile,
  getTenantPolicy,
  patchTenantPolicyDomain,
  pushTenantPolicy,
} from "../api/policies";
import { listAllKnownDevices } from "../api/jobs";
import {
  readManagedAppFromPolicy,
  managedAppFormToPolicy,
  extractPolicyEnvelope,
} from "../components/Policies/policyTransforms";
import { DetailRow, shortHash } from "../components/Policies/policyDisplay";
import ManagedAppSection from "../components/Policies/ManagedAppSection";
import MdmPlatformSection from "../components/Policies/MdmPlatformSection";
import useMdmCatalog from "../hooks/useMdmCatalog";
import { useUnsavedChanges } from "../components/AgentSettings/useUnsavedChanges";

const MOBILE_PLATFORMS = new Set(["ios", "android"]);

function isMobileRow(d) {
  const p = String(d?.platform || d?.os || "").toLowerCase();
  return MOBILE_PLATFORMS.has(p);
}

const TABS = ["overview", "devices", "enrollment", "policies", "apple-setup"];
const tabA11y = (key) => ({ id: `mdm-tab-${key}`, "aria-controls": `mdm-tabpanel-${key}` });

function TabPanel({ value, tab, children }) {
  if (value !== tab) return null;
  return (
    <Box role="tabpanel" id={`mdm-tabpanel-${tab}`} aria-labelledby={`mdm-tab-${tab}`}>
      {children}
    </Box>
  );
}

const EMPTY_MDM = { access: "unknown", status: null, devices: [], enrollments: [] };

export default function DeviceManagement({ onNavigate }) {
  const { auth } = useAuthContext();
  const confirm = useConfirm();

  // ⚠️ NOT `auth?.tenantId` — see useEffectiveTenantId. During vendor/MSP
  // portfolio navigation the selected tenant lives in the MSP context and
  // `auth` does not carry it, so this read silently resolved to nothing.
  const tenantId = useEffectiveTenantId();
  const isActiveMember = auth?.tenantMember?.isActive === true;

  // ADR-0011 Phase 3: gate on the "device_management" capability
  // instead of a hardcoded OWNER/ADMIN name check — see the same fix
  // already applied to Jobs.jsx/Audit.jsx/PKI.jsx/SecurityBaselines.jsx.
  // Defaults to disabled while the fetch is in flight (fail-closed).
  const [myPermissions, setMyPermissions] = React.useState(null);
  // El mismo endpoint devuelve el rol EFECTIVO que resuelve el servidor, y el
  // botón de informe lo necesita: `auth.role` no es el rol sobre el cliente
  // activo en una sesión de cartera MSP.
  const [myRole, setMyRole] = React.useState(null);

  React.useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    getMyCapabilities(tenantId)
      .then((resp) => {
        if (!alive) return;
        setMyPermissions(new Set(Array.isArray(resp?.permissions) ? resp.permissions : []));
        setMyRole(resp?.role ?? null);
      })
      .catch(() => {
        if (!alive) return;
        setMyPermissions(new Set());
      });
    return () => {
      alive = false;
    };
  }, [tenantId]);

  const capabilitiesLoading = isActiveMember && myPermissions === null;
  const canManage = isActiveMember && Boolean(myPermissions?.has("device_management"));
  // La API de MDM (`/api/v1/mdm`) va montada con la capacidad `enrollment`,
  // no con `device_management`: sin ella no se llama, en vez de pintar un 403.
  const canEnroll = isActiveMember && Boolean(myPermissions?.has("enrollment"));

  const [tab, setTab] = React.useState(() => {
    const requested = getSearchParam("mdmTab", "");
    return TABS.includes(requested) ? requested : "overview";
  });
  React.useEffect(() => {
    updateSearchParams({ mdmTab: tab === "overview" ? null : tab });
  }, [tab]);
  // ⚠️ No es `canManage`: aquello es la capacidad `device_management` y esto es
  // el ROL. `global.fleet-health` declara `minRole: ["ADMIN","OWNER"]`, así que
  // a quien gestione dispositivos sin ser administrador le saldría una puerta
  // que termina en "no disponible".
  const canReport = isActiveMember && ["ADMIN", "OWNER"].includes(String(myRole || ""));
  // Mismo par que exige el servidor para pedir la solicitud o instalar el
  // `.pem`: cambia el Topic de toda la organización.
  const canConfigurePush = canEnroll && ["ADMIN", "OWNER"].includes(String(myRole || ""));
  // Sin `enrollment` la pestaña no existe: un `?mdmTab=apple-setup` viejo cae
  // en Overview en vez de dejar las pestañas sin ninguna seleccionada.
  const shownTab = tab === "apple-setup" && !canEnroll ? "overview" : tab;

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
  const [mdm, setMdm] = React.useState(EMPTY_MDM);
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

  // Estado, equipos y altas de MDM. Cada fuente por su lado: que falle una no
  // deja las otras en blanco. Un 403 es falta de capacidad, no un error.
  const loadMdm = React.useCallback(
    async ({ fresh = false } = {}) => {
      if (!tenantId) return;
      if (!canEnroll) {
        setMdm({ ...EMPTY_MDM, access: "forbidden" });
        return;
      }
      const [st, dv, en] = await Promise.allSettled([
        getMdmStatus({ fresh }),
        listMdmDevices({ fresh }),
        listMdmEnrollments({ fresh }),
      ]);
      const forbidden = [st, dv, en].some((r) => r.status === "rejected" && r.reason?.status === 403);
      setMdm({
        access: forbidden ? "forbidden" : [st, dv, en].some((r) => r.status === "rejected") ? "error" : "ok",
        status: st.status === "fulfilled" && st.value?.enrollment ? st.value : null,
        devices: dv.status === "fulfilled" && Array.isArray(dv.value?.devices) ? dv.value.devices : [],
        enrollments: en.status === "fulfilled" && Array.isArray(en.value?.enrollments) ? en.value.enrollments : [],
      });
    },
    [canEnroll, tenantId]
  );

  const load = React.useCallback(async () => {
    if (!canManage || !tenantId) return;
    try {
      setLoading(true);
      const [policyRes, devicesRes] = await Promise.all([
        getTenantPolicy(tenantId).then(
          (r) => { setLoadError(null); return r; },
          (err) => { setLoadError(err?.message || "Could not load the tenant policy."); return null; }
        ),
        // Todas las páginas: con la llamada pelada son 25 equipos.
        listAllKnownDevices().catch(() => ({ items: [] })),
        loadMdm(),
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
  }, [canManage, tenantId, showSnack, loadMdm]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Tras crear o revocar un alta: de la red, no de la caché de 60 s.
  const reloadMdm = React.useCallback(() => loadMdm({ fresh: true }), [loadMdm]);

  const currentSerialized = React.useMemo(
    () => JSON.stringify(managedAppFormToPolicy(form.managedApp)),
    [form.managedApp]
  );
  const dirty = loadedMam !== null && currentSerialized !== loadedMam;
  const mdmDirty = React.useMemo(
    () => ({
      macos: JSON.stringify(mdmBlocks.macos || {}) !== loadedMdm.macos,
      ios: JSON.stringify(mdmBlocks.ios || {}) !== loadedMdm.ios,
    }),
    [mdmBlocks, loadedMdm]
  );
  const anyDirty = dirty || mdmDirty.macos || mdmDirty.ios;

  // ⚠️ `load` REESCRIBE el formulario MAM y los bloques macOS/iOS con lo que
  // devuelve el servidor. Pasado tal cual a `useAutoRefresh` —que viene
  // activo por defecto cada 20 min— borraba en silencio cualquier edición
  // sin guardar. Misma guarda que Agent Settings (invariante 5): el refresco
  // automático nunca pisa una edición, y el manual pregunta antes.
  const dirtyRef = React.useRef(false);
  dirtyRef.current = anyDirty;
  useUnsavedChanges(anyDirty);

  const autoRefresh = React.useCallback(() => {
    if (dirtyRef.current) return;
    load();
  }, [load]);
  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(autoRefresh, "deviceManagementAutoRefresh");

  const manualRefresh = async () => {
    if (dirtyRef.current) {
      const ok = await confirm({
        title: "Discard unsaved changes?",
        body: "Reloading replaces the form with what the server has.",
        confirmText: "Discard and reload",
        danger: true,
      });
      if (!ok) return;
      dirtyRef.current = false;
    }
    await load();
  };

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
      showSnack(`${platform === "macos" ? "macOS" : "iOS"} policy saved`, "success");
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
        // El backend rechaza claves fuera del catálogo con el detalle por
        // campo; mostrarlo tal cual evita que el operador adivine.
        const issues = e?.body?.issues;
        const detail = Array.isArray(issues) && issues.length
          ? issues.map((i) => `${i.field}: ${i.message}`).join(" · ")
          : e?.body?.message;
        showSnack(detail || "Could not save the policy", "error");
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

  if (capabilitiesLoading) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Typography sx={{ color: "text.secondary" }}>Loading…</Typography>
      </Box>
    );
  }

  if (!canManage) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          You don't have permission to view device management. Ask a tenant admin to grant the Device Management capability.
        </Alert>
      </Box>
    );
  }

  const env = extractPolicyEnvelope(policyRow);

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 }, minWidth: 0 }}>
      <PageHeader
        title="MDM / MAM"
        subtitle="Enroll and manage Apple devices (MDM) and the Tracenium app on iOS and Android (MAM)."
        icon={<PhonelinkSetupOutlinedIcon />}
        actions={
          <>
            {canEnroll ? (
              <Button
                variant="contained"
                startIcon={<AddLinkOutlinedIcon />}
                onClick={() => setTab("enrollment")}
                sx={{ textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
              >
                Enroll a device
              </Button>
            ) : null}
            {canReport ? (
              <GoToReportButton
                onNavigate={onNavigate}
                reportKey={FLEET_HEALTH_KEY}
                tooltip="Fleet health report"
              />
            ) : null}
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={manualRefresh}
              loading={loading}
            />
          </>
        }
      />

      <PageTabs
        value={shownTab}
        onChange={(_e, v) => setTab(v)}
        aria-label="MDM / MAM sections"
        items={[
          { value: "overview", label: "Overview", icon: <DashboardOutlinedIcon />, ...tabA11y("overview") },
          { value: "devices", label: "Devices", icon: <DevicesOutlinedIcon />, ...tabA11y("devices") },
          { value: "enrollment", label: "Enrollment", icon: <AddLinkOutlinedIcon />, ...tabA11y("enrollment") },
          { value: "policies", label: "Policies", icon: <TuneOutlinedIcon />, ...tabA11y("policies") },
          ...(canEnroll
            ? [{ value: "apple-setup", label: "Apple setup", icon: <AppleIcon />, ...tabA11y("apple-setup") }]
            : []),
        ]}
      />

      <TabPanel value={shownTab} tab="overview">
        <MdmOverviewTab mdm={mdm} appDevices={mobileDevices} onOpenTab={setTab} />
      </TabPanel>

      <TabPanel value={shownTab} tab="devices">
        <MdmDevicesTab
          mdm={mdm}
          appDevices={mobileDevices}
          onNavigate={onNavigate}
          onOpenTab={setTab}
          canConfigure={canConfigurePush}
          notify={(message, severity) => showSnack(message, severity)}
        />
      </TabPanel>

      <TabPanel value={shownTab} tab="enrollment">
        <MdmEnrollmentTab
          mdm={mdm}
          canEnroll={canEnroll}
          onChanged={reloadMdm}
          notify={(message, severity) => showSnack(message, severity)}
          onNavigate={onNavigate}
        />
      </TabPanel>

      <TabPanel value={shownTab} tab="policies">
        {/* ── Política de la app (MAM) ───────────────────────────────── */}
        <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 1, mb: 0.5 }}>
            <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>Tracenium app (MAM)</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Enforced by the app itself on iOS and Android, including personal devices.
            </Typography>
          </Box>
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
              {saving ? "Saving…" : "Save app policy"}
            </Button>
            {dirty ? (
              <Typography variant="caption" sx={{ color: BRAND.alert.warningText, fontWeight: 700 }}>
                Unsaved changes
              </Typography>
            ) : null}
            {/* Aparte y con confirmación: empuja la política ENTERA del tenant
                y borra los overrides por equipo (plan MDM/MAM, hallazgo 3). */}
            <Box sx={{ ml: { sm: "auto" } }}>
              <Tooltip title="Wakes every device to re-fetch the whole tenant policy and resets device-level overrides.">
                <span>
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
                    {pushing ? "Pushing…" : "Push to all devices…"}
                  </Button>
                </span>
              </Tooltip>
            </Box>
          </Box>
        </SectionPaper>

        {/* ── Ajustes del sistema por plataforma (MDM) ───────────────────
            Secciones separadas macOS / iOS: las políticas NO son las mismas
            en ambas, y cada una guarda su propio dominio de política. Los
            controles se renderizan desde el catálogo del backend — esta
            página no conoce ningún ajuste por su nombre. */}
        <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>Device settings (MDM)</Typography>
            <Chip
              size="small"
              label="beta"
              sx={{ height: 18, fontSize: TEXT.xs, fontWeight: 800, color: BRAND.gray }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>
            Operating-system settings for enrolled Macs, iPhones and iPads, per platform — macOS and
            iOS settings aren&apos;t equivalent.{" "}
            {/* 1-oct: los Macs del MDM de Tracenium reciben el perfil de la
                organización en cada conexión (profile-delivery.service);
                iPhone y iPad todavía no. `deliverable` es sólo el push. */}
            {`macOS settings reach Macs enrolled in Tracenium MDM as a configuration profile on their next check-in${
              mdm.status?.commands?.deliverable ? "" : " (about every 4 hours)"
            }.`}{" "}
            iPhone and iPad settings are saved, not sent to devices yet.
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
            <Tab label="iPhone & iPad" />
          </Tabs>

          {catalogLoading ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Loading settings…
            </Typography>
          ) : (
            (() => {
              const platform = mdmTab === 1 ? "ios" : "macos";
              const block = mdmBlocks[platform] || {};
              const isDirty = mdmDirty[platform];
              // Sin estado de supervisión real todavía: el aviso de
              // aplicabilidad cuenta toda la flota de esa plataforma.
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
                  <Box sx={{ mt: 1, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
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
                        ? "Saving…"
                        : `Save ${platform === "macos" ? "macOS" : "iPhone & iPad"} settings`}
                    </Button>
                    {/* El perfil de la organización sale de la política GUARDADA:
                        el mismo que el MDM de Tracenium entrega a sus Macs
                        (ADR-0002). La descarga es para los Macs SIN nuestro
                        MDM: a mano o por el MDM del cliente. Identificador
                        fijo: uno nuevo reemplaza al anterior. */}
                    {platform === "macos" ? (
                      <Tooltip
                        arrow
                        title={
                          isDirty
                            ? "Save the policy first: the profile is built from the saved macOS policy."
                            : "Macs enrolled in Tracenium MDM get this profile on their own. For other Macs, download it and upload it to your MDM, or open it on the Mac and approve it in System Settings › Privacy & Security › Profiles. A newer version replaces the old one."
                        }
                      >
                        <span>
                          <Button
                            variant="outlined"
                            startIcon={<DownloadOutlinedIcon />}
                            disabled={isDirty || loading || !tenantId}
                            onClick={async () => {
                              try {
                                const name = await downloadMacosOrganizationProfile(tenantId);
                                showSnack(`Downloaded ${name || "the organization's profile"}`, "success");
                              } catch (e) {
                                showSnack(
                                  e?.status === 404
                                    ? "The macOS policy has no settings a profile can deliver yet."
                                    : e?.body?.message || e?.message || "Could not download the profile.",
                                  e?.status === 404 ? "info" : "error"
                                );
                              }
                            }}
                            sx={{ textTransform: "none", fontWeight: 700 }}
                          >
                            Download profile
                          </Button>
                        </span>
                      </Tooltip>
                    ) : null}
                    {isDirty ? (
                      <Typography
                        variant="caption"
                        sx={{ color: BRAND.alert.warningText, fontWeight: 700 }}
                      >
                        Unsaved changes
                      </Typography>
                    ) : null}
                  </Box>
                </Box>
              );
            })()
          )}
        </SectionPaper>
      </TabPanel>

      {canEnroll ? (
        <TabPanel value={shownTab} tab="apple-setup">
          <MdmAppleSetupTab
            canConfigure={canConfigurePush}
            notify={(message, severity) => showSnack(message, severity)}
            onChanged={reloadMdm}
          />
        </TabPanel>
      ) : null}

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}
