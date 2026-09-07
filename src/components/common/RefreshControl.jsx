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

export const REFRESH_OPTIONS = [
  { value: "0",   label: "Off" },
  { value: "30",  label: "Every 30s" },
  { value: "60",  label: "Every 60s" },
  { value: "120", label: "Every 2 min" },
  { value: "300", label: "Every 5 min" },
];

export const DEFAULT_REFRESH_SECONDS = "60";

export default function RefreshControl({
  refreshSeconds,
  onRefreshSecondsChange,
  onRefresh,
  loading = false,
  options = REFRESH_OPTIONS,
}) {
  return (
    <>
      <TextField
        select
        label="Auto refresh"
        size="small"
        value={refreshSeconds}
        onChange={(e) => onRefreshSecondsChange?.(e.target.value)}
        sx={{
          minWidth: 140,
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
      <Button
        variant="outlined"
        startIcon={<RefreshOutlinedIcon />}
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
        sx={{
          textTransform: "none",
          fontWeight: 700,
          borderColor: BRAND.teal,
          color: BRAND.teal,
          "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
        }}
      >
        {loading ? "Refreshing…" : "Refresh"}
      </Button>
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
