// src/components/Overview/LatestAlerts.jsx
//
// Compact "latest alerts" strip for the Overview. Shows up to 5 recent
// events from whatever rules the tenant has enabled, each row clickable
// into the Alerts page for the full drill-down.
//
// This is the second surface (after the Topbar bell) where the alerts
// module is visible from the dashboard. Keeping it tight — 5 rows, no
// filter controls, one "View all" footer — so it functions as a quick
// "anything urgent?" peek without competing with the full Alerts page.
//
// Zero-state branches deliberately different copy for "no rules
// enabled" vs "rules enabled but quiet" — the first needs an action
// (go pick rules), the second is a positive signal (nothing to do).

import { Paper, Box, Stack, Typography, ButtonBase, Chip, Skeleton } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import { BRAND, ICON, ROLE, TEXT } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";

// Matches the severity palette used inside the Alerts page so the two
// surfaces agree visually. Kept inline (not imported) so this component
// can drop into the Overview without pulling the larger Alerts page chunk.
// Canonical severity scale (theme/severity.js) — matches the Alerts page.
const SEVERITY_STYLE = {
  critical: severityMeta("critical"),
  high:     severityMeta("high"),
  medium:   severityMeta("medium"),
  low:      severityMeta("low")
};

const SOURCE_LABEL = {
  security_event:     "Security event",
  compliance_finding: "Compliance finding",
  compliance_score:   "Compliance score",
  device_offline:     "Device offline",
  cert_expiry:        "Cert expiry",
  job_failure:        "Job failure",
  device_enrollment:  "Device enrolled"
};

function formatRelativeTime(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function getValue(result) {
  if (!result || result.status !== "fulfilled") return null;
  return result.value ?? null;
}

// UUID v4-ish matcher. Server-generated summaries embed the raw
// device_id as plain text ("Device <uuid> enrolled", "Agent <uuid>
// drifted off-profile"). Swapping it for the hostname makes the strip
// scannable without forcing the user to memorize UUIDs. We keep the
// match case-insensitive and anchor to word boundaries so we never
// accidentally clobber a serial or fingerprint fragment.
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function replaceDeviceIdWithHostname(summary, deviceIndex) {
  if (!summary) return "";
  if (!deviceIndex || typeof deviceIndex.get !== "function") return String(summary);
  return String(summary).replace(UUID_RE, (uuid) => {
    const host = deviceIndex.get(uuid) || deviceIndex.get(uuid.toLowerCase());
    return host || uuid;
  });
}

export default function LatestAlerts({ result, loading, onNavigate, deviceIndex }) {
  const value = getValue(result);
  // We consider the strip empty both when the endpoint returned zero
  // items AND when the tenant simply hasn't enabled any rules (in which
  // case total is 0 too). We can't disambiguate from the response alone,
  // so the copy is neutral: "No alerts yet · open Manage rules".
  const items = Array.isArray(value?.items) ? value.items.slice(0, 5) : [];
  const totalInWindow = Number(value?.total ?? items.length);

  const navigate = (query) => onNavigate?.("alerts", query);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 4.5,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        // Min-height (not height:100%) because the parent stack now
        // sizes to content — a forced 100% with no anchor would
        // collapse. The min keeps the empty-state panel from looking
        // cramped when there are 0 alerts.
        minHeight: 200,
        display: "flex",
        flexDirection: "column"
      }}
    >
      <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography
          variant="subtitle2"
          sx={{ color: BRAND.dark, fontWeight: 700, flex: 1 }}
        >
          Latest alerts
          {totalInWindow > items.length ? (
            <Typography
              component="span"
              variant="caption"
              sx={{ color: BRAND.gray, ml: 1, fontWeight: 500 }}
            >
              (showing {items.length} of {totalInWindow})
            </Typography>
          ) : null}
        </Typography>
        <ButtonBase
          onClick={() => navigate()}
          sx={{
            fontSize: TEXT.sm,
            color: BRAND.teal,
            fontWeight: 600,
            "&:hover": { textDecoration: "underline" }
          }}
        >
          View all →
        </ButtonBase>
      </Stack>

      {loading ? (
        <Stack spacing={1}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={44} />
          ))}
        </Stack>
      ) : items.length === 0 ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: 1,
            color: BRAND.gray
          }}
        >
          {/* The icon intentionally flips signal depending on whether
              there's ANY rule active — but from this payload alone we
              can't tell. We default to the neutral "all quiet" read. */}
          <CheckCircleOutlineOutlinedIcon sx={{ color: ROLE.positive, fontSize: ICON["2xl"] }} />
          <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600 }}>
            No alerts in the last 7 days
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray, maxWidth: 260, textAlign: 'left' }}>
            Either everything is quiet or no rules are enabled. Open
            Alerts → Manage rules to configure what you want to see.
          </Typography>
          <ButtonBase
            onClick={() => navigate()}
            sx={{
              mt: 0.5,
              fontSize: TEXT.sm,
              color: BRAND.teal,
              fontWeight: 600
            }}
          >
            Open Alerts →
          </ButtonBase>
        </Box>
      ) : (
        <Stack spacing={1} sx={{ flex: 1 }}>
          {items.map((event, idx) => {
            const style = SEVERITY_STYLE[event.severity] ?? SEVERITY_STYLE.low;
            const resolvedSummary = replaceDeviceIdWithHostname(event.summary, deviceIndex);
            const hostLabel = event.deviceId
              ? (deviceIndex?.get(event.deviceId)
                 || deviceIndex?.get(String(event.deviceId).toLowerCase()))
              : null;
            return (
              <ButtonBase
                key={`${event.source}:${event.sourceEventId}:${idx}`}
                onClick={() => navigate()}
                sx={{
                  width: "100%",
                  textAlign: "left",
                  p: 1.25,
                  borderRadius: 1.5,
                  border: `1px solid ${BRAND.border}`,
                  transition: "background-color 120ms ease, border-color 120ms ease",
                  "&:hover": {
                    backgroundColor: BRAND.surfaceMuted,
                    borderColor: BRAND.borderStrong
                  }
                }}
              >
                <Stack
                  direction="row"
                  spacing={1.25}
                  alignItems="center"
                  sx={{ width: "100%" }}
                >
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1,
                      bgcolor: style.bg,
                      color: style.fg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}
                  >
                    <NotificationsNoneOutlinedIcon fontSize="small" />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        color: BRAND.dark,
                        fontWeight: 600,
                        lineHeight: 1.2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                      title={resolvedSummary}
                    >
                      {resolvedSummary}
                    </Typography>
                    <Stack direction="row" spacing={0.75} sx={{ mt: 0.25, alignItems: "center", flexWrap: "wrap" }}>
                      <Chip
                        label={style.label}
                        size="small"
                        sx={{
                          height: 18,
                          bgcolor: style.bg,
                          color: style.fg,
                          fontWeight: 700,
                          fontSize: TEXT.xs,
                          border: `1px solid ${style.fg}33`
                        }}
                      />
                      {hostLabel ? (
                        // Small host chip surfaces the resolved hostname
                        // even when the server-formatted summary doesn't
                        // mention the device by name. Gives the operator
                        // the "who is this about" answer without having
                        // to click through.
                        <Chip
                          label={hostLabel}
                          size="small"
                          variant="outlined"
                          sx={{
                            height: 18,
                            fontSize: TEXT.xs,
                            fontWeight: 600,
                            color: BRAND.tealText,
                            borderColor: `${BRAND.teal}66`,
                            bgcolor: BRAND.tealSoft,
                            maxWidth: 160,
                            "& .MuiChip-label": {
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }
                          }}
                        />
                      ) : null}
                      <Typography variant="caption" sx={{ color: BRAND.gray }}>
                        {SOURCE_LABEL[event.source] || event.source}
                        {" · "}
                        {formatRelativeTime(event.occurredAt)}
                      </Typography>
                    </Stack>
                  </Box>
                  <ChevronRightIcon fontSize="small" sx={{ color: BRAND.gray, flexShrink: 0 }} />
                </Stack>
              </ButtonBase>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}
