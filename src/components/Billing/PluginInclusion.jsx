// src/components/Billing/PluginInclusion.jsx
//
// "What's included" — the informational replacement for the old
// Plugin Control page (retired: entitlements made manual per-plugin
// toggling obsolete, so there's no switch here, only status). Renders
// under the Endpoint line in SubscriptionSummary as a collapsible
// 3-column box grid, one box per catalog plugin:
//
//   - Active            → entitled by tier AND enabled in the tenant's
//                          policy. Shows live device coverage.
//   - Included, inactive → entitled by tier but not enabled — nothing
//                          to click here anymore; "how it gets turned
//                          on" is a support/account conversation now,
//                          not a toggle on this page.
//   - Requires upgrade   → not entitled at the tenant's current tier.
//
// Data sources, same ones the old Plugin Control page used:
//   - usePluginCatalog()      → the 6-plugin catalog (label/title/
//                                description/tier_required), cached.
//   - getTenantPolicy(tenantId) → policy_json, to read plugins.enabled[].
//   - getPluginCoverageSummary() → per-plugin device coverage.

import * as React from "react";
import { Box, Typography } from "@mui/material";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import { getTenantPolicy } from "../../api/policies";
import { getPluginCoverageSummary } from "../../api/overview";
import { usePluginCatalog } from "../../hooks/usePluginCatalog";
import { tierRank } from "./billingModel";

function extractPolicyContent(response) {
  if (!response || typeof response !== "object") return null;
  const row = response?.policy ?? response;
  if (!row || typeof row !== "object") return null;
  if ("policy_json" in row) return row.policy_json ?? null;
  if ("policyJson" in row) return row.policyJson ?? null;
  return row;
}

function PluginBox({ plugin, active, entitled, coverage, totalDevices }) {
  const locked = !entitled;
  const denom = Number(totalDevices) || 0;
  const count = Number(coverage) || 0;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 2.5,
        p: 1.75,
        bgcolor: locked ? BRAND.surfaceMuted : "#fff",
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", mb: 0.25 }}>
          <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
            {plugin.label} — {plugin.title}
          </Typography>
          {plugin.required ? (
            <Box
              component="span"
              sx={{
                fontSize: TEXT.xs,
                fontWeight: 800,
                bgcolor: BRAND.tealSoft,
                color: BRAND.tealText,
                border: `1px solid ${BRAND.teal}55`,
                borderRadius: 999,
                px: 1,
                py: 0.1,
              }}
            >
              Required
            </Box>
          ) : null}
          {locked ? (
            <Box
              component="span"
              sx={{
                fontSize: TEXT.xs,
                fontWeight: 800,
                bgcolor: BRAND.surfaceMuted,
                color: "text.secondary",
                borderRadius: 999,
                px: 1,
                py: 0.1,
                whiteSpace: "nowrap",
              }}
            >
              🔒 Requires {plugin.tier_required}
            </Box>
          ) : (
            <Box
              component="span"
              sx={{
                fontSize: TEXT.xs,
                fontWeight: 700,
                bgcolor: BRAND.surfaceMuted,
                color: "text.secondary",
                border: `1px solid ${BRAND.border}`,
                borderRadius: 999,
                px: 1,
                py: 0.1,
                whiteSpace: "nowrap",
              }}
            >
              {active ? `${count} / ${denom} reporting` : "included, not active"}
            </Box>
          )}
        </Box>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          {plugin.description}
        </Typography>
      </Box>
      {plugin.required ? (
        <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: "auto", pt: 0.5 }}>
          Always on
        </Typography>
      ) : null}
    </Box>
  );
}

export default function PluginInclusion({ tenantId, tier }) {
  const [open, setOpen] = React.useState(false);
  const [policyJson, setPolicyJson] = React.useState(null);
  const [coverage, setCoverage] = React.useState(null);
  const { catalog, getEnabledPluginSet } = usePluginCatalog();

  React.useEffect(() => {
    if (!tenantId) return undefined;
    let cancelled = false;
    getTenantPolicy(tenantId)
      .then((res) => {
        if (cancelled) return;
        setPolicyJson(extractPolicyContent(res) ?? {});
      })
      .catch(() => {
        if (cancelled) return;
        setPolicyJson({});
      });
    getPluginCoverageSummary()
      .then((res) => {
        if (cancelled) return;
        setCoverage(res || null);
      })
      .catch(() => {
        if (cancelled) return;
        setCoverage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (!catalog.length) return null;

  const enabledSet = getEnabledPluginSet(policyJson || {});
  const totalDevices = Number(coverage?.total ?? 0);
  const coverageByPlugin = coverage?.byPlugin || [];
  const includedCount = catalog.filter((p) => tierRank(tier) >= tierRank(p.tier_required)).length;

  return (
    <Box sx={{ mt: 1.75, pt: 1.75, borderTop: `1px dashed ${BRAND.border}` }}>
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          cursor: "pointer",
          color: BRAND.tealText,
          fontWeight: 700,
          fontSize: TEXT.md,
          userSelect: "none",
        }}
      >
        {open ? <ExpandLessOutlinedIcon fontSize="small" /> : <ExpandMoreOutlinedIcon fontSize="small" />}
        What&apos;s included ({includedCount} plugin{includedCount === 1 ? "" : "s"})
      </Box>

      {open ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" },
            gap: 1.25,
            mt: 1.5,
          }}
        >
          {catalog.map((plugin) => {
            const entitled = tierRank(tier) >= tierRank(plugin.tier_required);
            const active = entitled && enabledSet.has(plugin.key);
            const found = coverageByPlugin.find((c) => c.plugin === plugin.key);
            return (
              <PluginBox
                key={plugin.key}
                plugin={plugin}
                active={active}
                entitled={entitled}
                coverage={found?.count ?? 0}
                totalDevices={totalDevices}
              />
            );
          })}
        </Box>
      ) : null}
    </Box>
  );
}
