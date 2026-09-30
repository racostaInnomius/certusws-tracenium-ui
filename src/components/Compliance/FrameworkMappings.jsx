// src/components/Compliance/FrameworkMappings.jsx
//
// Los frameworks de un check: una línea plegada, la lista al abrir.
//
// Un check mapea hasta ~30 controles de 8 estándares (los de SSH: tres
// benchmarks CIS, HIPAA, ISO, NIST, CSF, PCI, SOC 2, STIG) y cada uno era una
// pill: filas de 10 líneas en el Catálogo y tarjetas del doble de alto en el
// cajón de un equipo. Plegado se dice QUÉ estándares y cuántos controles de
// cada uno; abierto, los controles, una línea por benchmark («CIS 5.1.19» de
// Ubuntu 22 y de Ubuntu 24 no son el mismo control repetido).
//
// Sirve a los dos: el Catálogo trae camelCase (controlId) y el hallazgo de un
// equipo snake_case (control_id); se normaliza aquí.

import * as React from "react";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { FrameworkChip } from "./complianceChips";
import { frameworkLongLabel, frameworkShortLabel } from "./frameworkRefs";

function normalize(fw) {
  return {
    framework: fw?.framework,
    controlId: fw?.controlId ?? fw?.control_id,
    controlLevel: fw?.controlLevel ?? fw?.control_level ?? null,
    controlTitle: fw?.controlTitle ?? fw?.control_title ?? null,
    referenceUrl: fw?.referenceUrl ?? fw?.reference_url ?? null,
  };
}

export function distinctControls(frameworks) {
  const seen = new Set();
  return (frameworks || []).map(normalize).filter((fw) => {
    if (!fw.framework || fw.controlId == null) return false;
    const k = `${fw.framework}\u0000${fw.controlId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// [{ family: "CIS", controls: [...] }] en orden de aparición.
export function byFamily(frameworks) {
  const map = new Map();
  for (const fw of distinctControls(frameworks)) {
    const fam = frameworkShortLabel(fw.framework);
    if (!map.has(fam)) map.set(fam, []);
    map.get(fam).push(fw);
  }
  return [...map.entries()].map(([family, controls]) => ({ family, controls }));
}

/** Plegado: un chip por estándar con cuántos controles; el tooltip los lista y el clic abre. */
export function FrameworkSummary({ frameworks, onOpen, emptyDash = true }) {
  const groups = byFamily(frameworks);
  if (!groups.length) return emptyDash ? <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>—</Typography> : null;
  return (
    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
      {groups.map((g) => (
        <Tooltip
          key={g.family}
          arrow
          placement="top"
          title={g.controls.map((c) => `${frameworkLongLabel(c.framework)} ${c.controlId}`).join("\n")}
          slotProps={{ tooltip: { sx: { whiteSpace: "pre-line" } } }}
        >
          <Chip
            size="small"
            label={g.controls.length > 1 ? `${g.family} · ${g.controls.length}` : g.family}
            onClick={onOpen || undefined}
            sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark, border: `1px solid ${BRAND.border}` }}
          />
        </Tooltip>
      ))}
    </Stack>
  );
}

/** Abierto: los controles, una línea por benchmark, cada uno con su enlace. */
export function FrameworkDetail({ frameworks, sx }) {
  const controls = distinctControls(frameworks);
  if (!controls.length) return null;
  const byFramework = new Map();
  for (const fw of controls) {
    if (!byFramework.has(fw.framework)) byFramework.set(fw.framework, []);
    byFramework.get(fw.framework).push(fw);
  }
  return (
    <Box sx={{ mt: 1.25, ...sx }}>
      <Typography sx={{ fontSize: TEXT.xs, fontWeight: 800, color: BRAND.gray, mb: 0.5 }}>FRAMEWORKS</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "minmax(160px, max-content) 1fr" }, columnGap: 1.5, rowGap: 0.5 }}>
        {[...byFramework.entries()].map(([framework, list]) => (
          <React.Fragment key={framework}>
            <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: BRAND.dark, pt: "2px" }}>{frameworkLongLabel(framework)}</Typography>
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
              {list.map((fw) => (
                <FrameworkChip
                  key={fw.controlId}
                  framework={fw.framework}
                  controlId={fw.controlId}
                  controlLevel={fw.controlLevel}
                  controlTitle={fw.controlTitle}
                  referenceUrl={fw.referenceUrl}
                  dense
                  bare
                />
              ))}
            </Stack>
          </React.Fragment>
        ))}
      </Box>
    </Box>
  );
}
