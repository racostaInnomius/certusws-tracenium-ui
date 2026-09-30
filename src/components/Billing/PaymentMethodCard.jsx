// src/components/Billing/PaymentMethodCard.jsx
//
// El método de pago, sin salir de Tracenium (ADR-0010 D6).
//
// Es la única parte de la pantalla que renderiza Stripe, y lo hace dentro de un
// iframe suyo: el número de tarjeta no pasa por nuestro DOM ni por nuestro
// servidor, que es lo que mantiene acotado el alcance de PCI sin renunciar a
// que la página sea nuestra.
//
// ⚠️ Stripe.js se carga BAJO DEMANDA, al abrir el formulario. Cargarlo con la
// página metería un script de terceros en cada visita a Billing —incluida la de
// quien sólo viene a mirar sus facturas—.

import { useCallback, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import SectionPaper from "../common/SectionPaper";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { httpPostJson } from "../../api/http";
import { BRAND, TEXT } from "../../theme/brand";

/**
 * Una promesa de Stripe.js POR CLAVE.
 *
 * `loadStripe` inyecta un <script> cada vez que se llama, así que memoizarla
 * evita duplicarlo al abrir y cerrar el formulario. Se cachea por clave y no en
 * una sola variable porque la clave llega del backend y podría cambiar sin
 * recargar la SPA.
 */
const stripeCache = new Map();
function stripePromiseFor(key) {
  if (!stripeCache.has(key)) stripeCache.set(key, loadStripe(key));
  return stripeCache.get(key);
}

function SetupForm({ onDone, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);

    // `redirect: "if_required"` es lo que hace que el usuario NO salga de aquí:
    // sólo se le manda fuera si su banco exige 3-D Secure, y en ese caso vuelve
    // a esta misma página.
    const { error: err, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

    if (err) {
      // El mensaje de Stripe está escrito para el titular de la tarjeta
      // ("tu tarjeta fue rechazada") y dice más que cualquier texto nuestro.
      setError(err.message ?? "Could not save the payment method.");
      setBusy(false);
      return;
    }
    // Se le dice al servidor que ya está, en vez de esperar el webhook: éste
    // llega cuando llega, y mientras tanto la pantalla seguiría afirmando que
    // no hay tarjeta justo después de haberla guardado. El servidor no se fía
    // del id — lo relee de Stripe y comprueba que sea de este tenant.
    try {
      await httpPostJson("/api/v1/billing/payment-method", { setupIntentId: setupIntent?.id });
    } catch {
      // La tarjeta YA está guardada en Stripe: fallar aquí sólo significa que
      // la pantalla tardará en enterarse, no que haya que rehacer nada.
    }
    setBusy(false);
    onDone(setupIntent);
  };

  return (
    <Box component="form" onSubmit={submit}>
      <PaymentElement />
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button type="submit" variant="contained" disabled={!stripe || busy}>
          {busy ? "Saving…" : "Save card"}
        </Button>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
      </Stack>
    </Box>
  );
}

/** "Visa ···· 4242", o lo que se sepa. */
function cardLabel(pm) {
  if (!pm) return null;
  const brand = pm.brand ? pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1) : "Card";
  return pm.last4 ? `${brand} ···· ${pm.last4}` : brand;
}

function cardExpiry(pm) {
  if (!pm?.expMonth || !pm?.expYear) return null;
  return `Expires ${String(pm.expMonth).padStart(2, "0")}/${String(pm.expYear).slice(-2)}`;
}

/**
 * `embedded`: sin tarjeta propia, dentro del selector de plan. Ahí la tarjeta es
 * un paso del alta, no una sección aparte.
 */
export default function PaymentMethodCard({ publishableKey, hasPaymentMethod, paymentMethod = null, onSaved, embedded = false }) {
  const [clientSecret, setClientSecret] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const open = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      // El SetupIntent nace en el servidor: es lo que autoriza a guardar una
      // tarjeta contra ESTE customer, y por eso no puede crearlo el navegador.
      const r = await httpPostJson("/api/v1/billing/setup-intent", {});
      if (!r?.clientSecret) throw new Error("The server did not return a SetupIntent.");
      setClientSecret(r.clientSecret);
    } catch (err) {
      setError(err?.message ?? "Could not prepare the payment form.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Una FUNCIÓN y no un componente: un componente definido aquí dentro sería un
  // tipo nuevo en cada render, y React remontaría el formulario de Stripe
  // —perdiendo lo tecleado— con cualquier cambio de estado.
  const frame = (children) =>
    embedded ? (
      <Box>{children}</Box>
    ) : (
      <SectionPaper variant="card" component="section" aria-label="Payment method">
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 0.5 }}>Payment method</Typography>
        {children}
      </SectionPaper>
    );

  // Sin clave publicable no hay Elements que montar. Se dice en vez de
  // enseñar un botón que no puede funcionar.
  if (!publishableKey) {
    return frame(
      <Typography sx={{ fontSize: TEXT.base, color: "text.secondary" }}>
        Card payments are not enabled on this installation.
      </Typography>
    );
  }

  const label = cardLabel(paymentMethod);
  const expiry = cardExpiry(paymentMethod);

  return frame(
    <>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      {saved && <Alert severity="success" sx={{ mb: 1 }}>Payment method saved.</Alert>}

      {!clientSecret ? (
        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: TEXT.base, fontWeight: 700, color: BRAND.dark }}>
              {hasPaymentMethod ? label ?? "A card is on file" : "No card on file"}
            </Typography>
            {hasPaymentMethod && expiry && (
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>{expiry}</Typography>
            )}
          </Box>
          <Button variant="outlined" size="small" onClick={open} disabled={loading} sx={{ flexShrink: 0 }}>
            {loading ? <CircularProgress size={18} /> : hasPaymentMethod ? "Update" : "Add card"}
          </Button>
        </Stack>
      ) : (
        <Elements
          // La clave remonta Elements si cambia el secreto, que es lo que
          // Stripe espera: un SetupIntent no se reutiliza.
          key={clientSecret}
          stripe={stripePromiseFor(publishableKey)}
          options={{ clientSecret, appearance: { theme: "stripe" } }}
        >
          <SetupForm
            onDone={() => {
              setClientSecret(null);
              setSaved(true);
              onSaved?.();
            }}
            onCancel={() => setClientSecret(null)}
          />
        </Elements>
      )}
    </>
  );
}
