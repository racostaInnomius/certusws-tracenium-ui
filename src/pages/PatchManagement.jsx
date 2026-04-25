import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  Chip,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";

import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import RadioButtonUncheckedOutlinedIcon from "@mui/icons-material/RadioButtonUncheckedOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import DevicesOtherOutlinedIcon from "@mui/icons-material/DevicesOtherOutlined";
import UpdateOutlinedIcon from "@mui/icons-material/UpdateOutlined";

import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import HttpsOutlinedIcon from "@mui/icons-material/HttpsOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import FolderSharedOutlinedIcon from "@mui/icons-material/FolderSharedOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";

import { BRAND } from "../theme/brand";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import SummaryCard from "../components/common/SummaryCard";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";

// ── Remediation catalog. Mirrors the Security Compliance categories —
//    each compliance check has a matching remediation action here. When
//    the PMP plugin lands, each remediation maps to a tenant-level
//    automation (e.g. "apply baseline" or "install KB").
const CATEGORIES = [
  {
    key: "patches",
    label: "Patches",
    icon: <SystemUpdateAltOutlinedIcon />,
    blurb:
      "Apply operating-system and security updates reported by Security Compliance as missing or pending.",
    actions: [
      {
        id: "patch.install_security",
        name: "Install missing security updates",
        description:
          "Deploy KBs flagged as Critical/Security on devices where Security Compliance reports them as missing.",
        impact: "host",
      },
      {
        id: "patch.install_quality",
        name: "Install pending quality / rollup updates",
        description:
          "Push non-security cumulative updates to devices that are behind the baseline.",
        impact: "host",
      },
      {
        id: "patch.schedule_reboot",
        name: "Schedule reboot for pending patches",
        description:
          "Trigger a controlled reboot window for devices with reboot-pending state.",
        impact: "downtime",
      },
      {
        id: "patch.update_drivers",
        name: "Apply driver updates",
        description:
          "Install optional driver updates where allowed by tenant policy.",
        impact: "host",
      },
      {
        id: "patch.scan_now",
        name: "Force patch scan",
        description:
          "Refresh patch inventory on demand instead of waiting for the next scheduled collection.",
        impact: "none",
      },
    ],
  },
  {
    key: "tls",
    label: "TLS & Ciphers",
    icon: <HttpsOutlinedIcon />,
    blurb:
      "Harden SChannel to meet tenant baseline: enable modern protocols, disable deprecated ones and weak ciphers.",
    actions: [
      {
        id: "tls.enable_1_2",
        name: "Enable TLS 1.2",
        description: "Ensures the minimum recommended version is available to all services.",
        impact: "reboot",
      },
      {
        id: "tls.enable_1_3",
        name: "Enable TLS 1.3",
        description: "Enables TLS 1.3 on hosts that support it.",
        impact: "reboot",
      },
      {
        id: "tls.disable_1_0_1_1",
        name: "Disable TLS 1.0 and 1.1",
        description:
          "Turns off deprecated protocol versions via SChannel registry settings.",
        impact: "reboot",
      },
      {
        id: "tls.disable_ssl",
        name: "Disable SSL 2.0 / 3.0",
        description: "Hard-disable obsolete protocols at server and client.",
        impact: "reboot",
      },
      {
        id: "tls.disable_weak_ciphers",
        name: "Disable weak cipher suites",
        description:
          "Removes RC4, DES, 3DES, NULL, EXPORT and anonymous DH suites from the cipher order.",
        impact: "reboot",
      },
    ],
  },
  {
    key: "smb",
    label: "SMB",
    icon: <HubOutlinedIcon />,
    blurb:
      "Harden the Server Message Block stack — disable legacy protocol, enforce signing, block anonymous access.",
    actions: [
      {
        id: "smb.disable_v1",
        name: "Disable SMBv1",
        description:
          "Removes the SMB1 feature / protocol from the device. Mitigates EternalBlue family.",
        impact: "reboot",
      },
      {
        id: "smb.require_server_signing",
        name: "Require SMB signing (server side)",
        description: "Blocks unsigned inbound SMB sessions.",
        impact: "none",
      },
      {
        id: "smb.require_client_signing",
        name: "Require SMB signing (client side)",
        description: "Signs every outbound SMB session from this host.",
        impact: "none",
      },
      {
        id: "smb.enable_encryption",
        name: "Enable SMB 3.x encryption",
        description:
          "Turn on transport encryption for all shares (or selected sensitive shares).",
        impact: "none",
      },
      {
        id: "smb.disable_guest",
        name: "Disable guest / anonymous SMB",
        description:
          "Blocks anonymous access to shares and named pipes.",
        impact: "none",
      },
    ],
  },
  {
    key: "shares",
    label: "Shared Folders",
    icon: <FolderSharedOutlinedIcon />,
    blurb:
      "Fix share and NTFS permissions flagged by Security Compliance — remove open grants and reconcile mismatches.",
    actions: [
      {
        id: "shares.remove_everyone",
        name: "Remove Everyone ACE",
        description:
          "Strip the Everyone principal from every share where Security Compliance flagged it.",
        impact: "access",
      },
      {
        id: "shares.lock_auth_users",
        name: "Reduce Authenticated Users rights",
        description:
          "Downgrade Full Control to Read on shares where the tenant baseline requires it.",
        impact: "access",
      },
      {
        id: "shares.reconcile_share_ntfs",
        name: "Reconcile share vs NTFS permissions",
        description:
          "Align effective permissions where share-level and NTFS-level ACLs disagree.",
        impact: "access",
      },
      {
        id: "shares.remove_unexpected",
        name: "Remove unexpected hidden shares",
        description:
          "Delete `$`-suffixed shares that are not part of the tenant baseline.",
        impact: "access",
      },
    ],
  },
  {
    key: "other",
    label: "Other",
    icon: <TuneOutlinedIcon />,
    blurb:
      "Generic host-hardening remediations driven by Security Compliance findings.",
    actions: [
      {
        id: "other.enable_bitlocker",
        name: "Enable BitLocker on OS volume",
        description:
          "Turn on full-disk encryption with the key-protection mode defined in the policy.",
        impact: "reboot",
      },
      {
        id: "other.enable_defender_rt",
        name: "Enable Defender real-time protection",
        description:
          "Re-enable RTP if disabled and refresh signatures to the latest intel.",
        impact: "none",
      },
      {
        id: "other.enable_firewall",
        name: "Enable Windows Firewall profiles",
        description:
          "Activate Firewall on Domain, Private and Public profiles.",
        impact: "none",
      },
      {
        id: "other.raise_uac",
        name: "Raise UAC level",
        description: "Set UAC to 'Always notify' (or the tenant baseline level).",
        impact: "none",
      },
      {
        id: "other.enable_lsa_protection",
        name: "Enable LSA protection / Credential Guard",
        description:
          "Harden LSASS on supported hosts against credential theft.",
        impact: "reboot",
      },
      {
        id: "other.rotate_local_admin",
        name: "Rotate local administrator account",
        description: "Rename / disable / rotate password per tenant policy.",
        impact: "access",
      },
      {
        id: "other.set_ps_policy",
        name: "Set PowerShell execution policy",
        description:
          "Apply tenant baseline (AllSigned / Restricted).",
        impact: "none",
      },
    ],
  },
];

function IMPACT_CHIP({ impact }) {
  const map = {
    none: { label: "No impact", bg: BRAND.tealSoft, fg: BRAND.tealText, border: `${BRAND.teal}55` },
    host: { label: "Host busy", bg: BRAND.cyanSoft, fg: BRAND.dark, border: `${BRAND.cyan}88` },
    access: { label: "Access change", bg: "rgba(199,121,43,0.14)", fg: "#8b5418", border: "rgba(199,121,43,0.4)" },
    reboot: { label: "May reboot", bg: BRAND.alert.errorSoft, fg: BRAND.alert.error, border: `${BRAND.alert.error}55` },
    downtime: { label: "Downtime", bg: BRAND.alert.errorSoft, fg: BRAND.alert.error, border: `${BRAND.alert.error}55` },
  };
  const cfg = map[impact] || { label: impact || "—", bg: BRAND.darkSoft, fg: BRAND.dark, border: BRAND.border };
  return (
    <Chip
      label={cfg.label}
      size="small"
      sx={{
        height: 22,
        fontSize: 11,
        fontWeight: 700,
        bgcolor: cfg.bg,
        color: cfg.fg,
        border: `1px solid ${cfg.border}`,
      }}
    />
  );
}

function ActionsList({ actions }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1.5 }}>
      {actions.map((a) => (
        <Box
          key={a.id}
          sx={{
            display: "flex",
            alignItems: { xs: "flex-start", sm: "center" },
            gap: 1.5,
            p: 1.5,
            borderRadius: 2,
            border: `1px solid ${BRAND.border}`,
            bgcolor: "#ffffff",
            transition: "background-color 0.12s ease, border-color 0.12s ease",
            "&:hover": { borderColor: BRAND.teal, bgcolor: BRAND.tealSoft },
            flexDirection: { xs: "column", sm: "row" },
          }}
        >
          <RadioButtonUncheckedOutlinedIcon
            sx={{ color: BRAND.gray, fontSize: 20, mt: { xs: 0, sm: 0.25 }, flexShrink: 0 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.dark }}>
                {a.name}
              </Typography>
              <IMPACT_CHIP impact={a.impact} />
            </Box>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 0.25 }}>
              {a.description}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1, flexShrink: 0, alignSelf: { xs: "flex-end", sm: "center" } }}>
            <Button
              disabled
              size="small"
              startIcon={<PlayArrowOutlinedIcon />}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                bgcolor: BRAND.tealSoft,
                color: BRAND.tealText,
                "&:hover": { bgcolor: BRAND.tealSoft },
                "&.Mui-disabled": {
                  bgcolor: BRAND.darkSoft,
                  color: BRAND.gray,
                  borderColor: BRAND.border,
                },
              }}
            >
              Remediate
            </Button>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function CategoryPanel({ category }) {
  return (
    <SectionPaper
      variant="panel"
      sx={{ minWidth: 0 }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, flexWrap: "wrap" }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2,
            bgcolor: BRAND.tealSoft,
            color: BRAND.teal,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {category.icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 17, fontWeight: 800, color: BRAND.dark }}>
            {category.label}
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.25 }}>
            {category.blurb}
          </Typography>
        </Box>
      </Box>

      <Alert
        severity="info"
        variant="outlined"
        icon={<HourglassEmptyOutlinedIcon fontSize="small" />}
        sx={{
          mt: 2,
          borderRadius: 2,
          borderColor: BRAND.border,
          bgcolor: BRAND.darkSoft,
          color: BRAND.dark,
          "& .MuiAlert-icon": { color: BRAND.dark },
        }}
      >
        PMP plugin is not wired yet — remediation actions are disabled and will
        activate once the agent reports {category.label.toLowerCase()} state
        via Security Compliance facts.
      </Alert>

      <ActionsList actions={category.actions} />
    </SectionPaper>
  );
}

export default function PatchManagement() {
  const [tab, setTab] = React.useState(CATEGORIES[0].key);
  const activeCategory = CATEGORIES.find((c) => c.key === tab) ?? CATEGORIES[0];

  // Refresh is a no-op until the PMP plugin lands — kept for visual
  // homologation with the rest of the app. When the plugin reports
  // patch / TLS / domain state the existing load functions will hook
  // here.
  const refreshNow = React.useCallback(() => {}, []);
  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(refreshNow, "patchAutoRefresh");

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 }, minWidth: 0 }}>
      {/* Header */}
      <PageHeader
        title="Patch Management"
        subtitle="Remediate findings collected by Security Compliance."
        icon={<SystemUpdateAltOutlinedIcon />}
        actions={
          <>
            <Chip
              label="PMP plugin pending"
              size="small"
              icon={<HourglassEmptyOutlinedIcon sx={{ fontSize: 14 }} />}
              sx={{
                bgcolor: BRAND.cyanSoft,
                color: BRAND.dark,
                fontWeight: 700,
                border: `1px solid ${BRAND.cyan}88`,
                "& .MuiChip-icon": { color: BRAND.dark },
              }}
            />
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={refreshNow}
            />
          </>
        }
      />

      {/* Summary cards */}
      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <SummaryCard
              title="Pending findings"
              value="—"
              icon={<PendingActionsOutlinedIcon />}
              accent="#8b5418"
              tint="rgba(199,121,43,0.14)"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <SummaryCard
              title="Remediations running"
              value="—"
              icon={<BuildOutlinedIcon />}
              accent={BRAND.dark}
              tint={BRAND.cyanSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <SummaryCard
              title="Remediated last 7d"
              value="—"
              icon={<CheckCircleOutlineOutlinedIcon />}
              accent={BRAND.tealText}
              tint={BRAND.tealSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <SummaryCard
              title="Devices targeted"
              value="0"
              icon={<DevicesOtherOutlinedIcon />}
              accent={BRAND.dark}
              tint={BRAND.darkSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <SummaryCard
              title="Last scan"
              value="—"
              icon={<UpdateOutlinedIcon />}
              accent={BRAND.teal}
              tint={BRAND.tealSoft}
            />
          </Grid>
        </Grid>
      </Box>

      {/* Tabs + Category panel */}
      <SectionPaper
        variant="panel"
        sx={{ p: 0, bgcolor: "#ffffff", overflow: "hidden", mb: 2 }}
      >
        <Tabs
          value={tab}
          onChange={(_e, next) => setTab(next)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            borderBottom: `1px solid ${BRAND.border}`,
            bgcolor: BRAND.darkSoft,
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 700,
              color: BRAND.dark,
              minHeight: 48,
              px: 2,
              outline: "none",
              "&:focus, &:focus-visible": { outline: "none", boxShadow: "none" },
              "&.Mui-focusVisible": { backgroundColor: BRAND.cyanSoft },
            },
            "& .Mui-selected": { color: `${BRAND.teal} !important` },
            "& .MuiTabs-indicator": { backgroundColor: BRAND.teal, height: 3 },
          }}
        >
          {CATEGORIES.map((c) => (
            <Tab
              key={c.key}
              value={c.key}
              label={c.label}
              icon={c.icon}
              iconPosition="start"
              sx={{ gap: 0.75 }}
            />
          ))}
        </Tabs>

        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
          <CategoryPanel category={activeCategory} />
        </Box>
      </SectionPaper>
    </Box>
  );
}
