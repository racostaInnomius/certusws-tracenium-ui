// src/components/AssetsDashboard/WindowsDomainPanel.jsx
//
// "Windows GPOs" and "Coverage" were two tabs in Asset Management's main bar,
// but neither one is asked of a Mac or a Linux box: GPOs are Group Policy,
// and Coverage is Active Directory discovery. Sitting as siblings of Hardware
// Inventory or Software Inventory made them read as another dimension of the
// same multi-platform inventory, when they only ever answer "what do we know
// about the Windows domain".
//
// Folded here as two sections of one tab, same left-nav shape as Patch
// Management's Configure (ConfigurePanel.jsx) — pick a section on the left,
// its existing page renders on the right. Neither WindowsGpos nor
// CoveragePanel is rewritten; this is only where they now live.

import * as React from "react";
import { Box, List, ListItemButton, ListItemText } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import WindowsGpos from "../../pages/WindowsGpos";
// Coverage's own API call only answers once the discovery migration is
// applied; kept lazy so opening the GPO section (the default) never pays for
// it, same budget Assets.jsx held before the merge.
const CoveragePanel = React.lazy(() => import("../discovery/CoveragePanel"));

export const WINDOWS_DOMAIN_SECTIONS = [
  {
    key: "gpos",
    label: "Group Policy",
    blurb: "GPOs applied across the fleet, and how many devices share each one.",
  },
  {
    key: "coverage",
    label: "Coverage",
    blurb: "Devices Active Directory knows about that have no agent yet.",
  },
];

export default function WindowsDomainPanel({
  refreshNonce,
  canManage = false,
  onNavigate = null,
  section,
  onSectionChange,
}) {
  // Controlled when the page deep-links into a section (old ?assetsTab=gpos
  // / ?assetsTab=coverage links still resolve here — see resolveAssetsTab),
  // uncontrolled otherwise.
  const [local, setLocal] = React.useState(WINDOWS_DOMAIN_SECTIONS[0].key);
  const active = section ?? local;
  const select = (key) => {
    setLocal(key);
    onSectionChange?.(key);
  };

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "248px 1fr" },
        gap: { xs: 2, md: 3 },
        alignItems: "start",
      }}
    >
      <Box
        component="nav"
        aria-label="Windows domain"
        sx={{
          border: `1px solid ${BRAND.border}`,
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: BRAND.surface,
        }}
      >
        <List disablePadding>
          {WINDOWS_DOMAIN_SECTIONS.map((s) => {
            const selected = s.key === active;
            return (
              <ListItemButton
                key={s.key}
                selected={selected}
                onClick={() => select(s.key)}
                sx={{
                  alignItems: "flex-start",
                  py: 1.25,
                  borderLeft: `3px solid ${selected ? BRAND.teal : "transparent"}`,
                  "&.Mui-selected": {
                    bgcolor: BRAND.tealSoft,
                    "&:hover": { bgcolor: BRAND.tealSoft },
                  },
                }}
              >
                <ListItemText
                  primary={s.label}
                  secondary={s.blurb}
                  primaryTypographyProps={{
                    fontSize: TEXT.sm,
                    fontWeight: 700,
                    color: selected ? BRAND.tealText : BRAND.dark,
                  }}
                  secondaryTypographyProps={{ fontSize: TEXT.xs }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Box>

      <Box sx={{ minWidth: 0 }}>
        {active === "gpos" ? (
          <WindowsGpos refreshNonce={refreshNonce} />
        ) : active === "coverage" ? (
          <React.Suspense fallback={null}>
            <CoveragePanel refreshNonce={refreshNonce} canManage={canManage} onNavigate={onNavigate} />
          </React.Suspense>
        ) : null}
      </Box>
    </Box>
  );
}
