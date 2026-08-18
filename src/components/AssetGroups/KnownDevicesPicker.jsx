// src/components/AssetGroups/KnownDevicesPicker.jsx
//
// Server-paginated device picker for Asset Groups, extracted from the
// AssetGroups god-component. Talks directly to the known-devices endpoint
// (via listKnownDevices) with server-side pagination + a debounced search;
// selections are owned by the parent (selectedIds + onToggleDevice) so they
// persist across pages. normalizeKnownDevice / normalizeKnownDeviceGroupAssignments
// fold the many backend field-name variants into a stable row shape.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import { BRAND, ROLE } from "../../theme/brand";
import { listKnownDevices } from "../../api/jobs";
import { listFrom } from "../../api/shape";

export function normalizeKnownDeviceGroupAssignments(d) {
  const rawCollections = [
    d?.groups,
    d?.assetGroups,
    d?.asset_groups,
    d?.groupMemberships,
    d?.group_memberships,
    d?.memberships,
  ];

  const names = [];

  rawCollections.forEach((collection) => {
    if (!Array.isArray(collection)) return;
    collection.forEach((item) => {
      const name =
        typeof item === "string"
          ? item
          : item?.name || item?.groupName || item?.group_name || item?.assetGroupName;
      const trimmed = String(name || "").trim();
      if (trimmed) names.push(trimmed);
    });
  });

  const rawGroupNames = d?.groupNames || d?.group_names || d?.assetGroupNames || d?.asset_group_names;
  if (Array.isArray(rawGroupNames)) {
    rawGroupNames.forEach((name) => {
      const trimmed = String(name || "").trim();
      if (trimmed) names.push(trimmed);
    });
  } else if (typeof rawGroupNames === "string") {
    rawGroupNames
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .forEach((name) => names.push(name));
  }

  const singleGroupName = String(d?.groupName || d?.group_name || d?.assetGroup || d?.asset_group || "").trim();
  if (singleGroupName && singleGroupName !== "—") names.push(singleGroupName);

  const uniqueNames = Array.from(new Set(names));
  const rawCount = Number(
    d?.groupCount ??
      d?.group_count ??
      d?.groupsCount ??
      d?.groups_count ??
      d?.assetGroupCount ??
      d?.asset_group_count ??
      uniqueNames.length
  );
  const groupCount = Number.isFinite(rawCount) ? rawCount : uniqueNames.length;

  const explicitGrouped =
    d?.isGrouped === true ||
    d?.is_grouped === true ||
    d?.grouped === true ||
    d?.hasGroup === true ||
    d?.has_group === true;

  const isGrouped = explicitGrouped || groupCount > 0 || uniqueNames.length > 0;

  return {
    isGrouped,
    groupCount: isGrouped ? Math.max(groupCount, uniqueNames.length, 1) : 0,
    groupCoverage: isGrouped ? "grouped" : "ungrouped",
    groupNames: uniqueNames,
  };
}

export function normalizeKnownDevice(d) {
  const groupInfo = normalizeKnownDeviceGroupAssignments(d || {});

  return {
    deviceId: String(d?.deviceId || "").trim(),
    hostname: String(d?.hostname || "").trim(),
    platform: String(d?.platform || d?.osPlatform || "").trim(),
    agentVersion: String(d?.agentVersion || d?.agent_version || "").trim(),
    connected: d?.connected === true,
    ...groupInfo,
  };
}

export default function KnownDevicesPicker({
  open,
  selectedIds,
  onToggleDevice,
  excludeIds,
  selectedLabel = "selected",
  emptyLabel = "No devices match.",
  /**
   * Hide devices that cannot run the thing being targeted, e.g. a macOS .pkg
   * offered to Windows hosts. Without it the operator only finds out when the
   * job comes back failed. Devices that never reported a platform are KEPT:
   * silently hiding a host because its inventory is incomplete is worse than
   * showing one extra row.
   */
  platformFilter,
}) {
  const [rows, setRows] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [pageSize] = React.useState(25);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setPage(0);
      setSearch("");
      setRows([]);
      setTotal(0);
      setError("");
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        setLoading(true);
        setError("");

        const res = await listKnownDevices({
          page: page + 1,
          pageSize,
          search: search.trim() || undefined,
          includeGroups: true,
        });

        if (cancelled) return;

        const items = listFrom(res, { context: "knownDevices" });
        setRows(
          items
            .map(normalizeKnownDevice)
            .filter((d) => d.deviceId && !excludeIds?.has(d.deviceId))
            .filter(
              (d) =>
                !platformFilter ||
                !d.platform ||
                d.platform.toLowerCase() === String(platformFilter).toLowerCase()
            )
        );
        setTotal(Number(res?.total ?? res?.count ?? 0));
      } catch (err) {
        if (cancelled) return;
        setRows([]);
        setTotal(0);
        setError(err?.body?.message || err?.message || "Failed to load devices");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, page, pageSize, search, excludeIds, platformFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: BRAND.gray,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Members
        </Typography>
        <Typography sx={{ fontSize: 12, color: BRAND.dark }}>
          <strong>{selectedIds.size}</strong> {selectedLabel} · {total} known
        </Typography>
      </Box>

      <TextField
        size="small"
        placeholder="Search hostname / device ID / platform / agent version…"
        value={search}
        onChange={(e) => {
          setPage(0);
          setSearch(e.target.value);
        }}
        fullWidth
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
            </InputAdornment>
          ),
          endAdornment: loading ? (
            <InputAdornment position="end">
              <CircularProgress size={16} sx={{ color: BRAND.teal }} />
            </InputAdornment>
          ) : null,
        }}
        sx={{ mb: 1 }}
      />

      {error ? (
        <Alert severity="error" variant="outlined" sx={{ mb: 1 }}>
          {error}
        </Alert>
      ) : null}

      <Box
        sx={{
          border: `1px solid ${BRAND.border}`,
          borderRadius: 2,
          maxHeight: 320,
          overflowY: "auto",
          bgcolor: BRAND.surface,
        }}
      >
        {rows.length === 0 && !loading ? (
          <Box sx={{ p: 2, textAlign: "center", color: BRAND.gray }}>
            <Typography variant="body2">{emptyLabel}</Typography>
          </Box>
        ) : (
          rows.map((d) => {
            const checked = selectedIds.has(d.deviceId);
            const groupNamesText = d.groupNames.length > 0 ? d.groupNames.join(", ") : "Assigned to an existing group";
            const groupChipLabel = d.isGrouped
              ? d.groupCount > 1
                ? `${d.groupCount} groups`
                : "Grouped"
              : "Ungrouped";

            return (
              <Box
                key={d.deviceId}
                onClick={() => onToggleDevice(d.deviceId)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.5,
                  py: 0.9,
                  cursor: "pointer",
                  bgcolor: checked ? BRAND.tealSoft : "transparent",
                  borderBottom: `1px solid ${BRAND.border}`,
                  "&:hover": { bgcolor: BRAND.rowHover },
                }}
              >
                <Box
                  sx={{
                    width: 16,
                    height: 16,
                    borderRadius: 0.5,
                    border: `2px solid ${checked ? BRAND.teal : BRAND.gray}`,
                    bgcolor: checked ? BRAND.teal : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {checked ? "✓" : ""}
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack
                    direction="row"
                    spacing={0.75}
                    alignItems="center"
                    sx={{ minWidth: 0, flexWrap: "wrap", rowGap: 0.4 }}
                  >
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: BRAND.dark,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: { xs: "100%", sm: 320 },
                      }}
                    >
                      {d.hostname || d.deviceId}
                    </Typography>
                    <Tooltip
                      arrow
                      title={
                        d.isGrouped
                          ? `Already in: ${groupNamesText}`
                          : "This device is not assigned to any asset group yet."
                      }
                    >
                      <Chip
                        size="small"
                        label={groupChipLabel}
                        sx={{
                          height: 20,
                          fontSize: 10.5,
                          fontWeight: 800,
                          border: `1px solid ${d.isGrouped ? `${BRAND.teal}66` : BRAND.border}`,
                          bgcolor: d.isGrouped ? BRAND.tealSoft : BRAND.surface,
                          color: d.isGrouped ? BRAND.tealText : BRAND.gray,
                          "& .MuiChip-label": { px: 0.85 },
                        }}
                      />
                    </Tooltip>
                  </Stack>

                  <Typography
                    sx={{
                      mt: 0.15,
                      fontSize: 11,
                      color: BRAND.gray,
                      fontFamily: "monospace",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {d.deviceId}
                  </Typography>

                  {d.isGrouped ? (
                    <Typography
                      sx={{
                        mt: 0.25,
                        fontSize: 11,
                        color: BRAND.tealText,
                        fontWeight: 700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={groupNamesText}
                    >
                      Already in: {groupNamesText}
                    </Typography>
                  ) : null}
                </Box>

                <Stack
                  direction="row"
                  spacing={0.5}
                  alignItems="center"
                  justifyContent="flex-end"
                  sx={{ flexShrink: 0, flexWrap: "wrap", maxWidth: { xs: 120, sm: 220 } }}
                >
                  {d.platform ? (
                    <Chip
                      size="small"
                      label={d.platform}
                      sx={{
                        height: 18,
                        fontSize: 10.5,
                        bgcolor: BRAND.darkSoft,
                        color: BRAND.dark,
                        fontWeight: 700,
                      }}
                    />
                  ) : null}
                  {d.connected ? (
                    <Chip
                      size="small"
                      label="online"
                      sx={{
                        height: 18,
                        fontSize: 10.5,
                        bgcolor: ROLE.positiveSoft,
                        color: ROLE.positive,
                        fontWeight: 700,
                      }}
                    />
                  ) : null}
                </Stack>
              </Box>
            );
          })
        )}
      </Box>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        alignItems={{ xs: "stretch", sm: "center" }}
        justifyContent="space-between"
        sx={{ mt: 1 }}
      >
        <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
          Page {page + 1} of {totalPages}
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button
            size="small"
            variant="outlined"
            disabled={loading || page <= 0}
            onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
            sx={{ textTransform: "none", borderColor: BRAND.border, color: BRAND.dark }}
          >
            Previous page
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={loading || page + 1 >= totalPages}
            onClick={() => setPage((prev) => prev + 1)}
            sx={{ textTransform: "none", borderColor: BRAND.border, color: BRAND.dark }}
          >
            Next page
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
