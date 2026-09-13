// src/components/Overview/overviewPlan.js
//
// Qué bloques del Overview monta un tenant, según lo que su plan concede.
//
// Los tres tiers de ADR-0010 son ADITIVOS (Starter ⊂ Professional ⊂
// Enterprise), así que la página se parte en tres bloques, uno por escalón. Un
// bloque es la unidad de gate: se monta entero o no se monta, y si no se monta
// no pide nada. Esconder cards sueltas dentro de una rejilla la dejaba coja y
// seguía disparando las peticiones de los plugins que el plan no incluye.
//
// La señal es `entitled` del catálogo de plugins, no el nombre del tier: el
// nombre sólo lo puede leer un OWNER (`/billing/summary`) y `entitled` lo lee
// cualquier miembro. Gatear por plugin concedido ES gatear por plan.
//
// ⚠️ Mantener `plugins` alineado con `tier_required` de
// `modules/policies/plugin-catalog.ts` en el backend. Si un plugin cambia de
// tier y aquí no, el bloque sigue apareciendo por el otro plugin que tenga —
// pero su card no, porque cada card se gatea también por su propio plugin.

export const TIER_LABELS = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

export const OVERVIEW_BLOCKS = [
  {
    id: "core",
    tier: "starter",
    title: "Fleet & operations",
    plugins: ["amp", "sdp"],
    // El suelo. El backend nunca deja un tenant sin AMP
    // (`entitlementFloor()`), así que este bloque tampoco se esconde: un
    // Overview vacío sería peor que uno al que le falta la card de SDP.
    always: true,
  },
  {
    id: "security",
    tier: "professional",
    title: "Security & access",
    plugins: ["scp", "rcp"],
  },
  {
    id: "operations",
    tier: "enterprise",
    title: "Patching & crypto",
    plugins: ["pmp", "cdp"],
  },
];

// Nombre de menú de cada plugin, para decir QUÉ no incluye el plan con las
// palabras que el operador ya ve en la barra lateral, no con siglas.
export const PLUGIN_TITLES = {
  amp: "Asset Management",
  sdp: "Software Delivery",
  scp: "Security Compliance",
  rcp: "Remote Control",
  pmp: "Patch Management",
  cdp: "Crypto Discovery",
};

/**
 * @param {{ entitled: Set<string> | null, loading?: boolean }} input
 *   `entitled` tal cual lo da `usePluginCatalog()`: un Set de claves, o null
 *   si todavía no se sabe o el backend no pudo resolverlo.
 * @returns {{
 *   known: boolean,
 *   blocks: Array<typeof OVERVIEW_BLOCKS[number] & { has: (key: string) => boolean }>,
 *   locked: typeof OVERVIEW_BLOCKS,
 *   visible: (id: string) => boolean,
 *   has: (key: string) => boolean,
 * }}
 */
export function resolveOverviewPlan({ entitled, loading = false } = {}) {
  const known = entitled instanceof Set;

  // Desconocido tras cargar = el backend no pudo resolver los derechos. Se
  // falla ABIERTO, igual que `isEntitled`: esconder de más deja tirado a quien
  // pagó; mostrar de más cuesta, como mucho, un estado vacío.
  const failOpen = !known && !loading;

  const has = (key) => {
    if (known) return entitled.has(String(key).toLowerCase());
    return failOpen;
  };

  const blocks = [];
  const locked = [];
  for (const block of OVERVIEW_BLOCKS) {
    if (block.always) {
      // El bloque del suelo se monta siempre, pero SUS cards de plugin se
      // gatean igual: sin conocer los derechos todavía, SDP espera. Un tenant
      // sin fila de suscripción cae al suelo (sólo AMP) y
      // `/software-delivery` le contestaría 402.
      blocks.push({ ...block, has: (key) => key === "amp" || has(key) });
      continue;
    }
    if (!known && loading) {
      // Ni visible ni bloqueado: aún no se sabe. Montarlo a ciegas mandaría
      // a un Starter las peticiones de SCP/PMP para recibir 402.
      continue;
    }
    if (block.plugins.some(has)) blocks.push({ ...block, has });
    else locked.push(block);
  }

  const visibleIds = new Set(blocks.map((b) => b.id));
  return {
    known,
    blocks,
    locked,
    visible: (id) => visibleIds.has(id),
    has,
  };
}
