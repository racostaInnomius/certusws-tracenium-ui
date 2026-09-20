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
import PolicyOutlinedIcon from "@mui/icons-material/PolicyOutlined";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import TravelExploreOutlinedIcon from "@mui/icons-material/TravelExploreOutlined";
import AssetsDashboard from "./AssetsDashboard";
import SignalCoverageCard from "../components/Assets/SignalCoverageCard";

import SoftwareInventory from "./SoftwareInventory";
import HardwareInventory from "./HardwareInventory";
// Perezoso como el resto de vistas pesadas: quien nunca abra la pestaña no
// paga su chunk.
const LocationWorkbench = React.lazy(() =>
  import("../components/AssetsDashboard/LocationWorkbench")
);
import WindowsGpos from "./WindowsGpos";
import Printers from "./Printers";
import AssetGroups from "./AssetGroups";
// Qué equipos EXISTEN frente a los que gestionamos. Perezosa: quien no la abra
// no paga su chunk, y su API sólo responde con la migración de Cobertura.
const CoveragePanel = React.lazy(() => import("../components/discovery/CoveragePanel"));

// Note: the "Agent Downloads" tab moved to its own top-level page
// (Device Enrollment) in tandem with the enrollment-token surface.
// Asset Management is now strictly inventory; the binary catalog is
// part of the enrollment flow, which is where new operators expect to
// find it.

import { BRAND } from "../theme/brand";
import { getSearchParam, updateSearchParams } from "../utils/browserState";

// Pestañas que se pueden abrir desde un enlace (`?assetsTab=hardware`). Sólo
// las que alguien enlaza hoy; el índice es el orden de los <Tab> de abajo.
const TAB_FROM_URL = { dashboard: 0, groups: 1, hardware: 2, location: 3, printers: 4, software: 5, gpos: 6, coverage: 7 };
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
          value={activeTab}
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

          <Tab
            icon={<PolicyOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Windows GPOs"
            {...a11yProps(6)}
            sx={TAB_SX}
          />

          {/* La otra mitad del inventario: lo que existe y NO tenemos. Al final
              de la barra a propósito — se mira al incorporar un cliente o al
              cuadrar la facturación, no todos los días. */}
          <Tab
            icon={<TravelExploreOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Coverage"
            {...a11yProps(7)}
            sx={TAB_SX}
          />
        </Tabs>
      </SectionPaper>

      {/* La ausencia como hallazgo: de los equipos que SÍ gestionamos, de
          cuáles no sabemos nada. Va sobre el dashboard de assets porque es la
          advertencia que hay que leer ANTES de creerse los números de abajo. */}
      <TabPanel value={activeTab} index={0}>
        <Box sx={{ mb: 2 }}>
          <SignalCoverageCard refreshNonce={refreshNonce} />
        </Box>
        <AssetsDashboard
          onAssetsEmptyStateChange={onAssetsEmptyStateChange}
          refreshNonce={refreshNonce}
          onNavigateToHardwareInventory={navigateToHardwareInventory}
          suppressEmptyStateOverlay={suppressEmptyStateOverlay}
          onNavigate={onNavigate}
        />
      </TabPanel>

      <TabPanel value={activeTab} index={1}>
        <AssetGroups refreshNonce={refreshNonce} />
      </TabPanel>

      <TabPanel value={activeTab} index={2}>
        <HardwareInventory
          initialSearch={pendingHardwareSearch}
          initialFleetFilter={initialFleetFilter}
          refreshNonce={refreshNonce}
        />
      </TabPanel>

      <TabPanel value={activeTab} index={3}>
        <React.Suspense fallback={null}>
          <LocationWorkbench refreshNonce={refreshNonce} />
        </React.Suspense>
      </TabPanel>

      <TabPanel value={activeTab} index={4}>
        <Printers refreshNonce={refreshNonce} />
      </TabPanel>

      <TabPanel value={activeTab} index={5}>
        <SoftwareInventory refreshNonce={refreshNonce} />
      </TabPanel>

      <TabPanel value={activeTab} index={6}>
        <WindowsGpos refreshNonce={refreshNonce} />
      </TabPanel>

      <TabPanel value={activeTab} index={7}>
        <React.Suspense fallback={null}>
          <CoveragePanel refreshNonce={refreshNonce} canManage={canReport} />
        </React.Suspense>
      </TabPanel>
    </Box>
  );
}
