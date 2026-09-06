// src/components/AgentSettings/PluginsView.jsx
//
// The read-only "Plugins" section. Activation is NOT a toggle: it follows
// the subscription (ADR-0010) — or "demo" with Enterprise open — and
// flipping it by hand breaks the subscription model. What this view does
// is tell the operator, per plugin: is it active in this policy, is it in
// the plan, what plan it needs, where its settings live, and how many
// devices actually run it (the number the old "Plugin coverage" card
// showed with no context).

import * as React from "react";
import { Box, Button, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { pluginRows } from "./plugins";

function tierLabel(tier) {
  if (!tier) return "—";
  const t = String(tier);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const STATUS_CHIP = {
  active: { label: "Active", bg: ROLE.positiveSoft, fg: ROLE.positive },
  included_inactive: { label: "Included · not active", bg: BRAND.darkSoft, fg: BRAND.dark },
  not_in_plan: { label: "Not in plan", bg: BRAND.surfaceMuted, fg: BRAND.gray },
  active_not_in_plan: { label: "Active · not in plan", bg: ROLE.cautionSoft, fg: ROLE.caution },
};

export default function PluginsView({ catalog, form, entitled, coverage, onOpenSection, onNavigate, planLabel }) {
  const rows = React.useMemo(() => pluginRows({ catalog, form, entitled, coverage }), [catalog, form, entitled, coverage]);
  return (
    <Box>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1.5 }}>
        Activation follows your subscription{planLabel ? ` (${planLabel})` : ""}. To change what is included, go to{" "}
        <Button size="small" onClick={() => onNavigate?.("billing")} sx={{ textTransform: "none", fontWeight: 700, p: 0, minWidth: 0, verticalAlign: "baseline" }}>
          Billing
        </Button>
        . The settings of each active plugin are edited in its own section.
      </Typography>
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small" aria-label="Plugins in this plan">
          <TableHead>
            <TableRow>
              <TableCell>Plugin</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Minimum plan</TableCell>
              <TableCell>Configuration</TableCell>
              <TableCell align="right">Coverage</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const chip = STATUS_CHIP[r.status];
              return (
                <TableRow key={r.key} hover>
                  <TableCell>
                    <Typography sx={{ fontSize: TEXT.base, fontWeight: 700, color: BRAND.dark }}>
                      {r.title} <Typography component="span" sx={{ fontSize: TEXT.xs, color: BRAND.gray, ml: 0.5 }}>{r.label}</Typography>
                    </Typography>
                    {r.description ? <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{r.description}</Typography> : null}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={r.required ? "Active · required" : chip.label} sx={{ bgcolor: chip.bg, color: chip.fg, fontWeight: 700 }} />
                  </TableCell>
                  <TableCell>{tierLabel(r.tier)}</TableCell>
                  <TableCell>
                    {r.hasSection && r.status !== "not_in_plan" ? (
                      <Button size="small" onClick={() => onOpenSection?.(r.key)} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText, p: 0, minWidth: 0 }}>
                        {r.title} →
                      </Button>
                    ) : (
                      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>—</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {r.coverageCount === null ? "—" : `${r.coverageCount} / ${r.coverageTotal}`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 1 }}>
        Coverage = devices whose last inventory advertises the plugin. A device on an included plugin that does not advertise it is worth a look.
      </Typography>
    </Box>
  );
}
