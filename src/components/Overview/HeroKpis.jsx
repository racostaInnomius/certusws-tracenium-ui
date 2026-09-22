// src/components/Overview/HeroKpis.jsx
//
// KPI row of block 1 (Fleet & operations), the one every plan sees — so it
// only reads data that EVERY plan has: AMP, SDP when entitled, jobs and alerts.
//
// The Compliance and Critical findings cards used to live here. On a
// Starter tenant (no SCP) they read "—" and, worse, "0 · no open
// high-severity findings" in green: /security/compliance/summary has no
// entitlement gate and answers zero to a tenant with no plugin looking for
// findings. They moved to SecurityKpis.jsx, which only mounts when the plan
// includes SCP.
//
// Cards fade in with skeleton while data loads and show a neutral
// zero-state if a backing endpoint failed — partial data is better than a
// blank dashboard.

import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import CloudDoneOutlinedIcon from "@mui/icons-material/CloudDoneOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import { BRAND, ROLE } from "../../theme/brand";
import { KpiRow } from "./Kpi";
import { coverageKpiCard } from "./coverageKpi";
import { formatPct, getValue, listLength } from "./overviewResults";

export default function HeroKpis({
  results,
  loading,
  onNavigate,
  hasSdp = false,
  coverageSignal = null,
  coverageFleet = 0,
  onOpenGapDevices,
}) {
  const dashboard = getValue(results?.dashboardSummary);
  const connected = getValue(results?.connectedDevices);
  const jobsTs = getValue(results?.jobsTimeseries);

  // Devices — the fleet roster from the control DB (`fleetDevices`), the
  // same number the MSP portfolio, Remote Control and the license rule
  // use. `totalHosts` counts only devices that have REPORTED inventory; a
  // device that enrolled and never checked in was invisible under it. The
  // older keys stay as the fallback for a backend without fleetDevices.
  const fleetDevices = dashboard?.fleetDevices;
  const reportingDevices = dashboard?.totalHosts ?? dashboard?.total_hosts ?? null;
  const totalDevices =
    fleetDevices ??
    dashboard?.totalDevices ??
    dashboard?.total_devices ??
    dashboard?.totalHosts ??
    dashboard?.total_hosts ??
    0;
  const notReporting =
    fleetDevices != null && reportingDevices != null
      ? Math.max(fleetDevices - reportingDevices, 0)
      : 0;

  // Online now — `/orchestrator/devices-connected` derives it from
  // `device_sessions.last_heartbeat`, the source the Jobs page trusts.
  const onlineCount =
    connected?.count ??
    (Array.isArray(connected?.deviceIds) ? connected.deviceIds.length : null) ??
    null;
  const onlinePct =
    totalDevices && onlineCount != null ? (onlineCount / totalDevices) * 100 : null;
  const onlineRole =
    onlinePct == null ? null : onlinePct >= 90 ? "positive" : onlinePct >= 70 ? "caution" : "critical";

  // Failed jobs, 7 days. Replaces "Jobs in flight": the queue is what the
  // Jobs chart right below already draws, and what needs a person is what
  // FAILED. The sparkline is the same series, per day.
  const buckets = Array.isArray(jobsTs?.buckets) ? jobsTs.buckets : [];
  const failedJobs = buckets.reduce((sum, b) => sum + Number(b?.failed ?? 0), 0);
  const failedSpark = buckets.map((b) => Number(b?.failed ?? 0));

  const navigate = (page, query) => onNavigate?.(page, query);

  const cards = [
    {
      title: "Devices",
      value: totalDevices,
      // When the two counts disagree the gap is the story: those devices
      // enrolled (got a cert) and never sent inventory.
      subtitle: !totalDevices
        ? null
        : notReporting > 0
          ? `${notReporting} enrolled, not reporting`
          : "total enrolled",
      icon: DevicesOutlinedIcon,
      accent: BRAND.teal,
      tint: BRAND.tealSoft,
      onClick: () => navigate("assets"),
    },
    {
      title: "Online now",
      value: onlineCount ?? "—",
      subtitle: onlinePct != null ? `${formatPct(onlinePct)} of fleet` : "— no session data",
      icon: CloudDoneOutlinedIcon,
      accent: onlineRole ? ROLE[onlineRole] : BRAND.teal,
      tint: onlineRole ? ROLE[`${onlineRole}Soft`] : BRAND.tealSoft,
      onClick: () => navigate("assets"),
    },
  ];

  if (hasSdp) {
    const running = results?.sdpRunning;
    const queued = results?.sdpQueued;
    const known = running?.status === "fulfilled" && queued?.status === "fulfilled";
    const inProgress = known ? listLength(running.value) + listLength(queued.value) : null;
    const sdpTs = getValue(results?.sdpTimeseries);
    const failedInstalls = Array.isArray(sdpTs?.buckets)
      ? sdpTs.buckets.reduce((sum, b) => sum + Number(b?.failed ?? 0), 0)
      : null;
    cards.push({
      title: "Deployments in progress",
      value: inProgress ?? "—",
      subtitle:
        failedInstalls == null
          ? null
          : failedInstalls > 0
            ? `${failedInstalls} installs failed · 30d`
            : "no failed installs · 30d",
      icon: RocketLaunchOutlinedIcon,
      accent: BRAND.teal,
      tint: BRAND.cyanSoft,
      onClick: () => navigate("software-delivery"),
    });
  }

  cards.push(
    {
      title: "Failed jobs",
      value: failedJobs,
      subtitle: failedJobs ? "last 7 days" : "none in 7 days",
      icon: ErrorOutlineOutlinedIcon,
      accent: failedJobs > 0 ? ROLE.critical : ROLE.positive,
      tint: failedJobs > 0 ? ROLE.criticalSoft : ROLE.positiveSoft,
      sparkline: failedJobs > 0 ? failedSpark : null,
      // failed + timeout y 7 días: exactamente lo que suma la cifra (la serie
      // del backend cuenta las dos). Jobs lo filtra EN SERVIDOR; en el
      // navegador sólo veía las 200 filas más recientes.
      onClick: () => navigate("jobs", { status: "failed,timeout", since: "7d" }),
    },
  );

  // De cuántos equipos no sabemos nada. Ocupa el sitio de "Unread alerts":
  // esa cifra ya está en la campana de la barra superior, en todas las
  // páginas, así que aquí no añadía nada. Sin datos de cobertura (403 sin
  // `assets_view`, o fallo) la fila se queda con las demás.
  if (coverageSignal) {
    cards.push(coverageKpiCard(coverageSignal, coverageFleet, onOpenGapDevices, "Blind spots"));
  }

  return <KpiRow cards={cards} loading={loading} />;
}
