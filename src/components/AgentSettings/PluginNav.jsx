// src/components/AgentSettings/PluginNav.jsx
//
// Left-hand navigation of Agent Settings: one entry per plugin (from the
// catalog), the agent's own settings, the read-only plan view, the raw
// editor, and the two tools (Overrides, Policy rollout). Replaces the
// single column of seven stacked sections.
//
// A section whose plugin is not active is still listed, dimmed, with a
// tooltip: the operator should learn the plugin exists, and the plan
// view explains how to get it. Unsaved changes show as a count badge on
// the section they belong to.

import * as React from "react";
import { Box, Chip, List, ListItemButton, ListItemText, ListSubheader, Tooltip, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

function Entry({ item, active, disabled, badge, onSelect }) {
  const button = (
    <ListItemButton
      selected={active}
      disabled={disabled}
      onClick={() => onSelect(item.id)}
      aria-current={active ? "page" : undefined}
      sx={{
        borderRadius: 1.5,
        py: 0.6,
        px: 1.25,
        mb: 0.25,
        "&.Mui-selected": { bgcolor: BRAND.tealSoft, "&:hover": { bgcolor: BRAND.tealSoftStrong } },
        "&.Mui-disabled": { opacity: 0.55 },
      }}
    >
      <ListItemText
        primary={item.label}
        primaryTypographyProps={{
          sx: { fontSize: TEXT.base, fontWeight: active ? 700 : 500, color: active ? BRAND.tealText : BRAND.dark },
        }}
      />
      {badge ? (
        <Chip
          size="small"
          label={badge}
          aria-label={`${badge} unsaved change${badge === 1 ? "" : "s"} in ${item.label}`}
          sx={{ height: 18, fontSize: TEXT.xs, fontWeight: 800, bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warning }}
        />
      ) : null}
    </ListItemButton>
  );
  if (!disabled) return button;
  return (
    <Tooltip title="This plugin is not active in the loaded policy. See Plugins for what your plan includes." placement="right" arrow>
      <span>{button}</span>
    </Tooltip>
  );
}

export default function PluginNav({ sections, tools, active, onSelect, changes = {}, planLabel = null }) {
  return (
    <Box component="nav" aria-label="Agent settings sections" sx={{ minWidth: 0 }}>
      <List dense disablePadding>
        <ListSubheader disableSticky sx={{ lineHeight: "28px", px: 1.25, fontSize: TEXT.xs, letterSpacing: 1, fontWeight: 800, color: BRAND.gray, bgcolor: "transparent" }}>
          {planLabel ? `Plan · ${planLabel}` : "Configuration"}
        </ListSubheader>
        {sections.map((s) => (
          <Entry key={s.id} item={s} active={active === s.id} disabled={s.enabled === false} badge={changes[s.id] || 0} onSelect={onSelect} />
        ))}
        <ListSubheader disableSticky sx={{ mt: 1, lineHeight: "28px", px: 1.25, fontSize: TEXT.xs, letterSpacing: 1, fontWeight: 800, color: BRAND.gray, bgcolor: "transparent" }}>
          Tools
        </ListSubheader>
        {tools.map((t) => (
          <Entry key={t.id} item={t} active={active === t.id} badge={0} onSelect={onSelect} />
        ))}
      </List>
      <Typography sx={{ mt: 1, px: 1.25, fontSize: TEXT.xs, color: BRAND.gray }}>
        Security baselines, maintenance windows, crypto connectors and remote-access approval are configured inside their plugins.
      </Typography>
    </Box>
  );
}
