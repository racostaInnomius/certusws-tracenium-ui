import * as React from "react";
import { Box, IconButton, Typography, Badge, Tooltip } from "@mui/material";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import { getAlertsUnreadCount } from "../api/alerts";
import { performLogout } from "../auth/logout";
import { useMsp } from "../msp/MspContext";

import { BRAND } from "../theme/brand";

export const TOPBAR_HEIGHT = 56;

// How often the bell polls for fresh unread count. 60s matches the
// product decision — fast enough that operators see new alerts within
// ~a minute, slow enough that we're not hammering the backend every
// couple seconds with cheap-but-not-free queries.
const UNREAD_POLL_MS = 60_000;

/**
 * Push a ?page=<key> into the URL and fire popstate so AppShell picks
 * it up. Same pattern the pages use internally (see SecurityCompliance
 * navigateTo) so routing stays consistent whether it's the bell, a
 * deep-link, or an in-page nav.
 */
function navigateToPage(page) {
  const params = new URLSearchParams(window.location.search);
  params.set("page", page);
  // Collapse accidental leading `//` in the pathname — the auth
  // redirect sometimes lands users on `http://host//?page=...` and
  // a URL starting with `//` is treated by pushState as
  // protocol-relative (same-origin check rejects it silently).
  const pathname = window.location.pathname.replace(/^\/+/, "/") || "/";
  window.history.pushState({}, "", `${pathname}?${params.toString()}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function Topbar({ onMenuClick }) {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

  const [unreadCount, setUnreadCount] = React.useState(0);

  // Alerts are tenant-scoped, but the Topbar also renders in portfolio mode
  // (vendor / MSP operator with no client selected), where there is no active
  // tenant to count alerts for. Polling there asks the backend for a tenant
  // that isn't set — noise at best. Mirrors AppShell's `inPortfolioMode`.
  // `mspLoading` matters as much as the mode itself: on mount the portfolio
  // hasn't resolved yet, so hasPortfolio is still false and we'd poll before
  // knowing whether this user has a tenant at all — which for a vendor is a
  // tenant-less request the SPA reads as a dead session.
  const { hasPortfolio, activeTenant, loading: mspLoading } = useMsp();
  const skipPolling = mspLoading || (hasPortfolio && !activeTenant);

  // Poll /alerts/unread-count. Uses setTimeout chained re-arm (not
  // setInterval) so when a request runs long the next tick schedules
  // relative to actual completion, not wall-clock — avoids request
  // pile-up if the backend is slow. Visibility-aware: pauses when the
  // tab is hidden so background tabs don't poll forever.
  React.useEffect(() => {
    let cancelled = false;
    let timer = null;

    // No tenant context → nothing to count. Re-runs once the portfolio
    // resolves (or a client is selected) and starts polling then.
    if (skipPolling) {
      setUnreadCount(0);
      return () => {
        cancelled = true;
      };
    }

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await getAlertsUnreadCount();
        if (!cancelled) {
          setUnreadCount(Number(res?.count ?? 0));
        }
      } catch {
        // Silent: an auth blip or a backend hiccup shouldn't spam
        // console on every poll. Next tick will retry.
      } finally {
        if (!cancelled && !document.hidden) {
          timer = setTimeout(tick, UNREAD_POLL_MS);
        }
      }
    };

    const onVisibilityChange = () => {
      if (!document.hidden && !timer) {
        tick();
      }
      if (document.hidden && timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    tick();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [skipPolling]);

  return (
    <Box
      sx={{
        width: "100%",
        height: TOPBAR_HEIGHT,
        px: { xs: 1.5, sm: 2, md: 3 },
        gap: 1,
        background: `linear-gradient(90deg, ${BRAND.dark} 0%, ${BRAND.teal} 100%)`,
        borderBottom: `3px solid ${BRAND.accentBrightLine}`,
        boxShadow: `0 1px 0 ${BRAND.accentBrightSoft}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        color: "#ffffff",
      }}
    >
      {/* Left cluster: hamburger (mobile only) + brand + subtitle.
          flex:1 + minWidth:0 lets the title ellipsize instead of pushing
          the right cluster (date + notifications) out of view. */}
      <Box sx={{ display: "flex", alignItems: "center", minWidth: 0, flex: 1 }}>
        <IconButton
          onClick={onMenuClick}
          aria-label="Open navigation"
          size="small"
          sx={{
            color: "#ffffff",
            mr: 0.5,
            flexShrink: 0,
            display: { xs: "inline-flex", md: "none" },
            "&:hover": { bgcolor: "rgba(90,159,159,0.28)" },
          }}
        >
          <MenuOutlinedIcon />
        </IconButton>

        <Typography
          sx={{
            fontSize: { xs: 12, sm: 13 },
            fontWeight: 400,
            letterSpacing: 0.3,
            color: "#ffffff",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
            flex: 1,
          }}
        >
          <Box
            component="span"
            sx={{
              fontFamily: 'Calibri, Carlito, "Segoe UI", sans-serif',
              fontWeight: 900,
              letterSpacing: 0.4,
              fontSize: { xs: 16, sm: 18 },
            }}
          >
            Tracenium
          </Box>
          {/* Subtitle with separator hidden on xs to prevent overflow on phones. */}
          <Box
            component="span"
            sx={{ display: { xs: "none", sm: "inline" } }}
          >
            <Box
              component="span"
              sx={{ color: BRAND.accentBright, fontWeight: 900, mx: 1 }}
            >
              |
            </Box>
            Endpoint Intelligence{" "}
            <Box
              component="span"
              sx={{ color: BRAND.accentBright, fontWeight: 900, px: 0.25 }}
            >
              &
            </Box>{" "}
            Compliance Platform
          </Box>
        </Typography>
      </Box>

      {/* Right cluster: flexShrink:0 guarantees the notification icon
          is always visible; the date hides on small widths. */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexShrink: 0 }}>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 500,
            color: "#ffffff",
            whiteSpace: "nowrap",
            display: { xs: "none", md: "block" },
          }}
        >
          {today}
        </Typography>
        <Tooltip title={unreadCount > 0 ? `${unreadCount} unread alert${unreadCount === 1 ? "" : "s"}` : "No new alerts"}>
          <IconButton
            size="small"
            aria-label="Alerts"
            onClick={() => navigateToPage("alerts")}
            sx={{
              color: "#ffffff",
              flexShrink: 0,
              "&:hover": { bgcolor: "rgba(90,159,159,0.28)" },
            }}
          >
            <Badge
              color="error"
              // Badge switches between a numeric count (when we have a
              // live number) and a dot (fallback when count isn't
              // available yet). Invisible when count=0 so the bell
              // looks clean in steady state.
              badgeContent={unreadCount > 99 ? "99+" : unreadCount || null}
              invisible={unreadCount <= 0}
              overlap="circular"
            >
              <NotificationsNoneOutlinedIcon fontSize="small" />
            </Badge>
          </IconButton>
        </Tooltip>

        {/* Sign out. Lives in the Topbar so it's reachable in EVERY mode —
            including the MSP portfolio, where the Sidebar (its only other
            logout) is hidden. */}
        <Tooltip title="Sign out">
          <IconButton
            size="small"
            aria-label="Sign out"
            onClick={performLogout}
            sx={{
              color: "#ffffff",
              flexShrink: 0,
              "&:hover": { bgcolor: "rgba(90,159,159,0.28)" },
            }}
          >
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
