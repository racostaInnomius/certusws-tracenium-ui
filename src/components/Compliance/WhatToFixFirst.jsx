// src/components/Compliance/WhatToFixFirst.jsx
//
// La sección que la portada no tenía: los controles que MÁS equipos incumplen,
// ordenados por severidad y luego por volumen.
//
// Hasta ahora la página respondía "¿cómo estoy?" (el score) y "¿dónde?" (las
// tablas de equipos y frameworks), pero no "¿qué arreglo primero?". El operador
// tenía que abrir equipos uno a uno para descubrir que diecisiete compartían el
// mismo problema. Esto es lo que convierte el tablero en herramienta.
//
// `framework` / `frameworkLabel`: cuando la portada tiene un estándar
// seleccionado, esta lista se acota a los controles que mapean a él. Antes el
// filtro sólo alcanzaba a la tabla de equipos y a los exports — ambos
// plegados — así que el operador elegía un framework y no veía cambiar nada.
// Lo primero que se lee tiene que responder al filtro, o el filtro no existe.
//
// El gate de tier vive en el dato, no aquí: el backend devuelve
// `agentRemediable` ya cruzado con el derecho a PMP, así que esta lista sólo
// decide el VERBO. Sin PMP la fila no desaparece ni se apaga — dice "Show me
// how" y abre la guía. El tenant ve todo lo que le pasa, que es exactamente lo
// que ha comprado; lo que no obtiene es que lo arreglemos por él.

import * as React from "react";
import {
  Box,
  Button,
  CircularProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import SectionPaper from "../common/SectionPaper";
import { BRAND, TEXT } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import { getTopFailingChecks } from "../../api/compliance";

const HOW_MANY = 5;

/** Barra de severidad: color como refuerzo, nunca como único portador. */
function SeverityRail({ severity }) {
  const meta = severityMeta(severity);
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: 4,
        alignSelf: "stretch",
        borderRadius: 1,
        bgcolor: meta?.fg || BRAND.gray,
        flexShrink: 0,
      }}
    />
  );
}

export default function WhatToFixFirst({ reloadKey, onOpenCheck, onRemediate, framework, frameworkLabel }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [pending, setPending] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    getTopFailingChecks({ limit: HOW_MANY, framework: framework || undefined })
      .then((res) => {
        if (!alive) return;
        setItems(Array.isArray(res?.items) ? res.items : []);
        setError(null);
      })
      .catch((err) => {
        if (!alive) return;
        // Una sección que falla se dice, no se deja en blanco: un hueco mudo
        // se lee como "no tienes nada que arreglar", que es lo contrario.
        setError(err?.body?.message || err?.message || "Could not load this section.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey, framework]);

  const handleFix = React.useCallback(
    async (row) => {
      if (!onRemediate) return;
      setPending(row.checkId);
      try {
        await onRemediate(row);
      } finally {
        setPending(null);
      }
    },
    [onRemediate]
  );

  return (
    <SectionPaper variant="panel" sx={{ p: 2, mb: 2 }}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
          What to fix first
        </Typography>
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
          {framework
            ? `Most-failed ${frameworkLabel || framework} controls across your fleet`
            : "Most-failed controls across your fleet"}
        </Typography>
      </Stack>

      {loading ? (
        <Box sx={{ display: "grid", placeItems: "center", minHeight: 120 }}>
          <CircularProgress size={22} sx={{ color: BRAND.teal }} />
        </Box>
      ) : error ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.errorText }} role="alert">
          {error}
        </Typography>
      ) : items.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
          {framework
            ? `Nothing mapped to ${frameworkLabel || framework} is failing right now. Other standards may still have findings — clear the filter to see them.`
            : "Nothing is failing right now. Every evaluated control passes on every reporting device."}
        </Typography>
      ) : (
        <Stack divider={<Box sx={{ borderBottom: `1px solid ${BRAND.border}` }} />}>
          {items.map((row) => {
            const meta = severityMeta(row.severity);
            const busy = pending === row.checkId;
            return (
              <Stack
                key={row.checkId}
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{ py: 1.25 }}
              >
                <SeverityRail severity={row.severity} />

                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    sx={{
                      fontSize: TEXT.md,
                      fontWeight: 700,
                      color: BRAND.dark,
                      cursor: onOpenCheck ? "pointer" : "default",
                      "&:hover": onOpenCheck ? { color: BRAND.tealText } : undefined,
                    }}
                    onClick={onOpenCheck ? () => onOpenCheck(row) : undefined}
                    role={onOpenCheck ? "button" : undefined}
                    tabIndex={onOpenCheck ? 0 : undefined}
                    onKeyDown={
                      onOpenCheck
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onOpenCheck(row);
                            }
                          }
                        : undefined
                    }
                  >
                    {row.title || row.checkId}
                  </Typography>
                  <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
                    {/* Severidad en TEXTO, no sólo en el color de la barra. */}
                    {meta?.label || row.severity || "—"} · {row.category}
                  </Typography>
                </Box>

                <Typography
                  sx={{
                    fontSize: TEXT.md,
                    fontWeight: 700,
                    color: BRAND.dark,
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.deviceCount}{" "}
                  <Box component="span" sx={{ fontSize: TEXT.xs, fontWeight: 400, color: BRAND.gray }}>
                    {row.deviceCount === 1 ? "device" : "devices"}
                  </Box>
                </Typography>

                {row.agentRemediable && onRemediate ? (
                  <Button
                    size="small"
                    variant="contained"
                    disableElevation
                    disabled={busy}
                    startIcon={busy ? <CircularProgress size={14} sx={{ color: "inherit" }} /> : <BuildOutlinedIcon />}
                    onClick={() => handleFix(row)}
                    sx={{
                      textTransform: "none",
                      fontWeight: 700,
                      bgcolor: BRAND.teal,
                      "&:hover": { bgcolor: BRAND.tealHover },
                      whiteSpace: "nowrap",
                    }}
                  >
                    Fix {row.deviceCount}
                  </Button>
                ) : (
                  <Tooltip
                    // `describeChild`: por defecto MUI usa el título como
                    // aria-label y SUPLANTA el nombre del botón — un lector de
                    // pantalla anunciaría la frase larga en vez de "Show me
                    // how". Así el tooltip describe, no rebautiza.
                    describeChild
                    title="Patch Management can apply this fix for you. Without it, open the control for step-by-step guidance."
                    arrow
                  >
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<MenuBookOutlinedIcon />}
                      onClick={onOpenCheck ? () => onOpenCheck(row) : undefined}
                      sx={{
                        textTransform: "none",
                        fontWeight: 700,
                        color: BRAND.gray,
                        borderColor: BRAND.border,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Show me how
                    </Button>
                  </Tooltip>
                )}
              </Stack>
            );
          })}
        </Stack>
      )}
    </SectionPaper>
  );
}
