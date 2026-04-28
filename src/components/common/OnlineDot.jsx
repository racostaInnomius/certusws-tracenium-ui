// src/components/common/OnlineDot.jsx
//
// Shared 10×10 traffic-light dot used to surface "is this device
// reachable right now" inline in tables. Originally inline in
// HostsTable.jsx (Asset Management) — extracted here so the Policies
// page Rollout-status grid can use the same visual language.
//
// Visual contract:
//   * Online: filled green dot with a soft halo. Reads as "alive" at
//     a glance even on dense rows.
//   * Offline: hollow gray ring. Same footprint, no halo. Distinct
//     from "no data" because the operator can still hover for the
//     tooltip.
//
// The only knob is `online` (boolean). Optional `title` overrides the
// default tooltip — useful when context is richer (e.g. "online · last
// seen 2m ago" vs the bare "Online — active session" default).

import { Box, Tooltip } from "@mui/material";
import { BRAND, ROLE } from "../../theme/brand";

export default function OnlineDot({ online, title }) {
  const fallbackTitle = online ? "Online — active session" : "Offline";
  return (
    <Tooltip title={title || fallbackTitle} arrow>
      <Box
        aria-label={online ? "Online" : "Offline"}
        sx={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          bgcolor: online ? ROLE.positive : "transparent",
          border: `1.5px solid ${online ? ROLE.positive : BRAND.gray}`,
          boxShadow: online ? `0 0 0 3px ${ROLE.positiveSoft}` : "none",
          display: "inline-block",
        }}
      />
    </Tooltip>
  );
}
