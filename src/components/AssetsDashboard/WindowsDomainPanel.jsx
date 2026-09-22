// src/components/AssetsDashboard/WindowsDomainPanel.jsx
//
// "Windows GPOs" and "Coverage" were two tabs in Asset Management's main bar,
// but neither one is asked of a Mac or a Linux box: GPOs are Group Policy,
// and Coverage is Active Directory discovery. Sitting as siblings of Hardware
// Inventory or Software Inventory made them read as another dimension of the
// same multi-platform inventory, when they only ever answer "what do we know
// about the Windows domain".
//
// Folded here as two sections of one tab, same left-nav shape as Patch
// Management's Configure (ConfigurePanel.jsx) — pick a section on the left,
// its existing page renders on the right. Neither WindowsGpos nor
// CoveragePanel is rewritten; this is only where they now live.

import * as React from "react";
import SideSectionLayout from "../common/SideSectionLayout";
import WindowsGpos from "../../pages/WindowsGpos";
// Coverage's own API call only answers once the discovery migration is
// applied; kept lazy so opening the GPO section (the default) never pays for
// it, same budget Assets.jsx held before the merge.
const CoveragePanel = React.lazy(() => import("../discovery/CoveragePanel"));

export const WINDOWS_DOMAIN_SECTIONS = [
  {
    key: "gpos",
    label: "Group Policy",
    blurb: "GPOs applied across the fleet, and how many devices share each one.",
  },
  {
    key: "coverage",
    label: "Coverage",
    blurb: "Devices Active Directory knows about that have no agent yet.",
  },
];

export default function WindowsDomainPanel({
  refreshNonce,
  canManage = false,
  onNavigate = null,
  section,
  onSectionChange,
}) {
  // Controlled when the page deep-links into a section (old ?assetsTab=gpos
  // / ?assetsTab=coverage links still resolve here — see resolveAssetsTab),
  // uncontrolled otherwise.
  const [local, setLocal] = React.useState(WINDOWS_DOMAIN_SECTIONS[0].key);
  const active = section ?? local;
  const select = (key) => {
    setLocal(key);
    onSectionChange?.(key);
  };

  return (
    <SideSectionLayout
      sections={WINDOWS_DOMAIN_SECTIONS}
      active={active}
      onSelect={select}
      ariaLabel="Windows domain"
    >
      {active === "gpos" ? (
        <WindowsGpos refreshNonce={refreshNonce} />
      ) : active === "coverage" ? (
        <React.Suspense fallback={null}>
          <CoveragePanel refreshNonce={refreshNonce} canManage={canManage} onNavigate={onNavigate} />
        </React.Suspense>
      ) : null}
    </SideSectionLayout>
  );
}
