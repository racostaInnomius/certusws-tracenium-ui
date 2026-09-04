// src/components/Overview/AuditTimeseriesChart.jsx
//
// Stacked bar chart of security events over the last 7 days, split by
// outcome (ok / rejected / error). Consumes the shape:
//   { windowDays: 7, buckets: [{ bucket: '2026-04-16', ok, rejected, error }, ...] }
// returned by GET /api/v1/security/audit/timeseries?window=7d.
//
// Bars are stacked so one bar per day tells the whole story. Green ok
// traffic dominates on a healthy day; rejected/error visually stick out
// as red/amber, which is exactly the at-a-glance signal a CISO wants.

import * as React from "react";
import { useEffect, useState } from "react";
import { Paper, Typography, Box, Skeleton, Stack } from "@mui/material";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from "recharts";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { CHART_CATEGORICAL } from "../../theme/chartPalette";
import { getAuditTimeseries } from "../../api/overview";
import WindowToggle from "./WindowToggle";

function formatDay(isoDate) {
  // isoDate is "YYYY-MM-DD". Show "Apr 17" style on the X-axis so the
  // 7-day window remains readable even on narrow screens.
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

export default function AuditTimeseriesChart({
  result,
  loading,
  onNavigate,
  // "outcome" (por defecto) | "category".
  //
  // Overview sigue apilando por outcome: ahí la tarjeta es una entre
  // muchas y la pregunta es "¿algo se está rechazando?".
  //
  // En la página de Audit ese eje no sirve. Medido en la control DB el
  // 2026-08-27: el 98,4% de los eventos son `ok`, así que la serie es una
  // línea plana que ningún dato real puede mover. Por categoría —Policy,
  // Identity, Devices & PKI…— un pico significa algo.
  //
  // Las categorías NO se listan aquí: llegan como claves dentro de cada
  // bucket. Una familia nueva en el backend aparece en la gráfica sin
  // tocar este fichero, que es lo contrario de lo que pasó con
  // SOURCE_LABEL y VALID_SOURCES.
  variant = "outcome",
  // El carril, para que la gráfica enseñe lo mismo que la tabla de abajo.
  lane,
}) {
  // The parent always fetches 7d into `result`. When the user toggles
  // the window we override with our own fetch; while that's inflight
  // we show a skeleton. Toggling back to 7d drops the override and
  // lets the parent's data drive again (avoids a redundant fetch).
  const parentValue =
    result?.status === "fulfilled" ? result.value : null;
  const parentWindow = parentValue?.windowDays ?? 7;

  const [windowDays, setWindowDays] = useState(parentWindow);
  const [override, setOverride] = useState(null);
  const [overrideFailed, setOverrideFailed] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Reset to parent whenever the parent's window changes (e.g. after
  // a page-level refresh). Prevents the toggle from drifting out of
  // sync silently.
  useEffect(() => {
    setWindowDays(parentWindow);
    setOverride(null);
    setOverrideFailed(false);
  }, [parentWindow]);

  // Fetch override when the toggle moves off the parent's window.
  useEffect(() => {
    if (windowDays === parentWindow) {
      setOverride(null);
      setOverrideFailed(false);
      return;
    }
    let cancelled = false;
    setToggling(true);
    getAuditTimeseries(windowDays, lane)
      .then((v) => {
        if (!cancelled) {
          setOverride(v);
          setOverrideFailed(false);
        }
      })
      .catch(() => {
        // ⚠️ Se marca el fallo en vez de sólo limpiar el override. Sin la
        // marca, la tarjeta cae en silencio a los datos del padre: el
        // selector diría "30 días" mientras se enseñan los 7 del padre, y
        // quien mire se llevará una cifra que no es la que pidió.
        if (!cancelled) {
          setOverride(null);
          setOverrideFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setToggling(false);
      });
    return () => {
      cancelled = true;
    };
  }, [windowDays, parentWindow, lane]);

  const value = override ?? parentValue;
  const buckets = Array.isArray(value?.buckets) ? value.buckets : [];
  const byCategory = variant === "category";

  // ⚠️ "NO HAY EVENTOS" Y "NO PUDE LEERLOS" NO SON LO MISMO.
  //
  // Esta tarjeta pintaba las dos igual, y eso escondió un error de sintaxis en
  // el SQL del backend durante SEIS DÍAS: el endpoint devolvía 500 con la base
  // llena de eventos —hasta 456 en un día— y la gráfica afirmaba tranquilamente
  // que no había pasado nada. Nadie mira dos veces un "sin eventos" en una
  // consola tranquila; un "no se pudo cargar" se reporta el primer día.
  //
  // El fallo llega de dos formas según la página: Overview pasa el sobre de
  // `Promise.allSettled` tal cual (`status: "rejected"`), y Audit pasa `null`
  // cuando su fetch falló. Las dos se distinguen de "cargó y vino vacío", que
  // es un objeto con `buckets`.
  const effectiveLoading = loading || toggling;
  const failed =
    !effectiveLoading &&
    (overrideFailed ||
      (!override && (result?.status === "rejected" || !parentValue)));

  // Las series salen de los datos, no de una lista local. Se recorren
  // TODOS los buckets y no sólo el primero: una categoría que sólo
  // aparece el día 6 tiene que salir igual, y mirar sólo el primer día es
  // la forma silenciosa de perderla.
  //
  // Se descartan las que están a cero en toda la ventana — con ~50
  // acciones al mes, la mitad de las familias no tiene nada, y una
  // leyenda con seis entradas de las que cuatro son invisibles miente
  // sobre lo que hay.
  const series = React.useMemo(() => {
    if (!byCategory) return null;
    const totals = new Map();
    for (const b of buckets) {
      for (const [name, n] of Object.entries(b.categories || {})) {
        totals.set(name, (totals.get(name) || 0) + Number(n || 0));
      }
    }
    return [...totals.entries()].filter(([, n]) => n > 0).map(([name]) => name);
  }, [buckets, byCategory]);

  const hasData = byCategory
    ? buckets.some((b) => Object.values(b.categories || {}).some((n) => Number(n) > 0))
    : buckets.some((b) => (b.ok ?? 0) + (b.rejected ?? 0) + (b.error ?? 0) > 0);

  const data = buckets.map((b) => ({
    day: formatDay(b.bucket),
    ok: b.ok ?? 0,
    rejected: b.rejected ?? 0,
    error: b.error ?? 0,
    ...(b.categories || {})
  }));

  // Whole card is clickable → /audit. Per-bar navigation (click Apr 22 →
  // audit filtered by that day) is a Phase 2 refinement; for now the
  // cheap win is just "the chart goes somewhere".
  const interactive = typeof onNavigate === "function";
  const navigate = () => onNavigate?.("audit", { window: `${windowDays}d` });

  return (
    <Paper
      elevation={0}
      onClick={interactive ? navigate : undefined}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        cursor: interactive ? "pointer" : "default",
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        "&:hover": interactive
          ? { borderColor: BRAND.teal, boxShadow: "0 4px 12px rgba(59,64,77,0.08)" }
          : undefined
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Typography
          variant="subtitle2"
          sx={{ color: BRAND.dark, fontWeight: 700 }}
        >
          {byCategory ? "Activity by area" : "Audit events"} — last {windowDays} day{windowDays === 1 ? "" : "s"}
        </Typography>
        <WindowToggle
          value={windowDays}
          onChange={setWindowDays}
          disabled={effectiveLoading}
        />
      </Stack>

      {effectiveLoading ? (
        <Skeleton variant="rounded" height={220} />
      ) : failed || !hasData ? (
        <Box
          sx={{
            height: 220,
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            px: 2,
            color: failed ? ROLE.caution : BRAND.gray
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: failed ? 700 : 400 }}>
            {failed ? "Couldn't load activity" : "No events in window"}
          </Typography>
          {failed && (
            <Typography variant="caption" sx={{ color: BRAND.gray }}>
              The audit timeseries request failed — this is not the same as
              having no activity.
            </Typography>
          )}
        </Box>
      ) : (
        <Box sx={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid stroke={BRAND.border} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: BRAND.dark, fontSize: TEXT.xs }}
                axisLine={{ stroke: BRAND.borderStrong }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: BRAND.dark, fontSize: TEXT.xs }}
                axisLine={{ stroke: BRAND.borderStrong }}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: `1px solid ${BRAND.border}`,
                  fontSize: TEXT.sm
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: TEXT.sm, color: BRAND.dark }}
                iconType="circle"
              />
              {byCategory ? (
                series.map((name, i) => (
                  <Bar
                    key={name}
                    dataKey={name}
                    name={name}
                    stackId="events"
                    fill={CHART_CATEGORICAL[i % CHART_CATEGORICAL.length]}
                    radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))
              ) : (
                <>
                  <Bar dataKey="ok"       name="OK"       stackId="events" fill={ROLE.positive} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="rejected" name="Rejected" stackId="events" fill={ROLE.caution}  radius={[0, 0, 0, 0]} />
                  <Bar dataKey="error"    name="Error"    stackId="events" fill={ROLE.critical} radius={[4, 4, 0, 0]} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Paper>
  );
}
