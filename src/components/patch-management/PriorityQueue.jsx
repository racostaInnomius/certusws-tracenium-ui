// src/components/patch-management/PriorityQueue.jsx
//
// "Where do I start?" — the first thing on the page, in place of five counters
// that answered a question nobody asked.
//
// Each row is one thing to do, why it is that high, how far it reaches, and a
// way in. The counters stay, but underneath and smaller: they are context for
// the queue, not the headline.

import * as React from "react";
import { Box, Chip, Stack, Typography, Button, CircularProgress, Tooltip } from "@mui/material";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import { BRAND, TEXT, ICON, ROLE } from "../../theme/brand";
import { buildWorklist } from "./buildWorklist";

const SEVERITY_TONE = {
  critical: { fg: ROLE.critical, bg: ROLE.criticalSoft },
  high: { fg: BRAND.alert.high, bg: "rgba(199,121,43,0.14)" },
  medium: { fg: ROLE.caution, bg: ROLE.cautionSoft },
  low: { fg: BRAND.tealText, bg: BRAND.tealSoft },
};

function toneFor(severity) {
  return SEVERITY_TONE[String(severity ?? "").toLowerCase()] ?? {
    fg: BRAND.gray,
    bg: BRAND.surfaceMuted,
  };
}

export default function PriorityQueue({
  exposures,
  findings,
  loading = false,
  limit = 6,
  onOpen,
}) {
  const items = React.useMemo(
    () => buildWorklist(exposures, findings, limit),
    [exposures, findings, limit]
  );

  if (loading) {
    return (
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 2 }}>
        <CircularProgress size={16} sx={{ color: BRAND.teal }} />
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
          Working out what needs attention first…
        </Typography>
      </Stack>
    );
  }

  if (items.length === 0) {
    return (
      <Box sx={{ py: 2 }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
          Nothing is waiting on you.
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 0.5 }}>
          No exposed vulnerabilities and no open findings across the fleet.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1.5 }}>
        <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
          Start here
        </Typography>
        <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
          Ordered by exploitation, then severity, then how far it reaches
        </Typography>
      </Stack>

      <Box
        component="ol"
        sx={{
          listStyle: "none",
          m: 0,
          p: 0,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: BRAND.surface,
        }}
      >
        {items.map((item, i) => {
          const tone = toneFor(item.severity);
          return (
            <Box
              key={`${item.kind}:${item.id}`}
              component="li"
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr auto" },
                gap: 1.5,
                alignItems: "center",
                px: 2,
                py: 1.5,
                borderTop: i === 0 ? "none" : `1px solid ${BRAND.border}`,
                // The severity reads before the words do.
                borderLeft: `3px solid ${tone.fg}`,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography
                    sx={{
                      fontWeight: 700,
                      color: BRAND.dark,
                      fontSize: TEXT.md,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: { xs: "100%", md: 520 },
                    }}
                    title={item.title}
                  >
                    {item.title}
                  </Typography>
                  {item.fixable ? (
                    <Tooltip title="The agent can apply this fix" arrow>
                      <Chip
                        size="small"
                        icon={<BoltOutlinedIcon sx={{ fontSize: ICON.sm }} />}
                        label="One-click fix"
                        sx={{
                          height: 20,
                          fontSize: TEXT.xs,
                          fontWeight: 700,
                          bgcolor: BRAND.tealSoft,
                          color: BRAND.tealText,
                        }}
                      />
                    </Tooltip>
                  ) : null}
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                  <Chip
                    size="small"
                    label={item.reason}
                    sx={{
                      height: 20,
                      fontSize: TEXT.xs,
                      fontWeight: 700,
                      bgcolor: tone.bg,
                      color: tone.fg,
                    }}
                  />
                  <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
                    {item.kind === "cve" ? "Vulnerability" : "Misconfiguration"}
                    {item.devicesAffected > 0
                      ? ` · ${item.devicesAffected} device${item.devicesAffected === 1 ? "" : "s"}`
                      : ""}
                  </Typography>
                </Stack>
              </Box>

              <Button
                size="small"
                variant="outlined"
                onClick={() => onOpen?.(item)}
                sx={{ textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}
              >
                {item.kind === "cve" ? "See exposure" : "See finding"}
              </Button>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
