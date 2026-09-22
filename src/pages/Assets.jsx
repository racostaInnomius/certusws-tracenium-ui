import * as React from "react";
import {
  Box,
  Tabs,
  Tab,
} from "@mui/material";

import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import GroupWorkOutlinedIcon from "@mui/icons-material/GroupWorkOutlined";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";
import MemoryOutlinedIcon from "@mui/icons-material/MemoryOutlined";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import DomainOutlinedIcon from "@mui/icons-material/DomainOutlined";
import AssetsDashboard from "./AssetsDashboard";

import SoftwareInventory from "./SoftwareInventory";
import HardwareInventory from "./HardwareInventory";
// Perezoso como el resto de vistas pesadas: quien nunca abra la pestaña no
// paga su chunk.
const LocationWorkbench = React.lazy(() =>
  import("../components/AssetsDashboard/LocationWorkbench")
);
import Printers from "./Printers";
import AssetGroups from "./AssetGroups";
// GPOs + Coverage: lo que sabemos del dominio Windows, ninguna de las dos
// preguntada nunca a un Mac o un Linux. Perezosa: quien no abra la pestaña no
// paga su chunk (Coverage además sólo responde con la migración de Cobertura;
// se queda perezosa un nivel más adentro — ver WindowsDomainPanel).
const WindowsDomainPanel = React.lazy(() => import("../components/AssetsDashboard/WindowsDomainPanel"));
// ADR-0029 — consulta en vivo. Perezosa por lo mismo; sólo se pinta con el
// permiso `live_query`.
const LiveQueryPanel = React.lazy(() => import("../components/liveQuery/LiveQueryPanel"));
import ManageSearchOutlinedIcon from "@mui/icons-material/ManageSearchOutlined";
import { getMyCapabilities } from "../api/roles";
import { useEffectiveTenantId } from "../hooks/useEffectiveTenantId";

// Note: the "Agent Downloads" tab moved to its own top-level page
// (Device Enrollment) in tandem with the enrollment-token surface.
// Asset Management is now strictly inventory; the binary catalog is
// part of the enrollment flow, which is where new operators expect to
// find it.

import { BRAND } from "../theme/brand";
import { getSearchParam, updateSearchParams } from "../utils/browserState";

// Pestañas que se pueden abrir desde un enlace (`?assetsTab=hardware`). Sólo
// las que alguien enlaza hoy; el índice es el orden de los <Tab> de abajo.
//
// `gpos` y `coverage` eran pestañas propias antes de fundirse en
// "Windows Domain" — un enlace o marcador viejo con esa clave sigue
// resolviendo aquí (ver WINDOWS_TAB y el estado inicial de más abajo), sólo
// que ahora selecciona la SECCIÓN dentro de la pestaña, no la pestaña misma.
const WINDOWS_TAB = 6;
const TAB_FROM_URL = { dashboard: 0, groups: 1, hardware: 2, location: 3, printers: 4, software: 5, windows: WINDOWS_TAB, gpos: WINDOWS_TAB, coverage: WINDOWS_TAB, "live-query": 7 };
const LIVE_QUERY_TAB = 7;
// Las claves viejas, además de abrir la pestaña, eligen su sección.
const WINDOWS_SECTION_FROM_URL = { gpos: "gpos", coverage: "coverage" };
// Segmentos de la dona de composición que Hardware Inventory sabe filtrar.
const HW_FLEET_KEYS = new Set(["laptop", "desktop", "server", "unknown", "virtual"]);
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import GoToReportButton from "../components/common/GoToReportButton";
import { useAuthContext } from "../auth/AuthContext";

// El informe que cubre lo que se administra en esta página: composición de la
// flota (equipos por plataforma, fabricantes) además del resto del resumen.
// No hay un tipo "assets" en el catálogo, y no se inventa uno aquí — la clave
// tiene que existir en `REPORT_REGISTRY` o Reports avisa de que no está
// disponible en vez de generarlo.
// El informe PROPIO de la página (ADR-0021). Hasta que existió, este botón
// prestaba Fleet Health, que mide postura; el de activos mide el patrimonio.
const ASSET_REPORT_KEY = "amp.asset-executive";

function TabPanel({ children, value, index }) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`assets-tabpanel-${index}`}
      aria-labelledby={`assets-tab-${index}`}
    >
      {value === index && <Box>{children}</Box>}
    </Box>
  );
}

function a11yProps(index) {
  return {
    id: `assets-tab-${index}`,
    "aria-controls": `assets-tabpanel-${index}`,
  };
}

// Shared sx for the four Tab labels. Keeping it in one place so the
// selected-state color and the hover treatment stay uniform — the
// previous file repeated the same object four times.
const TAB_SX = {
  textTransform: "none",
  fontWeight: 700,
  minHeight: 62,
  color: "text.secondary",
  "&.Mui-selected": { color: BRAND.dark },
};

export default function Assets({ onAssetsEmptyStateChange, suppressEmptyStateOverlay = false, onNavigate }) {
  // El Overview enlaza su dona de composición a Hardware Inventory, que es
  // donde vive la misma dona. Se lee UNA vez al montar.
  const [activeTab, setActiveTab] = React.useState(
    () => TAB_FROM_URL[getSearchParam("assetsTab", "")] ?? 0
  );
  const [initialFleetFilter] = React.useState(() => {
    const key = getSearchParam("hwFleet", "");
    return HW_FLEET_KEYS.has(key) ? key : "";
  });
  // Which section opens inside Windows Domain — read once, same as the
  // fleet filter above. Undefined (not "gpos") when the link didn't ask for
  // one, so WindowsDomainPanel falls back to its own default section.
  const [windowsSection, setWindowsSection] = React.useState(
    () => WINDOWS_SECTION_FROM_URL[getSearchParam("assetsTab", "")]
  );
  // Set right before jumping to the Hardware Inventory tab from a
  // Dashboard "OS versions" row click, so that tab's search box opens
  // pre-filtered to just that OS. Cleared on any DIRECT tab click (see
  // handleChange) so it can't leak into a later, unrelated visit to the
  // tab — HardwareInventory only reads it once, as its initial state,
  // the moment TabPanel mounts it.
  const [pendingHardwareSearch, setPendingHardwareSearch] = React.useState("");

  const handleChange = (_event, newValue) => {
    setActiveTab(newValue);
    setPendingHardwareSearch("");
    // El enlace ya se consumió: sin esto, recargar devolvía a la pestaña y
    // al filtro del enlace en vez de a donde el operador se movió.
    updateSearchParams({ assetsTab: "", hwFleet: "" });
  };

  const navigateToHardwareInventory = React.useCallback((searchTerm = "") => {
    setPendingHardwareSearch(searchTerm);
    setActiveTab(2); // Hardware Inventory

    // Keep the drill-down feeling intentional: when the user clicks a
    // dashboard card such as OS versions, move them to the top of the
    // Hardware Inventory tab instead of leaving the scroll position in
    // the middle of the dashboard.
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);

  // Refresco de página — subir el nonce es la señal para que las pestañas
  // vuelvan a pedir.
  //
  // ⚠️ Lo miran TODAS. Antes sólo AssetsDashboard y WindowsGpos: pulsar
  // Refresh con Asset Groups, Software o Hardware delante no hacía
  // absolutamente nada, y no se notaba — el botón se comporta igual tanto si
  // recarga como si no. Un refresco que depende de la pestaña que tengas
  // abierta es peor que ninguno, porque enseña datos viejos con el gesto de
  // haberlos actualizado.
  //
  // (La otra mitad del problema estaba en el propio control: `httpGetJson`
  // servía de su caché de 60 s, así que ni siquiera las pestañas cableadas
  // salían a la red. Ver RefreshControl.)
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const triggerRefresh = React.useCallback(() => {
    setRefreshing(true);
    setRefreshNonce((v) => v + 1);
    // Drop the spinner after a short window so the long button doesn't
    // stay disabled forever — child tabs settle within ~1s on local
    // dev and won't visibly toggle. Acceptable tradeoff: the spinner
    // is advisory, not a strict load gate.
    window.setTimeout(() => setRefreshing(false), 1200);
  }, []);
  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(triggerRefresh, "assetsAutoRefresh");

  // Mismo criterio que Overview: `amp.asset-executive` declara `minRole: ["ADMIN","OWNER"]`
  // en el registro, así que enseñar el botón a un USER sería ofrecerle una
  // puerta que termina en "no disponible". Sólo decide qué se PINTA — quien
  // manda es el gate del backend.
  const { auth } = useAuthContext();
  // ADMIN/OWNER activo. Lo miran dos cosas: el botón de informe y las acciones
  // de Cobertura (lanzar una lectura, sacar el paquete de instalación), que el
  // backend gatea con ese mismo rol.
  const canReport =
    auth?.tenantMember?.isActive === true &&
    ["ADMIN", "OWNER"].includes(String(auth?.tenantMember?.role || ""));

  // ADR-0029 — la pestaña Live Query y sus atajos, sólo con el permiso
  // `live_query` (el backend además exige el plugin AMP). Cerrado mientras se
  // pregunta: sin permiso no se pinta nada que termine en un 403.
  const tenantId = useEffectiveTenantId();
  const [canLiveQuery, setCanLiveQuery] = React.useState(false);
  React.useEffect(() => {
    if (!tenantId) return undefined;
    let alive = true;
    getMyCapabilities(tenantId)
      .then((r) => alive && setCanLiveQuery(Array.isArray(r?.permissions) && r.permissions.includes("live_query")))
      .catch(() => alive && setCanLiveQuery(false));
    return () => {
      alive = false;
    };
  }, [tenantId]);
  // Los atajos («Ask this device», «Ask this group») llevan a la pestaña con
  // el objetivo puesto. El nonce reaplica el objetivo si ya estaba abierta.
  const [liveTarget, setLiveTarget] = React.useState(null);
  const [liveTargetNonce, setLiveTargetNonce] = React.useState(0);
  const openLiveQuery = React.useCallback((target) => {
    setLiveTarget(target);
    setLiveTargetNonce((n) => n + 1);
    setActiveTab(LIVE_QUERY_TAB);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }, []);
  const askDevice = React.useCallback(
    (deviceId, label) => openLiveQuery({ scope: "devices", deviceIds: [deviceId], label: label || deviceId }),
    [openLiveQuery]
  );
  const askGroup = React.useCallback((group) => openLiveQuery({ scope: "group", groupId: group.id }), [openLiveQuery]);
  // Un enlace a `?assetsTab=live-query` sin permiso cae en el Dashboard.
  const visibleTab = activeTab === LIVE_QUERY_TAB && !canLiveQuery ? 0 : activeTab;

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
      <PageHeader
        title="Asset Management"
        subtitle="Monitor devices, inventory and agent distribution"
        icon={<ComputerOutlinedIcon />}
        actions={
          <>
            {canReport ? (
              <GoToReportButton
                onNavigate={onNavigate}
                reportKey={ASSET_REPORT_KEY}
                tooltip="Asset Management executive report"
              />
            ) : null}
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={triggerRefresh}
              loading={refreshing}
            />
          </>
        }
      />

      <SectionPaper
        variant="panel"
        sx={{
          mb: 2,
          // Zero padding on the wrapper — the Tabs component brings
          // its own min-height and we want the bottom border of the
          // Tabs to line up with the Paper's edge.
          p: 0,
          overflow: "hidden",
        }}
      >
        <Tabs
          value={visibleTab}
          onChange={handleChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: { xs: 1, sm: 2 },
            minHeight: 62,
            "& .MuiTabs-indicator": {
              height: 3,
              borderRadius: 999,
              backgroundColor: BRAND.teal,
            },
          }}
        >
          {/* Tab order is intentional: Dashboard (overview) → Asset
              Groups (organizational layer over the fleet) → the two
              inventory drilldowns. The Dashboard label replaced the
              previous "Asset Management" tab because the page itself
              is already named "Asset Management" — the duplicated label
              read as redundant in the tab bar. */}
          <Tab
            icon={<DashboardOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Dashboard"
            {...a11yProps(0)}
            sx={TAB_SX}
          />

          <Tab
            icon={<GroupWorkOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Asset Groups"
            {...a11yProps(1)}
            sx={TAB_SX}
          />

          <Tab
            icon={<MemoryOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Hardware Inventory"
            {...a11yProps(2)}
            sx={TAB_SX}
          />

          {/* UNA pestaña, tres secciones dentro (Geofences, Location history,
              Recent transitions): son la misma funcionalidad sobre la misma
              evidencia, no tres cosas que compitan por sitio en esta barra. */}
          <Tab
            icon={<HistoryOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Location"
            {...a11yProps(3)}
            sx={TAB_SX}
          />

          {/* Las impresoras de la FLOTA agrupadas en colas; las de un equipo
              siguen en su detalle. */}
          <Tab
            icon={<PrintOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Printers"
            {...a11yProps(4)}
            sx={TAB_SX}
          />

          <Tab
            icon={<AppsOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Software Inventory"
            {...a11yProps(5)}
            sx={TAB_SX}
          />

          {/* Lo que sabemos del dominio Windows — GPOs aplicadas y qué falta
              incorporar. Ninguna de las dos se le pregunta nunca a un Mac o
              un Linux, así que van juntas y no como dimensiones de inventario
              multiplataforma. Dos secciones dentro (ver WindowsDomainPanel),
              mismo formato que Patch Management → Configure. */}
          <Tab
            icon={<DomainOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Windows Domain"
            {...a11yProps(WINDOWS_TAB)}
            sx={TAB_SX}
          />

          {/* ADR-0029 — preguntar AHORA a los equipos conectados. Aquí y no en
              la barra lateral: hoy son seis preguntas fijas sobre el estado
              del equipo, no una pregunta libre. Al final: la última pestaña,
              así su presencia condicional no mueve los índices de las demás. */}
          {canLiveQuery ? (
            <Tab
              icon={<ManageSearchOutlinedIcon fontSize="small" />}
              iconPosition="start"
              label="Live Query"
              {...a11yProps(LIVE_QUERY_TAB)}
              sx={TAB_SX}
            />
          ) : null}
        </Tabs>
      </SectionPaper>

      {/* "Blind spots" vivía aquí; se fue al Overview repartido por bloques
          (ver components/Overview/signalCoverageModel.js): tres de sus cuatro
          señales no eran de Asset Management. */}
      <TabPanel value={visibleTab} index={0}>
        <AssetsDashboard
          onAssetsEmptyStateChange={onAssetsEmptyStateChange}
          refreshNonce={refreshNonce}
          onNavigateToHardwareInventory={navigateToHardwareInventory}
          suppressEmptyStateOverlay={suppressEmptyStateOverlay}
          onNavigate={onNavigate}
          onAskDevice={canLiveQuery ? askDevice : undefined}
        />
      </TabPanel>

      <TabPanel value={visibleTab} index={1}>
        <AssetGroups refreshNonce={refreshNonce} onAskGroup={canLiveQuery ? askGroup : undefined} />
      </TabPanel>

      <TabPanel value={visibleTab} index={2}>
        <HardwareInventory
          initialSearch={pendingHardwareSearch}
          initialFleetFilter={initialFleetFilter}
          refreshNonce={refreshNonce}
        />
      </TabPanel>

      <TabPanel value={visibleTab} index={3}>
        <React.Suspense fallback={null}>
          <LocationWorkbench refreshNonce={refreshNonce} />
        </React.Suspense>
      </TabPanel>

      <TabPanel value={visibleTab} index={4}>
        <Printers refreshNonce={refreshNonce} />
      </TabPanel>

      <TabPanel value={visibleTab} index={5}>
        <SoftwareInventory refreshNonce={refreshNonce} />
      </TabPanel>

      <TabPanel value={visibleTab} index={WINDOWS_TAB}>
        <React.Suspense fallback={null}>
          <WindowsDomainPanel
            refreshNonce={refreshNonce}
            canManage={canReport}
            onNavigate={onNavigate}
            section={windowsSection}
            onSectionChange={setWindowsSection}
          />
        </React.Suspense>
      </TabPanel>

      {canLiveQuery ? (
        <TabPanel value={visibleTab} index={LIVE_QUERY_TAB}>
          <React.Suspense fallback={null}>
            <LiveQueryPanel initialTarget={liveTarget} targetNonce={liveTargetNonce} />
          </React.Suspense>
        </TabPanel>
      ) : null}
    </Box>
  );
}
