// src/components/patch-management/prerequisiteOffer.js
//
// «auditd no está instalado — ¿lo instalo y sigo?»
//
// 29-sep: aplicar reglas de auditoría a un servidor Linux sin auditd devolvía
// «Fix «auditd packages are installed» first, then this one» y el operador
// tenía que ir a buscar ese fix. El backend lo sabe instalar: responde con el
// requisito (PATCH_REMEDIATION_PREREQUISITE_MISSING) y, con
// `installPrerequisites: true`, manda la instalación delante de las reglas en
// el MISMO job del equipo. Aquí se decide qué ofrecer y con qué palabras.

export const PREREQUISITE_MISSING = "PATCH_REMEDIATION_PREREQUISITE_MISSING";

/**
 * De los checks omitidos de un lote, los que se quedaron fuera por un
 * requisito que se puede instalar, agrupados por requisito. Hoy sólo hay uno
 * (auditd), pero un segundo no debe mezclarse con él.
 */
export function prerequisiteOffers(skipped) {
  const byKey = new Map();
  for (const s of Array.isArray(skipped) ? skipped : []) {
    if (s?.error !== PREREQUISITE_MISSING || !s.prerequisite?.key) continue;
    const key = s.prerequisite.key;
    if (!byKey.has(key)) byKey.set(key, { prerequisite: s.prerequisite, checkIds: [], deviceIds: new Set() });
    const offer = byKey.get(key);
    offer.checkIds.push(s.checkId);
    for (const d of s.prerequisite.deviceIds ?? []) offer.deviceIds.add(d);
  }
  return [...byKey.values()].map((o) => ({ ...o, deviceIds: [...o.deviceIds] }));
}

/** Lo que dice el aviso, antes del botón. */
export function describePrerequisiteOffer(offer, { hostname = null } = {}) {
  const n = offer.checkIds.length;
  const where = offer.deviceIds.length === 1
    ? (hostname ? `on ${hostname}` : "on this device")
    : `on ${offer.deviceIds.length} devices`;
  return (
    `${offer.prerequisite.key} is not installed ${where}, so ${n === 1 ? "1 fix was" : `${n} fixes were`} held back: ` +
    `audit rules do nothing without it. Tracenium can install it first (${offer.prerequisite.title}) and then ` +
    `apply ${n === 1 ? "it" : "them"}, in the same job.`
  );
}

/** El texto del botón: instalar sólo se promete al aplicar; en una simulación se simula también. */
export function prerequisiteOfferLabel(offer, mode) {
  const n = offer.checkIds.length;
  return mode === "dry_run"
    ? `Dry-run ${n} with ${offer.prerequisite.key} installed first`
    : `Install ${offer.prerequisite.key} and apply ${n}`;
}
