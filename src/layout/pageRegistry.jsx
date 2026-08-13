// src/layout/pageRegistry.jsx
//
// Page dispatch table for AppShell, replacing the flat if-ladder that used to
// live inline. Every entry is `key → (ctx) => element`; `ctx` carries the few
// shell-owned callbacks a page can ask for:
//
//   ctx.onNavigate                 — setSelectedPage, for in-page navigation
//   ctx.onAssetsEmptyStateChange   — first-run empty-fleet flow (Assets only)
//
// Adding a page is now one entry here plus its React.lazy import — no branch
// to append. renderPage() falls back to Overview for an unknown key, which is
// safer than dropping the operator onto a page they didn't ask for.
//
// All page modules stay React.lazy so each route keeps its own chunk.

import * as React from "react";

const Assets = React.lazy(() => import("../pages/Assets"));
const Overview = React.lazy(() => import("../pages/Overview"));
const Configurations = React.lazy(() => import("../pages/Configurations"));
const TokensAdministrator = React.lazy(() => import("../pages/TokensAdministrator"));
const TenantsAdministrator = React.lazy(() => import("../pages/TenantsAdministrator"));
const Welcome = React.lazy(() => import("../pages/Welcome"));
const AgentReleases = React.lazy(() => import("../pages/AgentReleases"));
const SoftwareDelivery = React.lazy(() => import("../pages/SoftwareDelivery"));
const DeviceEnrollment = React.lazy(() => import("../pages/DeviceEnrollment"));
const PluginControl = React.lazy(() => import("../pages/PluginControl"));
const Jobs = React.lazy(() => import("../pages/Jobs"));
// SecurityBaselines is no longer mounted directly — Fase B folded it
// into Security Compliance as the Baselines tab; the `security-baselines`
// key below is a route alias, same pattern as `agent-settings`/`policies`
// aliasing into Configurations.
const DeviceManagement = React.lazy(() => import("../pages/DeviceManagement"));
const Audit = React.lazy(() => import("../pages/Audit"));
const PKI = React.lazy(() => import("../pages/PKI"));
const SecurityCompliance = React.lazy(() => import("../pages/SecurityCompliance"));
const PatchManagement = React.lazy(() => import("../pages/PatchManagement"));
const Alerts = React.lazy(() => import("../pages/Alerts"));
const RemoteControl = React.lazy(() => import("../pages/RemoteControl"));
const Retention = React.lazy(() => import("../pages/Retention"));
const SessionSettings = React.lazy(() => import("../pages/SessionSettings"));
const CryptoDiscovery = React.lazy(() => import("../pages/CryptoDiscovery"));
const LocationSites = React.lazy(() => import("../pages/LocationSites"));

export const PAGE_REGISTRY = {
  // Assets keeps its welcome-state callback because the first-time
  // empty-fleet flow is owned by this page, not by Overview.
  assets: (ctx) => (
    <Assets
      onAssetsEmptyStateChange={ctx.onAssetsEmptyStateChange}
      suppressEmptyStateOverlay
    />
  ),

  configurations: (ctx) => <Configurations onNavigate={ctx.onNavigate} />,

  // Device Enrollment is the combined surface — sidebar entry for
  // operators ("download installer + mint a token in the same flow").
  enrollment: () => <DeviceEnrollment />,

  // Plugin Control — tenant-wide plugin enablement, split out of
  // Policies so the "what's on" knob is separated from the "how it
  // behaves" knobs. Admin-scoped at the UI layer; backend hardening
  // (whitelist + role middleware) is Phase 2.
  "plugin-control": () => <PluginControl />,

  // Legacy `tokens` route kept alive so existing bookmarks / deep links
  // (Settings → Tokens cards from prior releases, automation links)
  // don't 404. The standalone TokensAdministrator still works; the new
  // primary entry point is Device Enrollment.
  tokens: () => <TokensAdministrator />,

  tenants: () => <TenantsAdministrator mode="global" />,
  "tenant-members": () => <TenantsAdministrator mode="tenant" />,

  welcome: (ctx) => <Welcome onNavigate={ctx.onNavigate} />,

  // Agent releases — admin catalog of Tracenium agent installer
  // binaries. The primary user-facing entry is the Device Enrollment
  // → Agent Downloads tab; this page itself is mostly admin-only CRUD.
  // Originally mounted at `software-delivery` until the 2026-05-01
  // rename; the transition alias was dropped in Batch 3.
  "agent-releases": () => <AgentReleases />,

  // Software Delivery (SDP) — operator surface for deploying
  // third-party software to the fleet. Distinct from `agent-releases`
  // (which catalogs the Tracenium agent's own installer binaries).
  // Two tabs: Catalog (CRUD packages) and Deployments (history +
  // per-device results).
  "software-delivery": (ctx) => <SoftwareDelivery onNavigate={ctx.onNavigate} />,

  jobs: () => <Jobs />,

  // The old single "Policies" page was split into three surfaces, one
  // per audience: agent/plugin behavior (platform operator), security
  // remediation baselines (security team), and enterprise device
  // management (MDM/MAM). They edit disjoint slices of the SAME tenant
  // policy document through domain-scoped PATCH endpoints, so they
  // can't clobber each other.
  // Agent Settings was folded into Settings as its second division —
  // both are tenant-scoped configuration. These two keys stay alive as
  // aliases so existing deep links (and the Patch Management CTA) keep
  // working; they just open Settings on the agent tab.
  "agent-settings": (ctx) => <Configurations onNavigate={ctx.onNavigate} initialTab="agent" />,
  "security-baselines": () => <SecurityCompliance initialTab="baselines" />,
  "device-management": (ctx) => <DeviceManagement onNavigate={ctx.onNavigate} />,
  policies: (ctx) => <Configurations onNavigate={ctx.onNavigate} initialTab="agent" />,

  audit: () => <Audit />,
  pki: () => <PKI />,
  ad: () => <SecurityCompliance />,
  patch: () => <PatchManagement />,

  // Crypto Discovery (CDP) — certificate inventory discovered ON the
  // devices by the cdp agent plugin. Distinct from PKI (the agent's
  // own mTLS identity certs).
  cdp: () => <CryptoDiscovery />,

  "remote-control": () => <RemoteControl />,
  alerts: () => <Alerts />,

  // Retention — admin-only drilldown reached from the "Database retention"
  // card on Settings. Mounted at top level (not nested under settings/*)
  // because deep linking is one of the operational needs: paste the link
  // into a maintenance ticket, hit it, see sizes + last-run audit.
  retention: (ctx) => <Retention onNavigate={ctx.onNavigate} />,

  // Session security — auto-logout toggle + idle minutes. Same
  // top-level dispatch as the other Settings sub-pages so deep
  // linking works (?page=session-settings).
  "session-settings": (ctx) => <SessionSettings onNavigate={ctx.onNavigate} />,

  // Location sites — the CIDR→site map behind the device drawer's "Location"
  // field. Reached from Settings; deep-linkable like the other sub-pages.
  "location-sites": (ctx) => <LocationSites onNavigate={ctx.onNavigate} />,
};

// Default → Overview. Any unrecognized ?page= key also falls through to
// Overview, which is safer than dropping the user onto a page they didn't ask
// for.
export function renderPage(selectedPage, ctx = {}) {
  const entry = PAGE_REGISTRY[selectedPage];
  return entry ? entry(ctx) : <Overview />;
}
