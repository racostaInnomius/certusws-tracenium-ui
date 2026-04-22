import * as React from "react";
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Typography,
} from "@mui/material";

import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";
import MemoryOutlinedIcon from "@mui/icons-material/MemoryOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import AssetsDashboard from "./AssetsDashboard";
import SoftwareDelivery from "./SoftwareDelivery";

import SoftwareInventory from "./SoftwareInventory";
import HardwareInventory from "./HardwareInventory";

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

function InventoryPlaceholder({ title, description }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 3, sm: 4 },
        borderRadius: 3,
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
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
        sx={{ fontWeight: 700, color: "#16324f", mb: 1.5 }}
      >
        {title}
      </Typography>

      <Typography
        sx={{
          maxWidth: 620,
          color: "#667085",
          lineHeight: 1.7,
        }}
      >
        {description}
      </Typography>
    </Paper>
  );
}

export default function Assets({ onAssetsEmptyStateChange }) {
  const [activeTab, setActiveTab] = React.useState(0);

  const handleChange = (_event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" color="#1ba6a6" sx={{ fontWeight: 700 }}>
          Assets
        </Typography>

        <Typography variant="body1" color="text.secondary">
          Monitor devices, inventory and agent distribution
        </Typography>
      </Box>

      <Paper
        elevation={0}
        sx={{
          mb: 2,
          borderRadius: 3,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
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
              backgroundColor: "#1ba6a6",
            },
          }}
        >
          <Tab
            icon={<Inventory2OutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Asset Management"
            {...a11yProps(0)}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              minHeight: 62,
              color: "#667085",
              "&.Mui-selected": { color: "#16324f" },
            }}
          />

          <Tab
            icon={<AppsOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Software Inventory"
            {...a11yProps(1)}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              minHeight: 62,
              color: "#667085",
              "&.Mui-selected": { color: "#16324f" },
            }}
          />

          <Tab
            icon={<MemoryOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Hardware Inventory"
            {...a11yProps(2)}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              minHeight: 62,
              color: "#667085",
              "&.Mui-selected": { color: "#16324f" },
            }}
          />

          <Tab
            icon={<DownloadOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Agent Downloads"
            {...a11yProps(3)}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              minHeight: 62,
              color: "#667085",
              "&.Mui-selected": { color: "#16324f" },
            }}
          />
        </Tabs>
      </Paper>

      <TabPanel value={activeTab} index={0}>
        <AssetsDashboard onAssetsEmptyStateChange={onAssetsEmptyStateChange} />
      </TabPanel>

      <TabPanel value={activeTab} index={1}>
        <SoftwareInventory />
      </TabPanel>

      <TabPanel value={activeTab} index={2}>
        <HardwareInventory />
      </TabPanel>

      <TabPanel value={activeTab} index={3}>
        <SoftwareDelivery embedded />
      </TabPanel>
    </Box>
  );
}