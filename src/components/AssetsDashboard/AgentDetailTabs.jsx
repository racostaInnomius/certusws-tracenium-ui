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
  Tooltip,
  Typography
} from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
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
  buildLocationHistory,
  buildTrail,
  getLocationHint
} from "./hostHelpers";
import { DetailField, FieldGrid } from "./detailAtoms";
import MobileCommandsPanel from "../AssetManagement/MobileCommandsPanel";

// Own chunk: Leaflet plus its CSS is dead weight on the overwhelming majority
// of drawer opens, where nobody touches the map.
const DeviceLocationMap = React.lazy(() => import("./DeviceLocationMap"));
// Segundo import perezoso, no un segundo Leaflet: Vite deja la librería en un
// chunk compartido, así que abrir este mapa no vuelve a descargarla si ya se
// abrió el otro. Importa en este repo — el portal es Free SKU y cada chunk de
// más es otra oportunidad de que llegue lento.
const DeviceLocationHistoryMap = React.lazy(() => import("./DeviceLocationHistoryMap"));
// La línea de tiempo (ADR-0018 fase 2). No es perezosa: no arrastra Leaflet y
// es el contenido principal de la sección, no un extra que se despliega.
import DeviceLocationTimeline from "./DeviceLocationTimeline";

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
  platformKey,
  /** Línea de tiempo del equipo (ADR-0018). La carga el padre, como el resto. */
  timeline = null
}) {
  const [mapOpen, setMapOpen] = React.useState(false);
  const [historyMapOpen, setHistoryMapOpen] = React.useState(false);
  // Qué posición del historial está resaltada. Vive aquí y no en el mapa porque
  // la lista y el mapa la comparten: seleccionar en una resalta en el otro.
  const [selectedPosition, setSelectedPosition] = React.useState(null);
  const mapPin = React.useMemo(() => getMapPin(profile), [profile]);
  const history = React.useMemo(() => buildLocationHistory(profile), [profile]);
  // El recorrido sale de los EPISODIOS, no del anillo: el orden es lo único que
  // el anillo no puede dar, y sin él la línea sería un viaje inventado.
  const trail = React.useMemo(() => buildTrail(timeline?.episodes), [timeline]);

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
                        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 1 }}>
                          Loading map…
                        </Typography>
                      }
                    >
                      <DeviceLocationMap pin={mapPin} />
                    </React.Suspense>
                  ) : null}
                </Box>
              ) : null}

              {/* Location history — el anillo acotado de posiciones DISTINTAS
                  (el tope lo pone el tenant en Asset Management). Se pinta solo
                  cuando el equipo se ha movido de verdad: una sola entrada no
                  dice nada que el campo "Location" de arriba no diga ya. */}
              {history.total > 1 ? (
                <Box sx={{ mt: 2.5 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Typography
                      sx={{
                        fontSize: TEXT.xs,
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "text.secondary"
                      }}
                    >
                      Location history
                    </Typography>
                    {history.mappable > 0 ? (
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setHistoryMapOpen((v) => !v)}
                        sx={{ textTransform: "none", fontSize: TEXT.xs, minWidth: 0, py: 0 }}
                        aria-expanded={historyMapOpen}
                      >
                        {historyMapOpen ? "Hide map" : `Map ${history.mappable}`}
                      </Button>
                    ) : null}
                  </Stack>

                  {/* ── La línea de tiempo SUSTITUYE a la lista de lugares ──
                      (ADR-0018 D8). Mientras no haya estancias — la tabla se
                      escribe desde que la función existe, no hacia atrás — se
                      sigue mostrando la lista, que es lo único que hay. No es
                      un duplicado permanente: es una ventana de transición que
                      se cierra sola, y el propio panel la explica. */}
                  {timeline?.episodes?.length ? (
                    <DeviceLocationTimeline
                      episodes={timeline.episodes}
                      retentionDays={timeline.retentionDays}
                    />
                  ) : null}

                  {timeline && !timeline.episodes?.length ? (
                    <Box sx={{ mb: 1.5 }}>
                      <DeviceLocationTimeline
                        episodes={[]}
                        retentionDays={timeline.retentionDays}
                        fallbackPlaces={history.total}
                      />
                    </Box>
                  ) : null}

                  {/* ⚠️ Lo que esta lista NO es, dicho una vez y a la vista.
                      Tres cosas que el formato invita a leer mal:

                      · Es un anillo acotado. Las posiciones viejas se caen
                        cuando aparecen nuevas, así que "todo lo que hay" no es
                        "todo lo que hubo".
                      · Los números son TICKS de inventario, no visitas. Un
                        equipo quieto en un sitio acumula cuentas altas sin
                        haber ido nunca dos veces, y la cadencia varía por
                        tenant (medido: de 1,2 a 10,8 al día), así que tampoco
                        se comparan entre flotas.
                      · Las fechas SE SOLAPAN entre filas. En un equipo real la
                        primera va del 13-ago al 08-sep y contiene a casi todas
                        las demás. Puesto en columna se lee como una secuencia
                        y no lo es. */}
                  {/* ⚠️ Esta nota describe la LISTA DE LUGARES, no la línea de
                      tiempo — dice literalmente "esto no es una línea de
                      tiempo". Si se pinta cuando hay episodios, contradice a lo
                      que está justo encima. Va atada a lo que explica. */}
                  {!timeline?.episodes?.length ? (
                    <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1 }}>
                      Distinct positions, newest first — older ones drop off as new places appear.
                      Counts are inventory check-ins, not visits, and the date ranges overlap, so
                      this is not a timeline.
                    </Typography>
                  ) : null}

                  {/* El mapa va ARRIBA de la lista: la selección se hace en la
                      lista y se mira en el mapa, y tenerlo debajo obligaría a
                      saltar de un extremo a otro del drawer en cada fila. */}
                  {historyMapOpen && history.mappable > 0 ? (
                    <React.Suspense
                      fallback={
                        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1 }}>
                          Loading map…
                        </Typography>
                      }
                    >
                      <DeviceLocationHistoryMap
                        entries={history.entries}
                        selectedId={selectedPosition}
                        onSelect={setSelectedPosition}
                        trail={trail}
                      />
                    </React.Suspense>
                  ) : null}

                  <Stack
                    spacing={0.75}
                    sx={{ mt: historyMapOpen ? 1.5 : 0, display: timeline?.episodes?.length ? "none" : undefined }}
                  >
                    {history.entries.map((entry) => {
                      const selected = entry.id === selectedPosition;
                      return (
                        <Stack
                          key={entry.id}
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          // Acoplada al mapa en los dos sentidos: seleccionar
                          // aqui resalta el pin, y hacer clic en el pin resalta
                          // la fila. Es lo que resuelve "cual es cual" sin
                          // numerar diez pines encima del mapa.
                          onClick={
                            entry.mappable
                              ? () => setSelectedPosition(selected ? null : entry.id)
                              : undefined
                          }
                          sx={{
                            flexWrap: "wrap",
                            rowGap: 0.5,
                            px: 0.75,
                            py: 0.35,
                            mx: -0.75,
                            borderRadius: 1,
                            cursor: entry.mappable ? "pointer" : "default",
                            bgcolor: selected ? BRAND.tealSoft : "transparent"
                          }}
                        >
                          <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
                            {/* El sitio que declaro el operador, luego el rango,
                                y si no hay ninguno pero SI posicion, la
                                posicion. Esa ultima rama es la que faltaba: las
                                filas GPS no tienen CIDR y caian a un guion que
                                se leia como "no sabemos donde estuvo", cuando
                                son justo las que traen coordenadas.

                                La ciudad derivada de la IP (entry.ipCity) sigue
                                SIN ser respaldo: dice donde sale el trafico, y
                                puso dos equipos de Ciudad de Mexico en
                                "Cleveland Heights". */}
                            {entry.label}
                          </Typography>
                          {/* De donde salio el nombre del sitio. El rango es
                              exacto por construccion; la cercania tiene una
                              medicion en medio, y quien lee tiene derecho a
                              saber cual esta viendo. */}
                          {entry.labelKind === "site" && entry.siteMatch === "proximity" ? (
                            <Chip
                              size="small"
                              variant="outlined"
                              label="by proximity"
                              sx={{ height: 18, fontSize: TEXT.xs, color: "text.secondary" }}
                            />
                          ) : null}
                          {/* El "25×" compacto cabe en la fila; lo que
                              CUENTA no cabe, y sin decirlo se lee como
                              "25 visitas". */}
                          <Tooltip
                            title={`Seen here on ${entry.hitCount} inventory check-in${
                              entry.hitCount === 1 ? "" : "s"
                            } — not ${entry.hitCount} separate visits.`}
                          >
                            <Chip
                              size="small"
                              label={`${entry.hitCount}×`}
                              sx={{ height: 18, fontSize: TEXT.xs, bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700 }}
                            />
                          </Tooltip>
                          <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
                            {/* ⚠️ "seen" y no una flecha: hitCount cuenta TICKS,
                                no visitas, y estos rangos SE SOLAPAN entre
                                filas. Una flecha entre dos fechas se lee como
                                una estancia continua; esto es la primera y la
                                ultima vez que se vio esta posicion. */}
                            seen {formatDetailDate(entry.firstSeenAt)} – {formatDetailDate(entry.lastSeenAt)}
                          </Typography>
                          {entry.detail ? (
                            <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
                              {entry.detail}
                            </Typography>
                          ) : null}
                        </Stack>
                      );
                    })}
                  </Stack>
                </Box>
              ) : null}

              {isMobileDevice ? (
                <>
                <Box sx={{ mt: 2.5 }}>
                  <Typography
                    sx={{
                      fontSize: TEXT.xs,
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
                      <Typography sx={{ fontSize: TEXT.xs, fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.4 }}>
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
                              fontSize: TEXT.xs,
                              textTransform: "capitalize",
                              bgcolor: `${storageHealthColor(profile.storageHealth)}1f`,
                              color: storageHealthColor(profile.storageHealth),
                            }}
                          />
                        ) : (
                          <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>—</Typography>
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
                  <Typography sx={{ mt: 0.25, fontSize: TEXT.sm, color: "text.secondary" }}>
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
                      fontSize: TEXT.sm,
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
                  <Typography sx={{ mt: 0.25, fontSize: TEXT.sm, color: "text.secondary" }}>
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
                          <TableCell sx={{ fontFamily: "monospace", fontSize: TEXT.sm }}>
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
