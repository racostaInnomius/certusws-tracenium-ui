import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";

import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import DevicesOtherOutlinedIcon from "@mui/icons-material/DevicesOtherOutlined";
import UpdateOutlinedIcon from "@mui/icons-material/UpdateOutlined";

import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import HttpsOutlinedIcon from "@mui/icons-material/HttpsOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import FolderSharedOutlinedIcon from "@mui/icons-material/FolderSharedOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import RadioButtonUncheckedOutlinedIcon from "@mui/icons-material/RadioButtonUncheckedOutlined";

// Tracenium brand palette
const BRAND = {
  dark: "#3B404D",
  teal: "#5A9F9F",
  tealHover: "#4E8C8C",
  cyan: "#8FFDFF",
  gray: "#BEBEBE",
  tealSoft: "rgba(90,159,159,0.12)",
  tealText: "#3E7878",
  cyanSoft: "rgba(143,253,255,0.22)",
  darkSoft: "rgba(59,64,77,0.08)",
  border: "rgba(190,190,190,0.5)",
  shadow: "0 8px 20px rgba(59,64,77,0.10)",
};

// ── Static descriptors of what the agent will collect. These stay in the UI
//    so the page is self-documenting even before any fact is ingested.
//    When gRPC starts pushing compliance facts, we replace the `status` of
//    each check with the real value (pass/fail/warn/value).
const CATEGORIES = [
  {
    key: "patches",
    label: "Patches",
    icon: <SystemUpdateAltOutlinedIcon />,
    blurb:
      "Operating system and security updates reported by Windows Update / MDM channels.",
    checks: [
      {
        id: "patch.security_installed",
        name: "Security updates installed",
        description:
          "Count and KB identifiers of security-classified updates present on the device.",
      },
      {
        id: "patch.critical_missing",
        name: "Critical patches missing",
        description:
          "KBs flagged as Critical by the vendor that are applicable but not yet installed.",
      },
      {
        id: "patch.quality_missing",
        name: "Quality / rollup updates pending",
        description:
          "Non-security cumulative updates that improve stability but are not installed.",
      },
      {
        id: "patch.reboot_pending",
        name: "Reboot pending",
        description:
          "The device needs a restart to finalize one or more installed patches.",
      },
      {
        id: "patch.driver_updates",
        name: "Driver updates available",
        description:
          "Optional driver updates offered via Windows Update that are not applied.",
      },
    ],
  },
  {
    key: "tls",
    label: "TLS & Ciphers",
    icon: <HttpsOutlinedIcon />,
    blurb:
      "SChannel protocol versions and cipher suite configuration used by services on the device.",
    checks: [
      {
        id: "tls.1_2_enabled",
        name: "TLS 1.2 enabled",
        description: "Minimum recommended protocol version.",
      },
      {
        id: "tls.1_3_enabled",
        name: "TLS 1.3 enabled",
        description: "Modern protocol version — should be enabled where supported.",
      },
      {
        id: "tls.1_0_disabled",
        name: "TLS 1.0 disabled",
        description: "Deprecated; must be disabled to pass modern compliance baselines.",
      },
      {
        id: "tls.1_1_disabled",
        name: "TLS 1.1 disabled",
        description: "Deprecated; must be disabled to pass modern compliance baselines.",
      },
      {
        id: "tls.ssl3_disabled",
        name: "SSL 3.0 / 2.0 disabled",
        description: "Obsolete and insecure — required disabled.",
      },
      {
        id: "tls.weak_ciphers_disabled",
        name: "Weak cipher suites disabled",
        description: "RC4, DES, 3DES, NULL, EXPORT and anonymous DH suites.",
      },
    ],
  },
  {
    key: "smb",
    label: "SMB",
    icon: <HubOutlinedIcon />,
    blurb:
      "Server Message Block configuration on the LanmanServer / LanmanWorkstation services.",
    checks: [
      {
        id: "smb.v1_disabled",
        name: "SMBv1 disabled",
        description: "Legacy protocol exposed to EternalBlue family of exploits.",
      },
      {
        id: "smb.server_signing_required",
        name: "Server-side SMB signing required",
        description: "Prevents SMB relay attacks against this host.",
      },
      {
        id: "smb.client_signing_required",
        name: "Client-side SMB signing required",
        description: "Outbound SMB connections sign packets.",
      },
      {
        id: "smb.encryption_supported",
        name: "SMB 3.x encryption supported",
        description: "Transport encryption for sensitive shares.",
      },
      {
        id: "smb.guest_disabled",
        name: "Guest / anonymous SMB disabled",
        description: "Anonymous access to shares and named pipes is blocked.",
      },
    ],
  },
  {
    key: "shares",
    label: "Shared Folders",
    icon: <FolderSharedOutlinedIcon />,
    blurb:
      "SMB shares hosted on the device and the effective permissions granted at share and NTFS level.",
    checks: [
      {
        id: "shares.everyone_access",
        name: "Shares granting Everyone",
        description:
          "Shares with an ACE for the Everyone SID. Usually unintentional; flagged for review.",
      },
      {
        id: "shares.auth_users_full_control",
        name: "Authenticated Users: Full Control",
        description:
          "Grants full control to every authenticated principal — high blast radius.",
      },
      {
        id: "shares.admin_shares_state",
        name: "Administrative shares (C$, ADMIN$)",
        description:
          "Presence and state of default admin shares; should match tenant policy.",
      },
      {
        id: "shares.permission_mismatch",
        name: "Share vs NTFS permission mismatch",
        description:
          "Effective permissions differ between share-level ACL and NTFS ACL.",
      },
      {
        id: "shares.hidden_unexpected",
        name: "Unexpected hidden shares",
        description: "Shares ending in `$` that are not part of the baseline.",
      },
    ],
  },
  {
    key: "other",
    label: "Other",
    icon: <TuneOutlinedIcon />,
    blurb:
      "Host hardening signals not tied to a specific protocol — endpoint protection, encryption, policy.",
    checks: [
      {
        id: "other.bitlocker_os_volume",
        name: "BitLocker on OS volume",
        description: "Full-disk encryption enabled on the system drive.",
      },
      {
        id: "other.defender_realtime",
        name: "Microsoft Defender real-time protection",
        description: "Real-time protection active and signatures current.",
      },
      {
        id: "other.firewall_profiles",
        name: "Windows Firewall profiles",
        description: "Enabled on Domain, Private and Public profiles.",
      },
      {
        id: "other.uac_level",
        name: "User Account Control level",
        description: "Set to 'Always notify' (or at least the default level).",
      },
      {
        id: "other.lsa_protection",
        name: "LSA protection / Credential Guard",
        description: "Hardens LSASS against credential theft on supported hosts.",
      },
      {
        id: "other.local_admin_state",
        name: "Local administrator account",
        description: "Renamed and/or disabled where tenant policy requires it.",
      },
      {
        id: "other.powershell_policy",
        name: "PowerShell execution policy",
        description: "Execution policy aligned with tenant baseline (AllSigned / Restricted).",
      },
    ],
  },
];

function SummaryCard({ title, value, icon, accent = BRAND.teal, tint = BRAND.tealSoft }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.75,
        minHeight: 96,
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        boxShadow: BRAND.shadow,
        display: "flex",
        alignItems: "center",
        gap: 1.75,
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow: "0 12px 26px rgba(59,64,77,0.14)",
        },
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: 2,
          bgcolor: tint,
          color: accent,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12, color: "text.secondary", fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 26, fontWeight: 800, color: BRAND.dark, lineHeight: 1.1 }}>
          {value}
        </Typography>
      </Box>
    </Paper>
  );
}

function PendingChip() {
  return (
    <Chip
      size="small"
      label="Pending"
      icon={<HourglassEmptyOutlinedIcon sx={{ fontSize: 14 }} />}
      sx={{
        bgcolor: BRAND.darkSoft,
        color: BRAND.dark,
        fontWeight: 700,
        border: `1px solid ${BRAND.border}`,
        "& .MuiChip-icon": { color: BRAND.dark },
      }}
    />
  );
}

function ChecksList({ checks }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        mt: 1.5,
      }}
    >
      {checks.map((c) => (
        <Box
          key={c.id}
          sx={{
            display: "flex",
            alignItems: { xs: "flex-start", sm: "center" },
            gap: 1.5,
            p: 1.5,
            borderRadius: 2,
            border: `1px solid ${BRAND.border}`,
            bgcolor: "#ffffff",
            transition: "background-color 0.12s ease, border-color 0.12s ease",
            "&:hover": {
              borderColor: BRAND.teal,
              bgcolor: BRAND.tealSoft,
            },
            flexDirection: { xs: "column", sm: "row" },
          }}
        >
          <RadioButtonUncheckedOutlinedIcon
            sx={{ color: BRAND.gray, fontSize: 20, mt: { xs: 0, sm: 0.25 }, flexShrink: 0 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.dark }}>
              {c.name}
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 0.25 }}>
              {c.description}
            </Typography>
          </Box>
          <Box sx={{ flexShrink: 0, alignSelf: { xs: "flex-end", sm: "center" } }}>
            <PendingChip />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function CategoryPanel({ category }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 2 },
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        boxShadow: BRAND.shadow,
        minWidth: 0,
      }}
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
        Collection pending — results will appear here once the agent starts
        reporting <strong>{category.label.toLowerCase()}</strong> facts for this tenant.
      </Alert>

      <ChecksList checks={category.checks} />
    </Paper>
  );
}

export default function SecurityCompliance() {
  const [tab, setTab] = React.useState(CATEGORIES[0].key);
  const activeCategory = CATEGORIES.find((c) => c.key === tab) ?? CATEGORIES[0];

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 }, minWidth: 0 }}>
      {/* Header */}
      <Box
        sx={{
          mb: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: { xs: "stretch", sm: "center" },
          gap: 2,
          flexWrap: "wrap",
          flexDirection: { xs: "column", sm: "row" },
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ color: BRAND.dark, fontWeight: 800, letterSpacing: -0.5 }}>
            Security Compliance
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.25 }}>
            Posture and hardening signals collected from each endpoint. Agent
            collection is not wired yet — every check below is a placeholder.
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Chip
            label="Awaiting first collection"
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
          <Button
            variant="outlined"
            startIcon={<RefreshOutlinedIcon />}
            disabled
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderColor: BRAND.teal,
              color: BRAND.teal,
              "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
            }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Summary cards */}
      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <SummaryCard
              title="Compliant"
              value="—"
              icon={<CheckCircleOutlineOutlinedIcon />}
              accent={BRAND.tealText}
              tint={BRAND.tealSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <SummaryCard
              title="Warnings"
              value="—"
              icon={<WarningAmberOutlinedIcon />}
              accent="#8b5418"
              tint="rgba(199,121,43,0.14)"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <SummaryCard
              title="Critical"
              value="—"
              icon={<ErrorOutlineOutlinedIcon />}
              accent="#b3261e"
              tint="rgba(179,38,30,0.12)"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <SummaryCard
              title="Devices Scanned"
              value="0"
              icon={<DevicesOtherOutlinedIcon />}
              accent={BRAND.dark}
              tint={BRAND.darkSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
            <SummaryCard
              title="Last Collection"
              value="—"
              icon={<UpdateOutlinedIcon />}
              accent={BRAND.dark}
              tint={BRAND.cyanSoft}
            />
          </Grid>
        </Grid>
      </Box>

      {/* Tabs + Category panel */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: `1px solid ${BRAND.border}`,
          boxShadow: BRAND.shadow,
          bgcolor: "#ffffff",
          overflow: "hidden",
          mb: 2,
        }}
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
            "& .Mui-selected": {
              color: `${BRAND.teal} !important`,
            },
            "& .MuiTabs-indicator": {
              backgroundColor: BRAND.teal,
              height: 3,
            },
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
      </Paper>
    </Box>
  );
}
