// src/components/DeviceManagement/MdmDeclarativePanel.jsx
//
// El DDM de ESTE Mac (1-oct-2026, backend ddm-view.service): lo que informa
// él mismo sin agente —FileVault, batería, Lockdown Mode, modelo, versión con
// su Background Security Improvement, tipo de enrolamiento— y las
// declaraciones que le hemos mandado, cada una con lo que dice el Mac: aplicada,
// esperando a que sincronice, o rechazada y por qué.

import * as React from "react";
import { Box, Divider, Typography } from "@mui/material";

import { BRAND } from "../../theme/brand";
import { formatRelative } from "../../utils/format";
import { getMdmDeclarative } from "../../api/mdm";
import { describeDdmInventory, describeDeclaration, visibleDeclarations } from "./mdmModel";
import { Field, FieldGrid, StatusChip } from "./mdmAtoms";

export default function MdmDeclarativePanel({ udid }) {
  const [view, setView] = React.useState(undefined);

  React.useEffect(() => {
    let alive = true;
    getMdmDeclarative(udid)
      .then((v) => alive && setView(v ?? null))
      .catch(() => alive && setView(null));
    return () => {
      alive = false;
    };
  }, [udid]);

  if (view === undefined) return null;
  const inv = describeDdmInventory(view?.inventory);
  const decls = visibleDeclarations(view?.declarations);
  if (!inv && decls.length === 0) {
    return (
      <Box aria-label="Device status" sx={{ display: "grid", gap: 1 }}>
        <Divider sx={{ borderColor: BRAND.border }} />
        <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700 }}>
          Device status
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          The Mac reports its status after its next check-in.
        </Typography>
      </Box>
    );
  }

  return (
    <Box aria-label="Device status" sx={{ display: "grid", gap: 1.5 }}>
      <Divider sx={{ borderColor: BRAND.border }} />
      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700 }}>
        Device status
        {view?.reportedAt ? (
          <Box component="span" sx={{ fontWeight: 400 }}>{` · reported by the Mac ${formatRelative(view.reportedAt)}`}</Box>
        ) : null}
      </Typography>

      {inv ? (
        <FieldGrid>
          {inv.model ? <Field label="Model name">{inv.model}</Field> : null}
          {inv.os ? <Field label="macOS">{inv.os}</Field> : null}
          {inv.fileVault ? (
            <Field label="FileVault">
              <StatusChip status={inv.fileVault} />
            </Field>
          ) : null}
          {inv.battery ? (
            <Field label="Battery">
              <StatusChip status={inv.battery} />
            </Field>
          ) : null}
          {inv.lockdownMode ? (
            <Field label="Lockdown Mode">
              <StatusChip status={inv.lockdownMode} />
            </Field>
          ) : null}
          {inv.enrollment ? <Field label="Enrollment">{inv.enrollment}</Field> : null}
          {inv.beta ? <Field label="Beta program">{inv.beta}</Field> : null}
          {inv.certificates.length ? (
            <Field label={`Managed certificates (${inv.certificates.length})`}>
              {inv.certificates.map((c) => `${c.subject}${c.identity ? " · identity" : ""}`).join(", ")}
            </Field>
          ) : null}
        </FieldGrid>
      ) : null}

      {decls.length ? (
        <Box aria-label="Declarations" sx={{ display: "grid", gap: 0.75 }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Declarations — what Tracenium declared to this Mac, and what the Mac says it did with each
          </Typography>
          {decls.map((d) => {
            const x = describeDeclaration(d);
            return (
              <Box key={`${d.kind}:${d.identifier}`} sx={{ display: "grid", gap: 0.25 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600 }}>
                    {x.name}
                  </Typography>
                  <StatusChip status={x.chip} />
                </Box>
                {x.reason ? (
                  <Typography variant="body2" sx={{ color: BRAND.alert.errorText }}>
                    {x.reason}
                  </Typography>
                ) : null}
              </Box>
            );
          })}
        </Box>
      ) : null}
    </Box>
  );
}
