// src/components/Alerts/creatableSources.js
//
// Qué fuentes se ofrecen al crear una regla a medida, y en qué orden.
//
// Fuera del componente para poder probarlo sin render, y porque una función
// exportada junto a un componente rompe el fast refresh.

import { SOURCE_LABEL } from "./alertSources";
import { editableSources } from "./criteriaFields";

/**
 * `sourcePlugin` — mapa fuente → plugin, sacado de las plantillas que ya
 * llegaron del backend. `availability` es su disponibilidad: una fuente de un
 * plugin que el tenant no tiene se ofrece DESACTIVADA con su motivo, porque la
 * API la rechazaría con 402/403.
 */
export function creatableSources({ sourcePlugin = {}, availability = null } = {}) {
  return editableSources()
    .map((source) => {
      const plugin = sourcePlugin[source] ?? null;
      const entry = plugin && availability ? availability[plugin] : null;
      return {
        source,
        label: SOURCE_LABEL[source] || source,
        plugin,
        available: entry ? entry.available !== false : true,
        reason: entry?.reason ?? null,
      };
    })
    .sort((a, b) => (a.available === b.available ? a.label.localeCompare(b.label) : a.available ? -1 : 1));
}
