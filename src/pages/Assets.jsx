import * as React from "react";
import {
  Box,
  Tabs,
  Tab,
  Typography,
} from "@mui/material";

import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import GroupWorkOutlinedIcon from "@mui/icons-material/GroupWorkOutlined";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";
import MemoryOutlinedIcon from "@mui/icons-material/MemoryOutlined";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import AssetsDashboard from "./AssetsDashboard";

import SoftwareInventory from "./SoftwareInventory";
import HardwareInventory from "./HardwareInventory";
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

// Empty-state card used when an inventory tab has no data yet.
// Uses the shared `panel` variant so the elevation/border match the
// rest of the app (previously it was a custom borderRadius 3 + a
// black-alpha shadow that didn't exist anywhere else).
function InventoryPlaceholder({ title, description }) {
  return (
    <SectionPaper
      variant="panel"
      sx={{
        p: { xs: 3, sm: 4 },
        minHeight: 280,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <Typography
        variant="h5"
        sx={{ fontWeight: 700, color: BRAND.dark, mb: 1.5 }}
      >
        {title}
      </Typography>

      <Typography
        sx={{
          maxWidth: 620,
          color: "text.secondary",
          lineHeight: 1.7,
        }}
      >
        {description}
      </Typography>
    </SectionPaper>
  );
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

export default function Assets({ onAssetsEmptyStateChange }) {
  const [activeTab, setActiveTab] = React.useState(0);

  const handleChange = (_event, newValue) => {
    setActiveTab(newValue);
  };

  // Page-level refresh — bumping the nonce signals child tabs to
  // re-fetch. Each tab opts in by depending on `refreshNonce` in its
  // load effects (today: AssetsDashboard; others can wire it later).
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

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
      <PageHeader
        title="Asset Management"
        subtitle="Monitor devices, inventory and agent distribution"
        icon={<ComputerOutlinedIcon />}
        actions={
          <RefreshControl
            refreshSeconds={refreshSeconds}
            onRefreshSecondsChange={setRefreshSeconds}
            onRefresh={triggerRefresh}
            loading={refreshing}
          />
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
        </Tabs>
      </SectionPaper>

      <TabPanel value={activeTab} index={0}>
        <AssetsDashboard
          onAssetsEmptyStateChange={onAssetsEmptyStateChange}
          refreshNonce={refreshNonce}
        />
      </TabPanel>

      <TabPanel value={activeTab} index={1}>
        <AssetGroups />
      </TabPanel>

      <TabPanel value={activeTab} index={2}>
        <SoftwareInventory />
      </TabPanel>

      <TabPanel value={activeTab} index={3}>
        <HardwareInventory />
      </TabPanel>
    </Box>
  );
}
