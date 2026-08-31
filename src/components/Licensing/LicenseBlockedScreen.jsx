// src/components/Licensing/LicenseBlockedScreen.jsx
//
// ADR-0005 D6 — the blocked console, and the two doors out of it.
//
// The rule this screen exists to satisfy: a lock whose only key is behind
// the lock is not a lock, it is a support ticket. So the blocked state
// keeps exactly three things reachable — accept the adjustment, remove
// devices, and log out — and this screen is where the first one lives
// while linking to the second.
//
// It is a full-page takeover rather than a banner because a banner is
// dismissible-looking; an operator who has already ignored the demand for
// two days has demonstrated that a banner does not reach them.

import * as React from "react";
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { BRAND, ROLE } from "../../theme/brand";
import { acceptLicenseAdjustment } from "../../api/licensing";
import { formatMoney } from "../Billing/money";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function LicenseBlockedScreen({ state, onResolved, onNavigate }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [needsAdmin, setNeedsAdmin] = React.useState(false);

  // ⚠️ EL BLOQUEO TIENE TRES MOTIVOS Y NO SE ARREGLAN IGUAL.
  //
  //   · ajuste de licencias sin responder (ADR-0005 D6) -> un clic, o borrar
  //     equipos;
  //   · prueba vencida sin contratar (ADR-0010)          -> elegir un plan;
  //   · factura vencida (ADR-0010)                       -> pagar ESA factura.
  //
  // El tercero no se resuelve en la pantalla de Billing: ahí se contrata el
  // ciclo vivo, no se reabre uno pasado. La deuda se salda en el enlace que
  // sirve Stripe, y por eso este caso es el único que manda fuera del portal.
  //
  // Enseñar el mensaje equivocado manda al cliente a arreglar algo que no está
  // roto, y el sitio donde SÍ puede arreglarlo ni siquiera aparece.
  const paymentOverdue = state?.blockReason === "payment_overdue";
  const trialExpired = state?.blockReason === "trial_expired";
  const payment = state?.payment ?? null;
  const adj = state?.adjustment ?? null;
  const previous = adj?.previousMaxDevices ?? state?.maxDevices ?? 0;
  const proposed = adj?.proposedMaxDevices ?? state?.used ?? 0;

  const handleAccept = async () => {
    if (!adj) return;
    setBusy(true);
    setError("");
    try {
      await acceptLicenseAdjustment(adj.id);
      onResolved?.();
    } catch (err) {
      // A 409 means somebody already answered — the other admin clicked
      // accept, or devices were removed. Re-reading state clears the
      // screen, so treat it as success rather than showing a scary error.
      if (err?.status === 409) onResolved?.();
      // The server is the single authority on who may change what the
      // tenant is billed for. Rather than duplicate its role logic here
      // (and risk the two disagreeing), the button is always offered and
      // a refusal is explained.
      else if (err?.status === 403) setNeedsAdmin(true);
      else setError(err?.message || "Could not apply the adjustment. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: { xs: 2, sm: 4 },
        overflow: "auto",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          maxWidth: 640,
          width: "100%",
          p: { xs: 3, sm: 4 },
          borderRadius: 3,
          border: `1px solid ${ROLE.critical}`,
          boxShadow: BRAND.shadow,
          backgroundColor: BRAND.surface || "#fff",
        }}
      >
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 1.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: ROLE.criticalSoft,
                color: ROLE.critical,
                flexShrink: 0,
              }}
            >
              <LockOutlinedIcon />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ color: BRAND.dark, fontWeight: 700, lineHeight: 1.2 }}>
                {paymentOverdue
                  ? "Your account has an unpaid balance"
                  : trialExpired
                  ? "Your trial has ended"
                  : "Your license needs attention"}
              </Typography>
              <Typography variant="body2" sx={{ color: BRAND.tealText }}>
                {paymentOverdue
                  ? "The console is paused until the balance is settled."
                  : trialExpired
                  ? "The console is paused until you choose a plan."
                  : "The console is paused until this is resolved."}
              </Typography>
            </Box>
          </Stack>

          {paymentOverdue ? (
            <>
              <Typography variant="body2" sx={{ color: BRAND.dark }}>
                There {payment?.invoiceCount === 1 ? "is" : "are"}{" "}
                <strong>{payment?.invoiceCount ?? 1}</strong> unpaid{" "}
                {payment?.invoiceCount === 1 ? "invoice" : "invoices"} totalling{" "}
                <strong>{formatMoney(payment?.outstandingCents, payment?.currency)}</strong>
                {payment?.limitedOn ? `, overdue since ${formatDate(payment.limitedOn)}` : ""}.
                Your devices stay enrolled and keep reporting their inventory — nothing
                has been deleted.
              </Typography>

              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  backgroundColor: BRAND.tealSoft,
                  border: `1px solid ${BRAND.border}`,
                }}
              >
                <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600, mb: 0.5 }}>
                  Paying restores access immediately
                </Typography>
                <Typography variant="caption" sx={{ color: BRAND.tealText, display: "block" }}>
                  {/* No hay job que "levantar": el bloqueo se deriva de las
                      facturas abiertas, así que en cuanto Stripe marca la
                      factura pagada, la siguiente carga de la consola ya no
                      bloquea. Decirlo evita la llamada de "he pagado, ¿cuánto
                      tarda?". */}
                  The console unlocks on your next page load once the payment clears — there's
                  nothing else to do and nothing to set up again.
                </Typography>
              </Box>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                {/* ⚠️ Sale del portal a propósito. Una factura VENCIDA se salda
                    en la página que sirve Stripe; nuestra pantalla de Billing
                    cobra el ciclo vivo y no reabre uno pasado, así que mandar
                    ahí sería mandar a un sitio donde no se puede hacer. */}
                {payment?.payUrl ? (
                  <Button
                    variant="contained"
                    component="a"
                    href={payment.payUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ backgroundColor: BRAND.teal, "&:hover": { backgroundColor: BRAND.tealText } }}
                  >
                    Pay the outstanding invoice
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    onClick={() => onNavigate?.("billing")}
                    sx={{ backgroundColor: BRAND.teal, "&:hover": { backgroundColor: BRAND.tealText } }}
                  >
                    Go to Billing
                  </Button>
                )}
                <Button variant="outlined" onClick={() => onNavigate?.("billing")}>
                  Billing settings
                </Button>
              </Stack>
            </>
          ) : trialExpired ? (
            <>
              <Typography variant="body2" sx={{ color: BRAND.dark }}>
                Your {formatDate(state?.trialEndedAt)} trial has finished. Your devices
                stay enrolled and keep reporting their inventory, but the rest of the
                plugins are paused until there is an active plan.
              </Typography>

              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  backgroundColor: BRAND.tealSoft,
                  border: `1px solid ${BRAND.border}`,
                }}
              >
                <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600, mb: 0.5 }}>
                  Choose a plan
                </Typography>
                <Typography variant="caption" sx={{ color: BRAND.tealText, display: "block" }}>
                  Everything you configured during the trial is still here — policies,
                  groups, enrolled devices. Subscribing turns the plugins back on where you
                  left them; nothing has to be set up again.
                </Typography>
              </Box>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Button
                  variant="contained"
                  onClick={() => onNavigate?.("billing")}
                  sx={{ backgroundColor: BRAND.teal, "&:hover": { backgroundColor: BRAND.tealText } }}
                >
                  Go to Billing
                </Button>
                <Button variant="outlined" onClick={() => onNavigate?.("assets")}>
                  Manage devices
                </Button>
              </Stack>
            </>
          ) : (
            <>
            <Typography variant="body2" sx={{ color: BRAND.dark }}>
              On {formatDate(adj?.detectedAt)} this tenant had{" "}
              <strong>{adj?.fleetAtDetection ?? state?.used}</strong> devices enrolled against{" "}
              <strong>{previous}</strong> licenses. We asked you to choose by{" "}
              {formatDate(adj?.dueAt)} and haven&apos;t heard back, so the console is on hold.
              Your devices are still managed and still reporting — nothing was turned off on
              the endpoints.
            </Typography>

            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                backgroundColor: BRAND.tealSoft,
                border: `1px solid ${BRAND.border}`,
              }}
            >
              <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600, mb: 0.5 }}>
                Option 1 — adjust your licenses
              </Typography>
              <Typography variant="caption" sx={{ color: BRAND.tealText, display: "block" }}>
                Set your licensed device count to {proposed}, matching what you are actually
                using. This records the change; no payment is taken here.
              </Typography>
            </Box>

            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                border: `1px solid ${BRAND.border}`,
              }}
            >
              <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600, mb: 0.5 }}>
                Option 2 — remove devices
              </Typography>
              <Typography variant="caption" sx={{ color: BRAND.tealText, display: "block" }}>
                Bring the fleet back to {previous} devices or fewer. The console unlocks as
                soon as you do — you don&apos;t need to come back here.
              </Typography>
            </Box>

            {error ? (
              <Typography variant="caption" sx={{ color: ROLE.critical }}>
                {error}
              </Typography>
            ) : null}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button
                variant="contained"
                onClick={handleAccept}
                disabled={busy || !adj || needsAdmin}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
                sx={{ backgroundColor: BRAND.teal, "&:hover": { backgroundColor: BRAND.tealText } }}
              >
                {busy ? "Applying…" : `Set my licenses to ${proposed}`}
              </Button>
              <Button variant="outlined" onClick={() => onNavigate?.("assets")} disabled={busy}>
                Manage devices
              </Button>
            </Stack>

            </>
          )}

          {needsAdmin ? (
            // A viewer still sees why the console is locked and can still
            // reach device management; only the billing decision is
            // reserved. Hiding the screen from them would leave an
            // inexplicably dead UI.
            <Typography variant="caption" sx={{ color: BRAND.tealText }}>
              Adjusting licenses requires an administrator or owner on this tenant.
            </Typography>
          ) : null}
        </Stack>
      </Paper>
    </Box>
  );
}
