import * as React from "react";
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Typography,
} from "@mui/material";

import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";

import AssetsDashboard from "./AssetsDashboard";
import SoftwareDelivery from "./SoftwareDelivery";

function a11yProps(index) {
  return {
    id: `assets-tab-${index}`,
    "aria-controls": `assets-tabpanel-${index}`,
  };
}

export default function Assets({ onAssetsEmptyStateChange }) {
  const [activeTab, setActiveTab] = React.useState(0);

  const handleChange = (_event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>

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
              "&.Mui-selected": {
                color: "#16324f",
              },
            }}
          />

          <Tab
            icon={<DownloadOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Software Delivery"
            {...a11yProps(1)}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              minHeight: 62,
              color: "#667085",
              "&.Mui-selected": {
                color: "#16324f",
              },
            }}
          />
        </Tabs>
      </Paper>

      <Box
        role="tabpanel"
        hidden={activeTab !== 0}
        id="assets-tabpanel-0"
        aria-labelledby="assets-tab-0"
      >
        {activeTab === 0 && (
          <AssetsDashboard onAssetsEmptyStateChange={onAssetsEmptyStateChange} />
        )}
      </Box>

      <Box
        role="tabpanel"
        hidden={activeTab !== 1}
        id="assets-tabpanel-1"
        aria-labelledby="assets-tab-1"
      >
        {activeTab === 1 && <SoftwareDelivery embedded />}
      </Box>
    </Box>
  );
}