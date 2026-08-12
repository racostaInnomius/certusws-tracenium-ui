// src/components/patch-management/KevBadge.jsx
//
// Badge for a CVE that is on the CISA KEV list (actively exploited in the wild).
// It's the single strongest prioritization signal, so it renders filled-red and,
// when CISA flags known ransomware campaign use, adds a second amber chip.

import * as React from "react";
import { Box, Chip, Tooltip } from "@mui/material";
import GppMaybeOutlinedIcon from "@mui/icons-material/GppMaybeOutlined";
import LocalFireDepartmentOutlinedIcon from "@mui/icons-material/LocalFireDepartmentOutlined";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import { BRAND } from "../../theme/brand";

export default function KevBadge({ ransomware = false, dueDate = null, overdue = false, size = "small" }) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
      <Tooltip title="On the CISA Known Exploited Vulnerabilities catalog — actively exploited in the wild. Prioritize this fix.">
        <Chip
          size={size}
          icon={<GppMaybeOutlinedIcon sx={{ fontSize: 14, color: "#fff !important" }} />}
          label="Actively exploited"
          sx={{
            height: 20,
            fontSize: 10.5,
            fontWeight: 800,
            bgcolor: BRAND.alert?.error,
            color: "#fff",
            "& .MuiChip-icon": { ml: 0.5 },
          }}
        />
      </Tooltip>
      {overdue ? (
        <Tooltip title={`Past the CISA remediate-by deadline${dueDate ? ` (${dueDate})` : ""}. Under BOD 22-01 this fix is overdue.`}>
          <Chip
            size={size}
            icon={<EventBusyOutlinedIcon sx={{ fontSize: 14, color: "#fff !important" }} />}
            label={dueDate ? `Overdue · due ${dueDate}` : "Overdue"}
            sx={{
              height: 20,
              fontSize: 10.5,
              fontWeight: 800,
              bgcolor: "#7a1420",
              color: "#fff",
              "& .MuiChip-icon": { ml: 0.5 },
            }}
          />
        </Tooltip>
      ) : dueDate ? (
        <Tooltip title="CISA remediate-by deadline for this actively-exploited CVE.">
          <Chip
            size={size}
            icon={<ScheduleOutlinedIcon sx={{ fontSize: 14 }} />}
            label={`Due ${dueDate}`}
            sx={{
              height: 20,
              fontSize: 10.5,
              fontWeight: 700,
              bgcolor: BRAND.darkSoft,
              color: BRAND.gray,
              "& .MuiChip-icon": { color: BRAND.gray, ml: 0.5 },
            }}
          />
        </Tooltip>
      ) : null}
      {ransomware ? (
        <Tooltip title="CISA marks this CVE as used in known ransomware campaigns.">
          <Chip
            size={size}
            icon={<LocalFireDepartmentOutlinedIcon sx={{ fontSize: 14 }} />}
            label="Ransomware"
            sx={{
              height: 20,
              fontSize: 10.5,
              fontWeight: 800,
              bgcolor: "rgba(199,121,43,0.16)",
              color: "#8b5418",
              "& .MuiChip-icon": { color: "#8b5418", ml: 0.5 },
            }}
          />
        </Tooltip>
      ) : null}
    </Box>
  );
}
