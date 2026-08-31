// src/components/Billing/money.js
//
// Importes de facturación, siempre en CÉNTIMOS.
//
// Toda cifra de dinero que viene del backend está en la unidad mínima de la
// moneda, como la maneja Stripe. Dividir entre 100 en cada sitio donde se
// pinta es exactamente cómo aparece un "USD 55400.00" en un correo de cobro.
//
// ⚠️ `Intl.NumberFormat` con `style: "currency"` LANZA si el código de moneda
// es nulo o no es ISO-4217. Es alcanzable: un tenant sin suscripción todavía no
// tiene moneda, y una deuda puede leerse antes de que llegue la primera
// factura. Sin el respaldo, la excepción sube hasta el ErrorBoundary y lo que
// el usuario ve es una página rota en vez de una cifra.

export function formatMoney(cents, currency) {
  const amount = (cents ?? 0) / 100;
  if (!currency) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${String(currency).toUpperCase()} ${amount.toFixed(2)}`;
  }
}
