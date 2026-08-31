// src/components/Licensing/PaymentDueBanner.jsx
//
// ADR-0010 — la deuda, mientras la consola todavía funciona.
//
// ── Por qué un banner aquí y una pantalla completa allá ──────────────
//
// La pantalla de bloqueo (LicenseBlockedScreen) es un takeover porque llega
// cuando el plazo ya se agotó: a esas alturas el cliente ya ignoró un correo de
// rechazo y otro de aviso, así que algo dismissible no le llegaría.
//
// Esto es lo contrario. Durante los 14 días de gracia el producto funciona con
// normalidad y el cliente puede estar sin enterarse —el correo del rechazo lo
// recibió quien figura como OWNER, que no siempre es quien usa la consola—.
// Un banner es proporcionado: informa en cada pantalla sin impedir trabajar,
// que es justo lo que hace falta para que el corte no llegue a ocurrir.
//
// ⚠️ NO SE PUEDE CERRAR. Es deliberado: lo que anuncia es la pérdida de acceso
// en una fecha concreta, y un aspa lo convertiría en algo que se quita una vez
// y no se vuelve a ver hasta que ya es tarde. El único modo de que desaparezca
// es pagar — y entonces desaparece solo, porque se deriva de las facturas
// abiertas.

import * as React from "react";
import { Alert, AlertTitle, Button, Stack } from "@mui/material";
import { formatMoney } from "../Billing/money";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function PaymentDueBanner({ payment, onNavigate }) {
  if (!payment || !payment.outstandingCents) return null;

  const days = payment.daysUntilLimit;
  // La última semana sube de tono. Antes de eso el aviso es informativo: la
  // mayoría de los rechazos se resuelven solos en los primeros reintentos de
  // Stripe, y pintar de rojo el día 1 gasta la señal para cuando importa.
  const severity = days !== null && days <= 7 ? "error" : "warning";

  const amount = formatMoney(payment.outstandingCents, payment.currency);
  const many = payment.invoiceCount > 1;

  return (
    <Alert
      severity={severity}
      sx={{ mb: 2, alignItems: "center" }}
      action={
        <Stack direction="row" spacing={1}>
          {/* Una factura vencida se salda donde la sirve Stripe: nuestra
              pantalla de Billing cobra el ciclo vivo y no reabre uno pasado. */}
          {payment.payUrl ? (
            <Button
              size="small"
              color="inherit"
              component="a"
              href={payment.payUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Pay now
            </Button>
          ) : null}
          <Button size="small" color="inherit" onClick={() => onNavigate?.("billing")}>
            Billing
          </Button>
        </Stack>
      }
    >
      <AlertTitle sx={{ mb: 0.25 }}>
        {many
          ? `${payment.invoiceCount} unpaid invoices — ${amount} outstanding`
          : `Unpaid invoice — ${amount} outstanding`}
      </AlertTitle>
      {days !== null && days > 0
        ? `Console access will be limited on ${formatDate(payment.limitedOn)} (${days} ${
            days === 1 ? "day" : "days"
          } from now) unless the balance is settled. Your devices keep reporting throughout.`
        : `The balance has been outstanding for ${payment.daysOverdue} days. Your devices keep reporting throughout.`}
    </Alert>
  );
}
