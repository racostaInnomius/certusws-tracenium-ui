// src/components/RemoteControl/StartSessionWizard.jsx
//
// "Start a remote session" in three steps.
//
// ── What it inverts relative to the table ────────────────────────────
//
// The table asks you to pick a device and then guess what three unlabelled
// icons do. Here you pick THE INTENT first — what you need to achieve — and
// the device list arrives already filtered to the ones that can serve it.
// Someone who doesn't know the product doesn't need to know what
// "rcp.screen" is in order to use it, and someone who does still has the
// table.
//
// ── Step 3 is not new ────────────────────────────────────────────────
//
// It's the ADR-0009 phase 1 access record (reason + ticket), which was
// already asked for in its own dialog. Here it's the last step instead of a
// separate window: same data, same backend contract, one hop fewer.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import TerminalOutlinedIcon from "@mui/icons-material/TerminalOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import DesktopWindowsOutlinedIcon from "@mui/icons-material/DesktopWindowsOutlined";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import {
  RCP_METHODS,
  methodFor,
  countsByMethod,
  filterDevices,
  matchesSearch,
  hasAnyRcp,
  blockedReason,
  platformLabel
} from "./rcpMethods";
import { useConnectableDevices } from "./useRemoteControlData";

const METHOD_ICON = {
  shell: TerminalOutlinedIcon,
  file: FolderOutlinedIcon,
  screen: DesktopWindowsOutlinedIcon
};

const STEP_LABELS = ["What do you need to do?", "Which device?", "Reason and ticket"];

function StepRail({ step }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", gap: 1 }}>
      {STEP_LABELS.map((label, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <Stack key={label} direction="row" spacing={0.75} alignItems="center">
            <Box
              sx={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                fontSize: TEXT.xs,
                fontWeight: 700,
                border: `1px solid ${active || done ? BRAND.teal : BRAND.border}`,
                bgcolor: active ? BRAND.teal : "transparent",
                color: active ? BRAND.surface : done ? BRAND.teal : BRAND.gray
              }}
            >
              {i + 1}
            </Box>
            <Typography
              variant="caption"
              sx={{
                color: active ? BRAND.dark : BRAND.gray,
                fontWeight: active ? 700 : 400
              }}
            >
              {label}
            </Typography>
            {i < STEP_LABELS.length - 1 ? (
              <Typography variant="caption" sx={{ color: BRAND.border, px: 0.5 }}>
                —
              </Typography>
            ) : null}
          </Stack>
        );
      })}
    </Stack>
  );
}

function MethodCard({ method, count, selected, onSelect }) {
  const Icon = METHOD_ICON[method.type];
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => onSelect(method.type)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(method.type);
        }
      }}
      sx={{
        flex: 1,
        minWidth: 190,
        p: 2,
        borderRadius: 2,
        cursor: "pointer",
        border: `1px solid ${selected ? BRAND.teal : BRAND.border}`,
        bgcolor: selected ? BRAND.tealSoft : "transparent",
        boxShadow: selected ? `inset 0 0 0 1px ${BRAND.teal}` : "none",
        "&:hover": { borderColor: BRAND.teal },
        "&:focus-visible": { outline: `2px solid ${BRAND.teal}`, outlineOffset: 2 }
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Icon fontSize="small" sx={{ color: BRAND.teal }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BRAND.dark }}>
          {method.label}
        </Typography>
      </Stack>
      <Typography variant="caption" sx={{ color: BRAND.textMuted, display: "block", lineHeight: 1.5 }}>
        {method.description}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: BRAND.gray, display: "block", mt: 1, fontSize: TEXT.xs }}
      >
        {method.capability} · {count} {count === 1 ? "device" : "devices"} ready
      </Typography>
    </Box>
  );
}

function DeviceRow({ device, selected, onSelect, reason }) {
  const blocked = Boolean(reason);
  return (
    <Box
      role="button"
      tabIndex={blocked ? -1 : 0}
      aria-disabled={blocked}
      onClick={() => !blocked && onSelect(device)}
      onKeyDown={(e) => {
        if (!blocked && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(device);
        }
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 1.5,
        py: 1.25,
        mb: 0.75,
        borderRadius: 1.5,
        border: `1px solid ${selected ? BRAND.teal : BRAND.border}`,
        bgcolor: selected ? BRAND.tealSoft : "transparent",
        opacity: blocked ? 0.62 : 1,
        cursor: blocked ? "default" : "pointer",
        "&:hover": blocked ? undefined : { borderColor: BRAND.teal },
        "&:focus-visible": { outline: `2px solid ${BRAND.teal}`, outlineOffset: 2 }
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: BRAND.dark }}>
          {device.hostname || device.deviceId}
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray }}>
          {[
            device.platform ? platformLabel(device.platform) : null,
            device.agentVersion ? `agent ${device.agentVersion}` : null
          ]
            .filter(Boolean)
            .join(" · ") || device.deviceId}
        </Typography>
      </Box>
      {blocked ? (
        <Typography variant="caption" sx={{ color: ROLE.caution, fontWeight: 600, textAlign: "right" }}>
          {reason}
        </Typography>
      ) : (
        <Chip
          size="small"
          label="Online"
          sx={{
            height: 20,
            fontWeight: 700,
            fontSize: TEXT.xs,
            bgcolor: ROLE.positiveSoft,
            color: ROLE.positive,
            border: `1px solid ${ROLE.positive}33`
          }}
        />
      )}
    </Box>
  );
}

export default function StartSessionWizard({ open, onClose, onConfirm }) {
  const { devices, loading } = useConnectableDevices();

  const [step, setStep] = React.useState(0);
  const [type, setType] = React.useState("");
  const [device, setDevice] = React.useState(null);
  const [search, setSearch] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [ticketRef, setTicketRef] = React.useState("");

  // Every opening starts from scratch. Without this the wizard would reopen
  // with the PREVIOUS access's reason and ticket already filled in, and the
  // operator would sign a record they didn't write — precisely what ADR-0009
  // phase 1 exists to prevent.
  React.useEffect(() => {
    if (!open) return;
    setStep(0);
    setType("");
    setDevice(null);
    setSearch("");
    setReason("");
    setTicketRef("");
  }, [open]);

  const counts = React.useMemo(() => countsByMethod(devices), [devices]);

  // The ones that can serve the chosen method right now.
  const eligible = React.useMemo(
    () => (type ? filterDevices(devices, { method: type, onlineOnly: true, search }) : []),
    [devices, type, search]
  );

  // The ones the operator IS looking for but that can't serve this.
  //
  // A filter that only hides produces the worst possible question: "where is
  // my device?". If what was searched for exists and doesn't fit, it's said
  // here, with the reason. Only shown when there's a search: without one the
  // list would be half the fleet greyed out, which is noise.
  const blocked = React.useMemo(() => {
    if (!type || !search.trim()) return [];
    return devices
      .filter((d) => hasAnyRcp(d) && matchesSearch(d, search) && blockedReason(d, type))
      .map((d) => ({ device: d, reason: blockedReason(d, type) }));
  }, [devices, type, search]);

  const reasonOk = reason.trim().length >= 10;
  const ticketOk = ticketRef.trim().length >= 3;
  const method = methodFor(type);

  const pickMethod = (t) => {
    setType(t);
    setDevice(null);
    setStep(1);
  };

  const pickDevice = (d) => {
    setDevice(d);
    setStep(2);
  };

  const confirm = () => {
    if (!device || !method || !reasonOk || !ticketOk) return;
    onConfirm({
      device,
      type,
      record: { reason: reason.trim(), ticketRef: ticketRef.trim() }
    });
  };

  return (
    <Dialog open={Boolean(open)} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        {/* component="div": DialogTitle already renders an <h2>, and a
            Typography with a heading variant inside it nests <h6> in <h2> —
            invalid HTML, and React says so at runtime. */}
        <Typography
          component="div"
          variant="h6"
          sx={{ fontWeight: 700, color: BRAND.dark, mb: 1 }}
        >
          Start a remote session
        </Typography>
        <StepRail step={step} />
      </DialogTitle>

      <DialogContent dividers sx={{ minHeight: 340 }}>
        {/* ── Step 1 — the intent ───────────────────────────────── */}
        {step === 0 ? (
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", gap: 1.5 }}>
            {RCP_METHODS.map((m) => (
              <MethodCard
                key={m.type}
                method={m}
                count={counts[m.type] ?? 0}
                selected={type === m.type}
                onSelect={pickMethod}
              />
            ))}
          </Stack>
        ) : null}

        {/* ── Step 2 — the device ───────────────────────────────── */}
        {step === 1 ? (
          <Box>
            <TextField
              autoFocus
              fullWidth
              size="small"
              placeholder="Search by host, group, site or identifier…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
                  </InputAdornment>
                )
              }}
              sx={{ mb: 1.5 }}
            />

            {loading && devices.length === 0 ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress size={24} sx={{ color: BRAND.teal }} />
              </Box>
            ) : null}

            {eligible.map((d) => (
              <DeviceRow
                key={d.deviceId}
                device={d}
                selected={device?.deviceId === d.deviceId}
                onSelect={pickDevice}
              />
            ))}

            {!loading && eligible.length === 0 && blocked.length === 0 ? (
              <Alert severity="info" sx={{ mt: 1 }}>
                {search.trim()
                  ? "No device matches that search."
                  : `No device can ${String(method?.label || "").toLowerCase()} right now. ` +
                    "They need to be online and have the capability enabled in their policy."}
              </Alert>
            ) : null}

            {blocked.length > 0 ? (
              <>
                <Divider sx={{ my: 1.5 }}>
                  <Typography variant="caption" sx={{ color: BRAND.gray }}>
                    Found, but not available for this
                  </Typography>
                </Divider>
                {blocked.map(({ device: d, reason: why }) => (
                  <DeviceRow key={d.deviceId} device={d} reason={why} onSelect={() => {}} />
                ))}
              </>
            ) : null}
          </Box>
        ) : null}

        {/* ── Step 3 — the access record (ADR-0009 phase 1) ─────── */}
        {step === 2 ? (
          <Box>
            <Box
              sx={{
                p: 1.5,
                mb: 2,
                borderRadius: 1.5,
                bgcolor: BRAND.tealSoft,
                border: `1px solid ${BRAND.border}`
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, color: BRAND.dark }}>
                {method?.label} on {device?.hostname || device?.deviceId}
              </Typography>
              <Typography variant="caption" sx={{ color: BRAND.textMuted }}>
                {[
                  device?.platform ? platformLabel(device.platform) : null,
                  device?.agentVersion ? `agent ${device.agentVersion}` : null
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Typography>
            </Box>

            <Typography variant="body2" sx={{ mb: 2, color: BRAND.textMuted }}>
              Who connects, to which device and why is recorded and stored alongside the
              session.
            </Typography>

            <TextField
              autoFocus
              fullWidth
              multiline
              minRows={2}
              margin="dense"
              label="Reason"
              placeholder="What you are going to do and why this access is needed"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              error={reason.length > 0 && !reasonOk}
              helperText={
                reason.length > 0 && !reasonOk
                  ? "Describe the reason (at least 10 characters)"
                  : " "
              }
            />
            <TextField
              fullWidth
              margin="dense"
              label="Ticket"
              placeholder="TCK-4821, INC0012345, jira/OPS-77…"
              value={ticketRef}
              onChange={(e) => setTicketRef(e.target.value)}
              helperText="The ticket this access is performed under"
            />
          </Box>
        ) : null}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {step > 0 ? (
          <Button
            startIcon={<ArrowBackOutlinedIcon fontSize="small" />}
            onClick={() => setStep((s) => s - 1)}
            sx={{ mr: "auto" }}
          >
            Back
          </Button>
        ) : null}
        <Button onClick={onClose}>Cancel</Button>
        {step === 2 ? (
          <Button variant="contained" disabled={!reasonOk || !ticketOk} onClick={confirm}>
            Connect
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
