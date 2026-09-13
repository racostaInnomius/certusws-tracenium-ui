// src/components/Overview/PluginSummaryCards.jsx
//
// One card per plugin page that had no presence on the Overview: Software
// Delivery (block 1), Patch Management and Crypto Discovery (block 3), plus
// Reports, which is in every plan. Each reads ONE cheap aggregate the page
// already serves — nothing here computes per device.
//
// Deliberately NOT here: CVE exposure (`/vulnerabilities/exposure` matches
// ~8.7k CVEs against every device's apps in memory) and PQC readiness
// (`/cdp/pqc`). Both are heavy for a landing page; their pages own them.

import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import { Box, Tooltip } from "@mui/material";
import { BRAND, ROLE } from "../../theme/brand";
import SummaryStatCard from "./SummaryStatCard";
import { getValue, listLength } from "./overviewResults";

const n = (v) => Number(v ?? 0);

/** Zero is quiet; anything above it takes the tone. */
const toneIf = (count, tone) => (count > 0 ? tone : "neutral");

function formatWhen(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// ── Software Delivery ────────────────────────────────────────────────

/**
 * Daily installs, 30 days, as a strip of thin bars: succeeded in teal with
 * the failed share on top in red. CSS only — Recharts is not on the first
 * paint of this page (see Overview.jsx) and 30 bars do not need it.
 */
function InstallStrip({ buckets }) {
  const max = Math.max(1, ...buckets.map((b) => n(b.total) || n(b.succeeded) + n(b.failed)));
  return (
    <Box
      aria-hidden
      sx={{ display: "flex", alignItems: "flex-end", gap: "2px", height: 40, mb: 1 }}
    >
      {buckets.map((b) => {
        const ok = n(b.succeeded);
        const bad = n(b.failed);
        return (
          <Tooltip key={b.bucket} title={`${b.bucket}: ${ok} succeeded · ${bad} failed`} arrow>
            <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
              <Box sx={{ height: `${(bad / max) * 100}%`, bgcolor: ROLE.critical, borderRadius: "2px 2px 0 0" }} />
              <Box sx={{ height: `${(ok / max) * 100}%`, bgcolor: BRAND.teal, minHeight: ok || bad ? 0 : 2, opacity: ok || bad ? 1 : 0.2 }} />
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

export function SoftwareDeliveryCard({ results, loading, onNavigate }) {
  const tsResult = results?.sdpTimeseries;
  const ts = getValue(tsResult);
  const buckets = Array.isArray(ts?.buckets) ? ts.buckets : [];
  const succeeded = buckets.reduce((s, b) => s + n(b.succeeded), 0);
  const failed = buckets.reduce((s, b) => s + n(b.failed), 0);
  const total = succeeded + failed;

  // "Running" ya no es fila: lo cuenta la KPI "Deployments in progress" de
  // arriba. Se sigue leyendo para no dar la card por vacía con una campaña
  // en marcha.
  const running = listLength(getValue(results?.sdpRunning));
  const queued = listLength(getValue(results?.sdpQueued));

  return (
    <SummaryStatCard
      title="Software delivery"
      icon={RocketLaunchOutlinedIcon}
      subtitle="Installs over the last 30 days"
      inlineSubtitle
      loading={loading}
      failed={tsResult?.status === "rejected"}
      empty={
        total === 0 && running + queued === 0
          ? "No software installs in the last 30 days. Deploy a package from Software Delivery."
          : null
      }
      stats={[
        {
          label: "Success rate",
          value: total ? `${Math.round((succeeded / total) * 100)}%` : "—",
          tone: total && failed / total > 0.1 ? "caution" : "neutral",
          hint: `${succeeded} succeeded of ${total}`,
        },
        { label: "Failed installs", value: failed, tone: toneIf(failed, "critical") },
        { label: "Deployments queued", value: queued },
      ]}
      onCardClick={() => onNavigate?.("software-delivery")}
    >
      {total > 0 ? <InstallStrip buckets={buckets} /> : null}
    </SummaryStatCard>
  );
}

// ── Reports ──────────────────────────────────────────────────────────

export function ReportsCard({ results, loading, onNavigate }) {
  const runsResult = results?.reportRuns;
  const runs = getValue(runsResult);
  const last = Array.isArray(runs?.runs) ? runs.runs[0] : null;
  const total = n(runs?.total);

  // `/reports/schedules` es ADMIN/OWNER. A un USER le llega 403: la fila no
  // se pinta, porque "0 schedules" le afirmaría algo que no puede ver.
  const schedulesResult = results?.reportSchedules;
  const schedules = Array.isArray(getValue(schedulesResult)?.schedules)
    ? getValue(schedulesResult).schedules
    : null;
  const active = schedules ? schedules.filter((s) => s.enabled) : [];
  const nextRun = active
    .map((s) => s.nextRunAt)
    .filter(Boolean)
    .sort()[0];

  const stats = [
    { label: "Reports generated", value: total },
  ];
  if (last) {
    stats.push({
      label: "Last report",
      value: last.outcome === "failed" ? "failed" : "ok",
      tone: last.outcome === "failed" ? "critical" : "positive",
      hint: [last.filename || last.key, formatWhen(last.occurredAt)].filter(Boolean).join(" · "),
    });
  }
  if (schedules) {
    stats.push({
      label: "Active schedules",
      value: active.length,
      hint: nextRun ? `next ${formatWhen(nextRun)}` : undefined,
    });
  }

  return (
    <SummaryStatCard
      title="Reports"
      icon={AssessmentOutlinedIcon}
      loading={loading}
      failed={runsResult?.status === "rejected"}
      empty={
        total === 0 && active.length === 0
          ? "No reports generated yet. Every page with a Report button leads to its report."
          : null
      }
      stats={stats}
      openLabel="Reports"
      // History: es donde están los "Reports generated" que cuenta la card.
      onOpen={() => onNavigate?.("reports", { reportsTab: "history" })}
    />
  );
}

// ── Patch Management ─────────────────────────────────────────────────

export function PatchManagementCard({ results, loading, onNavigate }) {
  const result = results?.patchSummary;
  const summary = getValue(result)?.summary;
  const status = summary?.statusBreakdown || {};
  const severity = summary?.severityBreakdown || {};
  const reporting = n(summary?.devicesReporting);
  const criticalish = n(severity.critical) + n(severity.important);

  return (
    <SummaryStatCard
      title="Patch management"
      icon={SystemUpdateAltOutlinedIcon}
      subtitle={reporting ? `${reporting} devices reporting` : null}
      loading={loading}
      failed={result?.status === "rejected"}
      empty={
        reporting === 0
          ? "No device has reported patch data yet. Patch Management is opt-in: enable it in Agent Settings."
          : null
      }
      stats={[
        { label: "Devices with updates available", value: n(status.updates_available), tone: toneIf(n(status.updates_available), "caution") },
        { label: "Reboot required", value: n(status.reboot_required), tone: toneIf(n(status.reboot_required), "critical") },
        { label: "Critical + important patches missing", value: criticalish, tone: toneIf(criticalish, "critical"), hint: "count of patches across the fleet, not devices" },
        { label: "Devices up to date", value: n(status.healthy), tone: toneIf(n(status.healthy), "positive") },
        { label: "Scan or install errors", value: n(status.error), tone: toneIf(n(status.error), "critical") },
      ]}
      openLabel="Patch Management"
      onOpen={() => onNavigate?.("patch")}
    />
  );
}

// ── Crypto Discovery ─────────────────────────────────────────────────

export function CryptoDiscoveryCard({ results, loading, onNavigate }) {
  const result = results?.cdpSummary;
  const s = getValue(result)?.summary;
  const reporting = n(s?.devicesReporting);

  return (
    <SummaryStatCard
      title="Crypto discovery"
      icon={BadgeOutlinedIcon}
      subtitle={reporting ? `${n(s?.totalCerts)} end-entity certificates on ${reporting} devices` : null}
      loading={loading}
      failed={result?.status === "rejected"}
      empty={
        reporting === 0
          ? "No device has reported certificates yet. Crypto Discovery is opt-in: enable it in Agent Settings."
          : null
      }
      stats={[
        // Mismo orden que la página: caducado-con-clave antes que caducado a
        // secas. Sin clave privada rara vez es incidencia; con clave es una
        // identidad viva que ya no vale.
        { label: "Expired, with private key", value: n(s?.expiredWithKey), tone: toneIf(n(s?.expiredWithKey), "critical") },
        { label: "Expiring in 30 days", value: n(s?.expiring30d), tone: toneIf(n(s?.expiring30d), "caution"), hint: `${n(s?.expiring7d)} within 7 days` },
        { label: "Hygiene flags", value: n(s?.withFlags), tone: toneIf(n(s?.withFlags), "caution"), hint: "weak signature or key, self-signed leaves" },
        { label: "With private key", value: n(s?.withPrivateKey) },
      ]}
      openLabel="Crypto Discovery"
      onOpen={() => onNavigate?.("cdp")}
    />
  );
}
