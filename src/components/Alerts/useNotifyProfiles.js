// src/components/Alerts/useNotifyProfiles.js
//
// ADR-0025 — lo que el drawer de reglas necesita para los perfiles:
// si el usuario puede gestionarlos, la lista, y los miembros del tenant
// para el selector de personas.
//
// ⚠️ Las capacidades se miran ANTES de pedir nada. `GET /notify-profiles`
// exige `alerts` y `GET /tenants/:id/members` exige `tenant_members`, y un
// 403 dispara el aviso global de permiso denegado: pedir «a ver si cuela»
// le enseñaría un error a quien sólo abrió el drawer para mirar reglas.

import * as React from "react";
import { getMyCapabilities } from "../../api/roles";
import { listTenantMembers } from "../../api/tenants";
import { listNotifyProfiles } from "../../api/alerts";
import { useEffectiveTenantId } from "../../hooks/useEffectiveTenantId";

/**
 * `access` es `null` mientras no se sabe — que NO es lo mismo que «no puede».
 * `profiles` es `null` cuando no se van a enseñar (sin permiso o sin saber);
 * es lo que `RuleNotifyEditor` usa para ocultar el selector.
 */
export function useNotifyProfiles() {
  const tenantId = useEffectiveTenantId();
  const [access, setAccess] = React.useState(null);
  const [profiles, setProfiles] = React.useState(null);
  const [loadingProfiles, setLoadingProfiles] = React.useState(false);
  const [members, setMembers] = React.useState([]);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (!tenantId) return undefined;
    let alive = true;
    getMyCapabilities(tenantId)
      .then((res) => {
        if (!alive) return;
        const perms = new Set(Array.isArray(res?.permissions) ? res.permissions : []);
        setAccess({ canManage: perms.has("alerts"), canListMembers: perms.has("tenant_members") });
      })
      .catch(() => alive && setAccess({ canManage: false, canListMembers: false }));
    return () => {
      alive = false;
    };
  }, [tenantId]);

  React.useEffect(() => {
    if (!access?.canManage) return undefined;
    let alive = true;
    setLoadingProfiles(true);
    listNotifyProfiles()
      .then((res) => alive && setProfiles(Array.isArray(res?.profiles) ? res.profiles : []))
      .catch(() => alive && setProfiles(null))
      .finally(() => alive && setLoadingProfiles(false));
    return () => {
      alive = false;
    };
  }, [access?.canManage, nonce]);

  React.useEffect(() => {
    if (!access?.canManage || !access?.canListMembers || !tenantId) return undefined;
    let alive = true;
    listTenantMembers(tenantId)
      .then((res) => {
        if (!alive) return;
        const items = Array.isArray(res?.items) ? res.items : [];
        setMembers(items.filter((m) => m?.isActive && m?.email && m?.subject));
      })
      .catch(() => alive && setMembers([]));
    return () => {
      alive = false;
    };
  }, [access?.canManage, access?.canListMembers, tenantId]);

  const profileNames = React.useMemo(
    () => (profiles ? new Map(profiles.map((p) => [String(p.id).toLowerCase(), p.name])) : null),
    [profiles]
  );

  return {
    access,
    profiles: access?.canManage ? profiles : null,
    profileNames,
    loadingProfiles,
    members,
    reload: () => setNonce((n) => n + 1),
  };
}
