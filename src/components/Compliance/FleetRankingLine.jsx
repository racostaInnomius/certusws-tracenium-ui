// src/components/Compliance/FleetRankingLine.jsx
//
// Per-device fleet-ranking line for the device drawer, extracted from the
// SecurityCompliance god-component. Loads the ranking lazily when the drawer
// opens for a given agent and renders a single caption line:
//
//   "#12 of 45 scored · top 27%"           (scored device)
//   "Not scored · 33 of 45 devices scored" (insufficient_data)
//   "Only scored device in this fleet"     (lone scored device)
//   "Loading fleet rank…" / hidden on error
//
// Deliberately surfaces no error UI — a failed ranking request is fine to
// hide silently; the drawer's main content is still useful without it. A
// modal-ish line that loads fresh per agent doesn't benefit from the
// useCachedFetch cache, so the manual loading/one-shot fetch is intentional.

import * as React from "react";
import { Tooltip, Typography } from "@mui/material";
import { BRAND } from "../../theme/brand";
import { getDeviceFleetRanking } from "../../api/compliance";

export default function FleetRankingLine({ agentId }) {
  const [ranking, setRanking] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoading(true);
    setRanking(null);
    getDeviceFleetRanking(agentId)
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) setRanking(res.ranking ?? null);
      })
      .catch(() => {
        // Silent — see component doc.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (loading) {
    return (
      <Typography variant="caption" sx={{ color: BRAND.gray, mt: 0.5, display: "block" }}>
        Loading fleet rank…
      </Typography>
    );
  }
  if (!ranking) return null;

  const { rank, scoredCount, unscoredCount, topPercentile } = ranking;
  const fleetSize = scoredCount + unscoredCount;

  // Unscored device — explain what's happening instead of showing
  // a numeric rank that doesn't apply.
  if (rank === null) {
    return (
      <Typography variant="caption" sx={{ color: BRAND.gray, mt: 0.5, display: "block" }}>
        Not scored · {scoredCount} of {fleetSize} devices scored in this fleet
      </Typography>
    );
  }

  // Lone-device fleets get a slightly different message. "Top 100%
  // of 1 device" reads weird.
  if (scoredCount === 1) {
    return (
      <Typography variant="caption" sx={{ color: BRAND.gray, mt: 0.5, display: "block" }}>
        Only scored device in this fleet
      </Typography>
    );
  }

  return (
    <Tooltip
      title={
        unscoredCount > 0
          ? `${unscoredCount} device${unscoredCount === 1 ? "" : "s"} have null score and are excluded from the ranking.`
          : "Ranked against every scored device in the fleet."
      }
      arrow
      placement="top"
    >
      <Typography
        variant="caption"
        sx={{ color: BRAND.gray, mt: 0.5, display: "block" }}
      >
        #{rank} of {scoredCount} scored · top {topPercentile}%
      </Typography>
    </Tooltip>
  );
}
