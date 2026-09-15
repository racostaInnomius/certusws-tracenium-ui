// src/components/AgentSettings/ChromeConnectorSection.jsx
//
// The Chrome Enterprise connector inside Agent Settings → Security
// Compliance. It is a tenant-wide source of browser security events that
// feeds Security Compliance and Alerts, so it sits with that plugin's
// settings rather than at the root of Settings.
//
// Agent Settings already limits the page to admins and owners; creating or
// removing the endpoint additionally needs the security_compliance
// capability, the same one the API enforces. Without it the panel is
// read-only instead of offering buttons that answer 403.

import * as React from "react";
import { getMyCapabilities } from "../../api/roles";
import { useEffectiveTenantId } from "../../hooks/useEffectiveTenantId";
import ChromeConnectorPanel from "./ChromeConnectorPanel";

export default function ChromeConnectorSection({ notify }) {
  const tenantId = useEffectiveTenantId();
  const [canManage, setCanManage] = React.useState(false);

  React.useEffect(() => {
    if (!tenantId) return undefined;
    let alive = true;
    getMyCapabilities(tenantId)
      .then((resp) => alive && setCanManage(Array.isArray(resp?.permissions) && resp.permissions.includes("security_compliance")))
      .catch(() => alive && setCanManage(false));
    return () => {
      alive = false;
    };
  }, [tenantId]);

  return <ChromeConnectorPanel notify={notify} canManage={canManage} />;
}
