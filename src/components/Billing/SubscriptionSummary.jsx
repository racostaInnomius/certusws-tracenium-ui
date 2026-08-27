// src/components/Billing/SubscriptionSummary.jsx
//
// "¿Cómo estoy?", en un solo sitio.
//
// El estado vivía repartido en cuatro: un chip, una alerta, texto suelto y la
// tabla de facturas. Para responder "qué tengo, me cabe la flota y cuánto me
// cobran" había que recomponerlo mentalmente de trozos separados por scroll.
//
// Aquí va junto y en ese orden, que es el de las preguntas.

import { Alert, Box, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import SectionPaper from "../common/SectionPaper";
import { BRAND } from "../../theme/brand";
import { useAuthContext } from "../../auth/AuthContext";
import { LINES, LINE_LABELS, TIER_LABELS, INTERVAL_LABELS, graceCeiling } from "./billingModel";
import PluginInclusion from "./PluginInclusion";

/** Los estados de Stripe, dichos en el idioma del usuario. */
const STATUS_LABELS = {
  trialing: "Trial",
  active: "Up to date",
  past_due: "Payment pending",
  unpaid: "Unpaid",
  canceled: "Canceled",
  incomplete: "Payment not completed",
  incomplete_expired: "Expired unpaid",
};

const money = (cents, currency = "usd") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format((cents ?? 0) / 100);

/**
 * Uso frente a licencias, con el margen dibujado.
 *
 * La barra llega al 100% en el TOPE CONTRATADO, no en el techo de gracia: el
 * margen es un colchón, no capacidad comprada, y pintarlo como parte de la
 * barra invitaría a agotarlo.
 */
function UsageBar({ used, quantity }) {
  if (!Number.isFinite(used) || !Number.isFinite(quantity) || quantity < 1) return null;

  const pct = Math.min(100, (used / quantity) * 100);
  const over = used > quantity;
  const beyondGrace = used > graceCeiling(quantity);

  return (
    <Box sx={{ minWidth: 190, flex: 1 }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {used} of {quantity} licenses
        </Typography>
        <Typography
          variant="caption"
          color={beyondGrace ? "error.main" : over ? "warning.main" : "text.secondary"}
        >
          cap {graceCeiling(quantity)}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: "#eceef1",
          "& .MuiLinearProgress-bar": {
            borderRadius: 3,
            bgcolor: beyondGrace ? "#c62828" : over ? "#ed6c02" : BRAND.teal,
          },
        }}
      />
    </Box>
  );
}

export default function SubscriptionSummary({ sub, estimate, currency }) {
  const { auth } = useAuthContext();
  const tenantId = auth?.tenantId;

  const lines = LINES.map((line) => ({
    line,
    tier: line === "endpoint" ? sub?.tier : sub?.mdmTier,
    quantity: line === "endpoint" ? sub?.quantity : sub?.mdmQuantity,
    used: sub?.usage?.[line] ?? null,
  })).filter((l) => l.tier);

  // ⚠️ EL TOPE CONTRATADO Y EL QUE SE APLICA PUEDEN DIFERIR.
  //
  // No es hipotético: el gate aceptaba altas hasta 55 mientras esta pantalla
  // decía 1, porque cada uno leía un sitio distinto y nada los comparaba. Si
  // vuelven a separarse —alguien edita el tope del tenant a mano— tiene que
  // verse aquí, no descubrirse el día que un alta se rechace sin motivo
  // aparente.
  const cap = sub?.licensedQuantity ?? null;
  const contracted = sub?.quantity ?? null;
  const mismatch =
    Number.isFinite(cap) && Number.isFinite(contracted) && cap !== contracted ? { cap, contracted } : null;

  const paid = sub?.status === "active" || sub?.status === "trialing";

  return (
    <SectionPaper variant="panel">
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          alignItems={{ md: "flex-start" }}
          spacing={2}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="overline" color="text.secondary">
              Your plan
            </Typography>

            {lines.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                You haven't subscribed to any line yet.
              </Typography>
            ) : (
              <Stack spacing={1.5} sx={{ mt: 1 }}>
                {lines.map(({ line, tier, quantity, used }) => (
                  <Box key={line}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={2}
                      alignItems={{ sm: "center" }}
                    >
                      <Box sx={{ minWidth: 230 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {LINE_LABELS[line]}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {TIER_LABELS[tier] ?? "—"}
                        </Typography>
                      </Box>
                      {/* Cada línea con SU uso: los topes son independientes, y un
                          único número escondería que las licencias de PC no
                          sirven para enrolar un móvil.

                          Para endpoints se mide contra el tope EFECTIVO, que es
                          el que decide si un alta pasa. Dibujar la barra contra
                          lo contratado enseñaría una holgura que el enrolamiento
                          no va a respetar. */}
                      <UsageBar
                        used={used}
                        quantity={line === "endpoint" ? (cap ?? quantity) : quantity}
                      />
                    </Stack>
                    {/* Plugin inclusion (retired Plugin Control's content) hangs
                        specifically off Endpoint — that's the line
                        tier_required actually applies to; MDM has its own
                        fixed feature set (MDM_INCLUDES), not this catalog. */}
                    {line === "endpoint" ? (
                      <PluginInclusion tenantId={tenantId} tier={tier} />
                    ) : null}
                  </Box>
                ))}
              </Stack>
            )}
          </Box>

          <Box sx={{ textAlign: { md: "right" }, minWidth: 190 }}>
            {/* El estado de Stripe es vocabulario suyo: "incomplete" no le dice
                nada a quien lo lee, y menos aún qué hacer al respecto. */}
            <Chip
              size="small"
              label={STATUS_LABELS[sub?.status] ?? (sub?.inTrial ? "Trial" : "No plan")}
              color={paid ? "success" : "warning"}
              sx={{ mb: 1 }}
            />
            {/* El importe y la fecha juntos: "cuánto" sin "cuándo" obliga a
                buscar el dato en otra tarjeta. */}
            {estimate !== null && estimate !== undefined && (
              <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND.dark }}>
                {money(estimate, currency)}
                <Typography component="span" variant="caption" color="text.secondary">
                  {" "}
                  /{sub?.billingInterval === "yearly" ? "yr" : "mo"}
                </Typography>
              </Typography>
            )}
            {sub?.currentPeriodEnd && (
              <Typography variant="caption" color="text.secondary" display="block">
                next charge {new Date(sub.currentPeriodEnd).toLocaleDateString()}
              </Typography>
            )}
            {sub?.billingInterval && (
              <Typography variant="caption" color="text.secondary" display="block">
                {(INTERVAL_LABELS[sub.billingInterval] ?? "").toLowerCase()} billing
              </Typography>
            )}
          </Box>
        </Stack>

        {mismatch && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Enrollment enforces a cap of <strong>{mismatch.cap}</strong>, but the
            subscription has <strong>{mismatch.contracted}</strong> licenses. The
            first one wins until they are reconciled.
          </Alert>
        )}
    </SectionPaper>
  );
}
