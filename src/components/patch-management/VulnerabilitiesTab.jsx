// src/components/patch-management/VulnerabilitiesTab.jsx
//
// The Vulnerabilities tab: which installed software in the fleet is exposed.
//
// The CVE catalog that used to share this tab behind a toggle now lives in
// Configure. Keeping them together meant the tab answered two unrelated
// questions — "what am I exposed to?" and "what does our catalog say?" —
// with one control to switch between them.

import VulnerabilityExposurePanel from "./VulnerabilityExposurePanel";

export default function VulnerabilitiesTab({ canManage, notify, refreshNonce = 0, openCveId = null, onOpened }) {
  return (
    <VulnerabilityExposurePanel
      canManage={canManage}
      notify={notify}
      refreshNonce={refreshNonce}
      openCveId={openCveId}
      onOpened={onOpened}
    />
  );
}
