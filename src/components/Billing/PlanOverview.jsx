// src/components/Billing/PlanOverview.jsx
//
// "¿Qué tengo, me cabe la flota y cuánto me van a cobrar?", en una tarjeta.
//
// Sustituye a SubscriptionSummary. Las respuestas son las mismas; lo que cambia
// es que la selección de planes ya no vive debajo de ella todo el rato: quien ya
// paga viene a mirar, no a comprar, y las tres tarjetas de planes eran la mayor
// parte de la página. Aquí está el botón que la abre.

import { Alert, Box, LinearProgress, Stack, Typography } from "@mui/material";
import SectionPaper from "../common/SectionPaper";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import StatusPill from "./StatusPill";
import PluginPills from "./PluginPills";
import { LINE_LABELS, INTERVAL_LABELS, graceCeiling, planStatus, tierLabel } from "./billingModel";
import { formatMoney } from "./money";

/**
 * Uso frente a licencias. La barra llega al 100 % en el TOPE CONTRATADO, no en
 * el techo de gracia: el margen es un colchón, no capacidad comprada.
 */
function UsageBar({ label, used, quantity }) {
  const known = Number.isFinite(used) && Number.isFinite(quantity) && quantity >= 1;
  const over = known && used > quantity;
  const beyondGrace = known && used > graceCeiling(quantity);
  const fill = beyondGrace ? ROLE.critical : over ? ROLE.caution : BRAND.teal;
  const textColor = beyondGrace ? BRAND.alert.errorText : over ? BRAND.alert.warningText : "text.secondary";

  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" spacing={1}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>{label}</Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: textColor }}>
          {known ? `${used} of ${quantity} devices` : Number.isFinite(quantity) ? `${quantity} licenses` : "—"}
        </Typography>
      </Stack>
      {known && (
        <>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, (used / quantity) * 100)}
            aria-label={`${label}: ${used} of ${quantity} licenses used`}
            sx={{
              mt: 0.5,
              height: 6,
              borderRadius: 3,
              bgcolor: BRAND.darkSoft,
              "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: fill },
            }}
          />
          {over && (
            <Typography sx={{ fontSize: TEXT.xs, color: textColor, mt: 0.25 }}>
              Enrollment stops at {graceCeiling(quantity)} (10% margin)
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}

/** La columna de la derecha: cuánto y cuándo, o por qué no hay cargo. */
function ChargeSummary({ sub, estimate, currency }) {
  const per = sub?.billingInterval === "yearly" ? "yr" : "mo";
  let caption = null;
  let amount = null;
  let footnote = null;

  if (sub?.managed) {
    caption = "Pricing";
    amount = "By contract";
  } else if (!sub?.billedByStripe) {
    caption = "Nothing billed yet";
    amount = formatMoney(0, currency);
    footnote = "Choose a plan to subscribe";
  } else if (sub?.cancelAtPeriodEnd) {
    // Con la cancelación programada no HAY próximo cargo: decir "next charge"
    // contradecía el aviso de "won't renew" de arriba.
    caption = "Ends on";
    amount = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : "—";
  } else {
    caption = sub.status === "trialing" ? "First charge (estimated)" : "Next charge (estimated)";
    amount = estimate !== null && estimate !== undefined ? `${formatMoney(estimate, currency)}/${per}` : "—";
    // La fecha junto al importe: "cuánto" sin "cuándo" obliga a buscarlo.
    const date = sub.status === "trialing" && sub.trialEndsAt ? sub.trialEndsAt : sub.currentPeriodEnd;
    footnote = date ? `on ${new Date(date).toLocaleDateString()} · before taxes` : "before taxes";
  }

  return (
    <Box sx={{ textAlign: { md: "right" } }}>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>{caption}</Typography>
      <Typography sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: BRAND.dark, lineHeight: 1.3 }}>{amount}</Typography>
      {footnote && <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>{footnote}</Typography>}
    </Box>
  );
}

export default function PlanOverview({ sub, estimate, currency, pluginCatalog, addonTitles = [], action = null }) {
  const status = planStatus(sub);
  const cap = sub?.licensedQuantity ?? null;
  const contracted = sub?.quantity ?? null;
  // El tope que aplica el enrolamiento y el contratado PUEDEN diferir (un
  // operador edita `maxDevices` a mano). Tiene que verse aquí, no descubrirse el
  // día que un alta se rechaza sin motivo aparente.
  const mismatch = Number.isFinite(cap) && Number.isFinite(contracted) && cap !== contracted;

  const lines = [
    // La barra de endpoints se mide contra el tope EFECTIVO: es el que decide
    // si un alta pasa.
    sub?.tier && { key: "endpoint", quantity: cap ?? contracted, used: sub?.usage?.endpoint },
    sub?.mdmTier && { key: "mdm", quantity: sub?.mdmQuantity, used: sub?.usage?.mdm },
  ].filter(Boolean);

  return (
    <SectionPaper variant="panel" component="section" aria-label="Your plan">
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography component="h2" sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark }}>
              {sub?.tier ? tierLabel(sub.tier) : "No plan"}
            </Typography>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            {sub?.billedByStripe && sub?.billingInterval && (
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                {INTERVAL_LABELS[sub.billingInterval] ?? sub.billingInterval} billing
              </Typography>
            )}
          </Stack>

          {lines.length > 0 && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                columnGap: 3,
                rowGap: 1.5,
                mt: 1.5,
                maxWidth: 640,
              }}
            >
              {lines.map((l) => (
                <UsageBar key={l.key} label={LINE_LABELS[l.key]} used={l.used ?? NaN} quantity={l.quantity} />
              ))}
            </Box>
          )}

          <Box sx={{ mt: 1.5 }}>
            <PluginPills catalog={pluginCatalog} sub={sub} />
          </Box>

          {addonTitles.length > 0 && (
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 1 }}>
              Add-ons: {addonTitles.join(", ")}
            </Typography>
          )}
        </Box>

        <Stack spacing={1.25} alignItems={{ md: "flex-end" }} sx={{ minWidth: 190 }}>
          <ChargeSummary sub={sub} estimate={estimate} currency={currency} />
          {action}
        </Stack>
      </Stack>

      {mismatch && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          Enrollment enforces a cap of <strong>{cap}</strong>, but the subscription has{" "}
          <strong>{contracted}</strong> licenses. The first one wins until they are reconciled.
        </Alert>
      )}
    </SectionPaper>
  );
}

