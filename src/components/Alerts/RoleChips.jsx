// src/components/Alerts/RoleChips.jsx
//
// Role picker shared by the rule delivery editor and the profile form
// (ADR-0025 F3). The roles come from the tenant's TenantRoleDef — custom
// ones included — instead of a hand-written OWNER/ADMIN/USER list, which is
// how `IT Support` could not be targeted.
//
// Each chip says how many active members with an email the role reaches
// today: a role nobody holds reads as "0", not as a working target.

import * as React from "react";
import { Chip, Stack, Tooltip } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { roleChoices, hasRole, toggleRole } from "./notifyHelpers";

export default function RoleChips({ options, selected, onChange, busy = false }) {
  const choices = roleChoices(options, selected);
  return (
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
      {choices.map((c) => {
        const on = hasRole(selected, c.name);
        const label = c.reachable == null ? c.name : `${c.name} · ${c.reachable}`;
        if (c.missing) {
          return (
            <Tooltip key={c.name} title="This role no longer exists in this tenant. Click to remove it." arrow>
              <Chip
                size="small"
                label={`${c.name} (removed)`}
                onDelete={busy ? undefined : () => onChange(toggleRole(selected, c.name))}
                sx={{ fontWeight: 700, fontSize: TEXT.xs, bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.errorText }}
              />
            </Tooltip>
          );
        }
        return (
          <Tooltip
            key={c.name}
            title={
              c.reachable == null
                ? ""
                : `${c.reachable} active member${c.reachable === 1 ? "" : "s"} with an email hold this role today`
            }
            arrow
          >
            <Chip
              size="small"
              label={label}
              aria-label={c.name}
              aria-pressed={on}
              onClick={busy ? undefined : () => onChange(toggleRole(selected, c.name))}
              sx={{
                cursor: busy ? "default" : "pointer",
                fontWeight: 700,
                fontSize: TEXT.xs,
                bgcolor: on ? BRAND.tealSoft : BRAND.surfaceMuted,
                color: on ? BRAND.tealText : BRAND.gray,
              }}
            />
          </Tooltip>
        );
      })}
    </Stack>
  );
}
