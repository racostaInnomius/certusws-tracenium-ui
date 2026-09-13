// src/components/Overview/OverviewBlock.jsx
//
// The frame around one Overview block, plus the single line that says which
// blocks the plan does not include.
//
// The header names the block and the plugins behind it by their menu names,
// so an operator can tell why a card is here. The tier chip is on every
// block but the first: "Starter" on the block every plan has would read as a
// limitation of the page rather than a fact about it.

import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { PLUGIN_TITLES, TIER_LABELS } from "./overviewPlan";

export function OverviewBlock({ block, children }) {
  const plugins = block.plugins
    .filter((key) => block.has(key))
    .map((key) => PLUGIN_TITLES[key] || key.toUpperCase());

  return (
    <Box component="section" aria-labelledby={`overview-block-${block.id}`} sx={{ mb: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 0.5 }}>
        <Typography
          id={`overview-block-${block.id}`}
          component="h2"
          sx={{ fontSize: TEXT.lg, fontWeight: 700, color: BRAND.dark }}
        >
          {block.title}
        </Typography>
        {block.always ? null : (
          <Chip
            size="small"
            label={TIER_LABELS[block.tier]}
            sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.tealSoft, color: BRAND.tealText }}
          />
        )}
        {plugins.length ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>{plugins.join(" · ")}</Typography>
        ) : null}
      </Stack>
      <Stack spacing={2}>{children}</Stack>
    </Box>
  );
}

/**
 * One line, not a block of padlocks. It states which blocks are outside the
 * plan, the tier that brings each, and its plugins — nothing else. No
 * invented benefits: the plugins are the difference between tiers, so the
 * plugins are what it names.
 *
 * "View plans" only for OWNER, the one role Billing lets in. Anyone else
 * would click into a page that turns them away.
 */
export function PlanScopeNotice({ locked, canManageBilling = false, onNavigate }) {
  if (!locked?.length) return null;

  const parts = locked.map(
    (b) =>
      `${b.title} (${b.plugins.map((k) => PLUGIN_TITLES[k] || k).join(", ")}) comes with ${TIER_LABELS[b.tier]}`
  );

  return (
    <Box
      role="note"
      aria-label="Not included in your plan"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        flexWrap: "wrap",
        px: 2,
        py: 1.25,
        borderRadius: 2,
        border: `1px dashed ${BRAND.border}`,
        bgcolor: BRAND.surface,
      }}
    >
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, flex: 1, minWidth: 240 }}>
        Not in your current plan: {parts.join("; ")}.
        {canManageBilling ? "" : " Your tenant owner can change the plan."}
      </Typography>
      {canManageBilling ? (
        <Button size="small" variant="outlined" onClick={() => onNavigate?.("billing")}>
          View plans
        </Button>
      ) : null}
    </Box>
  );
}
