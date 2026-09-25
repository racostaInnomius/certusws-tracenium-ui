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
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from "@mui/material";
import { httpPostJson } from "../../api/http";
import { BRAND, TEXT } from "../../theme/brand";
import SectionPaper from "../common/SectionPaper";
import { addonOffer } from "./billingModel";
import { formatMoney } from "./money";

const per = (interval) => (interval === "yearly" ? "yr" : "mo");

function StateChip({ state }) {
  const label = state === "subscribed" ? "Subscribed" : state === "trial" ? "Included in your trial" : "Not subscribed";
  const on = state === "subscribed";
  return (
    <Box
      component="span"
      sx={{
        fontSize: TEXT.xs,
        fontWeight: 800,
        bgcolor: on ? BRAND.tealSoft : BRAND.surfaceMuted,
        color: on ? BRAND.tealText : "text.secondary",
        border: `1px solid ${on ? `${BRAND.teal}55` : BRAND.border}`,
        borderRadius: 999,
        px: 1,
        py: 0.1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Box>
  );
}

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
      {addons.map((addon) => {
        const offer = addonOffer(sub, addon, {
          pluginTier: pluginCatalog.find((p) => p.key === addon.plugin)?.tier_required ?? null,
        });
        const price = offer.price
          ? `${formatMoney(offer.price.unitAmount, offer.price.currency)}/${per(offer.interval)}`
          : null;
        return (
          <SectionPaper key={addon.key} variant="panel">
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: "flex-start" }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="overline" color="text.secondary">
                  Add-on
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>{addon.title}</Typography>
                  <StateChip state={offer.state} />
                  {price && (
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {price}
                    </Typography>
                  )}
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
                  {addon.description}
                </Typography>
                {offer.state === "trial" && sub.trialEndsAt && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                    Your trial includes it until {new Date(sub.trialEndsAt).toLocaleDateString()}. Without subscribing, those
                    sources stop refreshing then — what they brought is kept.
                  </Typography>
                )}
                {offer.blocked && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                    {offer.blocked}
                  </Typography>
                )}
              </Box>
              <Button
                variant={offer.action === "add" ? "contained" : "outlined"}
                color={offer.action === "add" ? "primary" : "inherit"}
                disabled={Boolean(offer.blocked) || busy}
                onClick={() => setConfirm({ addon, offer })}
                sx={{ flexShrink: 0 }}
              >
                {offer.action === "add" ? "Add to subscription" : `Remove ${addon.title}`}
              </Button>
            </Stack>
          </SectionPaper>
        );
      })}

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

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
