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
import AssetsDashboard from "./AssetsDashboard";

import SoftwareInventory from "./SoftwareInventory";
import HardwareInventory from "./HardwareInventory";
import WindowsGpos from "./WindowsGpos";
import AssetGroups from "./AssetGroups";

// Note: the "Agent Downloads" tab moved to its own top-level page
// (Device Enrollment) in tandem with the enrollment-token surface.
// Asset Management is now strictly inventory; the binary catalog is
// part of the enrollment flow, which is where new operators expect to
// find it.

import { BRAND } from "../theme/brand";
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
const FLEET_HEALTH_KEY = "global.fleet-health";

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
  const [activeTab, setActiveTab] = React.useState(0);
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
  };

  const navigateToHardwareInventory = React.useCallback((searchTerm = "") => {
    setPendingHardwareSearch(searchTerm);
    setActiveTab(3);

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
  // ⚠️ Lo miran LAS CINCO. Antes sólo AssetsDashboard y WindowsGpos: pulsar
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

  // Mismo criterio que Overview: este tipo declara `minRole: ["ADMIN","OWNER"]`
  // en el registro, así que enseñar el botón a un USER sería ofrecerle una
  // puerta que termina en "no disponible". Sólo decide qué se PINTA — quien
  // manda es el gate del backend.
  const { auth } = useAuthContext();
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
                reportKey={FLEET_HEALTH_KEY}
                tooltip="Fleet health report"
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
            icon={<AppsOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Software Inventory"
            {...a11yProps(2)}
            sx={TAB_SX}
          />

          <Tab
            icon={<MemoryOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Hardware Inventory"
            {...a11yProps(3)}
            sx={TAB_SX}
          />

          {/* Va DESPUES de Hardware Inventory y no en Security Compliance: las
              GPO aplicadas son inventario. Estaban alla porque el dato viajaba
              como evidencia de un hallazgo, que describe como se construyo y
              no lo que es. */}
          <Tab
            icon={<PolicyOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Windows GPOs"
            {...a11yProps(4)}
            sx={TAB_SX}
          />
        </Tabs>
      </SectionPaper>

      <TabPanel value={activeTab} index={0}>
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
        <SoftwareInventory refreshNonce={refreshNonce} />
      </TabPanel>

      <TabPanel value={activeTab} index={3}>
        <HardwareInventory initialSearch={pendingHardwareSearch} refreshNonce={refreshNonce} />
      </TabPanel>

      <TabPanel value={activeTab} index={4}>
        <WindowsGpos refreshNonce={refreshNonce} />
      </TabPanel>
    </Box>
  );
}
