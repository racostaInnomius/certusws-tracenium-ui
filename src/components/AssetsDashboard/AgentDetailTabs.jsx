// src/components/AssetsDashboard/AgentDetailTabs.jsx
//
// The four tab bodies of the agent detail workbench, extracted from the
// AssetsDashboard god-component. Each is purely presentational — the parent
// owns the fetches, the selected tab, and the software pagination model, and
// passes already-derived values down. Split per tab so each stays readable
// and independently testable:
//   AgentTab     — identity fields + the mobile managed-device panel
//   HardwareTab  — the hardware inventory field grid
//   SoftwareTab  — paginated installed-applications table
//   PrintersTab  — configured print queues table

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography
} from "@mui/material";
import { BRAND, ROLE } from "../../theme/brand";
import { formatBytesToGb } from "../../utils/format";
import {
  formatDetailValue,
  formatDetailDate,
  formatDetailPercent,
  formatOperatingMode,
  storageHealthColor,
  formatLocationLabel,
  formatFormFactor,
  getOsLifecycleHint,
  formatCoordinates,
  getMapPin,
  getLocationHint
} from "./hostHelpers";
import { DetailField, FieldGrid } from "./detailAtoms";
import MobileCommandsPanel from "../AssetManagement/MobileCommandsPanel";

// Own chunk: Leaflet plus its CSS is dead weight on the overwhelming majority
// of drawer opens, where nobody touches the map.
const DeviceLocationMap = React.lazy(() => import("./DeviceLocationMap"));

export function AgentTab({
  hostname,
  agentId,
  platform,
  agentVersion,
  profile,
  hardware,
  connected,
  isMobileDevice,
  commandDeviceId,
  platformKey
}) {
  const [mapOpen, setMapOpen] = React.useState(false);
  const mapPin = React.useMemo(() => getMapPin(profile), [profile]);

  return (
            <>
              <FieldGrid>
                <DetailField label="Hostname" value={hostname} />
                <DetailField label="Agent ID" value={agentId} mono />
                <DetailField label="Platform" value={platform} />
                <DetailField label="Device type" value={formatFormFactor(profile)} />
                {/* El SO y su estado de soporte, en el mismo campo: la versión
                    sin saber si sigue soportada obliga a ir a buscarlo a otra
                    pantalla, y ahí es donde se deja de mirar. */}
                <DetailField
                  label="OS"
                  value={formatDetailValue(profile?.os || hardware?.distro)}
                  hint={getOsLifecycleHint(profile)}
                />
                <DetailField label="Agent version" value={agentVersion} mono />
                <DetailField label="Last logon user" value={formatDetailValue(profile?.lastLogonUser)} />
                <DetailField label="Local IP" value={formatDetailValue(profile?.localIp)} mono />
                <DetailField
                  label="Location"
                  value={formatLocationLabel(profile)}
                  hint={getLocationHint(profile)}
                />
                {/* Coordinates only exist for mobile GPS fixes; desktop rows
                    have none, so the field is omitted rather than dashed. */}
                {formatCoordinates(profile) ? (
                  <DetailField label="Coordinates" value={formatCoordinates(profile)} mono />
                ) : null}
                <DetailField label="Last seen" value={formatDetailDate(profile?.lastSeenAt || hardware?.collectedAtUtc)} />
                <DetailField label="Status" value={connected ? "Online" : "Offline"} />
              </FieldGrid>

              {/* The map is opt-in: it costs a chunk download and a round of
                  tile requests to an external host, and most drawer opens are
                  about software or compliance, not where the box is. */}
              {mapPin ? (
                <Box sx={{ mt: 2 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setMapOpen((v) => !v)}
                    sx={{ textTransform: "none" }}
                    aria-expanded={mapOpen}
                  >
                    {mapOpen ? "Hide map" : "View on map"}
                  </Button>
                  {mapOpen ? (
                    <React.Suspense
                      fallback={
                        <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>
                          Loading map…
                        </Typography>
                      }
                    >
                      <DeviceLocationMap pin={mapPin} />
                    </React.Suspense>
                  ) : null}
                </Box>
              ) : null}

              {/* Location history — the bounded ring buffer of DISTINCT
                  positions (max 10). Rendered only when the device has
                  actually moved: a single entry says nothing the "Location"
                  field above doesn't already, so showing it would be noise. */}
              {(profile?.locationHistory?.length ?? 0) > 1 ? (
                <Box sx={{ mt: 2.5 }}>
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "text.secondary",
                      mb: 1
                    }}
                  >
                    Location history
                  </Typography>
                  <Stack spacing={0.75}>
                    {profile.locationHistory.map((entry) => (
                      <Stack
                        key={entry.locationKey}
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ flexWrap: "wrap", rowGap: 0.5 }}
                      >
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}>
                          {/* Same rule as the Location field above: the site an
                              operator declared, else the bare network range.
                              The IP-derived city (entry.ipCity) is NOT a
                              fallback — it says where the traffic exits, and it
                              put two machines sitting in Mexico City under
                              "Cleveland Heights" because that is where their
                              egress lands. */}
                          {entry.siteName || entry.subnetCidr || "—"}
                        </Typography>
                        <Chip
                          size="small"
                          label={`${entry.hitCount}\u00d7`}
                          sx={{ height: 18, fontSize: 10.5, bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700 }}
                        />
                        <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
                          {formatDetailDate(entry.firstSeenAt)} → {formatDetailDate(entry.lastSeenAt)}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              ) : null}

              {isMobileDevice ? (
                <>
                <Box sx={{ mt: 2.5 }}>
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "text.secondary",
                      mb: 1,
                    }}
                  >
                    Managed device
                  </Typography>
                  <FieldGrid>
                    <DetailField label="Operating mode" value={formatOperatingMode(profile?.operatingMode)} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 11, fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.4 }}>
                        Storage health
                      </Typography>
                      <Box sx={{ mt: 0.35 }}>
                        {profile?.storageHealth ? (
                          <Chip
                            size="small"
                            label={String(profile.storageHealth)}
                            sx={{
                              height: 20,
                              fontWeight: 700,
                              fontSize: 11,
                              textTransform: "capitalize",
                              bgcolor: `${storageHealthColor(profile.storageHealth)}1f`,
                              color: storageHealthColor(profile.storageHealth),
                            }}
                          />
                        ) : (
                          <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}>—</Typography>
                        )}
                      </Box>
                    </Box>
                  </FieldGrid>
                </Box>
                <Box sx={{ mt: 3 }}>
                  <MobileCommandsPanel deviceId={commandDeviceId} platform={platformKey} />
                </Box>
                </>
              ) : null}
            </>
  );
}

export function HardwareTab({ hardware }) {
  return (
            <FieldGrid>
              <DetailField label="Serial" value={formatDetailValue(hardware?.serial)} mono />
              <DetailField label="Manufacturer" value={formatDetailValue(hardware?.manufacturer)} />
              <DetailField label="Model" value={formatDetailValue(hardware?.model)} />
              <DetailField label="CPU" value={formatDetailValue(hardware?.cpuBrand)} />
              <DetailField label="Physical cores" value={formatDetailValue(hardware?.physicalCores)} />
              <DetailField label="Memory" value={formatBytesToGb(hardware?.totalMemoryBytes)} />
              <DetailField label="Disk total" value={formatBytesToGb(hardware?.diskTotalBytes)} />
              <DetailField label="Disk used" value={formatBytesToGb(hardware?.diskUsedBytes)} />
              <DetailField label="Disk usage" value={formatDetailPercent(hardware?.diskUsagePct)} />
              <DetailField label="Battery" value={formatDetailPercent(hardware?.batteryPercent)} />
              <DetailField label="Collected at" value={formatDetailDate(hardware?.collectedAtUtc)} />
            </FieldGrid>
  );
}

export function SoftwareTab({
  softwareRows,
  softwareLoading,
  softwareCount,
  softwarePage,
  softwarePageSize,
  onSoftwarePaginationModelChange
}) {
  return (
            <Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }} justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Box>
                  <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>
                    Installed applications
                  </Typography>
                  <Typography sx={{ mt: 0.25, fontSize: 12, color: "text.secondary" }}>
                    Paginated software inventory for this device.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ alignSelf: { xs: "flex-start", sm: "center" } }}>
                  {softwareLoading ? <CircularProgress size={16} sx={{ color: BRAND.teal }} /> : null}
                  <Chip size="small" label={`${softwareCount} apps detected`} sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 800 }} />
                </Stack>
              </Stack>
              <Paper elevation={0} sx={{ border: `1px solid ${BRAND.border}`, borderRadius: 2, overflow: "hidden" }}>
                <TableContainer sx={{ maxHeight: 360 }}>
                  <Table stickyHeader size="small" aria-label="agent software table">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Application</TableCell>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Publisher</TableCell>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Source</TableCell>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Detected</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {softwareRows.map((app, index) => (
                        <TableRow key={app.id || `${app.name}-${index}`} hover>
                          <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>{formatDetailValue(app.name)}</TableCell>
                          <TableCell>{formatDetailValue(app.publisher)}</TableCell>
                          <TableCell>{formatDetailValue(app.source)}</TableCell>
                          <TableCell>{formatDetailDate(app.detectedAtUtc || app.detected_at_utc)}</TableCell>
                        </TableRow>
                      ))}
                      {softwareRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} sx={{ color: "text.secondary", py: 3, textAlign: "center" }}>
                            {softwareLoading ? "Loading software inventory…" : "No software inventory found for this device."}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={softwareCount}
                  page={softwarePage}
                  rowsPerPage={softwarePageSize}
                  rowsPerPageOptions={[8, 16, 24, 50]}
                  onPageChange={(_, nextPage) => {
                    onSoftwarePaginationModelChange?.({ page: nextPage, pageSize: softwarePageSize });
                  }}
                  onRowsPerPageChange={(event) => {
                    const nextPageSize = Number(event.target.value || 8);
                    onSoftwarePaginationModelChange?.({ page: 0, pageSize: nextPageSize });
                  }}
                  labelRowsPerPage="Rows per page:"
                  sx={{
                    borderTop: `1px solid ${BRAND.border}`,
                    bgcolor: BRAND.surface,
                    "& .MuiTablePagination-toolbar": {
                      minHeight: 48,
                      px: { xs: 1, sm: 2 },
                    },
                    "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": {
                      fontSize: 12,
                      color: "text.secondary",
                    },
                  }}
                />
              </Paper>
            </Box>
  );
}

export function PrintersTab({ printerRows = [], printersLoading = false }) {
  return (
            <Box>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                alignItems={{ xs: "stretch", sm: "center" }}
                justifyContent="space-between"
                sx={{ mb: 1.5 }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>
                    Configured printers
                  </Typography>
                  <Typography sx={{ mt: 0.25, fontSize: 12, color: "text.secondary" }}>
                    Print queues this device knows about, ordered with the
                    default first, then network printers, then local.
                  </Typography>
                </Box>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ alignSelf: { xs: "flex-start", sm: "center" } }}
                >
                  {printersLoading ? (
                    <CircularProgress size={16} sx={{ color: BRAND.teal }} />
                  ) : null}
                  <Chip
                    size="small"
                    label={`${printerRows.length} printer${printerRows.length === 1 ? "" : "s"} detected`}
                    sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 800 }}
                  />
                </Stack>
              </Stack>
              <Paper
                elevation={0}
                sx={{ border: `1px solid ${BRAND.border}`, borderRadius: 2, overflow: "hidden" }}
              >
                <TableContainer sx={{ maxHeight: 360 }}>
                  <Table stickyHeader size="small" aria-label="agent printers table">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Driver</TableCell>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Port</TableCell>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Type</TableCell>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {printerRows.map((p, index) => (
                        <TableRow key={p.id || p.installId || `${p.name}-${index}`} hover>
                          <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: "wrap" }}>
                              <span>{formatDetailValue(p.name)}</span>
                              {p.isDefault ? (
                                <Chip
                                  size="small"
                                  label="Default"
                                  sx={{ bgcolor: ROLE.positiveSoft, color: ROLE.positive, fontWeight: 800, height: 18 }}
                                />
                              ) : null}
                              {p.isShared ? (
                                <Chip
                                  size="small"
                                  label="Shared"
                                  sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 800, height: 18 }}
                                />
                              ) : null}
                            </Stack>
                          </TableCell>
                          <TableCell>{formatDetailValue(p.driver)}</TableCell>
                          <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                            {formatDetailValue(p.port)}
                          </TableCell>
                          <TableCell>{p.isNetwork ? "Network" : "Local"}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={p.status || "unknown"}
                              sx={{
                                bgcolor:
                                  p.status === "online"
                                    ? ROLE.positiveSoft
                                    : p.status === "error"
                                    ? ROLE.criticalSoft || `${ROLE.critical}33`
                                    : p.status === "offline"
                                    ? BRAND.surfaceMuted
                                    : BRAND.surfaceMuted,
                                color:
                                  p.status === "online"
                                    ? ROLE.positive
                                    : p.status === "error"
                                    ? ROLE.critical
                                    : "text.secondary",
                                fontWeight: 800,
                                textTransform: "capitalize",
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                      {printerRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} sx={{ color: "text.secondary", py: 3, textAlign: "center" }}>
                            {printersLoading
                              ? "Loading printers…"
                              : "No printers configured on this device."}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Box>
  );
}
