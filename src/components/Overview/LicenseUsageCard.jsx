// src/components/Overview/LicenseUsageCard.jsx
//
// "How many of the licenses I pay for am I actually using?" — ADR-0005 D7.
//
// Deliberately a full-width slim bar rather than a seventh Hero KPI. Two
// reasons: the KPI row is a 6-across grid that a seventh card breaks, and
// this is the one number on the page that can eventually stop enrollment
// working. It earns a line of its own.
//
// The card is passive by design. The decision recorded in ADR-0005 is
// that we do NOT interrupt a tenant who bought 50 and uses 49 — no nag,
// no upsell. It only raises its voice once the fleet is at or past the
// cap, which is the point where money and behaviour actually change.
//
// `used` here is the FLEET count from the control DB (see
// modules/fleet/fleet-count.ts server-side), never the number of devices
// that happen to have reported inventory.

import { Box, Paper, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import { BRAND, ROLE } from "../../theme/brand";

// Opaque equivalent of BRAND.darkSoft (rgba(59,64,77,0.08)) composited over
// a white card — used for the gradient bar's track/mask, which must not be
// translucent (see the comment at its usage site).
const TRACK_COLOR = "#eff0f1";

// Mirrors modules/licensing/license-thresholds.ts on the backend. The
// backend sends `status`, so this is only a fallback for an older API —
// but the card must never render a *different* verdict than the one the
// enrollment gate enforces.
function severityOf(status) {
  switch (status) {
    case "GRACE_EXHAUSTED":
      return { accent: ROLE.critical, tint: ROLE.criticalSoft };
    case "OVER_LIMIT":
      return { accent: BRAND.alert.warning, tint: BRAND.alert.warningSoft };
    case "APPROACHING_LIMIT":
      return { accent: ROLE.caution, tint: ROLE.cautionSoft };
    default:
      return { accent: BRAND.teal, tint: BRAND.tealSoft };
  }
}

function captionFor({ status, used, maxDevices, upperLimit }) {
  const grace = Math.max((upperLimit ?? maxDevices) - maxDevices, 0);
  switch (status) {
    case "GRACE_EXHAUSTED":
      return `Limit reached — the ${grace}-device grace margin is used up. New devices cannot enroll until you add licenses or remove devices.`;
    case "OVER_LIMIT":
      return `${used - maxDevices} over your plan. Enrollment continues up to ${upperLimit}; the overage is reconciled at your next subscription anniversary.`;
    case "APPROACHING_LIMIT":
      return `${maxDevices - used} license${maxDevices - used === 1 ? "" : "s"} left before you reach your plan limit.`;
    case "NOT_CONFIGURED":
      return "No licensed device count is recorded for this tenant. Set the device limit in Settings.";
    default:
      return `${maxDevices - used} of ${maxDevices} licenses available.`;
  }
}

export default function LicenseUsageCard({ result, loading, onNavigate }) {
  const summary = result?.status === "fulfilled" ? result.value : null;
  const license = summary?.license ?? null;

  if (loading) {
    return (
      <Paper elevation={0} sx={cardSx(BRAND.border)}>
        <Skeleton variant="text" width={220} height={32} />
      </Paper>
    );
  }

  // Absent (older backend) or exempt (MSP container / vendor root — no
  // fleet of its own, so no license rule). Rendering an empty or zeroed
  // bar for those would be worse than rendering nothing.
  if (!license || license.exempt) return null;

  const { used = 0, maxDevices, upperLimit, status } = license;
  const { accent, tint } = severityOf(status);

  if (maxDevices === null || maxDevices === undefined) {
    return (
      <Paper elevation={0} sx={cardSx(BRAND.border)}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Badge accent={accent} tint={tint} />
          <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600 }}>
            Licenses
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.tealText }}>
            {captionFor({ status: "NOT_CONFIGURED", used, maxDevices: 0, upperLimit: 0 })}
          </Typography>
        </Stack>
      </Paper>
    );
  }

  // The bar is scaled to the grace ceiling, not the plan limit, so an
  // over-limit tenant can see how much runway is left instead of just a
  // pegged 100% bar. The plan limit is drawn as a tick on top.
  const ceiling = Math.max(upperLimit || maxDevices, 1);
  const barValue = Math.min((used / ceiling) * 100, 100);
  const planTickPct = Math.min((maxDevices / ceiling) * 100, 100);

  const interactive = typeof onNavigate === "function";

  return (
    <Paper
      elevation={0}
      component={interactive ? "button" : "div"}
      type={interactive ? "button" : undefined}
      onClick={interactive ? () => onNavigate("tokens") : undefined}
      sx={{
        ...cardSx(status === "NORMAL" ? BRAND.border : accent),
        width: "100%",
        font: "inherit",
        textAlign: "left",
        cursor: interactive ? "pointer" : "default",
        "&:hover": interactive ? { borderColor: accent } : undefined,
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ xs: "flex-start", sm: "center" }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
          <Badge accent={accent} tint={tint} />
          <Box>
            <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600, lineHeight: 1.2 }}>
              Licenses
            </Typography>
            <Typography variant="h5" sx={{ color: BRAND.dark, fontWeight: 700, lineHeight: 1.2 }}>
              {used}
              <Typography component="span" variant="h6" sx={{ color: BRAND.tealText, fontWeight: 500 }}>
                {` / ${maxDevices}`}
              </Typography>
            </Typography>
          </Box>
        </Stack>

        <Box sx={{ flex: 1, minWidth: 160, width: "100%" }}>
          <Tooltip
            arrow
            title={`${used} devices in the fleet · plan limit ${maxDevices} · enrollment stops at ${upperLimit}`}
          >
            <Box sx={{ position: "relative" }}>
              <Box
                sx={{
                  position: "relative",
                  height: 8,
                  borderRadius: 4,
                  overflow: "hidden",
                  backgroundColor: TRACK_COLOR,
                }}
              >
                {/*
                  Fixed to the track's full width (0 → grace ceiling), not
                  the filled sub-range, so the color at any given point is
                  the same regardless of how much of the bar is filled —
                  green while comfortably under the plan, ambering by half
                  the plan limit, into the "high" orange right at the plan
                  limit (the same tick drawn below), and red once inside
                  the grace margin. Same tokens severityOf() already uses
                  for the badge/border, just spread across the scale
                  instead of picked as one flat color.
                */}
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `linear-gradient(to right, ${ROLE.positive} 0%, ${ROLE.caution} ${Math.max(planTickPct / 2, 1)}%, ${BRAND.alert.high} ${planTickPct}%, ${ROLE.critical} 100%)`,
                  }}
                />
                {/* Masks the gradient beyond the current usage — only
                    reveals it up to `barValue`. Must be OPAQUE: unlike
                    every other track fill in this codebase, this one
                    sits on top of the gradient layer, not the plain card
                    background, so a translucent brand token (e.g.
                    BRAND.darkSoft) barely dims what's underneath instead
                    of hiding it — the whole bar read as "fully colored"
                    no matter how little was actually used. */}
                <Box
                  sx={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    right: 0,
                    width: `${100 - barValue}%`,
                    backgroundColor: TRACK_COLOR,
                  }}
                />
              </Box>
              {/* Where the paid plan ends and the grace margin begins. */}
              <Box
                sx={{
                  position: "absolute",
                  left: `${planTickPct}%`,
                  top: -2,
                  height: 12,
                  width: 2,
                  backgroundColor: BRAND.dark,
                  opacity: 0.45,
                }}
              />
            </Box>
          </Tooltip>
          <Typography variant="caption" sx={{ color: BRAND.tealText, display: "block", mt: 0.75 }}>
            {captionFor({ status, used, maxDevices, upperLimit })}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

function Badge({ accent, tint }) {
  return (
    <Box
      sx={{
        width: 40,
        height: 40,
        borderRadius: 1.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tint,
        color: accent,
        flexShrink: 0,
      }}
    >
      <VerifiedUserOutlinedIcon fontSize="small" />
    </Box>
  );
}

function cardSx(borderColor) {
  return {
    p: 2,
    borderRadius: 3,
    border: `1px solid ${borderColor}`,
    boxShadow: BRAND.shadow,
    backgroundColor: BRAND.surface,
    backgroundImage: "none",
  };
}
