// src/components/patch-management/VulnerabilitiesTab.jsx
//
// Container for the Vulnerabilities tab: a sub-view toggle between fleet exposure
// (vulnerable installed software — the read surface) and the CVE catalog (the
// data operators maintain). Mirrors ThirdPartyTab.

import * as React from "react";
import { Box, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { BRAND } from "../../theme/brand";
import VulnerabilityExposurePanel from "./VulnerabilityExposurePanel";
import CveCatalogManager from "./CveCatalogManager";

export default function VulnerabilitiesTab({ canManage, notify }) {
  const [view, setView] = React.useState("exposure");

  return (
    <Box>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={view}
        onChange={(_e, v) => v && setView(v)}
        sx={{
          mb: 2,
          "& .MuiToggleButton-root": {
            textTransform: "none",
            fontWeight: 700,
            color: BRAND.gray,
            borderColor: BRAND.border,
            "&.Mui-selected": { color: BRAND.teal, bgcolor: BRAND.tealSoft, "&:hover": { bgcolor: BRAND.tealSoft } },
          },
        }}
      >
        <ToggleButton value="exposure">Vulnerable software</ToggleButton>
        <ToggleButton value="catalog">CVE catalog</ToggleButton>
      </ToggleButtonGroup>

      {view === "exposure" ? (
        <VulnerabilityExposurePanel notify={notify} />
      ) : (
        <CveCatalogManager canManage={canManage} notify={notify} />
      )}
    </Box>
  );
}
