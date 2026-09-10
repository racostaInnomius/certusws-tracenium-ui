// src/components/Reports/ReportPageRow.jsx
//
// Una fila por PÁGINA del menú, no por informe.
//
// El catálogo listaba informes: seis filas para once páginas con botón
// "Report". Eso contesta "¿qué puedo sacar?" y esconde la pregunta que se hace
// mirándolo hoy — "¿de qué páginas todavía NO hay informe?". Por página, la
// ausencia ocupa su propia fila, que es la mitad del valor de esta vista.
//
// La fila se despliega para llegar a los informes de esa página: la cuenta
// dice cuántos hay, y quien quiera generar uno abre y lo tiene ahí.

import * as React from "react";
import { Box, Chip, Collapse, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import { BRAND, TEXT } from "../../theme/brand";

/**
 * La "miniatura" con el número de informes de la página.
 *
 * Cero se pinta DISTINTO, no en gris apagado: es el dato que se viene a
 * buscar. Un cero que parece deshabilitado se lee como "no aplica" y esta
 * lista existe justamente para que se lea como "falta por hacer".
 */
function ContadorInformes({ n, sinDerecho }) {
  const vacio = n === 0;
  return (
    <Box
      aria-hidden
      sx={{
        width: 34,
        height: 34,
        flexShrink: 0,
        borderRadius: 1.5,
        display: "grid",
        placeItems: "center",
        fontWeight: 800,
        fontSize: TEXT.md,
        border: `1px solid ${vacio ? BRAND.border : BRAND.teal}`,
        bgcolor: vacio ? "transparent" : BRAND.tealSoft,
        color: sinDerecho ? BRAND.gray : vacio ? BRAND.gray : BRAND.tealText,
      }}
    >
      {sinDerecho ? "—" : n}
    </Box>
  );
}

export default function ReportPageRow({ fila, abierta = false, onToggle, children }) {
  const n = fila.types?.length ?? 0;
  const sinDerecho = Boolean(fila.sinDerecho);
  const desplegable = n > 0;

  // Qué dice la segunda línea. Tres estados distintos, y confundirlos es
  // justamente lo que hace inútil la lista:
  //
  //   · sin derecho — no se sabe si hay informe, porque el servidor no
  //     manda los tipos de un plugin que este tenant no tiene. Decir "0"
  //     aquí sería inventarse una carencia de producto.
  //   · sin informe propio — el hueco que se viene a ver. Se dice qué abre
  //     hoy su botón "Report", que es lo que el operador ya ha usado.
  //   · con informes — la cuenta habla sola.
  const detalle = sinDerecho
    ? "Plugin not enabled for this tenant — its reports aren't listed."
    : n === 0
      ? fila.borrows
        ? `No report of its own yet. Its "Report" button opens ${fila.borrows}.`
        : "No report of its own yet."
      : `${n} report${n === 1 ? "" : "s"}`;

  return (
    <Box
      role="group"
      aria-label={fila.label}
      sx={{ borderBottom: `1px solid ${BRAND.border}`, "&:last-of-type": { borderBottom: "none" } }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 1.5,
          py: 1.25,
          cursor: desplegable ? "pointer" : "default",
          "&:hover": desplegable ? { bgcolor: BRAND.tealSoft } : undefined,
        }}
        onClick={desplegable ? onToggle : undefined}
      >
        <Tooltip title={sinDerecho ? "Not entitled" : `${n} report${n === 1 ? "" : "s"}`}>
          <span><ContadorInformes n={n} sinDerecho={sinDerecho} /></span>
        </Tooltip>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }} noWrap>
            {fila.label}
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }} noWrap title={detalle}>
            {detalle}
          </Typography>
        </Box>

        {/* El hueco se marca, y con una palabra que dice de quién es el
            trabajo. "Missing" señalaría al operador; "Not built yet" dice que
            falta por construir, que es lo que pasa. */}
        {!sinDerecho && n === 0 ? (
          <Chip
            size="small"
            variant="outlined"
            label="Not built yet"
            sx={{ height: 22, fontSize: TEXT.xs, flexShrink: 0, borderColor: BRAND.border, color: BRAND.gray }}
          />
        ) : null}

        {desplegable ? (
          <IconButton
            size="small"
            aria-label={abierta ? `Collapse ${fila.label}` : `Expand ${fila.label}`}
            aria-expanded={abierta}
            onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
            sx={{ flexShrink: 0, color: BRAND.gray, transform: abierta ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
          >
            <ExpandMoreOutlinedIcon fontSize="small" />
          </IconButton>
        ) : (
          // Hueco del mismo ancho que el botón, para que los rótulos de todas
          // las filas queden alineados aunque unas se desplieguen y otras no.
          <Box sx={{ width: 34, flexShrink: 0 }} />
        )}
      </Box>

      <Collapse in={abierta} unmountOnExit>
        <Stack sx={{ pl: { xs: 0, sm: 5 }, pb: 0.5, borderTop: `1px solid ${BRAND.border}` }}>
          {children}
        </Stack>
      </Collapse>
    </Box>
  );
}
