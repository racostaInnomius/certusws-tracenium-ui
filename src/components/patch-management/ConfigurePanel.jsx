// src/components/patch-management/ConfigurePanel.jsx
//
// Everything in Patch Management that you set up once and then rarely touch:
// maintenance windows, the vCenter gateway, and the two catalogs operators
// maintain.
//
// These used to sit in the main tab bar as siblings of the daily work, which
// made the row read as a list of equals — "SMB" next to "Maintenance" — when
// one is a problem to fix and the other is a setting. The catalogs were worse
// off still: buried behind a toggle inside the Third-party and Vulnerabilities
// tabs, so the same row offered both a finding to act on and a reference table
// to edit.
//
// Nothing here is rewritten. Each panel is the component that already existed;
// this is only where they now live.

import * as React from "react";
import { Box, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import MaintenanceWindowsPanel from "./MaintenanceWindowsPanel";
import GatewayPanel from "./gateway/GatewayPanel";
import ThirdPartyCatalogManager from "./ThirdPartyCatalogManager";
import CveCatalogManager from "./CveCatalogManager";
import RemediationMatrixPanel from "./RemediationMatrixPanel";

/**
 * Ordered by how often an operator actually opens them: the two that change
 * how deployments behave first, then the reference data.
 */
export const CONFIG_SECTIONS = [
  {
    key: "maintenance",
    label: "Maintenance windows",
    blurb: "When patch and software deployments are allowed to go out.",
  },
  {
    key: "gateway",
    label: "Virtual infrastructure",
    blurb: "The host that snapshots vCenter VMs before they are patched.",
  },
  {
    key: "third-party-catalog",
    label: "Third-party catalog",
    blurb: "The applications we track for outdated versions.",
  },
  {
    key: "cve-catalog",
    label: "CVE catalog",
    blurb: "Vulnerability data, including the CISA KEV list.",
  },
  {
    key: "remediation-matrix",
    label: "Remediation matrix",
    blurb: "What the agent can fix per platform, and whether it has been seen working.",
  },
];

export default function ConfigurePanel({
  canManage,
  devices = [],
  notify,
  section,
  onSectionChange,
}) {
  // Controlled when the page deep-links into a section (?pmTab=gateway still
  // works and lands here), uncontrolled otherwise.
  const [local, setLocal] = React.useState(CONFIG_SECTIONS[0].key);
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
        aria-label="Patch management settings"
        sx={{
          border: `1px solid ${BRAND.border}`,
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: BRAND.surface,
        }}
      >
        <List disablePadding>
          {CONFIG_SECTIONS.map((s) => {
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
        {active === "maintenance" ? (
          <MaintenanceWindowsPanel canManage={canManage} notify={notify} />
        ) : active === "gateway" ? (
          <GatewayPanel canManage={canManage} devices={devices} notify={notify} />
        ) : active === "third-party-catalog" ? (
          <ThirdPartyCatalogManager canManage={canManage} notify={notify} />
        ) : active === "cve-catalog" ? (
          <CveCatalogManager canManage={canManage} notify={notify} />
        ) : active === "remediation-matrix" ? (
          <RemediationMatrixPanel canManage={canManage} devices={devices} notify={notify} />
        ) : (
          <Typography sx={{ color: BRAND.gray, fontSize: TEXT.sm }}>
            Pick a setting on the left.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
