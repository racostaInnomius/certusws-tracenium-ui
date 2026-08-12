// src/msp/PortfolioGrid.jsx
//
// The reusable child-card grid (F1). Renders one card per portfolio item
// — an MSP card (vendor level) or a client card (MSP level). Same
// component, two levels: the only difference is the childCount chip on
// MSP cards and the click behavior the parent wires via onSelect.
//
// Each card shows the four locked metrics: Devices, Online%, Alerts,
// Compliance% (see docs/MSP_PLATFORM_SPEC.md). Missing roll-up data
// (tenant never swept) renders as "—" rather than a misleading 0.

import * as React from "react";
import { Box, Chip, Grid, Stack, Typography } from "@mui/material";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import SectionPaper from "../components/common/SectionPaper";
import { BRAND } from "../theme/brand";
import { fetchMspClients } from "./mspApi";

// How many of an MSP's clients to preview inline on its card. Keeps the
// card a fixed, scannable size regardless of portfolio size — the exact
// count still shows via the "N clients" caption and the "+N more" line.
const CHILD_PREVIEW_LIMIT = 3;

function MetricChip({ label, value, tone = "neutral" }) {
  const tones = {
    neutral: { bg: BRAND.darkSoft, fg: BRAND.dark },
    teal: { bg: BRAND.tealSoft, fg: BRAND.tealText },
    good: { bg: BRAND.alert.successSoft, fg: BRAND.alert.success },
    warn: { bg: BRAND.alert.warningSoft, fg: BRAND.alert.warning },
    bad: { bg: BRAND.alert.errorSoft, fg: BRAND.alert.error },
  };
  const s = tones[tone] || tones.neutral;
  return (
    <Chip
      label={`${label}: ${value}`}
      size="small"
      sx={{ bgcolor: s.bg, color: s.fg, fontWeight: 700, fontSize: 11 }}
    />
  );
}

// Compliance tone: green ≥90, amber ≥70, red below.
function complianceTone(pct) {
  if (pct == null) return "neutral";
  if (pct >= 90) return "good";
  if (pct >= 70) return "warn";
  return "bad";
}
// Alerts tone: green 0, amber 1-4, red 5+.
function alertsTone(n) {
  if (n == null) return "neutral";
  if (n === 0) return "good";
  if (n < 5) return "warn";
  return "bad";
}

const dash = (v) => (v == null ? "—" : v);

function ChildTenantCard({ client }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 1,
        py: 0.5,
        borderRadius: 1.5,
        bgcolor: BRAND.surface,
        border: `1px solid ${BRAND.border}`,
        minWidth: 0,
      }}
    >
      <DevicesOutlinedIcon sx={{ fontSize: 13, color: BRAND.gray, flexShrink: 0 }} />
      <Typography
        noWrap
        sx={{ fontSize: 11.5, fontWeight: 600, color: BRAND.dark, flex: 1, minWidth: 0 }}
      >
        {client.name || `Tenant ${client.tenantId}`}
      </Typography>
      <Typography sx={{ fontSize: 10.5, color: BRAND.gray, flexShrink: 0 }}>
        {dash(client.deviceCount)} dev
      </Typography>
    </Box>
  );
}

// Lightweight preview of an MSP's clients, nested inside its card so a
// vendor can see who's inside a partner without drilling in first. Loads
// lazily per-card (same endpoint the drill-down click already uses) and
// fails silently — on error the card just falls back to the plain
// "N clients" caption it already had.
function useChildTenantPreview(item, isMsp) {
  const [clients, setClients] = React.useState(null);

  React.useEffect(() => {
    if (!isMsp) return;
    let alive = true;
    fetchMspClients(item.tenantId)
      .then((resp) => {
        if (!alive) return;
        setClients(Array.isArray(resp?.items) ? resp.items : []);
      })
      .catch(() => {
        if (alive) setClients(null);
      });
    return () => {
      alive = false;
    };
  }, [isMsp, item.tenantId]);

  return clients;
}

function PortfolioCard({ item, onSelect }) {
  const isMsp = item.tenantType === "msp";
  const childClients = useChildTenantPreview(item, isMsp);
  return (
    <SectionPaper
      variant="panel"
      hoverable
      onClick={() => onSelect?.(item)}
      sx={{ cursor: "pointer", height: "100%" }}
    >
      <Stack sx={{ p: 2, height: "100%" }} spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 36, height: 36, borderRadius: 1.5,
              display: "flex", alignItems: "center", justifyContent: "center",
              bgcolor: BRAND.tealSoft, color: BRAND.tealText, flexShrink: 0,
            }}
          >
            {isMsp ? <BusinessOutlinedIcon fontSize="small" /> : <DevicesOutlinedIcon fontSize="small" />}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              sx={{ fontWeight: 800, color: BRAND.dark, lineHeight: 1.1, wordBreak: "break-word" }}
            >
              {item.name || `Tenant ${item.tenantId}`}
            </Typography>
            {isMsp ? (
              <Typography variant="caption" sx={{ color: BRAND.gray }}>
                {dash(item.childCount)} {item.childCount === 1 ? "client" : "clients"}
              </Typography>
            ) : (
              <Typography variant="caption" sx={{ color: BRAND.gray }}>
                Tenant #{item.tenantId}
              </Typography>
            )}
          </Box>
          <ArrowForwardOutlinedIcon sx={{ color: BRAND.gray, fontSize: 18, flexShrink: 0 }} />
        </Stack>

        {isMsp && childClients && childClients.length > 0 ? (
          <Stack spacing={0.5}>
            {childClients.slice(0, CHILD_PREVIEW_LIMIT).map((client) => (
              <ChildTenantCard key={client.tenantId} client={client} />
            ))}
            {childClients.length > CHILD_PREVIEW_LIMIT ? (
              <Typography sx={{ fontSize: 11, color: BRAND.gray, fontWeight: 600, textAlign: "center" }}>
                +{childClients.length - CHILD_PREVIEW_LIMIT} more
              </Typography>
            ) : null}
          </Stack>
        ) : null}

        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: "auto" }}>
          <MetricChip label="Devices" value={dash(item.deviceCount)} tone="neutral" />
          <MetricChip
            label="Online"
            value={item.onlinePct == null ? "—" : `${item.onlinePct}%`}
            tone="teal"
          />
          <MetricChip label="Alerts" value={dash(item.openAlerts)} tone={alertsTone(item.openAlerts)} />
          <MetricChip
            label="Compliance"
            value={item.compliancePct == null ? "—" : `${item.compliancePct}%`}
            tone={complianceTone(item.compliancePct)}
          />
        </Box>
      </Stack>
    </SectionPaper>
  );
}

function CardGrid({ items, onSelect }) {
  return (
    <Grid container spacing={2} alignItems="stretch">
      {items.map((item) => (
        <Grid key={item.tenantId} size={{ xs: 12, sm: 6, lg: 4 }}>
          <PortfolioCard item={item} onSelect={onSelect} />
        </Grid>
      ))}
    </Grid>
  );
}

function GroupLabel({ children, count }) {
  return (
    <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 1.25 }}>
      <Typography
        variant="overline"
        sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2, lineHeight: 1.2 }}
      >
        {children}
      </Typography>
      <Typography sx={{ fontSize: 12, color: BRAND.gray, fontWeight: 600 }}>
        {count}
      </Typography>
    </Box>
  );
}

export default function PortfolioGrid({ items, onSelect, emptyLabel }) {
  if (!items || items.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: "center" }}>
        <Typography sx={{ color: BRAND.gray }}>
          {emptyLabel || "Nothing to show yet."}
        </Typography>
      </Box>
    );
  }

  const mspItems = items.filter((it) => it.tenantType === "msp");
  const otherItems = items.filter((it) => it.tenantType !== "msp");

  // Only the vendor's flat "All tenants" list mixes MSP and direct-tenant
  // cards — split it into two labeled groups there so partners read as a
  // distinct set rather than blending into the tenant list. Every other
  // level (an MSP's own client list, or a vendor drilled into one MSP)
  // is already a single homogeneous list, so it keeps the plain grid.
  if (mspItems.length === 0 || otherItems.length === 0) {
    return <CardGrid items={items} onSelect={onSelect} />;
  }

  return (
    <Box>
      <GroupLabel count={mspItems.length}>Partners</GroupLabel>
      <CardGrid items={mspItems} onSelect={onSelect} />

      <Box sx={{ mt: 3 }}>
        <GroupLabel count={otherItems.length}>Direct tenants</GroupLabel>
        <CardGrid items={otherItems} onSelect={onSelect} />
      </Box>
    </Box>
  );
}
