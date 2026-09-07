// src/components/common/GoToReportButton.jsx
//
// "Report" en la cabecera de una página: no genera nada, lleva a Reports con
// el informe ya elegido, y allí se confirma y se ejecuta POR EL MOTOR.
//
// Existe como componente porque ya son dos las páginas que lo ponen (Overview
// y Asset Management) y la tentación era copiar quince líneas. Copiadas, la
// tercera se olvida de algo: del gate de rol, o de limpiar el parámetro, o de
// que la altura case con el "Refresh" de al lado.
//
// ⚠️ Lo que NO hace, a propósito: descargar. Cada página que se bajaba su
// propio fichero por su propia ruta era otra puerta que esquivaba
// `report_runs` —el ledger del que cuelgan la re-entrega y el SHA-256—, y
// eran nueve. Aquí sólo se navega.

import * as React from "react";
import { Button, Tooltip } from "@mui/material";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import { BRAND, ICON } from "../../theme/brand";
import { updateSearchParams } from "../../utils/browserState";

export default function GoToReportButton({
  onNavigate,
  reportKey,
  format = "pdf",
  tooltip = "Generate this report",
  label = "Report",
}) {
  if (!onNavigate) return null;

  return (
    <Tooltip title={tooltip} arrow placement="bottom">
      <span>
        <Button
          // Tamaño por defecto y trazo teal, iguales a los del `Refresh` que
          // suele ir a su lado (RefreshControl): en una fila de acciones
          // alineada al centro, seis píxeles de diferencia se leen como un
          // descuido, y son dos acciones del mismo rango.
          variant="outlined"
          startIcon={<AssessmentOutlinedIcon sx={{ fontSize: ICON.md }} />}
          onClick={() => {
            // El parámetro viaja en la URL y lo consume la página de Reports
            // al usarlo, para que una recarga no vuelva a preguntar por un
            // informe ya decidido.
            updateSearchParams({ reportKey, reportFormat: format });
            onNavigate("reports");
          }}
          sx={{
            textTransform: "none",
            fontWeight: 700,
            borderColor: BRAND.teal,
            color: BRAND.teal,
            "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
          }}
        >
          {label}
        </Button>
      </span>
    </Tooltip>
  );
}
