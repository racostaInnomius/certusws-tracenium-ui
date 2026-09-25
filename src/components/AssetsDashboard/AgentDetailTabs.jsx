// src/components/AssetsDashboard/AgentDetailTabs.jsx
//
// The tab bodies of the agent detail workbench, extracted from the
// AssetsDashboard god-component. Each is purely presentational — the parent
// owns the fetches, the selected tab, and the software pagination model, and
// passes already-derived values down. Split per tab so each stays readable
// and independently testable:
//   AgentTab     — status tiles + identity + the mobile managed-device panel
//   HardwareTab  — the machine, then its CPU / memory / disk / battery
//   LocationTab  — current position, map and location history
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
import AppsRoundedIcon from "@mui/icons-material/AppsRounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import Battery5BarRoundedIcon from "@mui/icons-material/Battery5BarRounded";
import CloudQueueRoundedIcon from "@mui/icons-material/CloudQueueRounded";
import DesktopWindowsRoundedIcon from "@mui/icons-material/DesktopWindowsRounded";
import DeveloperBoardRoundedIcon from "@mui/icons-material/DeveloperBoardRounded";
import DevicesOtherRoundedIcon from "@mui/icons-material/DevicesOtherRounded";
import DnsRoundedIcon from "@mui/icons-material/DnsRounded";
import FingerprintRoundedIcon from "@mui/icons-material/FingerprintRounded";
import LanRoundedIcon from "@mui/icons-material/LanRounded";
import LayersRoundedIcon from "@mui/icons-material/LayersRounded";
import LaptopMacRoundedIcon from "@mui/icons-material/LaptopMacRounded";
import MemoryRoundedIcon from "@mui/icons-material/MemoryRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import PhoneIphoneRoundedIcon from "@mui/icons-material/PhoneIphoneRounded";
import PowerSettingsNewRoundedIcon from "@mui/icons-material/PowerSettingsNewRounded";
import QrCode2RoundedIcon from "@mui/icons-material/QrCode2Rounded";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import SystemUpdateAltRoundedIcon from "@mui/icons-material/SystemUpdateAltRounded";
import TerminalRoundedIcon from "@mui/icons-material/TerminalRounded";
import { BRAND, ICON, ROLE, TEXT } from "../../theme/brand";
import { formatBytesToGb, formatCalendarDay } from "../../utils/format";
import { platformColor, platformLabel } from "../../utils/platform";
import {
  formatDetailValue,
  formatDetailDate,
  formatDetailPercent,
  formatOperatingMode,
  storageHealthColor,
  formatLocationLabel,
  formatFormFactor,
  getOsLifecycle,
  getOsLifecycleHint,
  formatCoordinates,
  getMapPin,
  buildLocationHistory,
  buildTrail,
  getLocationHint,
  describePrinterReadProblem
} from "./hostHelpers";
import {
  DetailField,
  FieldGrid,
  IdentityItem,
  ResourceCard,
  SectionCard,
  SummaryTile,
  TileRow,
  UsageMeter,
} from "./detailAtoms";
import {
  batteryTone,
  diskTone,
  freeBytes,
  lifecycleTone,
  meterValue,
  versionTone,
} from "./deviceVisuals";
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

/** Icono del tipo de equipo; el virtual manda sobre el chasis. */
function formFactorIcon(profile, platformKey, sx) {
  if (platformKey === "ios" || platformKey === "android") return <PhoneIphoneRoundedIcon sx={sx} />;
  if (profile?.isVirtual) return <CloudQueueRoundedIcon sx={sx} />;
  const ff = String(profile?.formFactor || "").toLowerCase();
  if (ff === "laptop") return <LaptopMacRoundedIcon sx={sx} />;
  if (ff === "server") return <DnsRoundedIcon sx={sx} />;
  if (ff === "desktop") return <DesktopWindowsRoundedIcon sx={sx} />;
  return <DevicesOtherRoundedIcon sx={sx} />;
}

function PlatformChip({ platform, platformKey }) {
  const pc = platformColor(platformKey);
  return (
    <Chip
      size="small"
      label={platformKey ? platformLabel(platformKey) : platform}
      icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: pc.dot, ml: "8px !important" }} />}
      sx={{ height: 22, fontWeight: 800, fontSize: TEXT.xs, bgcolor: pc.bg, color: BRAND.dark }}
    />
  );
}

const ITEM_ICON = { fontSize: ICON.lg };
const PAIR_GRID = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
  gap: 2,
};

export function AgentTab({
  hostname,
  agentId,
  platform,
  agentVersion,
  /** Cubo de la versión frente a la última publicada (`bucketOfVersion`). */
  versionBucket = "unknown",
  latestVersion = null,
  profile,
  hardware,
  connected,
  isMobileDevice,
  commandDeviceId,
  platformKey,
  softwareCount = null,
  /** Abre otra pestaña de la ficha; la tarjeta de software lleva a la suya. */
  onOpenTab
}) {
  const lifecycle = getOsLifecycle(profile);
  const osHint = getOsLifecycleHint(profile);
  const lastSeen = profile?.lastSeenAt || hardware?.collectedAtUtc;
  const versionSub =
    versionBucket === "current"
      ? "Up to date"
      : versionBucket === "unknown" || !latestVersion
      ? ""
      : `Update available · ${latestVersion}`;

  return (
    <Stack spacing={2}>
      <TileRow>
        <SummaryTile
          icon={<PowerSettingsNewRoundedIcon />}
          label="Status"
          value={connected ? "Online" : "Offline"}
          tone={connected ? "positive" : "muted"}
          sub={`Last seen ${formatDetailDate(lastSeen)}`}
        />
        <SummaryTile
          icon={<SystemUpdateAltRoundedIcon />}
          label="Agent version"
          value={agentVersion}
          mono
          tone={versionTone(versionBucket)}
          sub={versionSub}
        />
        {/* El estado de soporte sólo habla cuando hay algo que decidir (ver
            getOsLifecycleHint): "Supported" en cada ficha sana entrena a no
            leer la línea. */}
        <SummaryTile
          icon={<TerminalRoundedIcon />}
          label="Operating system"
          value={formatDetailValue(profile?.os || hardware?.distro)}
          tone={osHint ? lifecycleTone(lifecycle.tone) : "neutral"}
          sub={osHint ? lifecycle.detail : ""}
        />
        <SummaryTile
          icon={<AppsRoundedIcon />}
          label="Software"
          value={softwareCount === null ? "—" : `${softwareCount} apps`}
          sub="View installed apps →"
          onClick={onOpenTab ? () => onOpenTab("software") : undefined}
          ariaLabel="Open the Software tab"
        />
      </TileRow>

      {/* Dos bloques y no una rejilla de siete: qué máquina es, y qué agente
          y quién la usa. Siete datos en tres columnas dejaban uno huérfano. */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" },
          gap: 1.5,
        }}
      >
        <SectionCard title="Device">
          <Box sx={PAIR_GRID}>
            <IdentityItem icon={<BadgeRoundedIcon sx={ITEM_ICON} />} label="Hostname" value={hostname} copyable />
            <IdentityItem
              icon={<LayersRoundedIcon sx={ITEM_ICON} />}
              label="Platform"
              value={platform && platform !== "—" ? <PlatformChip platform={platform} platformKey={platformKey} /> : null}
            />
            <IdentityItem
              icon={formFactorIcon(profile, platformKey, ITEM_ICON)}
              label="Device type"
              value={formatFormFactor(profile)}
            />
            <IdentityItem
              icon={<QrCode2RoundedIcon sx={ITEM_ICON} />}
              label="Serial"
              value={formatDetailValue(hardware?.serial)}
              mono
              copyable
            />
          </Box>
        </SectionCard>
        <SectionCard title="Agent & session">
          <Box sx={PAIR_GRID}>
            <Box sx={{ gridColumn: "1 / -1", minWidth: 0 }}>
              <IdentityItem icon={<FingerprintRoundedIcon sx={ITEM_ICON} />} label="Agent ID" value={agentId} mono copyable />
            </Box>
            <IdentityItem
              icon={<PersonRoundedIcon sx={ITEM_ICON} />}
              label="Last logon user"
              value={formatDetailValue(profile?.lastLogonUser)}
            />
            <IdentityItem
              icon={<LanRoundedIcon sx={ITEM_ICON} />}
              label="Local IP"
              value={formatDetailValue(profile?.localIp)}
              mono
              copyable
            />
          </Box>
        </SectionCard>
      </Box>

      {isMobileDevice ? (
        <>
          <SectionCard title="Managed device">
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
          </SectionCard>
          <Box>
            <MobileCommandsPanel deviceId={commandDeviceId} platform={platformKey} />
          </Box>
        </>
      ) : null}
    </Stack>
  );
}

/**
 * Dónde está el equipo: la posición actual, el mapa y el historial. Vivía al
 * final de la pestaña Agent, debajo de la identidad, y casi nadie bajaba hasta
 * ahí; aquí es lo único que hay.
 */
export function LocationTab({
  profile,
  /** Línea de tiempo del equipo (ADR-0018). La carga el padre, como el resto. */
  timeline = null
}) {
  // El mapa ya NO es opcional: la pestaña entera trata de dónde está el
  // equipo, y tenerlo detrás de un botón dejaba media pantalla vacía. Lo que
  // se elige es QUÉ enseña: la posición actual o el historial. Sin posición
  // actual pero con historial mapeable, empieza en el historial.
  const [historyMapOpen, setHistoryMapOpen] = React.useState(
    () => !getMapPin(profile) && buildLocationHistory(profile).mappable > 0
  );
  // Qué posición del historial está resaltada. Vive aquí y no en el mapa porque
  // la lista y el mapa la comparten: seleccionar en una resalta en el otro.
  const [selectedPosition, setSelectedPosition] = React.useState(null);
  const mapPin = React.useMemo(() => getMapPin(profile), [profile]);
  const history = React.useMemo(() => buildLocationHistory(profile), [profile]);
  // El recorrido sale de los EPISODIOS, no del anillo: el orden es lo único que
  // el anillo no puede dar, y sin él la línea sería un viaje inventado.
  const trail = React.useMemo(() => buildTrail(timeline?.episodes), [timeline]);
  const showHistoryMap = historyMapOpen && history.mappable > 0;
  const hasMap = Boolean(mapPin) || history.mappable > 0;

  const mapFallback = (
    <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>Loading map…</Typography>
  );

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: hasMap ? "minmax(0, 1fr) minmax(0, 1fr)" : "1fr" },
        gap: 2.5,
        alignItems: "start",
      }}
    >
            <Box sx={{ minWidth: 0 }}>
              <FieldGrid>
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
                <DetailField label="Location updated" value={formatDetailDate(profile?.locationLastSeenAt)} />
              </FieldGrid>

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
                        disabled={showHistoryMap && !mapPin}
                        sx={{ textTransform: "none", fontSize: TEXT.xs, minWidth: 0, py: 0 }}
                        aria-expanded={historyMapOpen}
                      >
                        {showHistoryMap ? (mapPin ? "Current position" : "Map") : `Map ${history.mappable}`}
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

                  <Stack
                    spacing={0.75}
                    sx={{ display: timeline?.episodes?.length ? "none" : undefined }}
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
            </Box>

            {/* ── El mapa, a la derecha y sin pedirlo ──
                Mismo sitio para las dos vistas; la selección de una fila del
                historial se resalta aquí. Pegado arriba al hacer scroll: la
                lista es la que se recorre, el mapa es donde se mira. */}
            {hasMap ? (
              <Box sx={{ minWidth: 0, position: { lg: "sticky" }, top: { lg: 16 } }}>
                <React.Suspense fallback={mapFallback}>
                  {showHistoryMap ? (
                    <DeviceLocationHistoryMap
                      entries={history.entries}
                      selectedId={selectedPosition}
                      onSelect={setSelectedPosition}
                      trail={trail}
                      height={380}
                    />
                  ) : mapPin ? (
                    <DeviceLocationMap pin={mapPin} height={380} />
                  ) : null}
                </React.Suspense>
              </Box>
            ) : null}
    </Box>
  );
}

export function HardwareTab({ hardware, profile = null, platformKey = "" }) {
  if (!hardware) {
    return (
      <Typography sx={{ py: 3, textAlign: "center", fontSize: TEXT.md, color: "text.secondary" }}>
        No hardware inventory reported for this device yet.
      </Typography>
    );
  }

  const title = [hardware.manufacturer, hardware.model].filter(Boolean).join(" ") || "Unknown model";
  const diskPct = meterValue(hardware.diskUsagePct);
  const dTone = diskTone(hardware.diskUsagePct);
  const free = freeBytes(hardware.diskTotalBytes, hardware.diskUsedBytes);
  const batteryPct = meterValue(hardware.batteryPercent);
  const bTone = batteryTone(hardware.batteryPercent);
  const cores = Number(hardware.physicalCores);

  return (
    <Stack spacing={2}>
      {/* Cabecera: qué máquina es, antes de cuánto tiene. */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, sm: 2 },
          borderRadius: 3,
          border: `1px solid ${BRAND.border}`,
          background: `linear-gradient(120deg, ${BRAND.tealSoft}, ${BRAND.surface} 70%)`,
        }}
      >
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              display: "grid",
              placeItems: "center",
              bgcolor: BRAND.surface,
              color: BRAND.teal,
              border: `1px solid ${BRAND.border}`,
              flexShrink: 0,
            }}
          >
            {formFactorIcon(profile, platformKey, { fontSize: ICON.xl })}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontSize: TEXT.xl, fontWeight: 900, color: BRAND.dark }} noWrap title={title}>
              {title}
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5, flexWrap: "wrap", rowGap: 0.5 }}>
              <Chip size="small" label={formatFormFactor(profile)} sx={{ height: 22, fontWeight: 800, fontSize: TEXT.xs, bgcolor: BRAND.surface, border: `1px solid ${BRAND.border}` }} />
              {hardware.arch ? (
                <Chip size="small" label={hardware.arch} sx={{ height: 22, fontWeight: 800, fontSize: TEXT.xs, fontFamily: "monospace", bgcolor: BRAND.surface, border: `1px solid ${BRAND.border}` }} />
              ) : null}
            </Stack>
          </Box>
          <Box sx={{ minWidth: 0, maxWidth: { sm: 260 } }}>
            <IdentityItem
              icon={<QrCode2RoundedIcon sx={ITEM_ICON} />}
              label="Serial"
              value={formatDetailValue(hardware.serial)}
              mono
              copyable
            />
          </Box>
        </Stack>
      </Paper>

      <TileRow>
        <ResourceCard
          icon={<MemoryRoundedIcon sx={{ fontSize: ICON.lg }} />}
          label="Processor"
          value={formatDetailValue(hardware.cpuBrand)}
          valueWraps
          sub={Number.isFinite(cores) && cores > 0 ? `${cores} physical core${cores === 1 ? "" : "s"}` : "Core count not reported"}
        />
        <ResourceCard
          icon={<DeveloperBoardRoundedIcon sx={{ fontSize: ICON.lg }} />}
          label="Memory"
          value={formatBytesToGb(hardware.totalMemoryBytes)}
          sub="Installed RAM"
        />
        {/* El antiguo "Disk usage" de la cabecera de la ficha, con su contexto:
            un porcentaje sin el tamaño del disco no dice si urge. */}
        <ResourceCard
          icon={<StorageRoundedIcon sx={{ fontSize: ICON.lg }} />}
          label="Disk usage"
          tone={dTone}
          value={formatDetailPercent(hardware.diskUsagePct)}
          meter={<UsageMeter value={diskPct} tone={dTone} label="Disk usage" />}
          sub={
            diskPct === null
              ? "Not reported"
              : `${formatBytesToGb(hardware.diskUsedBytes)} of ${formatBytesToGb(hardware.diskTotalBytes)} used${
                  free !== null ? ` · ${formatBytesToGb(free)} free` : ""
                }`
          }
        />
        {/* Sin batería no es "0 %": un sobremesa o un servidor no la tienen. */}
        <ResourceCard
          icon={<Battery5BarRoundedIcon sx={{ fontSize: ICON.lg }} />}
          label="Battery"
          tone={batteryPct === null ? "muted" : bTone}
          value={batteryPct === null ? "—" : formatDetailPercent(hardware.batteryPercent)}
          meter={batteryPct === null ? null : <UsageMeter value={batteryPct} tone={bTone} label="Battery charge" />}
          sub={batteryPct === null ? "No battery reported" : "Charge at last inventory"}
        />
      </TileRow>

      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
        Inventory collected {formatDetailDate(hardware.collectedAtUtc)}
      </Typography>
    </Stack>
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
                        {/* Dos fechas distintas: cuándo se instaló (lo dice el
                            equipo) y cuándo lo vimos nosotros por primera vez.
                            Para todo lo que ya estaba al enrolar, la segunda es
                            la fecha del enrolamiento. */}
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>
                          <Tooltip title="Date the current version was installed, as reported by the device">
                            <span>Installed</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 800, bgcolor: BRAND.surfaceMuted }}>
                          <Tooltip title="When Tracenium first saw this app on the device">
                            <span>Detected</span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {softwareRows.map((app, index) => (
                        <TableRow key={app.id || `${app.name}-${index}`} hover>
                          <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>{formatDetailValue(app.name)}</TableCell>
                          <TableCell>{formatDetailValue(app.publisher)}</TableCell>
                          <TableCell>{formatDetailValue(app.source)}</TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>{formatCalendarDay(app.installedOn)}</TableCell>
                          <TableCell>{formatDetailDate(app.detectedAtUtc || app.detected_at_utc)}</TableCell>
                        </TableRow>
                      ))}
                      {softwareRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} sx={{ color: "text.secondary", py: 3, textAlign: "center" }}>
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

export function PrintersTab({ printerRows = [], printersLoading = false, printerScan = null }) {
  // Why the last read was incomplete (Windows machineScope/userScope). With it,
  // an empty list is "could not read", not "has no printers".
  const readProblem = describePrinterReadProblem(printerScan);
  const notRead = Boolean(readProblem) && printerRows.length === 0;
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
                    label={notRead ? "Not read" : `${printerRows.length} printer${printerRows.length === 1 ? "" : "s"} detected`}
                    sx={
                      notRead
                        ? { bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warningText, fontWeight: 800 }
                        : { bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 800 }
                    }
                  />
                </Stack>
              </Stack>
              {readProblem && printerRows.length > 0 ? (
                <Typography
                  role="status"
                  sx={{
                    mb: 1.5,
                    px: 1.5,
                    py: 1,
                    borderRadius: 1.5,
                    fontSize: TEXT.sm,
                    bgcolor: BRAND.alert.warningSoft,
                    color: BRAND.alert.warningText,
                  }}
                >
                  {`Printer list may be incomplete (${readProblem})`}
                </Typography>
              ) : null}
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
                                  sx={{ bgcolor: ROLE.positiveSoft, color: BRAND.alert.successText, fontWeight: 800, height: 18 }}
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
                                    ? BRAND.alert.successText
                                    : p.status === "error"
                                    ? BRAND.alert.errorText
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
                              : readProblem
                              ? `Could not read printers (${readProblem})`
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
