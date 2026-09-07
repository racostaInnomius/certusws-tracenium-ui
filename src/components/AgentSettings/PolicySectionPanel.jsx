// src/components/AgentSettings/PolicySectionPanel.jsx
//
// The form for ONE section of the policy: header with a one-line
// description and the link to the plugin page where the rest of that
// plugin is configured, then the section's settings as compact rows
// (SectionFields). In device scope every row says whether it inherits
// from the tenant or overrides it.

import * as React from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import SectionFields from "./SectionFields";
import CdpProbeCandidates from "./CdpProbeCandidates";

export default function PolicySectionPanel({
  section,
  form,
  onChange,
  readOnly = false,
  onNavigate,
  onOpenPlugins,
  scope = "tenant",
  compareForm = null,
  deviceLabel = "",
}) {
  if (!section) return null;
  const inactive = section.enabled === false;
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h2" sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
            {section.label}
            {scope === "device" && deviceLabel ? <Typography component="span" sx={{ fontSize: TEXT.base, color: BRAND.gray, fontWeight: 500 }}> · {deviceLabel}</Typography> : null}
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
            {scope === "device" ? "Dimmed rows inherit from the tenant. An override stores only what differs." : section.description}
          </Typography>
        </Box>
        {section.related && onNavigate ? (
          <Button
            size="small"
            endIcon={<OpenInNewOutlinedIcon />}
            onClick={() => onNavigate(section.related.page)}
            sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText, whiteSpace: "nowrap" }}
          >
            {section.related.label}
          </Button>
        ) : null}
      </Box>

      {inactive ? (
        <Alert
          severity="info"
          sx={{ mt: 2 }}
          action={
            onOpenPlugins ? (
              <Button color="inherit" size="small" onClick={onOpenPlugins}>
                Plugins
              </Button>
            ) : null
          }
        >
          This plugin is not active in the loaded policy, so its settings have no effect. See Plugins for what your plan includes.
        </Alert>
      ) : (
        <>
          <SectionFields sectionId={section.id} form={form} onChange={onChange} scope={scope} compareForm={compareForm} readOnly={readOnly} />
          {section.id === "cdp" ? <CdpProbeCandidates form={form} onChange={onChange} readOnly={readOnly} /> : null}
        </>
      )}
    </Box>
  );
}
