// src/components/AssetGroups/GroupCoverageNotice.jsx
//
// Presentational coverage banner for Asset Groups, extracted from the
// AssetGroups god-component. Props-driven: the page owns the coverage fetch
// and passes {coverage, loading, error} + the onRefresh / onViewUngrouped
// callbacks. Renders the "X devices not assigned to any group" summary with
// covered/grouped/total chips; the "View devices" button opens the
// UngroupedDevicesDrawer.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Typography
} from "@mui/material";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { BRAND, ROLE } from "../../theme/brand";
import { getCoverageTone, getCoveragePalette, formatNumber, formatPercent } from "./coverageDisplay";

export default function GroupCoverageNotice({ coverage, loading, error, compact = false, onRefresh, onViewUngrouped }) {
  const totalDevices = Number(coverage?.totalDevices || 0);
  const groupedDevices = Number(coverage?.groupedDevices || 0);
  const ungroupedDevices = Number(coverage?.ungroupedDevices || 0);
  const coveragePercent = Number(coverage?.coveragePercent || 0);
  const tone = getCoverageTone(coverage);
  const palette = getCoveragePalette(tone);
  const hasUngrouped = ungroupedDevices > 0;

  if (error) {
    return (
      <Alert
        severity="warning"
        variant="outlined"
        sx={{
          borderColor: BRAND.border,
          bgcolor: BRAND.surfaceMuted,
          color: BRAND.dark,
          "& .MuiAlert-icon": { color: ROLE.caution },
        }}
        action={
          onRefresh ? (
            <Button size="small" onClick={onRefresh} sx={{ color: BRAND.tealText, textTransform: "none", fontWeight: 700 }}>
              Retry
            </Button>
          ) : null
        }
      >
        Group coverage could not be loaded right now.
      </Alert>
    );
  }

  return (
    <Box
      sx={{
        position: "relative",
        p: compact ? 1.25 : 1.5,
        borderRadius: 2,
        border: `1px solid ${BRAND.teal}`,
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.94) 58%, rgba(90,159,159,0.09) 100%)",
        boxShadow: "0 10px 24px rgba(59,64,77,0.06)",
        display: "grid",
        gap: 1.25,
        gridTemplateColumns: { xs: "1fr", md: compact ? "1fr" : "auto 1fr auto" },
        alignItems: "center",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 0% 50%, rgba(90,159,159,0.10), transparent 34%), radial-gradient(circle at 100% 50%, rgba(143,253,255,0.09), transparent 30%)",
        },
        "& > *": {
          position: "relative",
          zIndex: 1,
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            bgcolor: BRAND.tealSoft,
            color: BRAND.tealText,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            border: `1px solid ${BRAND.border}`,
          }}
        >
          <Inventory2OutlinedIcon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: BRAND.dark, lineHeight: 1.25 }}>
            {loading
              ? "Checking group coverage…"
              : hasUngrouped
              ? `${formatNumber(ungroupedDevices)} device${ungroupedDevices === 1 ? "" : "s"} not assigned to any group`
              : "All known devices are assigned to at least one group"}
          </Typography>
          <Typography sx={{ fontSize: 12, color: BRAND.gray, lineHeight: 1.45, mt: 0.25 }}>
            {loading
              ? "Validating static and dynamic asset group coverage."
              : hasUngrouped
              ? "These devices are outside static and dynamic group coverage. Review them before targeting jobs, policies, or reporting by group."
              : "Your fleet has complete asset group coverage based on the latest backend evaluation."}
          </Typography>
        </Box>
      </Box>

      <Stack
        direction="row"
        spacing={0.75}
        sx={{
          flexWrap: "wrap",
          gap: 0.75,
          justifyContent: { xs: "flex-start", md: compact ? "flex-start" : "center" },
        }}
      >
        <Chip
          size="small"
          label={`${formatPercent(coveragePercent)} covered`}
          sx={{
            bgcolor: "rgba(255,255,255,0.92)",
            color: palette.color,
            fontWeight: 900,
            border: `1px solid ${BRAND.border}`,
            boxShadow: "0 3px 10px rgba(59,64,77,0.05)",
            "& .MuiChip-label": { px: 1.25 },
          }}
        />
        <Chip
          size="small"
          label={`${formatNumber(groupedDevices)} grouped`}
          sx={{
            bgcolor: "rgba(255,255,255,0.92)",
            color: BRAND.tealText,
            fontWeight: 800,
            border: `1px solid ${BRAND.border}`,
            boxShadow: "0 3px 10px rgba(59,64,77,0.04)",
            "& .MuiChip-label": { px: 1.25 },
          }}
        />
        <Chip
          size="small"
          label={`${formatNumber(totalDevices)} total`}
          sx={{
            bgcolor: "rgba(255,255,255,0.92)",
            color: BRAND.gray,
            fontWeight: 800,
            border: `1px solid ${BRAND.border}`,
            boxShadow: "0 3px 10px rgba(59,64,77,0.04)",
            "& .MuiChip-label": { px: 1.25 },
          }}
        />
      </Stack>

      <Stack
        direction="row"
        spacing={1}
        justifyContent={{ xs: "flex-start", md: compact ? "flex-start" : "flex-end" }}
        sx={{ minWidth: { md: compact ? 0 : 220 } }}
      >
        {hasUngrouped ? (
          <Button
            size="small"
            variant="contained"
            startIcon={<VisibilityOutlinedIcon />}
            onClick={onViewUngrouped}
            disabled={loading}
            sx={{
              textTransform: "none",
              fontWeight: 800,
              bgcolor: BRAND.teal,
              "&:hover": { bgcolor: BRAND.tealHover },
            }}
          >
            View devices
          </Button>
        ) : null}
        {onRefresh ? (
          <IconButton
            size="small"
            onClick={onRefresh}
            disabled={loading}
            sx={{
              bgcolor: "#fff",
              color: BRAND.tealText,
              border: `1px solid ${BRAND.border}`,
              "&:hover": { bgcolor: BRAND.tealSoft },
            }}
            title="Refresh group coverage"
          >
            {loading ? <CircularProgress size={16} sx={{ color: BRAND.teal }} /> : <RefreshOutlinedIcon fontSize="small" />}
          </IconButton>
        ) : null}
      </Stack>
    </Box>
  );
}
