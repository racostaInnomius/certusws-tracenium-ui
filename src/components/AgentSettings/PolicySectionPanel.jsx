// src/components/AgentSettings/PolicySectionPanel.jsx
//
// The form for ONE section of the policy: the section's own cards, a
// one-line description, and a link to the plugin page where the rest of
// that plugin is configured (baselines, maintenance windows, connectors,
// approval). Reuses the existing card components untouched — the change
// is which of them render together, not what they do.

import * as React from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import IntervalScheduleCard from "../Policies/IntervalScheduleCard";
import FeaturesSection from "../Policies/FeaturesSection";
import CryptoDiscoverySection from "../Policies/CryptoDiscoverySection";
import { AiIntelligenceSection, SoftwareDeliverySection } from "../Policies/AiSdpSections";
import {
  COMPLIANCE_INTERVAL_MAX,
  COMPLIANCE_INTERVAL_MIN,
  INVENTORY_INTERVAL_MAX,
  INVENTORY_INTERVAL_MIN,
  PATCH_INTERVAL_MAX,
  PATCH_INTERVAL_MIN,
  UPDATE_INTERVAL_MAX,
  UPDATE_INTERVAL_MIN,
} from "../Policies/policyTransforms";

function SectionBody({ id, form, onChange, readOnly, catalog }) {
  switch (id) {
    case "agent":
      return (
        <>
          <IntervalScheduleCard
            form={form}
            onChange={onChange}
            readOnly={readOnly}
            formKey="update"
            title="Agent update schedule"
            label="Update probe interval (seconds)"
            min={UPDATE_INTERVAL_MIN}
            max={UPDATE_INTERVAL_MAX}
            step={300}
            helperText="Blank = backend default (6h / 21600s). Set higher to slow auto-update down; freeze it with the Self-update switch below."
          />
          <FeaturesSection form={form} onChange={onChange} readOnly={readOnly} catalog={catalog} parts="agent" />
        </>
      );
    case "amp":
      return (
        <IntervalScheduleCard
          form={form}
          onChange={onChange}
          readOnly={readOnly}
          formKey="inventory"
          title="Inventory schedule"
          label="Asset collection interval (seconds)"
          min={INVENTORY_INTERVAL_MIN}
          max={INVENTORY_INTERVAL_MAX}
          step={60}
          helperText="Blank = backend default (6h / 21600s). Range 60–86400."
        />
      );
    case "scp":
      return (
        <IntervalScheduleCard
          form={form}
          onChange={onChange}
          readOnly={readOnly}
          formKey="compliance"
          title="Compliance schedule"
          label="Evaluation interval (seconds)"
          min={COMPLIANCE_INTERVAL_MIN}
          max={COMPLIANCE_INTERVAL_MAX}
          step={60}
          bgcolor={BRAND.tealSoft}
          titleColor={BRAND.tealText}
          helperText="Blank = backend default (8h / 28800s). Range 300–86400."
        />
      );
    case "pmp":
      return (
        <IntervalScheduleCard
          form={form}
          onChange={onChange}
          readOnly={readOnly}
          formKey="patch"
          title="Patch schedule"
          label="Patch scan interval (seconds)"
          min={PATCH_INTERVAL_MIN}
          max={PATCH_INTERVAL_MAX}
          step={300}
          bgcolor={BRAND.cyanSoft}
          helperText="Blank = backend default (24h / 86400s). Range 300–604800."
        />
      );
    case "sdp":
      return <SoftwareDeliverySection form={form} onChange={onChange} readOnly={readOnly} />;
    case "cdp":
      return <CryptoDiscoverySection form={form} onChange={onChange} readOnly={readOnly} />;
    case "rcp":
      return <FeaturesSection form={form} onChange={onChange} readOnly={readOnly} catalog={catalog} parts="rcp" />;
    case "ai":
      return <AiIntelligenceSection form={form} onChange={onChange} readOnly={readOnly} />;
    default:
      return null;
  }
}

export default function PolicySectionPanel({ section, form, onChange, readOnly = false, catalog = [], onNavigate, onOpenPlugins }) {
  if (!section) return null;
  const inactive = section.enabled === false;
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h2" sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
            {section.label}
          </Typography>
          {section.description ? (
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>{section.description}</Typography>
          ) : null}
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
        <SectionBody id={section.id} form={form} onChange={onChange} readOnly={readOnly} catalog={catalog} />
      )}
    </Box>
  );
}
