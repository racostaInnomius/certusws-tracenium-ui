// src/components/Billing/ConfirmChangeDialog.jsx
//
// El último paso antes de que se mueva dinero.
//
// Antes se pulsaba "Actualizar suscripción" y se cobraba. El aviso de prorrateo
// estaba encima del botón, que es exactamente donde no se lee: el usuario ya ha
// decidido y va a por el botón.
//
// Un diálogo obliga a un segundo gesto y —más importante— enseña el ANTES y el
// DESPUÉS juntos. "Pasas de $120 a $200" responde la pregunta que el usuario
// tiene de verdad, y que dos números en pantallas distintas no responden.

import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, Stack, Typography,
} from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { BRAND } from "../../theme/brand";
import { LINES, LINE_LABELS, TIER_LABELS, INTERVAL_LABELS } from "./billingModel";

const money = (cents, currency = "usd") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format((cents ?? 0) / 100);

const describe = (sel) =>
  sel ? `${TIER_LABELS[sel.tier] ?? sel.tier} × ${sel.quantity}` : "no contratada";

export default function ConfirmChangeDialog({
  open, onClose, onConfirm, busy,
  current, next, change, beforeTotal, afterTotal, currency,
}) {
  const perPeriod = next?.interval === "yearly" ? "/año" : "/mes";

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
        {change === "new" ? "Confirmar contratación" : "Confirmar cambio de plan"}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={1.25} sx={{ mb: 2 }}>
          {LINES.map((line) => {
            const a = current?.[line] ?? null;
            const b = next?.[line] ?? null;
            // Una línea que no se toca no ocupa espacio: el diálogo tiene que
            // decir QUÉ CAMBIA, no repetir el estado entero.
            if (!a && !b) return null;
            const same = a && b && a.tier === b.tier && a.quantity === b.quantity;

            return (
              <Stack key={line} direction="row" spacing={1.5} alignItems="center">
                <Typography variant="body2" sx={{ minWidth: 110, fontWeight: 700 }}>
                  {LINE_LABELS[line]}
                </Typography>
                <Typography variant="body2" color={same ? "text.secondary" : "text.disabled"}>
                  {describe(a)}
                </Typography>
                {!same && (
                  <>
                    <ArrowForwardIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {describe(b)}
                    </Typography>
                  </>
                )}
              </Stack>
            );
          })}

          {current && next && current.interval !== next.interval && (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="body2" sx={{ minWidth: 110, fontWeight: 700 }}>
                Facturación
              </Typography>
              <Typography variant="body2" color="text.disabled">
                {INTERVAL_LABELS[current.interval]}
              </Typography>
              <ArrowForwardIcon sx={{ fontSize: 16, color: "text.disabled" }} />
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {INTERVAL_LABELS[next.interval]}
              </Typography>
            </Stack>
          )}
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: 2 }}>
          {beforeTotal !== null && beforeTotal !== undefined && (
            <>
              <Typography variant="body1" color="text.disabled" sx={{ textDecoration: "line-through" }}>
                {money(beforeTotal, currency)}
              </Typography>
              <ArrowForwardIcon sx={{ fontSize: 16, color: "text.disabled" }} />
            </>
          )}
          <Typography variant="h5" sx={{ fontWeight: 800, color: BRAND.dark }}>
            {money(afterTotal, currency)}
            <Typography component="span" variant="body2" color="text.secondary">
              {perPeriod}
            </Typography>
          </Typography>
        </Stack>

        {/* Subir y bajar se cobran distinto, y decirlo AQUÍ —no encima del
            botón de la página— es la diferencia entre un cambio informado y
            una reclamación. */}
        {(change === "upgrade" || change === "new") && (
          <Alert severity="info">
            Se cobrará ahora la diferencia, prorrateada por lo que queda del ciclo.
          </Alert>
        )}
        {change === "downgrade" && (
          <Alert severity="warning">
            La reducción se aplica al cierre del ciclo actual, sin devolución. Los
            datos de los plugins que dejes de contratar se conservan 90 días.
          </Alert>
        )}

        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            El importe final lo calcula Stripe e incluye impuestos y prorrateos.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} color="inherit">
          Cancelar
        </Button>
        <Button onClick={onConfirm} disabled={busy} variant="contained">
          {busy ? "Procesando…" : change === "downgrade" ? "Programar cambio" : "Confirmar y pagar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
