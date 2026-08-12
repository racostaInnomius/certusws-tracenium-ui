// src/components/Compliance/FindingCard.jsx
//
// A single compliance-finding card: severity/framework/status chips, an
// expandable evidence body, and the acknowledge / remediation-status / history
// actions. Extracted from the SecurityCompliance god-component. Pure props +
// local menu state, no data fetching — the parent owns the mutations and
// passes them as callbacks.

import * as React from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { BRAND, ROLE } from "../../theme/brand";
import {
  SeverityChip,
  FrameworkChip,
  StatusChip,
  RemediationStatusChip,
  REMEDIATION_STATUS_META,
} from "./complianceChips";
import {
  REMEDIATION_TRANSITIONS,
  ACK_EXPIRY_PRESETS,
  ackUntilIso,
  shortRelativeTime,
  shortDate,
} from "./complianceHelpers";

export default function FindingCard({
  finding,
  onAck,
  onRevoke,
  onChangeStatus,
  onShowHistory,
  pendingAction,
  // Sprint 6 — bulk selection. selected: boolean indicates whether
  // this card is checked; onToggleSelected: fn or null. When null,
  // the checkbox is hidden (used for findings without a stable id
  // — shouldn't happen in production, defensive only).
  selected = false,
  onToggleSelected = null
}) {
  const borderColor = finding.status === "fail" ? `${ROLE.critical}66` : BRAND.border;
  const [open, setOpen] = React.useState(false);

  // Anchor for the remediation-status menu. Local state because the
  // anchor element belongs to a button rendered inside this card.
  const [statusMenuAnchor, setStatusMenuAnchor] = React.useState(null);
  const statusMenuOpen = Boolean(statusMenuAnchor);

  // Acknowledge-with-expiry menu (expiring exceptions).
  const [ackMenuAnchor, setAckMenuAnchor] = React.useState(null);
  const ackMenuOpen = Boolean(ackMenuAnchor);

  const isAcked = Boolean(finding.acknowledgedAt);
  // An ack whose expiry lapsed: the backend masks acknowledgedAt to
  // null (so `isAcked` is false and the finding re-surfaces as open),
  // but flags `acknowledgementExpired` so we can tell the operator WHY
  // it's back rather than looking like it was never acknowledged.
  const ackExpired = Boolean(finding.acknowledgementExpired);
  const ackUntil = finding.acknowledgedUntil || null;
  const remediationStatus = finding.remediationStatus || "open";
  const nextTransitions = REMEDIATION_TRANSITIONS[remediationStatus] || [];

  // A card-level pending flag covers both the ack toggle AND the
  // status menu so the operator sees one in-flight indicator at a
  // time. `pendingAction === finding.id` means THIS card has a
  // mutation in flight.
  const isPending = pendingAction === finding.id;

  const firstSeenAgo = shortRelativeTime(finding.firstSeenAtUtc);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: `1px solid ${borderColor}`,
        bgcolor:
          isAcked && finding.status === "fail"
            ? // Acknowledged fail = soft red (still attention-worthy)
              // but less visually loud than a brand-new fail card.
              `${ROLE.criticalSoft}88`
            : finding.status === "fail"
            ? ROLE.criticalSoft
            : "transparent",
        transition: "background-color 120ms ease",
        // Subtle tint on the right edge to signal "this finding has
        // an operator declared remediation state". Doesn't replace
        // the chip — just helps the eye scan a list of cards.
        boxShadow:
          remediationStatus !== "open"
            ? `inset -3px 0 0 0 ${REMEDIATION_STATUS_META[remediationStatus]?.fg ?? BRAND.gray}`
            : "none"
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        {/* Sprint 6 — bulk selection checkbox. Compact (padding=0)
            so the card height doesn't grow; aligned to the top so it
            sits at the same baseline as the status chip row. Hidden
            when no toggle handler is provided (defensive). */}
        {onToggleSelected ? (
          <Checkbox
            size="small"
            checked={selected}
            onChange={onToggleSelected}
            // Stop propagation so the checkbox click doesn't fall
            // through and open the Details collapse below it.
            onClick={(e) => e.stopPropagation()}
            sx={{ p: 0, mt: 0.25 }}
            inputProps={{ "aria-label": "Select finding for bulk action" }}
          />
        ) : null}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap" }}>
            <StatusChip status={finding.status} />
            <SeverityChip severity={finding.severity} />
            {/* Sprint 3 — show remediation state inline with the
                outcome status so operators can sort/scan by either. */}
            <RemediationStatusChip status={remediationStatus} />
            <Typography variant="caption" sx={{ color: BRAND.gray, fontFamily: "monospace" }}>
              {finding.checkId}
            </Typography>
            {firstSeenAgo ? (
              <Tooltip
                title={`First seen at ${finding.firstSeenAtUtc}`}
                arrow
                placement="top"
              >
                <Typography variant="caption" sx={{ color: BRAND.gray }}>
                  · open {firstSeenAgo}
                </Typography>
              </Tooltip>
            ) : null}
            {isAcked ? (
              <Tooltip
                title={`Acknowledged ${shortRelativeTime(finding.acknowledgedAt) ?? ""} ago${finding.acknowledgedBy ? ` by ${finding.acknowledgedBy}` : ""}${ackUntil ? ` · exception expires ${new Date(ackUntil).toLocaleString()}` : ""}`}
                arrow
                placement="top"
              >
                <Chip
                  label={ackUntil ? `Ack until ${shortDate(ackUntil)}` : "Ack"}
                  size="small"
                  icon={
                    ackUntil ? (
                      <ScheduleOutlinedIcon sx={{ fontSize: 12 }} />
                    ) : (
                      <VisibilityOutlinedIcon sx={{ fontSize: 12 }} />
                    )
                  }
                  sx={{
                    bgcolor: BRAND.tealSoft,
                    color: BRAND.tealText,
                    fontWeight: 700,
                    height: 22,
                    fontSize: 11,
                    "& .MuiChip-icon": { color: BRAND.tealText }
                  }}
                />
              </Tooltip>
            ) : null}
            {ackExpired ? (
              <Tooltip
                title={`This exception expired ${ackUntil ? shortDate(ackUntil) : ""} and the finding is open again. Re-acknowledge to silence it.`}
                arrow
                placement="top"
              >
                <Chip
                  label="Exception expired"
                  size="small"
                  icon={<EventBusyOutlinedIcon sx={{ fontSize: 12 }} />}
                  sx={{
                    bgcolor: ROLE.cautionSoft,
                    color: ROLE.caution,
                    fontWeight: 700,
                    height: 22,
                    fontSize: 11,
                    "& .MuiChip-icon": { color: ROLE.caution }
                  }}
                />
              </Tooltip>
            ) : null}
          </Stack>
          <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600 }}>
            {finding.title}
          </Typography>
          {finding.description ? (
            <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mt: 0.25 }}>
              {finding.description}
            </Typography>
          ) : null}

          {/* Framework chips */}
          {Array.isArray(finding.frameworks) && finding.frameworks.length > 0 ? (
            <Stack
              direction="row"
              spacing={0.5}
              sx={{ mt: 1, flexWrap: "wrap", gap: 0.5 }}
            >
              {finding.frameworks.map((fw, idx) => (
                <FrameworkChip
                  key={`${fw.framework}:${fw.control_id}:${idx}`}
                  framework={fw.framework}
                  controlId={fw.control_id}
                  controlLevel={fw.control_level}
                  controlTitle={fw.control_title}
                  referenceUrl={fw.reference_url}
                />
              ))}
            </Stack>
          ) : null}

          {/* Sprint 3 — action row. Sits between framework chips and
              the Details collapse so the operator sees:
                - WHAT this finding is (chips + title above)
                - WHAT they can do about it (action row)
                - WHY / EVIDENCE (collapse below)
              Buttons are size="small" so the card height matches the
              pre-Sprint-3 look. Disabled while a mutation is in
              flight. */}
          <Stack
            direction="row"
            spacing={0.5}
            sx={{ mt: 1, flexWrap: "wrap", gap: 0.5 }}
          >
            {isAcked ? (
              <Button
                size="small"
                variant="outlined"
                startIcon={<VisibilityOffOutlinedIcon sx={{ fontSize: 14 }} />}
                onClick={() => onRevoke(finding)}
                disabled={isPending}
                sx={{ textTransform: "none" }}
              >
                Revoke ack
              </Button>
            ) : (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<VisibilityOutlinedIcon sx={{ fontSize: 14 }} />}
                  endIcon={<ExpandMoreOutlinedIcon sx={{ fontSize: 14 }} />}
                  onClick={(e) => setAckMenuAnchor(e.currentTarget)}
                  disabled={isPending}
                  sx={{ textTransform: "none" }}
                >
                  {ackExpired ? "Re-acknowledge" : "Acknowledge"}
                </Button>
                <Menu
                  anchorEl={ackMenuAnchor}
                  open={ackMenuOpen}
                  onClose={() => setAckMenuAnchor(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                  transformOrigin={{ vertical: "top", horizontal: "left" }}
                >
                  {ACK_EXPIRY_PRESETS.map((preset) => (
                    <MenuItem
                      key={preset.label}
                      onClick={() => {
                        setAckMenuAnchor(null);
                        onAck(finding, ackUntilIso(preset.days));
                      }}
                    >
                      {preset.days == null ? (
                        <VisibilityOutlinedIcon sx={{ fontSize: 16, mr: 1 }} />
                      ) : (
                        <ScheduleOutlinedIcon sx={{ fontSize: 16, mr: 1 }} />
                      )}
                      <Typography variant="body2">
                        Acknowledge {preset.label}
                      </Typography>
                    </MenuItem>
                  ))}
                </Menu>
              </>
            )}
            {nextTransitions.length > 0 ? (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  endIcon={<ExpandMoreOutlinedIcon sx={{ fontSize: 14 }} />}
                  onClick={(e) => setStatusMenuAnchor(e.currentTarget)}
                  disabled={isPending}
                  sx={{ textTransform: "none" }}
                >
                  Change status
                </Button>
                <Menu
                  anchorEl={statusMenuAnchor}
                  open={statusMenuOpen}
                  onClose={() => setStatusMenuAnchor(null)}
                  // anchorOrigin defaults to top-left; use bottom-left
                  // so the menu opens BELOW the trigger, otherwise it
                  // can clip against the drawer's top edge on the
                  // first finding.
                  anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                >
                  {nextTransitions.map((next) => (
                    <MenuItem
                      key={next}
                      onClick={() => {
                        setStatusMenuAnchor(null);
                        onChangeStatus(finding, next);
                      }}
                    >
                      <RemediationStatusChip status={next} />
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        Mark {REMEDIATION_STATUS_META[next]?.label.toLowerCase()}
                      </Typography>
                    </MenuItem>
                  ))}
                </Menu>
              </>
            ) : null}
            <Button
              size="small"
              variant="text"
              startIcon={<HistoryOutlinedIcon sx={{ fontSize: 14 }} />}
              onClick={() => onShowHistory(finding)}
              disabled={isPending}
              sx={{ textTransform: "none" }}
            >
              History
            </Button>
            {isPending ? (
              <CircularProgress size={16} sx={{ ml: 0.5, alignSelf: "center" }} />
            ) : null}
          </Stack>
        </Box>
        <Button
          size="small"
          onClick={() => setOpen((v) => !v)}
          sx={{ flexShrink: 0 }}
        >
          {open ? "Hide" : "Details"}
        </Button>
      </Box>

      {open ? (
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px dashed ${BRAND.border}` }}>
          {finding.remediationSummary ? (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" sx={{ color: BRAND.tealText, fontWeight: 700, textTransform: "uppercase" }}>
                Remediation
              </Typography>
              <Typography variant="body2" sx={{ color: BRAND.dark, mt: 0.25 }}>
                {finding.remediationSummary}
              </Typography>
            </Box>
          ) : null}

          {finding.evidence ? (
            <Box>
              <Typography variant="caption" sx={{ color: BRAND.tealText, fontWeight: 700, textTransform: "uppercase" }}>
                Evidence
              </Typography>
              <Box
                component="pre"
                sx={{
                  mt: 0.5,
                  p: 1,
                  borderRadius: 1,
                  bgcolor: BRAND.surfaceMuted,
                  fontSize: 11,
                  fontFamily: "monospace",
                  maxHeight: 200,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  margin: 0
                }}
              >
                {JSON.stringify(finding.evidence, null, 2)}
              </Box>
            </Box>
          ) : null}
        </Box>
      ) : null}
    </Paper>
  );
}

// ── Sprint 6 — bulk action toolbar ─────────────────────────────────
//
// Compact bar that appears above the findings list. Three modes:
//   1. selectedCount === 0 → "Select all (N findings)" + nothing else.
//   2. selectedCount > 0   → "N of M selected" + Clear + Actions menu.
//   3. pending            → all controls disabled with a spinner.
//
// Kept as a Paper rather than a sticky Toolbar so it doesn't fight
// the Drawer's scroll behavior across viewports. Operators scrolling
// a long findings list can scroll up to find it — the selection
// state is preserved.
