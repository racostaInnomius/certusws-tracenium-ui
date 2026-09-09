// src/components/common/RefreshControl.jsx
//
// Canonical refresh control for page headers — an Auto-refresh
// dropdown paired with a long "Refresh" button. Every page that has a
// refresh affordance should drop this into PageHeader's `actions` slot
// so the cadence options, button styling, and disabled-while-loading
// behavior stay identical across the app.
//
// The component is presentational: callers own the cadence state and
// the load function. `useAutoRefresh` (below) packages the timer +
// URL-persistence loop most pages want.

import * as React from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { clearApiCache } from "../../api/http";
import { BRAND } from "../../theme/brand";

/**
 * Cadencias en MINUTOS, no en segundos.
 *
 * Estaban en 30 s / 60 s / 2 min / 5 min, y con quince páginas usando esto
 * significaba que un portal abierto en una pestaña olvidada golpeaba el
 * backend dos veces por minuto para siempre. Ninguno de estos datos —
 * inventario, cumplimiento, parches— cambia a esa velocidad: los recoge un
 * agente que reporta cada varios minutos, así que refrescar más a menudo que
 * eso sólo repinta lo mismo.
 *
 * ⚠️ "Off" se queda. No es una cadencia —por eso no está en la lista de
 * minutos— pero es la única forma de parar el goteo, y además hay dos páginas
 * (Crypto Discovery, y Baselines embebido) que pasan "0" como su defecto: sin
 * esta entrada arrancarían con un valor que `useAutoRefresh` rechaza.
 */
export const REFRESH_OPTIONS = [
  { value: "0",    label: "Off" },
  { value: "60",   label: "Every 1 min" },
  { value: "300",  label: "Every 5 min" },
  { value: "600",  label: "Every 10 min" },
  { value: "1200", label: "Every 20 min" },
];

/**
 * 20 minutos.
 *
 * ⚠️ Las cadencias viejas que quedaran guardadas en una URL (`?…=30`, `?…=120`)
 * ya no validan contra `REFRESH_OPTIONS`, así que `useAutoRefresh` las
 * descarta y cae aquí. Es lo que se quiere: un enlace guardado no puede
 * reponer un ritmo que se ha retirado a propósito.
 */
export const DEFAULT_REFRESH_SECONDS = "1200";

/**
 * Altura común del control y del botón.
 *
 * Un `TextField size="small"` mide 40 px y un `Button` de tamaño por defecto
 * 36,5: cuatro píxeles de diferencia en una fila alineada al centro, que se
 * leen como un descuido en las once páginas que usan esto. Se fija aquí y en
 * los dos, para que no puedan volver a separarse si MUI cambia sus defaults.
 *
 * Bajar el campo a 36,5 es seguro porque su etiqueta está SIEMPRE flotada: es
 * un `select` que nunca está vacío, así que el rótulo vive en la muesca del
 * borde y no puede chocar con el texto.
 */
const CONTROL_HEIGHT = 36.5;

/**
 * Ancho FIJO del botón, para que no crezca al cambiar el rótulo.
 *
 * "Refresh" → "Refreshing…" son cinco caracteres más, y el botón se ensanchaba
 * y volvía a encogerse en cada pulsación. En una fila donde a su derecha está
 * el desplegable de Auto refresh, ese vaivén empuja al vecino: no es el botón
 * el que parpadea, es media cabecera.
 *
 * Medido en el navegador con el tema real (ver más abajo por qué hacen falta
 * las dos cosas):
 *
 *   icono + "Refresh"        110,94 px   ← reposo
 *   icono + "Refreshing…"    147,53 px   ← salto de 36,6 px
 *   sin icono + "Refreshing…" 123,53 px  ← todavía 12,6 px de salto
 *
 * O sea que quitar el icono corta dos tercios del salto pero NO lo elimina.
 * 128 px cubre el estado más ancho con holgura, comprobado además contra
 * `scrollWidth`: ninguno de los dos rótulos se recorta.
 *
 * Es `width` y no `minWidth` a propósito: `minWidth` no impide crecer, que es
 * justo lo que hay que impedir. Los dos rótulos son constantes de este
 * fichero, así que el riesgo de que un texto no quepa es el de editarlos aquí
 * — y ahí está este comentario.
 */
const BUTTON_WIDTH = 128;

export default function RefreshControl({
  refreshSeconds,
  onRefreshSecondsChange,
  onRefresh,
  loading = false,
  options = REFRESH_OPTIONS,
}) {
  return (
    <>
      <Button
        variant="outlined"
        // Sin icono mientras refresca. Es la mitad barata de mantener el ancho
        // —ahorra 24 px justo cuando el rótulo crece 36— y de paso el botón
        // deshabilitado deja de enseñar un icono de "pulsa aquí".
        startIcon={loading ? null : <RefreshOutlinedIcon />}
        onClick={() => {
          // ⚠️ TIRAR LA CACHÉ ANTES DE RECARGAR, o esto no refresca nada.
          //
          // `httpGetJson` sirve de una caché en memoria mientras la entrada
          // esté fresca (60 s por defecto). Una página cuyo "refrescar" sólo
          // vuelve a llamar a su `load` recibe exactamente los mismos datos
          // que ya tenía, sin que salga una sola petición — y el operador se
          // queda mirando una foto vieja convencido de que acaba de
          // actualizarla, que es peor que no tener botón.
          //
          // Es el mismo patrón que ya usaban las escrituras
          // (`invalidateAfterMutation`): corrección antes que optimizar. Pulsar
          // esto es una petición explícita de datos frescos.
          //
          // El tick del auto-refresco NO lo hace: es una comodidad de fondo, y
          // vaciar la caché de toda la app cada 30-60 s por si acaso le sale
          // caro a un portal servido desde un Static Web App gratuito.
          clearApiCache();
          onRefresh?.();
        }}
        disabled={loading}
        // Nombre accesible ESTABLE. El rótulo pasa a "Refreshing…" mientras
        // carga, y sin esto el botón cambia de nombre justo cuando alguien con
        // lector de pantalla querría saber qué está ocurriendo — y cualquier
        // referencia a él por su nombre deja de encontrarlo a mitad de acción.
        aria-label="Refresh"
        sx={{
          height: CONTROL_HEIGHT,
          width: BUTTON_WIDTH,
          textTransform: "none",
          fontWeight: 700,
          borderColor: BRAND.teal,
          color: BRAND.teal,
          "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
        }}
      >
        {loading ? "Refreshing…" : "Refresh"}
      </Button>
      <TextField
        select
        label="Auto refresh"
        size="small"
        value={refreshSeconds}
        onChange={(e) => onRefreshSecondsChange?.(e.target.value)}
        sx={{
          minWidth: 140,
          "& .MuiInputBase-root": { height: CONTROL_HEIGHT },
          // Override MUI's default primary-blue focus ring with the
          // brand teal so the control reads as part of Tracenium's
          // palette, not as a stock MUI form field.
          "& .MuiOutlinedInput-root": {
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: BRAND.teal },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: BRAND.teal },
          },
          "& .MuiInputLabel-root.Mui-focused": { color: BRAND.teal },
        }}
      >
        {options.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>
    </>
  );
}

// useAutoRefresh — encapsulates the standard polling loop:
//   * Re-arms when the cadence changes; clears on unmount.
//   * Skips the tick when the tab is hidden so background tabs don't
//     thrash the backend.
//   * Persists the cadence choice to a URL search param so reloads
//     remember the setting.
//
// Returns [refreshSeconds, setRefreshSeconds]. Pages keep their own
// load function — this hook just calls it on cadence ticks.
export function useAutoRefresh(load, urlParam, defaultSeconds = DEFAULT_REFRESH_SECONDS) {
  const [refreshSeconds, setRefreshSeconds] = React.useState(() => {
    if (!urlParam || typeof window === "undefined") return defaultSeconds;
    try {
      const url = new URL(window.location.href);
      const fromUrl = url.searchParams.get(urlParam);
      if (fromUrl != null && REFRESH_OPTIONS.some((o) => o.value === fromUrl)) {
        return fromUrl;
      }
    } catch { /* fall through */ }
    return defaultSeconds;
  });

  React.useEffect(() => {
    const seconds = Number(refreshSeconds || 0);
    if (seconds <= 0) return undefined;
    const ms = seconds * 1000;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load?.();
    }, ms);
    return () => clearInterval(id);
  }, [load, refreshSeconds]);

  React.useEffect(() => {
    if (!urlParam || typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (refreshSeconds && refreshSeconds !== "0") {
        url.searchParams.set(urlParam, refreshSeconds);
      } else {
        url.searchParams.delete(urlParam);
      }
      const pathname = url.pathname.replace(/^\/+/, "/") || "/";
      const search = url.searchParams.toString();
      window.history.replaceState({}, "", search ? `${pathname}?${search}` : pathname);
    } catch { /* best effort */ }
  }, [urlParam, refreshSeconds]);

  return [refreshSeconds, setRefreshSeconds];
}
