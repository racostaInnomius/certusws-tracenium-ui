// src/components/AgentSettings/PolicySectionPanel.jsx
//
// The form for ONE section of the policy: header with a one-line
// description and the link to the plugin page where the rest of that
// plugin is configured, then the section's settings as compact rows
// (SectionFields). In device scope every row says whether it inherits
// from the tenant or overrides it.

import * as React from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import SectionFields from "./SectionFields";
import AccessPolicyMatrix from "../common/AccessPolicyMatrix";

// Plugins con capacidades privilegiadas y, por tanto, con matriz de
// vistobueno. Es un cambio de permisos: vive aquí, en Agent Settings —solo
// ADMIN/OWNER llegan a esta página—, y no en la pantalla del plugin donde
// quien está frenado por el gate lo tendría a un clic. La de Crypto
// Discovery se movió el 08-sep por la misma razón que la de Remote Control.
const APPROVAL_MATRIX = {
  rcp: "Which remote control capabilities need a second person's approval before they can be used. Connecting to a server and connecting to a laptop are not the same operation.",
  cdp: "Which crypto discovery capabilities need a second person’s approval before they can be used. Installing a certificate and distrusting a trust anchor both change what a machine will accept."
};

export default function PolicySectionPanel({
  section,
  form,
  onChange,
  readOnly = false,
  onNavigate,
  onOpenPlugins,
  scope = "tenant",
  compareForm = null,
  deviceLabel = "",
}) {
  if (!section) return null;
  const inactive = section.enabled === false;
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h2" sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
            {section.label}
            {scope === "device" && deviceLabel ? <Typography component="span" sx={{ fontSize: TEXT.base, color: BRAND.gray, fontWeight: 500 }}> · {deviceLabel}</Typography> : null}
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
            {scope === "device" ? "Dimmed rows inherit from the tenant. An override stores only what differs." : section.description}
          </Typography>
        </Box>
        {section.related && onNavigate ? (
          <Button
            size="small"
            endIcon={<OpenInNewOutlinedIcon />}
            onClick={() => onNavigate(section.related.page)}
            sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText, whiteSpace: "nowrap" }}
          >
            {section.related.label}
          </Button>
        ) : null}
      </Box>

      {inactive ? (
        <Alert
          severity="info"
          sx={{ mt: 2 }}
          action={
            onOpenPlugins ? (
              <Button color="inherit" size="small" onClick={onOpenPlugins}>
                Plugins
              </Button>
            ) : null
          }
        >
          This plugin is not active in the loaded policy, so its settings have no effect. See Plugins for what your plan includes.
        </Alert>
      ) : (
        <>
          <SectionFields sectionId={section.id} form={form} onChange={onChange} scope={scope} compareForm={compareForm} readOnly={readOnly} />
          {/* ⚠️ El vistobueno se configura AQUÍ y ya no en la página de Remote
              Control.

              Vivía en la pestaña Access, junto a la cola de aprobaciones: la
              misma pantalla donde un operador descubre que el gate le frena
              tenía el interruptor para apagarlo, a un clic. Un control que
              existe para obligar a que intervenga una segunda persona no
              puede desactivarlo, sin salir de la pantalla, justo quien está
              esperando esa segunda persona. Pasó en producción el 07-sep.

              Solo en ámbito TENANT: la matriz es del tenant entero y no del
              equipo que se esté editando, y enseñarla mientras se edita el
              parche de un equipo diría que es suya. */}
          {APPROVAL_MATRIX[section.id] && scope === "tenant" && !readOnly ? (
            <Box sx={{ mt: 2 }}>
              <AccessPolicyMatrix prefix={`${section.id}.`} title="Privileged access policy" description={APPROVAL_MATRIX[section.id]} />
            </Box>
          ) : null}
        </>
      )}
    </Box>
  );
}
