// src/components/patch-management/ThirdPartyTab.jsx
//
// The Third-party tab: outdated applications across the fleet.
//
// It used to carry a toggle between these findings and the catalog manager,
// which put a problem to act on and a reference table to maintain behind the
// same tab. The catalog moved to Configure, where the other setup surfaces
// live, and this became what its name always promised.

import ThirdPartyPanel from "./ThirdPartyPanel";

export default function ThirdPartyTab({ canManage, notify }) {
  return <ThirdPartyPanel canManage={canManage} notify={notify} />;
}
