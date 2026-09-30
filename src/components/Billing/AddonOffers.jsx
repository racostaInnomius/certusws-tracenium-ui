// src/components/Billing/AddonOffers.jsx
//
// ADR-0026 — los COMPLEMENTOS se contratan aquí, donde se paga (hoy, CDP
// Coverage). Antes sólo los activaba el staff desde su selector.
//
// Dos cosas que la pantalla tiene que decir ANTES de mover dinero, porque son
// las que sorprenden:
//
//   · contratar cobra YA la parte proporcional del periodo en curso — en el
//     plan anual es una cifra grande — y si el cargo no pasa no se añade nada;
//   · retirar es inmediato y no devuelve el resto del periodo (lo mismo que
//     bajar licencias). Lo que ya se trajo se conserva: se congela, no se borra.

import { useState } from "react";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tooltip, Typography,
} from "@mui/material";
import { httpPostJson } from "../../api/http";
import { BRAND, TEXT } from "../../theme/brand";
import SectionPaper from "../common/SectionPaper";
import StatusPill from "./StatusPill";
import { addonOffer } from "./billingModel";
import { formatMoney } from "./money";

const per = (interval) => (interval === "yearly" ? "yr" : "mo");

const STATE_LOOK = {
  subscribed: { label: "Subscribed", tone: "success" },
  trial: { label: "In your trial", tone: "info" },
  available: { label: "Not subscribed", tone: "neutral" },
};

export default function AddonOffers({ sub, addons, pluginCatalog = [], onChanged }) {
  const [confirm, setConfirm] = useState(null); // { addon, offer }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!addons?.length || !sub) return null;

  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : null;

  const apply = async () => {
    const { addon, offer } = confirm;
    setBusy(true);
    setError(null);
    try {
      await httpPostJson("/api/v1/billing/addons", { addon: addon.key, enabled: offer.action === "add" });
      setConfirm(null);
      await onChanged?.(addon, offer.action);
    } catch (err) {
      setConfirm(null);
      // Una tarjeta rechazada llega con el mensaje de Stripe, que dice justo qué pasa.
      setError(err?.message ?? "Could not change the add-on.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionPaper variant="card" component="section" aria-label="Add-ons">
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 0.5 }}>Add-ons</Typography>
        <Stack spacing={1.25}>
          {addons.map((addon) => {
            const offer = addonOffer(sub, addon, {
              pluginTier: pluginCatalog.find((p) => p.key === addon.plugin)?.tier_required ?? null,
            });
            const price = offer.price
              ? `${formatMoney(offer.price.unitAmount, offer.price.currency)}/${per(offer.interval)}`
              : null;
            const look = STATE_LOOK[offer.state];
            return (
              <Box key={addon.key}>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ minWidth: 0 }}>
                    <Tooltip arrow title={addon.description ?? ""}>
                      <Typography tabIndex={0} sx={{ fontSize: TEXT.base, fontWeight: 700, color: BRAND.dark, cursor: "help" }}>
                        {addon.title}
                      </Typography>
                    </Tooltip>
                    <StatusPill tone={look.tone}>{look.label}</StatusPill>
                  </Stack>
                  <Button
                    size="small"
                    variant={offer.action === "add" ? "outlined" : "text"}
                    color={offer.action === "add" ? "primary" : "inherit"}
                    disabled={Boolean(offer.blocked) || busy}
                    onClick={() => setConfirm({ addon, offer })}
                    aria-label={`${offer.action === "add" ? "Add" : "Remove"} ${addon.title}`}
                    sx={{ flexShrink: 0 }}
                  >
                    {offer.action === "add" ? "Add" : "Remove"}
                  </Button>
                </Stack>
                {price && <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>{price}</Typography>}
                {offer.state === "trial" && sub.trialEndsAt && (
                  <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                    Your trial includes it until {new Date(sub.trialEndsAt).toLocaleDateString()}. Without subscribing, those
                    sources stop refreshing then — what they brought is kept.
                  </Typography>
                )}
                {/* El motivo junto al botón deshabilitado, no un botón mudo. */}
                {offer.blocked && (
                  <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>{offer.blocked}</Typography>
                )}
              </Box>
            );
          })}
        </Stack>
        {/* El error va en la tarjeta del botón que lo provocó, no arriba de la
            página donde no se ve. */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mt: 1.25 }}>
            {error}
          </Alert>
        )}
      </SectionPaper>


      <Dialog open={Boolean(confirm)} onClose={busy ? undefined : () => setConfirm(null)} maxWidth="sm" fullWidth>
        {confirm && (
          <>
            <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
              {confirm.offer.action === "add" ? `Add ${confirm.addon.title}` : `Remove ${confirm.addon.title}`}
            </DialogTitle>
            <DialogContent>
              {confirm.offer.action === "add" ? (
                <Stack spacing={1.25}>
                  <Typography variant="body2">
                    {formatMoney(confirm.offer.price?.unitAmount, confirm.offer.price?.currency)}/{per(confirm.offer.interval)}, on the
                    same subscription and invoice as your plan.
                  </Typography>
                  <Alert severity="info">
                    The prorated part for the rest of the current period
                    {periodEnd ? ` (until ${periodEnd})` : ""} is charged now to your card on file. If the charge doesn't go
                    through, nothing is added.
                  </Alert>
                </Stack>
              ) : (
                <Stack spacing={1.25}>
                  <Alert severity="warning">
                    It stops now and the rest of the current period is not refunded.
                  </Alert>
                  <Typography variant="body2" color="text.secondary">
                    Remote probes, the Windows CA, cloud connectors and domains past the included ones stop refreshing. Their
                    configuration and what they already brought are kept.
                  </Typography>
                </Stack>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirm(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="contained"
                color={confirm.offer.action === "add" ? "primary" : "error"}
                onClick={apply}
                disabled={busy}
              >
                {busy ? "Working…" : confirm.offer.action === "add" ? "Add and pay now" : "Remove now"}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
}
