// src/msp/ConsolidatedStrip.jsx
//
// F2 — the "all my clients at a glance" summary shown atop the Portfolio.
// A KPI row (totals across the portfolio) + a "needs attention" list of
// the specific clients below the compliance SLA or carrying open alerts.
// Reads /api/v1/msp/consolidated (the materialized roll-up; one query).
//
// onOpenClient(tenantId, name) lets a click on an exception jump straight
// into that client's console.

import * as React from "react";
import {
  Box,
  Chip,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import WifiTetheringOutlinedIcon from "@mui/icons-material/WifiTetheringOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import SectionPaper from "../components/common/SectionPaper";
import { BRAND, TEXT } from "../theme/brand";
import { fetchConsolidated } from "./mspApi";

function Kpi({ icon, label, value, sub, accent = BRAND.teal, tint = BRAND.tealSoft }) {
  return (
    <SectionPaper variant="panel" sx={{ height: "100%" }}>
      <Stack direction="row" spacing={1.5} sx={{ p: 2, alignItems: "center" }}>
        <Box
          sx={{
            width: 40, height: 40, borderRadius: 1.5, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            bgcolor: tint, color: accent,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: BRAND.dark, lineHeight: 1.05 }}>
            {value}
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            {label}{sub ? ` · ${sub}` : ""}
          </Typography>
        </Box>
      </Stack>
    </SectionPaper>
  );
}

const dash = (v) => (v == null ? "—" : v);

export default function ConsolidatedStrip({ onOpenClient }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetchConsolidated();
        if (alive) setData(resp);
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading || !data || data.level === "none") return null;

  const t = data.totals || {};
  const exceptions = data.exceptions || [];

  return (
    <Box sx={{ mb: 3 }}>
      <Grid container spacing={2} alignItems="stretch">
        <Grid size={{ xs: 6, md: 3 }}>
          <Kpi
            icon={<DevicesOutlinedIcon />}
            label="Devices"
            sub={`${t.clients} client${t.clients === 1 ? "" : "s"}`}
            value={dash(t.devices)}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Kpi
            icon={<WifiTetheringOutlinedIcon />}
            label="Online"
            value={t.onlinePct == null ? "—" : `${t.onlinePct}%`}
            sub={`${t.online} up`}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Kpi
            icon={<NotificationsActiveOutlinedIcon />}
            label="Open alerts"
            value={dash(t.openAlerts)}
            accent={t.openAlerts ? BRAND.alert.warning : BRAND.alert.success}
            tint={t.openAlerts ? BRAND.alert.warningSoft : BRAND.alert.successSoft}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Kpi
            icon={<VerifiedUserOutlinedIcon />}
            label="Avg compliance"
            value={t.avgCompliance == null ? "—" : `${t.avgCompliance}%`}
            accent={
              t.avgCompliance == null ? BRAND.teal
                : t.avgCompliance >= 90 ? BRAND.alert.success
                : t.avgCompliance >= 70 ? BRAND.alert.warning
                : BRAND.alert.error
            }
            tint={
              t.avgCompliance == null ? BRAND.tealSoft
                : t.avgCompliance >= 90 ? BRAND.alert.successSoft
                : t.avgCompliance >= 70 ? BRAND.alert.warningSoft
                : BRAND.alert.errorSoft
            }
          />
        </Grid>
      </Grid>

      {/* Needs-attention exception list */}
      {exceptions.length > 0 ? (
        <SectionPaper variant="panel" sx={{ mt: 2 }}>
          <Stack sx={{ p: 2 }} spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <WarningAmberOutlinedIcon fontSize="small" sx={{ color: BRAND.alert.warning }} />
              <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>
                Needs attention ({exceptions.length})
              </Typography>
              <Typography variant="caption" sx={{ color: BRAND.gray }}>
                compliance &lt; {data.thresholds?.complianceBelow}% or ≥ {data.thresholds?.alertsAtLeast} open alert
              </Typography>
            </Stack>
            <Stack spacing={0.5}>
              {exceptions.slice(0, 8).map((ex) => (
                <Box
                  key={ex.tenantId}
                  onClick={() => onOpenClient?.(ex.tenantId, ex.name)}
                  sx={{
                    display: "flex", alignItems: "center", gap: 1,
                    px: 1, py: 0.75, borderRadius: 1, cursor: "pointer",
                    "&:hover": { bgcolor: BRAND.darkSoft },
                  }}
                >
                  <Typography sx={{ fontWeight: 700, color: BRAND.dark, flex: 1, minWidth: 0 }}>
                    {ex.name || `Tenant ${ex.tenantId}`}
                  </Typography>
                  {ex.reasons.map((r, i) => (
                    <Chip key={i} label={r} size="small"
                      sx={{ bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warning, fontWeight: 700, fontSize: TEXT.xs }} />
                  ))}
                </Box>
              ))}
              {exceptions.length > 8 ? (
                <Typography variant="caption" sx={{ color: BRAND.gray, pl: 1 }}>
                  +{exceptions.length - 8} more
                </Typography>
              ) : null}
            </Stack>
          </Stack>
        </SectionPaper>
      ) : null}
    </Box>
  );
}
