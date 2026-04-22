import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";

import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";

import { useAuthContext } from "../auth/AuthContext";
import {
  deleteDevicePolicy,
  getDevicePolicy,
  getDevicePolicyStatus,
  getEffectivePolicy,
  getTenantPolicy,
  listTenantPolicyStatus,
  pushDevicePolicy,
  pushTenantPolicy,
  saveDevicePolicy,
  saveTenantPolicy,
} from "../api/policies";
import { listKnownDevices } from "../api/jobs";

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
  rowHover: "rgba(143,253,255,0.10)",
  shadow: "0 8px 20px rgba(59,64,77,0.10)",
};

// ── Plugin descriptors. `required: true` means the plugin is part of the
//    agent core and cannot be turned off — it ships as a locked toggle.
//    `impliesModule` auto-enables a module when the plugin is active; the
//    module does not need its own user-facing toggle.
const PLUGIN_DESCRIPTORS = [
  {
    key: "amp",
    label: "AMP — Asset Management",
    description: "Hardware and software inventory. Integrated into the agent core — always on.",
    required: true,
  },
  {
    key: "scp",
    label: "SCP — Security Compliance",
    description:
      "Compliance facts feeding the Security Compliance page. Enabling it activates compliance collection automatically.",
    impliesModule: "compliance",
  },
  {
    key: "pmp",
    label: "PMP — Patch Management",
    description: "Patch scan and install. Opt-in: disabled by default.",
  },
  {
    key: "sdp",
    label: "SDP — Software Delivery",
    description: "Software deployment and distribution tracking.",
  },
];

// ── Form ⇄ policy mapping. The form only tracks plugin toggles; modules
//    are derived from plugins (see formToPolicy) and required plugins are
//    clamped to true regardless of the incoming policy.
function readFormFromPolicy(policy) {
  const enabled = Array.isArray(policy?.plugins?.enabled) ? policy.plugins.enabled : [];
  return {
    plugins: Object.fromEntries(
      PLUGIN_DESCRIPTORS.map((p) => [
        p.key,
        p.required ? true : enabled.includes(p.key),
      ])
    ),
  };
}

function formToPolicy(form) {
  const pluginsEnabled = PLUGIN_DESCRIPTORS
    .filter((p) => p.required || form.plugins[p.key])
    .map((p) => p.key);

  // Derive modules from plugins that imply one (e.g. scp → compliance).
  const modules = {};
  PLUGIN_DESCRIPTORS.forEach((p) => {
    if (p.impliesModule && pluginsEnabled.includes(p.key)) {
      modules[p.impliesModule] = true;
    }
  });

  return {
    modules,
    plugins: { enabled: pluginsEnabled },
  };
}

function isEmptyPolicy(policy) {
  if (!policy) return true;
  if (typeof policy !== "object") return true;
  const keys = Object.keys(policy);
  return keys.length === 0;
}

function formatJson(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "2-digit",
    month: "short",
    day: "2-digit",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortHash(hash) {
  if (!hash) return "—";
  const s = String(hash);
  return s.length > 14 ? `${s.slice(0, 10)}…${s.slice(-4)}` : s;
}

function renderAckChip(status, reasonText) {
  if (status === 0) {
    return (
      <Chip
        label="ACK OK"
        size="small"
        icon={<CheckCircleOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
        sx={{
          bgcolor: BRAND.tealSoft,
          color: BRAND.tealText,
          fontWeight: 700,
          border: `1px solid ${BRAND.teal}55`,
          "& .MuiChip-icon": { color: BRAND.tealText },
        }}
      />
    );
  }
  if (status == null) {
    return (
      <Chip
        label={reasonText || "Pending"}
        size="small"
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
  return (
    <Chip
      label={`ACK ERR ${status}`}
      size="small"
      icon={<ErrorOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
      sx={{
        bgcolor: "rgba(179,38,30,0.12)",
        color: "#b3261e",
        fontWeight: 700,
        border: "1px solid rgba(179,38,30,0.35)",
        "& .MuiChip-icon": { color: "#b3261e" },
      }}
    />
  );
}

function renderSourceChip(source) {
  const val = String(source || "").toLowerCase();
  if (val === "device") {
    return (
      <Chip
        label="Device override"
        size="small"
        sx={{
          bgcolor: BRAND.cyanSoft,
          color: BRAND.dark,
          fontWeight: 700,
          border: `1px solid ${BRAND.cyan}88`,
        }}
      />
    );
  }
  if (val === "tenant") {
    return (
      <Chip
        label="Tenant"
        size="small"
        sx={{
          bgcolor: BRAND.tealSoft,
          color: BRAND.tealText,
          fontWeight: 700,
          border: `1px solid ${BRAND.teal}55`,
        }}
      />
    );
  }
  return (
    <Chip
      label={source || "—"}
      size="small"
      sx={{ bgcolor: BRAND.darkSoft, color: BRAND.dark, fontWeight: 700 }}
    />
  );
}

// ── Shared UI pieces ────────────────────────────────────────────────────

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

function DetailRow({ label, value, mono = false }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "baseline" }}>
      <Typography
        sx={{
          fontSize: 12,
          color: "text.secondary",
          fontWeight: 600,
          minWidth: 96,
          textTransform: "uppercase",
          letterSpacing: 0.3,
          flexShrink: 0,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 13,
          color: BRAND.dark,
          fontFamily: mono ? "monospace" : "inherit",
          wordBreak: "break-all",
          flex: 1,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function JsonBlock({ value, maxHeight = 260 }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        bgcolor: BRAND.dark,
        color: "#e2e8f0",
        borderColor: BRAND.dark,
        overflow: "auto",
        maxHeight,
        fontFamily: "monospace",
        fontSize: 12,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {formatJson(value)}
    </Paper>
  );
}

// ── PolicyForm — module + plugin switches plus collapsible advanced JSON

function PolicyForm({ form, onChange, jsonDraft, setJsonDraft, jsonError, setJsonError, readOnly = false }) {
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  const handleTogglePlugin = (key) => (e) => {
    onChange({
      ...form,
      plugins: { ...form.plugins, [key]: e.target.checked },
    });
  };

  const handleJsonChange = (e) => {
    const value = e.target.value;
    setJsonDraft(value);
    try {
      const parsed = JSON.parse(value);
      setJsonError(null);
      onChange(readFormFromPolicy(parsed));
    } catch (err) {
      setJsonError(String(err?.message || err));
    }
  };

  return (
    <Box>
      <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
        Plugins
      </Typography>
      <Box sx={{ mt: 0.5, display: "grid", gap: 0.5 }}>
        {PLUGIN_DESCRIPTORS.map((p) => (
          <Box
            key={p.key}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1.5,
              p: 1.25,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 2,
              bgcolor: p.required ? BRAND.darkSoft : "#ffffff",
              flexWrap: "wrap",
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.dark }}>{p.label}</Typography>
                {p.required ? (
                  <Chip
                    label="Required"
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: 10,
                      fontWeight: 800,
                      bgcolor: BRAND.tealSoft,
                      color: BRAND.tealText,
                      border: `1px solid ${BRAND.teal}55`,
                    }}
                  />
                ) : null}
              </Box>
              <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{p.description}</Typography>
            </Box>
            <Switch
              checked={p.required ? true : Boolean(form.plugins[p.key])}
              onChange={handleTogglePlugin(p.key)}
              disabled={readOnly || p.required}
              sx={{
                "& .MuiSwitch-switchBase.Mui-checked": { color: BRAND.teal },
                "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { backgroundColor: BRAND.teal },
              }}
            />
          </Box>
        ))}
      </Box>

      <Box sx={{ mt: 2 }}>
        <Button
          size="small"
          onClick={() => setAdvancedOpen((v) => !v)}
          startIcon={<CodeOutlinedIcon />}
          endIcon={advancedOpen ? <ExpandLessOutlinedIcon /> : <ExpandMoreOutlinedIcon />}
          sx={{ textTransform: "none", color: BRAND.dark, fontWeight: 600 }}
        >
          {advancedOpen ? "Hide JSON editor" : "Advanced: edit raw JSON"}
        </Button>
        <Collapse in={advancedOpen} unmountOnExit>
          <TextField
            multiline
            minRows={10}
            fullWidth
            value={jsonDraft}
            onChange={handleJsonChange}
            disabled={readOnly}
            error={Boolean(jsonError)}
            helperText={jsonError || "Preserves unknown keys. Saved value replaces the policy on the server."}
            sx={{
              mt: 1,
              "& .MuiInputBase-root": {
                fontFamily: "monospace",
                fontSize: 12.5,
                bgcolor: "#ffffff",
              },
            }}
          />
        </Collapse>
      </Box>
    </Box>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export default function Policies() {
  const theme = useTheme();
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));
  const { auth } = useAuthContext();

  const tenantId = auth?.tenantId;
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;
  const canManage = isActiveMember && (tenantRole === "ADMIN" || tenantRole === "OWNER");

  const [tab, setTab] = React.useState("tenant");

  // Shared
  const [devices, setDevices] = React.useState([]); // [{deviceId, hostname, connected, agentVersion}]
  const [snackbar, setSnackbar] = React.useState({ open: false, message: "", severity: "success" });

  // Tenant state
  const [tenantPolicy, setTenantPolicy] = React.useState(null);
  const [tenantForm, setTenantForm] = React.useState(readFormFromPolicy({}));
  const [tenantJsonDraft, setTenantJsonDraft] = React.useState("{}");
  const [tenantJsonError, setTenantJsonError] = React.useState(null);
  const [tenantStatus, setTenantStatus] = React.useState([]);
  const [tenantLoading, setTenantLoading] = React.useState(true);
  const [tenantSaving, setTenantSaving] = React.useState(false);
  const [tenantPushing, setTenantPushing] = React.useState(false);

  // Device state
  const [selectedDeviceId, setSelectedDeviceId] = React.useState("");
  const [devicePolicy, setDevicePolicy] = React.useState(null); // raw override or null
  const [deviceForm, setDeviceForm] = React.useState(readFormFromPolicy({}));
  const [deviceJsonDraft, setDeviceJsonDraft] = React.useState("{}");
  const [deviceJsonError, setDeviceJsonError] = React.useState(null);
  const [effective, setEffective] = React.useState(null);
  const [deviceStatus, setDeviceStatus] = React.useState(null);
  const [deviceLoading, setDeviceLoading] = React.useState(false);
  const [deviceSaving, setDeviceSaving] = React.useState(false);
  const [devicePushing, setDevicePushing] = React.useState(false);
  const [deviceDeleting, setDeviceDeleting] = React.useState(false);

  const showSnack = React.useCallback((message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  }, []);

  // ── Load tenant policy + status + device list ──────────────────────────
  const loadTenant = React.useCallback(async () => {
    if (!canManage || !tenantId) return;
    try {
      setTenantLoading(true);
      const [policyRes, statusRes, devicesRes] = await Promise.all([
        getTenantPolicy(tenantId).catch(() => null),
        listTenantPolicyStatus(tenantId).catch(() => ({ items: [] })),
        listKnownDevices().catch(() => ({ items: [] })),
      ]);

      const policy = policyRes?.policy ?? policyRes?.policyJson ?? policyRes ?? {};
      setTenantPolicy(policyRes ?? null);
      setTenantForm(readFormFromPolicy(policy));
      setTenantJsonDraft(formatJson(policy));
      setTenantJsonError(null);

      const statusItems = Array.isArray(statusRes?.items) ? statusRes.items : [];
      setTenantStatus(statusItems);

      const deviceItems = Array.isArray(devicesRes?.items) ? devicesRes.items : [];
      const normalized = deviceItems
        .map((d) => ({
          deviceId: String(d?.deviceId || "").trim(),
          hostname: String(d?.hostname || "").trim() || String(d?.deviceId || "").trim(),
          connected: d?.connected === true,
          agentVersion: d?.agentVersion ?? null,
        }))
        .filter((d) => d.deviceId);
      setDevices(normalized);
      setSelectedDeviceId((current) => {
        if (current && normalized.some((d) => d.deviceId === current)) return current;
        return normalized[0]?.deviceId || "";
      });
    } catch (e) {
      console.error(e);
      showSnack("Failed to load tenant policy", "error");
    } finally {
      setTenantLoading(false);
    }
  }, [canManage, tenantId, showSnack]);

  // ── Load device override + effective + status ──────────────────────────
  const loadDevice = React.useCallback(async (deviceId) => {
    if (!canManage || !deviceId) {
      setDevicePolicy(null);
      setEffective(null);
      setDeviceStatus(null);
      return;
    }
    try {
      setDeviceLoading(true);
      const [overrideRes, effectiveRes, statusRes] = await Promise.all([
        getDevicePolicy(deviceId).catch(() => null),
        getEffectivePolicy(deviceId).catch(() => null),
        getDevicePolicyStatus(deviceId).catch(() => null),
      ]);

      const overridePolicy =
        overrideRes?.policy ?? overrideRes?.policyJson ?? (overrideRes === null ? null : overrideRes);
      setDevicePolicy(overrideRes ?? null);
      setDeviceForm(readFormFromPolicy(overridePolicy || {}));
      setDeviceJsonDraft(formatJson(overridePolicy || {}));
      setDeviceJsonError(null);
      setEffective(effectiveRes ?? null);
      setDeviceStatus(statusRes ?? null);
    } catch (e) {
      console.error(e);
      showSnack("Failed to load device policy", "error");
    } finally {
      setDeviceLoading(false);
    }
  }, [canManage, showSnack]);

  React.useEffect(() => {
    loadTenant();
  }, [loadTenant]);

  React.useEffect(() => {
    loadDevice(selectedDeviceId);
  }, [selectedDeviceId, loadDevice]);

  // ── Actions ────────────────────────────────────────────────────────────
  const handleSaveTenant = async () => {
    if (!canManage || !tenantId) return;
    if (tenantJsonError) {
      showSnack("Fix JSON errors before saving", "error");
      return;
    }
    try {
      setTenantSaving(true);
      const policy = formToPolicy(tenantForm);
      await saveTenantPolicy(tenantId, policy);
      showSnack("Tenant policy saved", "success");
      await loadTenant();
    } catch (e) {
      console.error(e);
      showSnack("Failed to save tenant policy", "error");
    } finally {
      setTenantSaving(false);
    }
  };

  const handlePushTenant = async () => {
    if (!canManage || !tenantId) return;
    if (!window.confirm("Push the current tenant policy to every connected device?")) return;
    try {
      setTenantPushing(true);
      const res = await pushTenantPolicy(tenantId);
      showSnack(`Tenant policy dispatched to ${res?.dispatched ?? "all"} devices`, "success");
      await loadTenant();
    } catch (e) {
      console.error(e);
      showSnack("Failed to push tenant policy", "error");
    } finally {
      setTenantPushing(false);
    }
  };

  const handleSaveDevice = async () => {
    if (!canManage || !selectedDeviceId) return;
    if (deviceJsonError) {
      showSnack("Fix JSON errors before saving", "error");
      return;
    }
    try {
      setDeviceSaving(true);
      const policy = formToPolicy(deviceForm);
      await saveDevicePolicy(selectedDeviceId, policy);
      showSnack("Device override saved", "success");
      await loadDevice(selectedDeviceId);
    } catch (e) {
      console.error(e);
      showSnack("Failed to save device override", "error");
    } finally {
      setDeviceSaving(false);
    }
  };

  const handlePushDevice = async () => {
    if (!canManage || !selectedDeviceId) return;
    try {
      setDevicePushing(true);
      await pushDevicePolicy(selectedDeviceId);
      showSnack("Policy dispatched to device", "success");
      await loadDevice(selectedDeviceId);
    } catch (e) {
      console.error(e);
      showSnack("Failed to push device policy", "error");
    } finally {
      setDevicePushing(false);
    }
  };

  const handleDeleteDevice = async () => {
    if (!canManage || !selectedDeviceId) return;
    if (!window.confirm("Remove the override? Device will fall back to tenant policy.")) return;
    try {
      setDeviceDeleting(true);
      await deleteDevicePolicy(selectedDeviceId);
      showSnack("Device override removed", "success");
      await loadDevice(selectedDeviceId);
    } catch (e) {
      console.error(e);
      showSnack("Failed to remove device override", "error");
    } finally {
      setDeviceDeleting(false);
    }
  };

  const handleSwitchToDevice = (deviceId) => {
    setSelectedDeviceId(deviceId);
    setTab("device");
  };

  // ── Derived summary ────────────────────────────────────────────────────
  const deviceMap = React.useMemo(
    () => new Map(devices.map((d) => [d.deviceId, d])),
    [devices]
  );

  const summary = React.useMemo(() => {
    const total = tenantStatus.length;
    const acked = tenantStatus.filter((s) => s.last_ack_status === 0).length;
    const pending = tenantStatus.filter(
      (s) => s.last_ack_status == null && s.last_sent_policy_version
    ).length;
    const errors = tenantStatus.filter(
      (s) => s.last_ack_status != null && s.last_ack_status !== 0
    ).length;
    return { total, acked, pending, errors };
  }, [tenantStatus]);

  const tenantVersion = tenantPolicy?.version ?? tenantPolicy?.policyVersion ?? "—";
  const tenantHash = tenantPolicy?.hash ?? tenantPolicy?.policyHash ?? null;
  const tenantUpdatedAt = tenantPolicy?.updatedAt ?? tenantPolicy?.updated_at;

  const deviceVersion = devicePolicy?.version ?? devicePolicy?.policyVersion ?? null;
  const deviceHash = devicePolicy?.hash ?? devicePolicy?.policyHash ?? null;
  const deviceUpdatedAt = devicePolicy?.updatedAt ?? devicePolicy?.updated_at;

  const effectivePolicyJson =
    effective?.policyJson ?? effective?.policy_json ?? effective?.policy ?? {};
  const effectiveSource = effective?.source;
  const effectiveVersion = effective?.policyVersion ?? effective?.policy_version;

  const hasOverride = !isEmptyPolicy(devicePolicy?.policy ?? devicePolicy?.policyJson ?? devicePolicy);

  // ── Rollout table columns ──────────────────────────────────────────────
  const statusColumns = [
    {
      field: "device_id",
      headerName: "Device",
      minWidth: 200,
      flex: 1,
      valueGetter: (_v, row) => deviceMap.get(row.device_id)?.hostname || row.device_id,
    },
    {
      field: "desired_policy_source",
      headerName: "Source",
      minWidth: 140,
      flex: 0.5,
      renderCell: (params) => renderSourceChip(params.value),
    },
    {
      field: "desired_policy_version",
      headerName: "Desired",
      minWidth: 110,
      flex: 0.4,
      valueGetter: (_v, row) => row.desired_policy_version || "—",
    },
    {
      field: "last_sent_policy_version",
      headerName: "Sent",
      minWidth: 110,
      flex: 0.4,
      valueGetter: (_v, row) => row.last_sent_policy_version || "—",
    },
    {
      field: "last_ack_status",
      headerName: "ACK",
      minWidth: 130,
      flex: 0.5,
      renderCell: (params) => renderAckChip(params.row.last_ack_status, null),
    },
    {
      field: "last_ack_at",
      headerName: "ACK At",
      minWidth: 140,
      flex: 0.5,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "last_ack_message",
      headerName: "Message",
      minWidth: 220,
      flex: 1,
      valueGetter: (_v, row) => row.last_ack_message || "—",
    },
  ];

  const columnVisibilityModel = React.useMemo(() => {
    if (isSmDown) {
      return { last_ack_at: false, last_ack_message: false, desired_policy_version: false };
    }
    return {};
  }, [isSmDown]);

  if (!canManage) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          Policy management is restricted to active tenant admins and owners.
        </Alert>
      </Box>
    );
  }

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
            Policies
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.25 }}>
            Configure tenant-wide behavior and fine-tune individual devices with overrides.
          </Typography>
        </Box>

        <Button
          variant="outlined"
          startIcon={<RefreshOutlinedIcon />}
          onClick={() => {
            loadTenant();
            if (selectedDeviceId) loadDevice(selectedDeviceId);
          }}
          disabled={tenantLoading}
          sx={{
            textTransform: "none",
            fontWeight: 700,
            borderColor: BRAND.teal,
            color: BRAND.teal,
            "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
          }}
        >
          {tenantLoading ? "Loading…" : "Refresh"}
        </Button>
      </Box>

      {/* Summary cards */}
      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              title="Devices tracked"
              value={summary.total}
              icon={<AssignmentOutlinedIcon />}
              accent={BRAND.dark}
              tint={BRAND.darkSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              title="ACK OK"
              value={summary.acked}
              icon={<CheckCircleOutlineOutlinedIcon />}
              accent={BRAND.tealText}
              tint={BRAND.tealSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              title="Pending ACK"
              value={summary.pending}
              icon={<HourglassEmptyOutlinedIcon />}
              accent="#8b5418"
              tint="rgba(199,121,43,0.14)"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              title="ACK errors"
              value={summary.errors}
              icon={<ErrorOutlineOutlinedIcon />}
              accent="#b3261e"
              tint="rgba(179,38,30,0.12)"
            />
          </Grid>
        </Grid>
      </Box>

      {/* Tabs */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: `1px solid ${BRAND.border}`,
          boxShadow: BRAND.shadow,
          overflow: "hidden",
          mb: 2,
        }}
      >
        <Tabs
          value={tab}
          onChange={(_e, next) => setTab(next)}
          sx={{
            borderBottom: `1px solid ${BRAND.border}`,
            bgcolor: BRAND.darkSoft,
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 700,
              color: BRAND.dark,
              minHeight: 48,
              outline: "none",
              "&:focus, &:focus-visible": {
                outline: "none",
                boxShadow: "none",
              },
              "&.Mui-focusVisible": {
                backgroundColor: BRAND.cyanSoft,
              },
            },
            "& .Mui-selected": { color: `${BRAND.teal} !important` },
            "& .MuiTabs-indicator": { backgroundColor: BRAND.teal, height: 3 },
          }}
        >
          <Tab value="tenant" label="Tenant Policy" icon={<TuneOutlinedIcon />} iconPosition="start" sx={{ gap: 0.75 }} />
          <Tab value="device" label="Device Overrides" icon={<AccountTreeOutlinedIcon />} iconPosition="start" sx={{ gap: 0.75 }} />
        </Tabs>

        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
          {tab === "tenant" ? (
            <TenantTab
              tenantForm={tenantForm}
              setTenantForm={setTenantForm}
              tenantJsonDraft={tenantJsonDraft}
              setTenantJsonDraft={setTenantJsonDraft}
              tenantJsonError={tenantJsonError}
              setTenantJsonError={setTenantJsonError}
              tenantVersion={tenantVersion}
              tenantHash={tenantHash}
              tenantUpdatedAt={tenantUpdatedAt}
              tenantSaving={tenantSaving}
              tenantPushing={tenantPushing}
              onSave={handleSaveTenant}
              onPush={handlePushTenant}
              tenantStatus={tenantStatus}
              statusColumns={statusColumns}
              columnVisibilityModel={columnVisibilityModel}
              onRowClick={(row) => handleSwitchToDevice(row.device_id)}
              loading={tenantLoading}
            />
          ) : (
            <DeviceTab
              devices={devices}
              selectedDeviceId={selectedDeviceId}
              setSelectedDeviceId={setSelectedDeviceId}
              deviceMap={deviceMap}
              hasOverride={hasOverride}
              deviceForm={deviceForm}
              setDeviceForm={setDeviceForm}
              deviceJsonDraft={deviceJsonDraft}
              setDeviceJsonDraft={setDeviceJsonDraft}
              deviceJsonError={deviceJsonError}
              setDeviceJsonError={setDeviceJsonError}
              deviceVersion={deviceVersion}
              deviceHash={deviceHash}
              deviceUpdatedAt={deviceUpdatedAt}
              effectivePolicyJson={effectivePolicyJson}
              effectiveSource={effectiveSource}
              effectiveVersion={effectiveVersion}
              deviceStatus={deviceStatus}
              deviceSaving={deviceSaving}
              devicePushing={devicePushing}
              deviceDeleting={deviceDeleting}
              loading={deviceLoading}
              onSave={handleSaveDevice}
              onPush={handlePushDevice}
              onDelete={handleDeleteDevice}
            />
          )}
        </Box>
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ── Tenant tab ──────────────────────────────────────────────────────────

function TenantTab(props) {
  const {
    tenantForm, setTenantForm,
    tenantJsonDraft, setTenantJsonDraft,
    tenantJsonError, setTenantJsonError,
    tenantVersion, tenantHash, tenantUpdatedAt,
    tenantSaving, tenantPushing, onSave, onPush,
    tenantStatus, statusColumns, columnVisibilityModel, onRowClick,
    loading,
  } = props;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, lg: 5 }}>
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
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.dark }}>
              Tenant policy
            </Typography>
          </Box>

          <Box sx={{ display: "grid", gap: 0.5, mb: 2 }}>
            <DetailRow label="Version" value={tenantVersion} mono />
            <DetailRow label="Hash" value={shortHash(tenantHash)} mono />
            <DetailRow label="Updated" value={formatDate(tenantUpdatedAt)} />
          </Box>

          <Divider sx={{ borderColor: BRAND.border, mb: 2 }} />

          <PolicyForm
            form={tenantForm}
            onChange={setTenantForm}
            jsonDraft={tenantJsonDraft}
            setJsonDraft={setTenantJsonDraft}
            jsonError={tenantJsonError}
            setJsonError={setTenantJsonError}
          />

          <Box sx={{ mt: 2.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              startIcon={<SaveOutlinedIcon />}
              onClick={onSave}
              disabled={tenantSaving || Boolean(tenantJsonError)}
              sx={{
                bgcolor: BRAND.teal,
                color: "#fff",
                fontWeight: 700,
                textTransform: "none",
                "&:hover": { bgcolor: BRAND.tealHover },
              }}
            >
              {tenantSaving ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="outlined"
              startIcon={<SendOutlinedIcon />}
              onClick={onPush}
              disabled={tenantPushing}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderColor: BRAND.teal,
                color: BRAND.teal,
                "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
              }}
            >
              {tenantPushing ? "Pushing…" : "Push to all"}
            </Button>
          </Box>
        </Paper>
      </Grid>

      <Grid size={{ xs: 12, lg: 7 }}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 1.5, sm: 2 },
            borderRadius: 3,
            border: `1px solid ${BRAND.border}`,
            boxShadow: BRAND.shadow,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5, flexWrap: "wrap", gap: 1 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.dark }}>
              Rollout status
            </Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {tenantStatus.length} devices tracked · click a row to edit override
            </Typography>
          </Box>

          <Box sx={{ width: "100%", overflowX: "auto" }}>
            <DataGrid
              autoHeight
              disableRowSelectionOnClick
              rows={tenantStatus}
              columns={statusColumns}
              loading={loading}
              getRowId={(row) => row.device_id}
              onRowClick={(params) => onRowClick?.(params.row)}
              columnVisibilityModel={columnVisibilityModel}
              pageSizeOptions={[10, 25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
              sx={{
                border: "none",
                "& .MuiDataGrid-columnHeaders": {
                  backgroundColor: BRAND.darkSoft,
                  color: BRAND.dark,
                  fontWeight: 700,
                  borderBottom: `1px solid ${BRAND.border}`,
                },
                "& .MuiDataGrid-row": { cursor: "pointer" },
                "& .MuiDataGrid-row:hover": { backgroundColor: BRAND.rowHover },
                "& .MuiDataGrid-cell": { borderBottom: `1px solid ${BRAND.border}` },
                "& .MuiDataGrid-footerContainer": { borderTop: `1px solid ${BRAND.border}` },
              }}
            />
          </Box>
        </Paper>
      </Grid>
    </Grid>
  );
}

// ── Device tab ──────────────────────────────────────────────────────────

function DeviceTab(props) {
  const {
    devices, selectedDeviceId, setSelectedDeviceId, deviceMap,
    hasOverride,
    deviceForm, setDeviceForm,
    deviceJsonDraft, setDeviceJsonDraft,
    deviceJsonError, setDeviceJsonError,
    deviceVersion, deviceHash, deviceUpdatedAt,
    effectivePolicyJson, effectiveSource, effectiveVersion,
    deviceStatus,
    deviceSaving, devicePushing, deviceDeleting, loading,
    onSave, onPush, onDelete,
  } = props;

  const selectedDevice = selectedDeviceId ? deviceMap.get(selectedDeviceId) : null;

  return (
    <Box>
      {/* Device selector */}
      <Box sx={{ mb: 2 }}>
        <TextField
          select
          label="Device"
          size="small"
          value={selectedDeviceId}
          onChange={(e) => setSelectedDeviceId(e.target.value)}
          fullWidth
          helperText={
            selectedDevice
              ? `${selectedDevice.connected ? "Connected" : "Offline"} · agent ${selectedDevice.agentVersion || "unknown"}`
              : `${devices.length} devices known`
          }
        >
          {devices.length === 0 ? (
            <MenuItem value="">No devices available</MenuItem>
          ) : (
            devices.map((d) => (
              <MenuItem key={d.deviceId} value={d.deviceId}>
                {d.hostname}
                {d.hostname !== d.deviceId ? ` · ${d.deviceId}` : ""}
                {d.connected ? " · online" : " · offline"}
              </MenuItem>
            ))
          )}
        </TextField>
      </Box>

      {!selectedDeviceId ? (
        <Paper
          variant="outlined"
          sx={{
            p: 3,
            borderRadius: 2,
            borderColor: BRAND.border,
            borderStyle: "dashed",
            bgcolor: BRAND.darkSoft,
            textAlign: "center",
            color: "text.secondary",
          }}
        >
          <InfoOutlinedIcon sx={{ fontSize: 32, color: BRAND.gray, mb: 1 }} />
          <Typography variant="body2">Select a device to inspect and edit its override.</Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {/* Override editor */}
          <Grid size={{ xs: 12, lg: 6 }}>
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
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.dark }}>
                  Device override
                </Typography>
                {hasOverride ? (
                  <Chip
                    label="Override active"
                    size="small"
                    sx={{
                      bgcolor: BRAND.cyanSoft,
                      color: BRAND.dark,
                      fontWeight: 700,
                      border: `1px solid ${BRAND.cyan}88`,
                    }}
                  />
                ) : (
                  <Chip
                    label="No override"
                    size="small"
                    sx={{
                      bgcolor: BRAND.darkSoft,
                      color: BRAND.dark,
                      fontWeight: 700,
                      border: `1px solid ${BRAND.border}`,
                    }}
                  />
                )}
              </Box>

              <Box sx={{ display: "grid", gap: 0.5, mb: 2 }}>
                <DetailRow label="Version" value={deviceVersion || "—"} mono />
                <DetailRow label="Hash" value={shortHash(deviceHash)} mono />
                <DetailRow label="Updated" value={formatDate(deviceUpdatedAt)} />
              </Box>

              <Divider sx={{ borderColor: BRAND.border, mb: 2 }} />

              <PolicyForm
                form={deviceForm}
                onChange={setDeviceForm}
                jsonDraft={deviceJsonDraft}
                setJsonDraft={setDeviceJsonDraft}
                jsonError={deviceJsonError}
                setJsonError={setDeviceJsonError}
              />

              <Box sx={{ mt: 2.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  variant="contained"
                  startIcon={<SaveOutlinedIcon />}
                  onClick={onSave}
                  disabled={deviceSaving || Boolean(deviceJsonError) || loading}
                  sx={{
                    bgcolor: BRAND.teal,
                    color: "#fff",
                    fontWeight: 700,
                    textTransform: "none",
                    "&:hover": { bgcolor: BRAND.tealHover },
                  }}
                >
                  {deviceSaving ? "Saving…" : hasOverride ? "Update override" : "Create override"}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<SendOutlinedIcon />}
                  onClick={onPush}
                  disabled={devicePushing || loading}
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    borderColor: BRAND.teal,
                    color: BRAND.teal,
                    "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
                  }}
                >
                  {devicePushing ? "Pushing…" : "Push"}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlineOutlinedIcon />}
                  onClick={onDelete}
                  disabled={deviceDeleting || !hasOverride || loading}
                  sx={{ textTransform: "none", fontWeight: 700 }}
                >
                  {deviceDeleting ? "Removing…" : "Remove override"}
                </Button>
              </Box>
            </Paper>
          </Grid>

          {/* Effective + status */}
          <Grid size={{ xs: 12, lg: 6 }}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 1.5, sm: 2 },
                borderRadius: 3,
                border: `1px solid ${BRAND.border}`,
                boxShadow: BRAND.shadow,
                minWidth: 0,
                mb: 2,
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.dark }}>
                  Effective policy
                </Typography>
                {renderSourceChip(effectiveSource)}
              </Box>
              <Box sx={{ display: "grid", gap: 0.5, mb: 1 }}>
                <DetailRow label="Version" value={effectiveVersion || "—"} mono />
              </Box>
              <JsonBlock value={effectivePolicyJson} maxHeight={220} />
            </Paper>

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
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.dark }}>
                  Sync status
                </Typography>
                {deviceStatus ? renderAckChip(deviceStatus.last_ack_status, null) : null}
              </Box>
              {deviceStatus ? (
                <Box sx={{ display: "grid", gap: 0.5 }}>
                  <DetailRow label="Desired" value={deviceStatus.desired_policy_version || "—"} mono />
                  <DetailRow label="Source" value={deviceStatus.desired_policy_source || "—"} />
                  <DetailRow label="Last sent" value={deviceStatus.last_sent_policy_version || "—"} mono />
                  <DetailRow label="Sent at" value={formatDate(deviceStatus.last_sent_at)} />
                  <DetailRow label="ACK version" value={deviceStatus.last_ack_policy_version || "—"} mono />
                  <DetailRow label="ACK at" value={formatDate(deviceStatus.last_ack_at)} />
                  <DetailRow label="Message" value={deviceStatus.last_ack_message || "—"} />
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No sync activity recorded yet for this device.
                </Typography>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
