// src/components/Compliance/macPolicyKeys.js
//
// ¿Ya está en la política macOS de la organización lo que arregla un hallazgo?
// PURO (1-oct).
//
// Entre «Add to macOS policy» y que el Mac confirme el perfil (su próxima
// conexión, hasta ~4 h sin push) el hallazgo sigue abierto. La tarjeta volvía a
// ofrecer «Add» como si no se hubiera hecho nada; ahora dice que ya está en la
// política y qué pasa después. Las claves son las de las intenciones del
// catálogo MDM («macos.privacy.allowPersonalizedAds»).

/** Las claves de `policy_json.macos`, con el prefijo `macos.`. */
export function macPolicyKeys(macosBlock) {
  const out = new Set();
  const walk = (node, trail) => {
    for (const [k, v] of Object.entries(node)) {
      const path = `${trail}.${k}`;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) walk(v, path);
      else out.add(path);
    }
  };
  if (macosBlock && typeof macosBlock === "object" && !Array.isArray(macosBlock)) walk(macosBlock, "macos");
  return out;
}

/** true si TODAS las intenciones del arreglo están ya en la política. */
export function intentsInPolicy(intents, keys) {
  return Array.isArray(intents) && intents.length > 0 && !!keys && intents.every((i) => keys.has(i?.key));
}
