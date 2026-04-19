import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Paper,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import PublishOutlinedIcon from "@mui/icons-material/PublishOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import { DataGrid } from "@mui/x-data-grid";

import { useAuthContext } from "../auth/AuthContext";
import {
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
import { listDeviceCertDevices } from "../api/deviceCerts";

function SummaryCard({ title, value, accent = "#1ba6a6" }) {
  return (
    <Paper
      sx={{
        p: 2,
        minHeight: 104,
        borderRadius: 3,
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{title}</Typography>
      <Typography
        sx={{
          fontSize: 28,
          fontWeight: 800,
          color: accent,
          lineHeight: 1.1,
          mt: 1,
        }}
      >
        {value}
      </Typography>
    </Paper>
  );
}

function createPolicyFromForm(form) {
  return {
    modules: {
      compliance: Boolean(form.complianceEnabled),
    },
    plugins: {
      enabled: [
        ...(form.ampEnabled ? ["amp"] : []),
        ...(form.scpEnabled ? ["scp"] : []),
      ],
    },
  };
}

function readFormFromPolicy(policy) {
  const enabled = Array.isArray(policy?.plugins?.enabled) ? policy.plugins.enabled : [];
  return {
    complianceEnabled: Boolean(policy?.modules?.compliance),
    ampEnabled: enabled.includes("amp"),
    scpEnabled: enabled.includes("scp"),
  };
}

function formatJson(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

function formatDate(value) {
  if (!value) return " - ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return " - ";
  return date.toLocaleString("en-US", {
    year: "2-digit",
    month: "short",
    day: "2-digit",
    hourCycle: "h24",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderAckChip(status) {
  if (status === 0) {
    return (
      <Chip
        label="ACK OK"
        size="small"
        sx={{ bgcolor: "rgba(27,166,166,0.12)", color: "#0f6b72", fontWeight: 700 }}
      />
    );
  }

  if (status === 1) {
    return (
      <Chip
        label="ACK Retry"
        size="small"
        sx={{ bgcolor: "rgba(255,152,0,0.14)", color: "#9a6700", fontWeight: 700 }}
      />
    );
  }

  if (status === 2) {
    return (
      <Chip
        label="ACK Failed"
        size="small"
        sx={{ bgcolor: "rgba(211,47,47,0.12)", color: "#b3261e", fontWeight: 700 }}
      />
    );
  }

  return <Chip label="Pending" size="small" />;
}

function PolicyEditorCard({
  title,
  subtitle,
  form,
  onChange,
  onSave,
  onPush,
  saving,
  pushing,
  version,
  hash,
}) {
  const preview = React.useMemo(() => createPolicyFromForm(form), [form]);

  return (
    <Paper
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
      }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        </Box>

        <Stack spacing={1}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Modules
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={form.complianceEnabled}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    complianceEnabled: event.target.checked,
                  }))
                }
              />
            }
            label="modules.compliance"
          />
        </Stack>

        <Stack spacing={1}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Plugins
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={form.ampEnabled}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    ampEnabled: event.target.checked,
                  }))
                }
              />
            }
            label='plugins.enabled includes "amp"'
          />
          <FormControlLabel
            control={
              <Switch
                checked={form.scpEnabled}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    scpEnabled: event.target.checked,
                  }))
                }
              />
            }
            label='plugins.enabled includes "scp"'
          />
        </Stack>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Button
            variant="contained"
            startIcon={<SaveOutlinedIcon />}
            onClick={onSave}
            disabled={saving}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              bgcolor: "#16324f",
              "&:hover": { bgcolor: "#10253b" },
            }}
          >
            {saving ? "Saving..." : "Save Policy"}
          </Button>
          <Button
            variant="outlined"
            startIcon={<SendOutlinedIcon />}
            onClick={onPush}
            disabled={pushing}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            {pushing ? "Pushing..." : "Push Now"}
          </Button>
        </Stack>

        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Preview
          </Typography>
          <TextField
            value={formatJson(preview)}
            multiline
            minRows={7}
            fullWidth
            InputProps={{
              readOnly: true,
              sx: {
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                alignItems: "flex-start",
              },
            }}
          />
        </Box>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Chip label={`Version: ${version || " - "}`} variant="outlined" />
          <Chip label={`Hash: ${hash || " - "}`} variant="outlined" />
        </Stack>
      </Stack>
    </Paper>
  );
}

export default function Policies() {
  const theme = useTheme();
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const { auth } = useAuthContext();

  const tenantId = auth?.tenantId;
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;
  const canManagePolicies = isActiveMember && (tenantRole === "ADMIN" || tenantRole === "OWNER");

  const [tenantForm, setTenantForm] = React.useState({
    complianceEnabled: false,
    ampEnabled: true,
    scpEnabled: false,
  });
  const [deviceForm, setDeviceForm] = React.useState({
    complianceEnabled: false,
    ampEnabled: true,
    scpEnabled: false,
  });

  const [tenantPolicyMeta, setTenantPolicyMeta] = React.useState({ version: "", hash: "" });
  const [devicePolicyMeta, setDevicePolicyMeta] = React.useState({ version: "", hash: "" });
  const [effectivePolicy, setEffectivePolicy] = React.useState(null);
  const [deviceStatus, setDeviceStatus] = React.useState(null);
  const [tenantStatuses, setTenantStatuses] = React.useState([]);
  const [devices, setDevices] = React.useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState("");
  const [deviceSearch, setDeviceSearch] = React.useState("");

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [tenantSaving, setTenantSaving] = React.useState(false);
  const [tenantPushing, setTenantPushing] = React.useState(false);
  const [deviceSaving, setDeviceSaving] = React.useState(false);
  const [devicePushing, setDevicePushing] = React.useState(false);

  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });

  const deferredDeviceSearch = React.useDeferredValue(deviceSearch);

  const showMessage = React.useCallback((message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  }, []);

  const loadTenantState = React.useCallback(async () => {
    if (!canManagePolicies || !tenantId) return;

    const [tenantPolicyResponse, tenantStatusResponse, deviceListResponse] = await Promise.all([
      getTenantPolicy(tenantId),
      listTenantPolicyStatus(tenantId),
      listDeviceCertDevices({
        search: deferredDeviceSearch || undefined,
        page: 1,
        pageSize: 50,
      }),
    ]);

    const tenantPolicy = tenantPolicyResponse?.policy ?? null;
    if (tenantPolicy) {
      setTenantForm(readFormFromPolicy(tenantPolicy.policy_json ?? tenantPolicy.policyJson ?? {}));
      setTenantPolicyMeta({
        version: tenantPolicy.policy_version ?? tenantPolicy.policyVersion ?? "",
        hash: tenantPolicy.policy_hash ?? tenantPolicy.policyHash ?? "",
      });
    } else {
      setTenantForm({
        complianceEnabled: false,
        ampEnabled: true,
        scpEnabled: false,
      });
      setTenantPolicyMeta({ version: "", hash: "" });
    }

    setTenantStatuses(Array.isArray(tenantStatusResponse?.items) ? tenantStatusResponse.items : []);

    const deviceItems = Array.isArray(deviceListResponse?.items) ? deviceListResponse.items : [];
    setDevices(deviceItems);
    setSelectedDeviceId((current) => {
      if (current && deviceItems.some((item) => item.deviceId === current)) return current;
      return deviceItems[0]?.deviceId || current || "";
    });
  }, [canManagePolicies, deferredDeviceSearch, tenantId]);

  const loadDeviceState = React.useCallback(async () => {
    if (!canManagePolicies || !selectedDeviceId) {
      setEffectivePolicy(null);
      setDeviceStatus(null);
      setDevicePolicyMeta({ version: "", hash: "" });
      return;
    }

    const [devicePolicyResponse, effectiveResponse, statusResponse] = await Promise.all([
      getDevicePolicy(selectedDeviceId),
      getEffectivePolicy(selectedDeviceId),
      getDevicePolicyStatus(selectedDeviceId),
    ]);

    const devicePolicy = devicePolicyResponse?.policy ?? null;
    if (devicePolicy) {
      setDeviceForm(readFormFromPolicy(devicePolicy.policy_json ?? devicePolicy.policyJson ?? {}));
      setDevicePolicyMeta({
        version: devicePolicy.policy_version ?? devicePolicy.policyVersion ?? "",
        hash: devicePolicy.policy_hash ?? devicePolicy.policyHash ?? "",
      });
    } else {
      setDeviceForm({
        complianceEnabled: false,
        ampEnabled: true,
        scpEnabled: false,
      });
      setDevicePolicyMeta({ version: "", hash: "" });
    }

    setEffectivePolicy(effectiveResponse?.policy ?? null);
    setDeviceStatus(statusResponse?.status ?? null);
  }, [canManagePolicies, selectedDeviceId]);

  const refreshAll = React.useCallback(async () => {
    if (!canManagePolicies || !tenantId) return;

    try {
      setRefreshing(true);
      await loadTenantState();
      await loadDeviceState();
    } catch (error) {
      console.error(error);
      showMessage("Failed to load policies", "error");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [canManagePolicies, loadDeviceState, loadTenantState, showMessage, tenantId]);

  React.useEffect(() => {
    if (!canManagePolicies) {
      setLoading(false);
      return;
    }

    refreshAll();
  }, [canManagePolicies, refreshAll]);

  React.useEffect(() => {
    if (!canManagePolicies) return;
    loadTenantState().catch((error) => {
      console.error(error);
      showMessage("Failed to refresh policy inventory", "error");
    });
  }, [canManagePolicies, loadTenantState, showMessage]);

  React.useEffect(() => {
    if (!canManagePolicies) return;
    loadDeviceState().catch((error) => {
      console.error(error);
      showMessage("Failed to load device policy state", "error");
    });
  }, [canManagePolicies, loadDeviceState, showMessage]);

  const summary = React.useMemo(() => {
    const total = tenantStatuses.length;
    const ackOk = tenantStatuses.filter((item) => Number(item.last_ack_status) === 0).length;
    const drift = tenantStatuses.filter(
      (item) =>
        item.desired_policy_version &&
        item.last_ack_policy_version &&
        String(item.desired_policy_version) !== String(item.last_ack_policy_version)
    ).length;
    const pending = tenantStatuses.filter(
      (item) => item.desired_policy_version && !item.last_ack_policy_version
    ).length;

    return { total, ackOk, drift, pending };
  }, [tenantStatuses]);

  const policyStatusRows = React.useMemo(() => {
    return tenantStatuses.map((row) => ({
      id: row.device_id,
      deviceId: row.device_id,
      desiredPolicyVersion: row.desired_policy_version,
      desiredPolicySource: row.desired_policy_source,
      lastSentPolicyVersion: row.last_sent_policy_version,
      lastAckPolicyVersion: row.last_ack_policy_version,
      lastAckStatus: row.last_ack_status,
      lastAckMessage: row.last_ack_message,
      lastAckAt: row.last_ack_at,
      updatedAt: row.updated_at,
    }));
  }, [tenantStatuses]);

  const statusColumns = React.useMemo(
    () => [
      { field: "deviceId", headerName: "Device ID", minWidth: 220, flex: 1.2 },
      { field: "desiredPolicyVersion", headerName: "Desired", minWidth: 140, flex: 0.8 },
      { field: "desiredPolicySource", headerName: "Source", minWidth: 120, flex: 0.6 },
      { field: "lastSentPolicyVersion", headerName: "Last Sent", minWidth: 140, flex: 0.8 },
      { field: "lastAckPolicyVersion", headerName: "Last ACK", minWidth: 140, flex: 0.8 },
      {
        field: "lastAckStatus",
        headerName: "ACK Status",
        minWidth: 140,
        flex: 0.8,
        renderCell: (params) => renderAckChip(params.value),
      },
      { field: "lastAckMessage", headerName: "ACK Message", minWidth: 220, flex: 1.2 },
      {
        field: "lastAckAt",
        headerName: "ACK At",
        minWidth: 150,
        flex: 0.8,
        valueFormatter: (value) => formatDate(value),
      },
    ],
    []
  );

  const selectedDevice = React.useMemo(
    () => devices.find((item) => item.deviceId === selectedDeviceId) || null,
    [devices, selectedDeviceId]
  );

  const handleSaveTenantPolicy = async () => {
    if (!tenantId) return;
    try {
      setTenantSaving(true);
      const response = await saveTenantPolicy(tenantId, createPolicyFromForm(tenantForm));
      setTenantPolicyMeta({
        version: response?.policyVersion ?? "",
        hash: response?.policyHash ?? "",
      });
      showMessage("Tenant policy saved");
      await refreshAll();
    } catch (error) {
      console.error(error);
      showMessage("Failed to save tenant policy", "error");
    } finally {
      setTenantSaving(false);
    }
  };

  const handlePushTenantPolicy = async () => {
    if (!tenantId) return;
    try {
      setTenantPushing(true);
      const response = await pushTenantPolicy(tenantId);
      showMessage(`Tenant policy pushed to ${Number(response?.sent ?? 0)} connected devices`);
      await refreshAll();
    } catch (error) {
      console.error(error);
      showMessage("Failed to push tenant policy", "error");
    } finally {
      setTenantPushing(false);
    }
  };

  const handleSaveDevicePolicy = async () => {
    if (!selectedDeviceId) return;
    try {
      setDeviceSaving(true);
      const response = await saveDevicePolicy(selectedDeviceId, createPolicyFromForm(deviceForm));
      setDevicePolicyMeta({
        version: response?.policyVersion ?? "",
        hash: response?.policyHash ?? "",
      });
      showMessage("Device override saved");
      await refreshAll();
    } catch (error) {
      console.error(error);
      showMessage("Failed to save device override", "error");
    } finally {
      setDeviceSaving(false);
    }
  };

  const handlePushDevicePolicy = async () => {
    if (!selectedDeviceId) return;
    try {
      setDevicePushing(true);
      await pushDevicePolicy(selectedDeviceId);
      showMessage("Device effective policy pushed");
      await refreshAll();
    } catch (error) {
      console.error(error);
      showMessage("Failed to push device policy", "error");
    } finally {
      setDevicePushing(false);
    }
  };

  if (!canManagePolicies) {
    return (
      <Paper
        sx={{
          p: 3,
          borderRadius: 3,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
        }}
      >
        <Alert severity="info">
          Policies management is restricted to active tenant admins and owners.
        </Alert>
      </Paper>
    );
  }

  return (
    <Stack spacing={2.5}>
      <Paper
        sx={{
          p: 2.5,
          borderRadius: 3,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", md: "center" }}
          justifyContent="space-between"
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Policies
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Manage tenant baseline policy, device overrides, effective policy, and delivery status.
            </Typography>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Search Devices"
              size="small"
              value={deviceSearch}
              onChange={(event) => setDeviceSearch(event.target.value)}
            />
            <Button
              variant="outlined"
              startIcon={<RefreshOutlinedIcon />}
              onClick={refreshAll}
              disabled={refreshing || loading}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard title="Tracked Devices" value={summary.total} accent="#16324f" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard title="ACK OK" value={summary.ackOk} accent="#1ba6a6" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard title="Pending ACK" value={summary.pending} accent="#9a6700" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <SummaryCard title="Version Drift" value={summary.drift} accent="#b3261e" />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, xl: 6 }}>
          <PolicyEditorCard
            title="Tenant Policy"
            subtitle="Baseline policy for all devices in the tenant."
            form={tenantForm}
            onChange={setTenantForm}
            onSave={handleSaveTenantPolicy}
            onPush={handlePushTenantPolicy}
            saving={tenantSaving}
            pushing={tenantPushing}
            version={tenantPolicyMeta.version}
            hash={tenantPolicyMeta.hash}
          />
        </Grid>

        <Grid size={{ xs: 12, xl: 6 }}>
          <Stack spacing={2.5}>
            <Paper
              sx={{
                p: 2.5,
                borderRadius: 3,
                border: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
              }}
            >
              <Stack spacing={2}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  Device Override
                </Typography>
                <TextField
                  select
                  label="Device"
                  size="small"
                  value={selectedDeviceId}
                  onChange={(event) => setSelectedDeviceId(event.target.value)}
                  fullWidth
                >
                  {devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.hostname || device.deviceId}
                    </option>
                  ))}
                </TextField>
              </Stack>
            </Paper>

            <PolicyEditorCard
              title="Device Override Policy"
              subtitle="Optional override for the selected device."
              form={deviceForm}
              onChange={setDeviceForm}
              onSave={handleSaveDevicePolicy}
              onPush={handlePushDevicePolicy}
              saving={deviceSaving}
              pushing={devicePushing}
              version={devicePolicyMeta.version}
              hash={devicePolicyMeta.hash}
            />
          </Stack>
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper
            sx={{
              p: 2.5,
              borderRadius: 3,
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
            }}
          >
            <Stack spacing={1.5}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Effective Policy
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedDevice
                  ? `Resolved policy for ${selectedDevice.hostname || selectedDevice.deviceId}`
                  : "Select a device to inspect effective policy."}
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Chip
                  label={`Source: ${effectivePolicy?.source || " - "}`}
                  variant="outlined"
                />
                <Chip
                  label={`Version: ${effectivePolicy?.policyVersion || " - "}`}
                  variant="outlined"
                />
              </Stack>
              <TextField
                value={formatJson(effectivePolicy?.policyJson ?? {})}
                multiline
                minRows={isMdDown ? 10 : 14}
                fullWidth
                InputProps={{
                  readOnly: true,
                  sx: {
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    alignItems: "flex-start",
                  },
                }}
              />
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper
            sx={{
              p: 2.5,
              borderRadius: 3,
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
            }}
          >
            <Stack spacing={1.5}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Device Delivery Status
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Latest desired, sent, and ACK state for the selected device.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Chip label={`Desired: ${deviceStatus?.desired_policy_version || " - "}`} variant="outlined" />
                <Chip label={`Sent: ${deviceStatus?.last_sent_policy_version || " - "}`} variant="outlined" />
                {renderAckChip(deviceStatus?.last_ack_status)}
              </Stack>
              <TextField
                value={formatJson(deviceStatus ?? {})}
                multiline
                minRows={isMdDown ? 10 : 14}
                fullWidth
                InputProps={{
                  readOnly: true,
                  sx: {
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    alignItems: "flex-start",
                  },
                }}
              />
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Paper
        sx={{
          p: 2,
          borderRadius: 3,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          sx={{ mb: 1.5 }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Tenant Policy Status
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Delivery and ACK status for all tracked devices in the tenant.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<PublishOutlinedIcon />}
            onClick={handlePushTenantPolicy}
            disabled={tenantPushing}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            Push Tenant Policy
          </Button>
        </Stack>

        <DataGrid
          autoHeight
          rows={policyStatusRows}
          columns={statusColumns}
          disableRowSelectionOnClick
          loading={loading}
          getRowId={(row) => row.id}
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            pagination: {
              paginationModel: {
                pageSize: 10,
                page: 0,
              },
            },
          }}
          onRowClick={(params) => setSelectedDeviceId(params.row.deviceId)}
          sx={{
            border: 0,
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: "rgba(22,50,79,0.04)",
            },
          }}
        />
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((current) => ({ ...current, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setSnackbar((current) => ({ ...current, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
