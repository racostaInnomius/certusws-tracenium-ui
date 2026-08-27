// src/components/patch-management/SecurityConfigPanel.jsx
//
// One surface for every misconfiguration in the fleet, with a filter across
// the top instead of four tabs across the page.
//
// The tabs it replaces — TLS, SMB, Shared folders, Other — were four slices of
// a single question, and the page could only answer a quarter of it at a time.
// Here the default shows everything and the filter narrows, so a finding is
// never one wrong guess away from invisible.
//
// FindingsPanel does the work, unchanged; this only decides what to ask it for.

import * as React from "react";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import FindingsPanel from "./FindingsPanel";
import { SECURITY_DOMAINS, DEFAULT_DOMAIN, domainParams } from "./securityDomains";

export default function SecurityConfigPanel({
  canManage,
  notify,
  domain,
  onDomainChange,
  refreshNonce,
}) {
  // Controlled when the page deep-links a slice (?pmTab=tls still resolves
  // here), uncontrolled otherwise.
  const [local, setLocal] = React.useState(DEFAULT_DOMAIN);
  const active = domain ?? local;
  const select = (key) => {
    setLocal(key);
    onDomainChange?.(key);
  };

  const params = domainParams(active);

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        flexWrap="wrap"
        sx={{ mb: 2 }}
        role="group"
        aria-label="Filter findings by area"
      >
        {SECURITY_DOMAINS.map((d) => {
          const selected = d.key === active;
          return (
            <Tooltip key={d.key} title={d.hint} arrow placement="top">
              <Chip
                label={d.label}
                onClick={() => select(d.key)}
                aria-pressed={selected}
                sx={{
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: TEXT.sm,
                  borderRadius: 1,
                  border: `1px solid ${selected ? BRAND.teal : BRAND.border}`,
                  bgcolor: selected ? BRAND.tealSoft : BRAND.surface,
                  color: selected ? BRAND.tealText : BRAND.dark,
                  "&:hover": { bgcolor: selected ? BRAND.tealSoft : BRAND.surfaceMuted },
                }}
              />
            </Tooltip>
          );
        })}
      </Stack>

      {active === DEFAULT_DOMAIN ? (
        <Typography sx={{ color: BRAND.gray, fontSize: TEXT.xs, mb: 1.5 }}>
          Showing every misconfiguration found. Operating-system updates have
          their own tab.
        </Typography>
      ) : null}

      <FindingsPanel
        // Remount on domain change so the grid never shows one slice's rows
        // under another slice's heading while the fetch is in flight.
        key={active}
        tabKey={active}
        category={params.category}
        categoriesNotIn={params.categoriesNotIn}
        checkIdContains={params.checkIdContains}
        canManage={canManage}
        notify={notify}
        refreshNonce={refreshNonce}
      />
    </Box>
  );
}
