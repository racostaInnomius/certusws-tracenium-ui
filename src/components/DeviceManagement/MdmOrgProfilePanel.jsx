// src/components/DeviceManagement/MdmOrgProfilePanel.jsx
//
// El perfil de la organización en ESTE Mac (1-oct, backend
// profile-delivery.service): la política macOS del tenant —lo que se añade
// desde un hallazgo con «Add to macOS policy»— le llega sola por la cola de
// comandos en su próxima conexión. Aquí se ve en qué quedó y, si el Mac lo
// rechazó, por qué. «Resend» (ADMIN/OWNER) es lo único que reintenta un
// rechazo con el mismo contenido.

import * as React from "react";
import { Box, Button, Divider, Typography } from "@mui/material";

import { BRAND } from "../../theme/brand";
import { formatRelative } from "../../utils/format";
import { getMdmOrganizationProfile, resendMdmOrganizationProfile } from "../../api/mdm";
import { describeProfileDelivery } from "./mdmModel";
import { Field, StatusChip } from "./mdmAtoms";

export default function MdmOrgProfilePanel({ udid, canConfigure, notify, platform = "macos" }) {
  const [delivery, setDelivery] = React.useState(undefined);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(
    async ({ fresh = false } = {}) => {
      try {
        const res = await getMdmOrganizationProfile(udid, { fresh });
        setDelivery(res?.delivery ?? null);
      } catch {
        setDelivery(null);
      }
    },
    [udid]
  );

  React.useEffect(() => {
    load();
  }, [load]);

  if (delivery === undefined) return null;
  const d = describeProfileDelivery(delivery, formatRelative, platform);

  async function resend() {
    setBusy(true);
    try {
      await resendMdmOrganizationProfile(udid);
      notify?.(`${platform === "ios" ? "The device" : "The Mac"} gets the organization's profile again on its next check-in.`, "success");
      await load({ fresh: true });
    } catch (err) {
      notify?.(err?.body?.message || err?.message || "Could not resend the profile.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box aria-label="Organization profile" sx={{ display: "grid", gap: 1 }}>
      <Divider sx={{ borderColor: BRAND.border }} />
      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700 }}>
        Organization profile
      </Typography>
      <Field label="Status">
        <StatusChip status={d.chip} />
      </Field>
      <Typography variant="body2" sx={{ color: d.error ? BRAND.alert.errorText : "text.secondary", fontWeight: d.error ? 600 : 400 }}>
        {d.text}
      </Typography>
      {canConfigure && delivery ? (
        <Box>
          <Button variant="outlined" onClick={resend} disabled={busy} sx={{ textTransform: "none", fontWeight: 700 }}>
            {busy ? "Resending…" : "Resend"}
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
