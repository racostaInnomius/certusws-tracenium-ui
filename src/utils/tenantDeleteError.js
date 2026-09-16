// Mensaje para el operador cuando falla DELETE /tenants/:id.
//
// ⚠️ Antes todo lo que no fuera TENANT_HAS_ACTIVE_MEMBERS salía como «Failed to
// delete tenant»: el 409 de la raíz vendor, el de miembros inactivos o
// invitaciones, y el 500 —que fue precisamente lo que escondió que NINGÚN
// borrado funcionaba (bigint = text en las tablas de política, 2026-09-16).
// El código viaja en `err.code` (5xx) o dentro de `err.message` (4xx: el
// cuerpo crudo tras «HTTP 409:»), así que se mira en los dos.

const MESSAGES = {
  TENANT_IS_VENDOR_ROOT:
    "This is the Tracenium vendor root that every MSP hangs from. It cannot be deleted.",
  TENANT_HAS_ACTIVE_MEMBERS:
    "Tenant has active members and cannot be deleted. Remove its members first.",
  TENANT_HAS_MEMBERS:
    "Tenant still has inactive members or pending invites. Remove them first.",
  TENANT_NOT_FOUND: "This tenant no longer exists. Refresh the list.",
  PERMISSION_DENIED: "You don't have permission to delete this tenant.",
};

export function tenantDeleteErrorMessage(err) {
  const haystack = `${err?.code ?? ""} ${err?.message ?? ""}`;
  for (const [code, message] of Object.entries(MESSAGES)) {
    if (haystack.includes(code)) return message;
  }
  return "Failed to delete tenant";
}
