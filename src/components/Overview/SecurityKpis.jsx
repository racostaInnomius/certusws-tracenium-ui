// src/components/Overview/SecurityKpis.jsx
//
// KPI row of block 2 (Security & access, Professional). Only mounts when the
// plan includes SCP or RCP, and each card is gated by ITS plugin — a tenant
// with SCP and no RCP sees the compliance cards and nothing about remote
// sessions.
//
// Compliance and Critical findings came from the old single hero row, where a
// Starter tenant read "0 · no open high-severity findings" in green. Here
// they only exist when there is a plugin looking for findings.

import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import SettingsRemoteOutlinedIcon from "@mui/icons-material/SettingsRemoteOutlined";
import ScreenShareOutlinedIcon from "@mui/icons-material/ScreenShareOutlined";
import { BRAND, ROLE } from "../../theme/brand";
import { KpiRow } from "./Kpi";
import { getValue } from "./overviewResults";
import { formatFleetScore } from "../../theme/scoreBands";

function scoreRole(score) {
  if (score == null) return null;
  return score >= 85 ? "positive" : score >= 60 ? "caution" : "critical";
}

export default function SecurityKpis({ results, loading, onNavigate, has, extraCards = [] }) {
  const navigate = (page, query) => onNavigate?.(page, query);
  const cards = [];

  if (has("scp")) {
    const summary = getValue(results?.complianceSummary)?.summary;
    const score = summary?.avgScore ?? null;
    const role = scoreRole(score);
    const findings = summary?.openFindings ?? {};
    const criticalHigh = Number(findings.critical ?? 0) + Number(findings.high ?? 0);
    const reporting = summary?.devicesReporting ?? null;

    cards.push(
      {
        title: "Compliance",
        value: formatFleetScore(score),
        subtitle: reporting != null ? `${reporting} devices reporting` : null,
        icon: ShieldOutlinedIcon,
        accent: role ? ROLE[role] : BRAND.teal,
        tint: role ? ROLE[`${role}Soft`] : BRAND.tealSoft,
        onClick: () => navigate("ad"),
      },
      {
        title: "Critical findings",
        // Sin equipos reportando, cero no es "todo bien": es "nadie ha
        // mirado". Se dice así en vez de pintar un 0 verde.
        value: reporting ? criticalHigh : "—",
        subtitle: !reporting
          ? "no device has reported yet"
          : criticalHigh
            ? "critical + high, open"
            : "no open high-severity findings",
        icon: ReportProblemOutlinedIcon,
        accent: !reporting ? BRAND.teal : criticalHigh > 0 ? ROLE.critical : ROLE.positive,
        tint: !reporting ? BRAND.tealSoft : criticalHigh > 0 ? ROLE.criticalSoft : ROLE.positiveSoft,
        onClick: () => navigate("ad", { severity: "high" }),
      }
    );
  }

  // `/remote-control/summary` exige ADMIN/OWNER: a un USER le llega 403. Sus
  // cards no se pintan en vez de enseñar "—", que se leería como avería.
  const rcpResult = results?.rcpSummary;
  if (has("rcp") && rcpResult?.status !== "rejected") {
    const rcp = getValue(rcpResult)?.summary;
    const active = Number(rcp?.activeSessions ?? 0);
    const denied = Number(rcp?.deniedByUser7d ?? 0);

    cards.push(
      {
        title: "Remote-ready",
        value: rcp?.readyNow ?? "—",
        subtitle: rcp?.fleetTotal != null ? `online and capable, of ${rcp.fleetTotal}` : null,
        icon: SettingsRemoteOutlinedIcon,
        accent: BRAND.teal,
        tint: BRAND.tealSoft,
        onClick: () => navigate("remote-control"),
      },
      {
        title: "Remote sessions",
        value: rcp?.sessionsLast7d ?? "—",
        subtitle: active
          ? `${active} active now`
          : denied
            ? `${denied} denied by the user · 7d`
            : "last 7 days",
        icon: ScreenShareOutlinedIcon,
        accent: active ? ROLE.caution : BRAND.teal,
        tint: active ? ROLE.cautionSoft : BRAND.cyanSoft,
        onClick: () => navigate("remote-control"),
      }
    );
  }

  // Lo que la página añade a la fila (hoy: "Compliance reporting", el hueco de
  // SCP — ver coverageKpi.js). KpiRow reparte el ancho entre las que haya.
  cards.push(...extraCards);

  if (cards.length === 0) return null;
  return <KpiRow cards={cards} loading={loading} />;
}
