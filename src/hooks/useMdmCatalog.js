// src/hooks/useMdmCatalog.js
//
// Catálogo del modelo de intención MDM, servido por el backend
// (modules/policies/mdm-catalog.ts). Mismo razonamiento que
// usePluginCatalog: la lista vive en UN solo sitio.
//
// Aquí importa especialmente, porque el catálogo no solo dice qué claves
// existen — también dice **qué exige supervisión**. Si la UI mantuviera su
// propia copia y derivara, el operador vería avisos de aplicabilidad
// equivocados: configuraría algo creyendo que aplica a toda su flota
// cuando no. Ese es justo el fallo silencioso que este diseño persigue.

import { useCallback, useMemo } from "react";
import useCachedFetch from "./useCachedFetch";
import { getMdmCatalog } from "../api/policies";

const CACHE_KEY = "mdmCatalog";
const STALE_MS = 5 * 60 * 1000; // 5 min
const STORAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 h

export default function useMdmCatalog() {
  const fetched = useCachedFetch(
    CACHE_KEY,
    async () => {
      const resp = await getMdmCatalog();
      return Array.isArray(resp?.settings) ? resp.settings : [];
    },
    { staleMs: STALE_MS, storageMaxAgeMs: STORAGE_MAX_AGE_MS }
  );

  // `data` es null durante el primer round-trip; los consumidores
  // renderizan siempre contra un array.
  const settings = useMemo(
    () => (Array.isArray(fetched?.data) ? fetched.data : []),
    [fetched?.data]
  );

  /** Ajustes de una plataforma, en el orden del catálogo. */
  const byPlatform = useCallback(
    (platform) => settings.filter((s) => (s.platforms || []).includes(platform)),
    [settings]
  );

  /**
   * Agrupa por el segmento intermedio de la clave (`macos.<grupo>.<ajuste>`)
   * para que la UI pueda renderizar subsecciones sin que el catálogo tenga
   * que declarar una taxonomía aparte.
   */
  const groupsFor = useCallback(
    (platform) => {
      const groups = new Map();
      for (const s of byPlatform(platform)) {
        const parts = String(s.key).split(".");
        const group = parts.length >= 3 ? parts[1] : "general";
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(s);
      }
      return [...groups.entries()].map(([name, items]) => ({ name, items }));
    },
    [byPlatform]
  );

  return {
    settings,
    byPlatform,
    groupsFor,
    loading: Boolean(fetched?.loading),
    error: fetched?.error ?? null,
    refetch: fetched?.refetch ?? (async () => {}),
  };
}
