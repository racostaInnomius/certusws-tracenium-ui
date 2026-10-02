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
//   - Policies: los ajustes macOS e iPhone & iPad (MDM) y la política de la
//     app (MAM), una tarjeta y un editor por política (MdmPoliciesTab, 1-oct).
//   - Apple setup: el certificado de push de APNs de la organización (28-sep).
//     Sólo con la capacidad `enrollment`, como toda la API de MDM; descargar
//     la solicitud e instalar el `.pem` piden además ADMIN/OWNER.
//
// Las políticas se escriben por el PATCH de dominio: guardar aquí no puede
// tocar los bloques de configuración del agente ni de seguridad.

import * as React from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
import PhonelinkSetupOutlinedIcon from "@mui/icons-material/PhonelinkSetupOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import AddLinkOutlinedIcon from "@mui/icons-material/AddLinkOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import AppleIcon from "@mui/icons-material/Apple";

import PageHeader from "../components/common/PageHeader";
import BrandSnackbar from "../components/common/BrandSnackbar";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import GoToReportButton from "../components/common/GoToReportButton";
import PageTabs from "../components/common/PageTabs";
import MdmOverviewTab from "../components/DeviceManagement/MdmOverviewTab";
import MdmDevicesTab from "../components/DeviceManagement/MdmDevicesTab";
import MdmEnrollmentTab from "../components/DeviceManagement/MdmEnrollmentTab";
import MdmAppleSetupTab from "../components/DeviceManagement/MdmAppleSetupTab";
import MdmPoliciesTab from "../components/DeviceManagement/MdmPoliciesTab";
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
import { BRAND } from "../theme/brand";
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
import {
  POLICY_KINDS,
  POLICY_NAMES,
  keepEditsAfterReload,
  policyDirty,
} from "../components/Policies/mdmPolicyModel";
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
const EMPTY_POLICIES = { macos: {}, ios: {}, app: readManagedAppFromPolicy({}) };

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
  // already applied to Jobs.jsx/Audit.jsx/PKI.jsx.
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

  // ── Las tres políticas de la pestaña Policies ───────────────────────
  // macOS, iPhone & iPad y la app (MAM): una edición y una base cargada por
  // política, porque cada una guarda su PROPIO dominio del documento —una
  // edición de macOS no puede pisar iOS ni MAM—. `app` es el formulario MAM.
  const { groupsFor, loading: catalogLoading } = useMdmCatalog();
  const [edits, setEdits] = React.useState(EMPTY_POLICIES);
  const [baseline, setBaseline] = React.useState(null);
  const editsRef = React.useRef(edits);
  editsRef.current = edits;
  const baselineRef = React.useRef(baseline);
  baselineRef.current = baseline;
  const [savingKind, setSavingKind] = React.useState(null); // política en curso
  const [devices, setDevices] = React.useState([]);
  const [mdm, setMdm] = React.useState(EMPTY_MDM);
  const [loading, setLoading] = React.useState(true);
  // "No pude leerla" y "todavía no hay" colapsaban en el mismo null, y ese
  // null desarma el If-Match (extractPolicyEnvelope(null) da version=null →
  // el PATCH va sin If-Match y pisa lo del servidor) además de pintar
  // defaults sin avisar.
  const [loadError, setLoadError] = React.useState(null);
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

  // `keep`: políticas cuya edición sin guardar se conserva (tras guardar
  // OTRA, o tras un 409). Devuelve las que no se pudieron conservar porque
  // en el servidor habían cambiado — ver keepEditsAfterReload.
  const load = React.useCallback(async ({ keep = [] } = {}) => {
    if (!canManage || !tenantId) return { replaced: [] };
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
      setDevices(Array.isArray(devicesRes?.items) ? devicesRes.items : []);
      setPolicyRow(policyRes ?? null);
      // Sin documento no hay con qué comparar: lo editado se queda como está.
      if (!policyRes && keep.length) return { replaced: [] };

      const policy = extractPolicyEnvelope(policyRes).raw ?? {};
      // Bloques MDM tal cual vienen del documento — el catálogo decide qué
      // se renderiza, así que aquí no se normaliza nada.
      const server = {
        macos: policy?.macos && typeof policy.macos === "object" ? policy.macos : {},
        ios: policy?.ios && typeof policy.ios === "object" ? policy.ios : {},
        app: readManagedAppFromPolicy(policy),
      };
      const { values, replaced } = keepEditsAfterReload({
        server,
        loaded: baselineRef.current,
        current: editsRef.current,
        keep,
      });
      setEdits(values);
      setBaseline(server);
      return { replaced };
    } catch (e) {
      console.error(e);
      showSnack("Failed to load device management policy", "error");
      return { replaced: [] };
    } finally {
      setLoading(false);
    }
  }, [canManage, tenantId, showSnack, loadMdm]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Tras crear o revocar un alta: de la red, no de la caché de 60 s.
  const reloadMdm = React.useCallback(() => loadMdm({ fresh: true }), [loadMdm]);

  const dirty = React.useMemo(
    () => Object.fromEntries(POLICY_KINDS.map((k) => [k, policyDirty(k, edits, baseline)])),
    [edits, baseline]
  );
  const anyDirty = POLICY_KINDS.some((k) => dirty[k]);

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

  const macAgentCount = React.useMemo(
    () =>
      devices.filter((d) => {
        const p = String(d?.platform || d?.os || "").toLowerCase();
        return p === "macos" || p === "darwin";
      }).length,
    [devices]
  );

  // Guardado de UNA política. Cada una va a su propio dominio
  // (`device-management` para la app, `mdm-macos` / `mdm-ios`), que es lo que
  // garantiza que un guardado no pueda tocar las otras dos. Lo que esté a
  // medio editar en las otras se conserva al recargar.
  const handleSave = async (kind) => {
    if (!canManage || !tenantId) return;
    if (loadError) {
      showSnack("The current policy could not be read — reload before saving.", "error");
      return;
    }
    const name = POLICY_NAMES[kind];
    const others = POLICY_KINDS.filter((k) => k !== kind && dirty[k]);
    const keptNote = (replaced) =>
      replaced.length
        ? ` Someone else saved the ${replaced.map((k) => POLICY_NAMES[k]).join(" and ")} policy meanwhile — your unsaved edits there were replaced with theirs.`
        : "";
    try {
      setSavingKind(kind);
      let domain;
      let slice;
      if (kind === "app") {
        // Replace-slice. Note the legacy `managedApp` alias is in this
        // domain's whitelist too, so omitting it here removes it — the UI
        // authors the canonical `mam` key only.
        const mam = managedAppFormToPolicy(edits.app);
        domain = "device-management";
        slice = mam ? { mam } : {};
      } else {
        // Slice de reemplazo: un bloque vacío borra la sección entera, que
        // es justo lo que el operador espera al dejar todo "sin definir".
        const block = edits[kind] || {};
        domain = `mdm-${kind}`;
        slice = Object.keys(block).length > 0 ? { [kind]: block } : {};
      }
      const expectedVersion = extractPolicyEnvelope(policyRow).version;
      await patchTenantPolicyDomain(tenantId, domain, slice, { expectedVersion });
      const { replaced } = await load({ keep: others });
      const saved = kind === "app" ? "App policy saved." : `${name} settings saved.`;
      showSnack(`${saved}${keptNote(replaced)}`, replaced.length ? "warning" : "success");
    } catch (e) {
      if (e?.status === 409) {
        // Alguien guardó el documento mientras tanto: se recarga conservando
        // lo editado donde el servidor no cambió, para revisar y volver a guardar.
        const { replaced } = await load({ keep: POLICY_KINDS.filter((k) => dirty[k]) });
        showSnack(
          `The policy was changed by someone else. Reloaded — your edits are kept where nothing changed; review and save again.${keptNote(replaced)}`,
          "warning"
        );
      } else {
        console.error(e);
        // El backend rechaza claves fuera del catálogo con el detalle por
        // campo; mostrarlo tal cual evita que el operador adivine.
        const issues = e?.body?.issues;
        const detail = Array.isArray(issues) && issues.length
          ? issues.map((i) => `${i.field}: ${i.message}`).join(" · ")
          : e?.body?.message;
        showSnack(detail || `Could not save the ${name} policy`, "error");
      }
    } finally {
      setSavingKind(null);
    }
  };

  const handleDiscard = (kind) => {
    if (!baseline) return;
    setEdits((prev) => ({ ...prev, [kind]: baseline[kind] }));
  };

  // El perfil de la organización sale de la política GUARDADA de macOS.
  const handleDownloadProfile = async () => {
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
          onChanged={reloadMdm}
        />
      </TabPanel>

      <TabPanel value={shownTab} tab="enrollment">
        <MdmEnrollmentTab
          mdm={mdm}
          canEnroll={canEnroll}
          canCreateAnyDevice={canConfigurePush}
          onChanged={reloadMdm}
          notify={(message, severity) => showSnack(message, severity)}
          onNavigate={onNavigate}
        />
      </TabPanel>

      <TabPanel value={shownTab} tab="policies">
        <MdmPoliciesTab
          edits={edits}
          baseline={baseline}
          dirty={dirty}
          onEdit={(kind, value) => setEdits((prev) => ({ ...prev, [kind]: value }))}
          onSave={handleSave}
          onDiscard={handleDiscard}
          savingKind={savingKind}
          loading={loading}
          loadError={loadError}
          onRetry={() => load()}
          groupsFor={groupsFor}
          catalogLoading={catalogLoading}
          mdm={mdm}
          appDeviceCount={mobileCounts.total}
          // Sin estado de supervisión real todavía: el aviso de
          // aplicabilidad cuenta toda la flota de esa plataforma.
          unsupervised={{ ios: mobileCounts.ios, macos: macAgentCount }}
          onPush={handlePush}
          pushing={pushing}
          onDownloadProfile={handleDownloadProfile}
          envelope={env}
        />
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
