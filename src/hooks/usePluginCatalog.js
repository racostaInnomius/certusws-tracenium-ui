// src/hooks/usePluginCatalog.js
//
// Single source of truth for the plugin catalog in the frontend.
// Replaces the legacy hardcoded `src/constants/plugins.js`.
//
// Why this exists:
//   The plugin catalog used to live in TWO places — backend
//   (modules/policies/plugin-catalog.ts) and frontend (constants/plugins.js).
//   These drifted at least once, causing a production bug where the
//   UI sent `plugins.enabled = [..., 'rcp']` and the backend
//   policy validator returned 400 UNKNOWN_PLUGIN because its catalog
//   array hadn't been updated.
//
//   Owning the catalog server-side eliminates the entire class of
//   drift bugs: there is now one array, in one repo, validated by
//   the same code that lists it.
//
// Cache strategy:
//   The catalog rarely changes (a release every few months). Cache
//   aggressively (5 min stale, 1 day storage cap) so the typical
//   page navigation is instant.

import { useCallback, useMemo } from "react";
import useCachedFetch from "./useCachedFetch";
import { getPluginCatalog } from "../api/policies";

const CACHE_KEY = "pluginCatalog";
const STALE_MS = 5 * 60 * 1000;          // 5 min before background revalidate
const STORAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours hard cap

/**
 * Fetch and cache the plugin catalog. Returns the loaded catalog plus
 * helper functions bound to the current catalog snapshot.
 *
 * @returns {{
 *   catalog: PluginCatalogEntry[],
 *   loading: boolean,
 *   error: Error | null,
 *   refetch: () => Promise<void>,
 *   getEnabledPluginSet: (policyJson: object) => Set<string>,
 *   deriveModules: (enabledIterable: Iterable<string>) => Record<string, boolean>,
 *   isRequiredKey: (key: string) => boolean,
 * }}
 */
export function usePluginCatalog() {
  const fetched = useCachedFetch(
    CACHE_KEY,
    async () => {
      const resp = await getPluginCatalog();
      return {
        catalog: Array.isArray(resp?.catalog) ? resp.catalog : [],
        // null = el backend no pudo resolver los derechos. Distinto de []
        // ("no tienes ninguno"): con null la UI no debe esconder nada, o un
        // parpadeo dejaría la consola inservible.
        entitled: Array.isArray(resp?.entitled) ? resp.entitled : null,
      };
    },
    {
      staleMs: STALE_MS,
      storageMaxAgeMs: STORAGE_MAX_AGE_MS,
    }
  );

  // `data` is null while the first network round-trip is in flight.
  // Callers can safely render with `catalog` always being an array.
  // Se saca a una local para que la dependencia del memo coincida con lo que
  // realmente se lee (el React Compiler rechaza depender de `fetched?.data`
  // mientras dentro se accede a `fetched.data.catalog`).
  const payload = fetched?.data;
  const catalog = useMemo(
    () => (Array.isArray(payload?.catalog) ? payload.catalog : []),
    [payload]
  );

  /**
   * Plugins a los que ESTE tenant tiene derecho por su suscripción
   * (ADR-0010). `null` mientras carga o si el backend no pudo resolverlo.
   *
   * ⚠️ No confundir con "habilitado": un plugin puede estar en la política y
   * no estar contratado. Derecho = lo que el plan incluye.
   */
  const entitled = useMemo(() => {
    const list = payload?.entitled;
    return Array.isArray(list) ? new Set(list.map((k) => String(k).toLowerCase())) : null;
  }, [payload]);

  /**
   * ¿El tenant tiene derecho a este plugin?
   *
   * Devuelve `true` mientras no se sepa (cargando, o el backend no pudo
   * resolverlo). Esto es una PISTA de UI, no un control: los cierres reales
   * son el gate de rutas (402) y el recorte de la política al proyectarla al
   * agente. Esconder de más por un parpadeo deja tirado a quien sí pagó;
   * mostrar de más cuesta un 402 que explica qué contratar.
   */
  const isEntitled = useCallback(
    (key) => (entitled ? entitled.has(String(key).toLowerCase()) : true),
    [entitled]
  );

  /**
   * Read the enabled plugin set from a raw policy JSON, applying the
   * "required" rule — required plugins are always considered enabled
   * even if the stored policy somehow omitted them.
   */
  const getEnabledPluginSet = useCallback(
    (policyJson) => {
      const stored = Array.isArray(policyJson?.plugins?.enabled)
        ? policyJson.plugins.enabled.map((k) => String(k).toLowerCase())
        : [];
      const required = catalog.filter((p) => p.required).map((p) => p.key);
      return new Set([...required, ...stored]);
    },
    [catalog]
  );

  /**
   * Derive `modules` dict from a list/set of enabled plugin keys.
   * `modules.{name} = true` for every plugin with `impliesModule = name`
   * that is currently enabled.
   */
  const deriveModules = useCallback(
    (enabledPluginsIterable) => {
      const enabled = new Set(
        Array.isArray(enabledPluginsIterable)
          ? enabledPluginsIterable
          : [...(enabledPluginsIterable || [])]
      );
      const modules = {};
      for (const p of catalog) {
        if (p.impliesModule && enabled.has(p.key)) {
          modules[p.impliesModule] = true;
        }
      }
      return modules;
    },
    [catalog]
  );

  /**
   * Whether a key is flagged as `required` (always-on, can't be
   * disabled by the operator).
   */
  const isRequiredKey = useCallback(
    (key) => catalog.some((p) => p.key === key && p.required === true),
    [catalog]
  );

  return {
    catalog,
    entitled,
    isEntitled,
    loading: Boolean(fetched?.loading),
    error: fetched?.error ?? null,
    refetch: fetched?.refetch ?? (async () => {}),
    getEnabledPluginSet,
    deriveModules,
    isRequiredKey,
  };
}

export default usePluginCatalog;
