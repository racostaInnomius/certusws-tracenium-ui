// src/components/patch-management/ThirdPartyTab.jsx
//
// Container for the Third-party tab: a sub-view toggle between the outdated-
// software findings (the action surface) and the catalog manager (the data
// operators maintain). Kept as a thin wrapper so each sub-view stays a focused,
// self-contained component.

import * as React from "react";
import { Box, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { BRAND } from "../../theme/brand";
import ThirdPartyPanel from "./ThirdPartyPanel";
import ThirdPartyCatalogManager from "./ThirdPartyCatalogManager";

export default function ThirdPartyTab({ canManage, notify }) {
  const [view, setView] = React.useState("findings");

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
        <ToggleButton value="findings">Outdated software</ToggleButton>
        <ToggleButton value="catalog">Catalog</ToggleButton>
      </ToggleButtonGroup>

      {view === "findings" ? (
        <ThirdPartyPanel canManage={canManage} notify={notify} />
      ) : (
        <ThirdPartyCatalogManager canManage={canManage} notify={notify} />
      )}
    </Box>
  );
}
