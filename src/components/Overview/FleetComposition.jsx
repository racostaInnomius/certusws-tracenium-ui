// src/components/Overview/FleetComposition.jsx
//
// Donuts of the Overview's fleet row: Fleet composition (the shared
// FleetCompositionDonut from Hardware Inventory — it replaced "OS platform")
// and Agent version, plus an optional third slot (`patchCoverageSlot`).
// `DonutCard` below is also reused by PatchCoverageCard.jsx.
//
// "Top manufacturers" was in this panel originally but removed — an
// Overview about operational health shouldn't lead with vendor mix.
// The same data is available on the Assets page for anyone curious.
//
// The Agent version donut is the interesting one — it's not served as
// a first-class backend aggregate, so we compute it client-side by
// matching each host's `agent_version` against the "latest published"
// map we got from the binaries metadata endpoint. That means:
//   - "current" = reported version equals latest for its platform+arch
//   - "one behind" = reported version is within one minor
//   - "older" = everything else (or unknown)
// Zero surface area backend-side; any time the auto-update shippability
// threshold changes we adjust the classifier here.
//
// Reconciled totals ("pending" bucket): each donut used to show only
// what its own source table already had — OS platform counted
// host_current_status rows, Agent versions counted the `agent` table,
// Patch coverage counted completed SCP scans. Those totals can
// legitimately differ (they're different pipeline stages), but showing
// three different totals side by side on the same row reads as the
// dashboard's numbers not "adding up". Fix: every donut here now also
// accepts `fleetDevices` (the control-DB enrollment roster — the same
// number the "Devices" KPI card shows) and, when given, reconciles to
// it by rendering the gap as an explicit "pending" segment instead of
// silently excluding those devices from the total. No new backend
// query — `fleetDevices` already rides along in the dashboard summary
// bundle this page already fetches.

import { Grid, Box } from "@mui/material";
import { BRAND, ROLE } from "../../theme/brand";
import RingCard from "../Charts/RingCard";
import { PENDING_COLOR } from "../Charts/ringGeometry";

function getValue(result) {
  if (!result || result.status !== "fulfilled") return null;
  return result.value ?? null;
}

import { classifyAgentVersions } from "./agentVersions";
import FleetCompositionDonut from "../AssetManagement/FleetCompositionDonut";

// Re-exportado: vivía aquí, y ahora es de RingCard, que dibuja la rebanada.
export { PENDING_COLOR };

// Exported as a named export so the Assets page can reuse the exact
// same donut (classification + coloring + legend) instead of
// re-implementing it. The default export of this module stays the
// composition wrapper; individual primitives are opt-in for pages
// that only want one slice.
export function AgentVersionDonut({
  byVersion,
  latestMap,
  loading,
  onCardClick,
  onSegmentClick,
  fleetDevices = null,
  agentTotal = null
}) {
  const { buckets, canonicalLatest } = classifyAgentVersions(
    byVersion,
    latestMap
  );

  const data = [
    { name: "Current", value: buckets.current, color: ROLE.positive },
    { name: "One behind", value: buckets.oneBehind, color: ROLE.caution },
    { name: "Older", value: buckets.older, color: ROLE.critical },
    { name: "Unknown", value: buckets.unknown, color: BRAND.gray }
  ].filter((x) => x.value > 0);

  const fallback = !canonicalLatest
    ? "No latest-version data"
    : !Array.isArray(byVersion) || byVersion.length === 0
    ? "No enrolled devices"
    : "No version data";

  // Reconcile against the enrollment roster (see file header comment).
  // `agentTotal` is the backend's own count of `agent` rows — prefer it
  // over re-summing `byVersion` since it's the exact same number the
  // pre-reconciliation "checked in" label used to show.
  const knownTotal =
    agentTotal ??
    (Array.isArray(byVersion)
      ? byVersion.reduce((sum, r) => sum + Number(r?.count ?? 0), 0)
      : 0);
  const pendingValue =
    fleetDevices != null ? Math.max(fleetDevices - knownTotal, 0) : null;

  return (
    <DonutCard
      title="Agent versions"
      // La versión publicada va al subtítulo: en el título alargaba la
      // cabecera hasta partirla en dos líneas en una columna md:4, y
      // descuadraba la altura frente a Fleet composition.
      subtitle={canonicalLatest ? `Latest published ${canonicalLatest}` : "Against the latest published build"}
      data={data}
      loading={loading}
      // "checked in", not "devices": this counts rows in the `agent`
      // table (agent has connected at least once), an earlier pipeline
      // stage than the "reporting" total the OS platform donut shows —
      // the two can legitimately differ. Once fleetDevices is known,
      // the total is reconciled to the full roster and the label
      // switches to "enrolled" (see DonutCard's pending handling).
      totalLabel={fleetDevices != null ? "enrolled" : "checked in"}
      fallbackLabel={fallback}
      onCardClick={onCardClick}
      onSegmentClick={onSegmentClick}
      pendingValue={pendingValue}
      pendingLabel="Not connected"
    />
  );
}

export function DonutCard({
  title,
  subtitle = null,
  data,
  loading,
  totalLabel = "items",
  fallbackLabel = "No data",
  onCardClick,
  onSegmentClick,
  // When set (and > 0), a "pending" segment is appended to the chart —
  // devices counted in the reconciled roster (see file header comment)
  // that this particular donut's own source table doesn't have a row
  // for yet. `null` means "no roster to reconcile against" (an older
  // backend, or the roster fetch failed) — falls back to the donut's
  // own total, exactly like before this existed.
  pendingValue = null,
  pendingLabel = "Pending"
}) {
  const hasPending = pendingValue != null && pendingValue > 0;
  // El dibujo es el de Fleet composition (Charts/RingCard): anillo grueso,
  // cifra grande y leyenda en fichas. Los COLORES siguen siendo los de cada
  // dona — `data[].color` pasa tal cual.
  const slices = [
    ...data.map((d) => ({ key: d.name, label: d.name, value: d.value, color: d.color })),
    ...(hasPending
      ? [{ key: "__pending__", label: pendingLabel, value: pendingValue, color: PENDING_COLOR, pending: true }]
      : []),
  ];

  return (
    <RingCard
      title={title}
      subtitle={subtitle}
      slices={slices}
      centerLabel={totalLabel}
      loading={loading}
      emptyLabel={fallbackLabel}
      ariaNoun={totalLabel}
      onCardClick={onCardClick}
      // La rebanada original, con `name`: es lo que los llamadores ya leen
      // para decidir el filtro.
      onSliceClick={
        typeof onSegmentClick === "function"
          ? (s) => onSegmentClick(data.find((d) => d.name === s.key) ?? { name: s.key, value: s.value })
          : null
      }
      // Radio 2 y sin sombra, como sus vecinas de fila en Overview y Assets.
      sx={{ borderRadius: 2, boxShadow: "none" }}
    />
  );
}

export default function FleetComposition({ results, loading, onNavigate, patchCoverageSlot = null }) {
  const dashboard = getValue(results?.dashboardSummary);
  const latest = getValue(results?.latestVersions);
  const agentVersions = getValue(results?.agentVersions);

  // Control-DB enrollment roster — the reconciliation denominator (see
  // file header comment). Same field HeroKpis' "Devices" card already
  // uses, so this donut row and that KPI never disagree on what "the
  // fleet" is.
  const fleetDevices =
    typeof dashboard?.fleetDevices === "number" ? dashboard.fleetDevices : null;

  // Composición de la flota (laptops / desktops / servers + virtuales), la
  // misma dona que Hardware Inventory. Sustituye a "OS platform": qué TIPO de
  // equipos hay dice más en una portada que el reparto por sistema operativo,
  // que ya enseña el dashboard de Asset Management.
  const hardware = getValue(results?.hardwareSummary);
  const fleet = hardware?.fleet;

  // Agent version donut is now powered by a dedicated backend aggregate
  // (`/dashboard/agent-versions`), which is the only place this tenant's
  // per-version distribution lives — `/dashboard/hosts` omits the field.
  const latestMap = {};
  if (Array.isArray(latest)) {
    for (const entry of latest) {
      if (entry?.ok && entry.data?.latestVersion) {
        latestMap[`${entry.platform}:${entry.arch}`] = entry.data.latestVersion;
      }
    }
  }
  const byVersion = Array.isArray(agentVersions?.byVersion)
    ? agentVersions.byVersion
    : [];

  // Navigation helpers. Fleet composition + Agent versions are fleet-wide
  // breakdowns (count every enrolled device, not just the SCP-reporting
  // subset), so clicks land on Asset Management rather than Security
  // Compliance — the previous `ad` destination silently dropped devices
  // that hadn't reported SCP facts yet, causing a count mismatch
  // between the donut and the filtered page.
  //
  // Patch Coverage is the exception: it IS SCP-specific by
  // construction, so its drilldown stays in `ad` (handled by the
  // parent via `patchCoverageSlot`).
  const navToAssets = (query) => onNavigate?.("assets", query);

  // Sin tercer donut (el de parches es de SCP y vive en el bloque 2), los dos
  // que quedan reparten la fila en vez de dejar un tercio vacío.
  const cell = patchCoverageSlot ? { xs: 12, sm: 6, md: 4 } : { xs: 12, sm: 6 };

  return (
    // `height: 100%`: la fila del Overview estira sus celdas y esta rejilla
    // tiene que llenar la suya, o las donas quedan más bajas que la card de
    // Software delivery de al lado.
    <Grid container spacing={2} sx={{ height: "100%" }}>
      <Grid size={cell} sx={{ display: "flex" }}>
        <Box sx={{ width: "100%" }}>
          <FleetCompositionDonut
            composition={fleet?.composition}
            total={fleet?.total}
            loading={loading}
            sx={{ borderRadius: 2, boxShadow: "none", minHeight: 0 }}
            // A Hardware Inventory, donde vive la MISMA dona (mismo endpoint),
            // con el segmento ya filtrado: la cifra pulsada es la que se ve.
            onSelect={(key) => onNavigate?.("assets", { assetsTab: "hardware", hwFleet: key })}
          />
        </Box>
      </Grid>
      <Grid size={cell} sx={{ display: "flex" }}>
        <Box sx={{ width: "100%" }}>
        <AgentVersionDonut
          byVersion={byVersion}
          latestMap={latestMap}
          loading={loading}
          fleetDevices={fleetDevices}
          agentTotal={typeof agentVersions?.total === "number" ? agentVersions.total : null}
          onCardClick={() => navToAssets()}
          // Filtra por el grupo pulsado. Estuvo sin filtro mientras Assets
          // filtraba sólo la página cargada (Older 4 → 2 filas); desde
          // d71f272/0e19984 filtra en el servidor con esta misma regla y
          // validado en el portal da 4/3/46, lo mismo que esta dona.
          onSegmentClick={(segment) => {
            const label = String(segment.name || "").toLowerCase();
            const bucket = label.includes("current")
              ? "current"
              : label.includes("one behind")
              ? "one_behind"
              : label.includes("older")
              ? "older"
              : label.includes("unknown")
              ? "unknown"
              : null;
            // "Not connected" (pendientes) no es un grupo de versión: a Assets sin filtro.
            navToAssets(bucket ? { versionBucket: bucket } : undefined);
          }}
        />
        </Box>
      </Grid>
      {patchCoverageSlot ? (
        <Grid size={cell}>
          {patchCoverageSlot}
        </Grid>
      ) : null}
    </Grid>
  );
}
