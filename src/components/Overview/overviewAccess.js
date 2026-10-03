// src/components/Overview/overviewAccess.js
//
// Lo que el ROL deja ver en el Overview: la otra mitad de overviewPlan.js, que
// dice lo que deja el PLAN.
//
// Las capacidades salen de GET /roles/me/capabilities (api/roles.js) y llegan
// aquí en uno de tres estados, que no se mezclan:
//
//   undefined — aún se está preguntando.
//   null      — no se pudo saber (la petición falló, o no hay tenant).
//   Set       — las capacidades del rol.
//
// ⚠️ `null` NO es "no tiene nada". Sin saberlo se pide todo como antes (las
// cargas van con BACKGROUND, así que un 403 no abre el diálogo) y no se
// anuncia nada sobre el rol: decirle a un ADMIN "tu rol no ve nada" porque
// falló una petición sería mentirle en la página a la que aterriza.

/**
 * Las capacidades de las áreas que el Overview resume, card a card: la flota
 * y sus donas (`assets_view`), Software Delivery, Reports, Jobs, Audit, los
 * certificados PKI de Attention, y los bloques de SCP, RCP, PMP y CDP.
 *
 * Sin NINGUNA, la página no tiene nada para ese rol y enseña sus páginas. No es
 * la lista de rutas con capacidad (ver OVERVIEW_GATES en api/overview.js):
 * varias lecturas del Overview no exigen ninguna, y un rol que sólo da de alta
 * equipos no tiene por qué aterrizar en la postura de la flota.
 */
export const OVERVIEW_CAPABILITIES = [
  "assets_view",
  "software_delivery",
  "reports",
  "jobs",
  "audit_log",
  "pki",
  "security_compliance",
  "remote_control",
  "patch_management",
  "crypto_discovery",
];

/**
 * Las páginas que un rol sin nada en el Overview sí puede usar, con su nombre
 * del menú. Sólo capacidades de fuera de OVERVIEW_CAPABILITIES — las de dentro
 * nunca llegan a este panel — y sólo las que tienen una página propia: Live
 * Query y la evidencia se abren desde la ficha de un equipo, que pide
 * `assets_view`.
 */
export const ROLE_PAGES = [
  // `/api/v1/mdm` va montada con `enrollment`; `device_management` gestiona.
  { page: "device-management", label: "MDM / MAM", capabilities: ["enrollment", "device_management"] },
  // Los tokens de alta (tokens.routes.ts) exigen `enrollment`.
  { page: "enrollment", label: "Device Enrollment", capabilities: ["enrollment"] },
  { page: "assessments", label: "Assessment Suite", capabilities: ["assessment_service"] },
  { page: "alerts", label: "Alerts", capabilities: ["alerts"] },
  { page: "tenant-members", label: "Tenant members", capabilities: ["tenant_members"] },
  { page: "roles", label: "Roles & permissions", capabilities: ["roles_management"] },
  { page: "session-settings", label: "Session security", capabilities: ["session_settings"] },
  { page: "location-sites", label: "Location sites", capabilities: ["location_sites"] },
  { page: "retention", label: "Database retention", capabilities: ["retention"] },
  { page: "agent-releases", label: "Agent releases", capabilities: ["agent_releases"] },
];

const ALLOW_ALL = () => true;

/** `can(capability)`. Mientras no se sepa (undefined / null), todo. */
export function canFrom(permissions) {
  if (!(permissions instanceof Set)) return ALLOW_ALL;
  return (capability) => permissions.has(capability);
}

/** True sólo con las capacidades YA conocidas y ninguna del Overview. */
export function seesNothingOnOverview(permissions) {
  return permissions instanceof Set && !OVERVIEW_CAPABILITIES.some((key) => permissions.has(key));
}

export function pagesForRole(permissions) {
  if (!(permissions instanceof Set)) return [];
  return ROLE_PAGES.filter((entry) => entry.capabilities.some((key) => permissions.has(key)));
}
