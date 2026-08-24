// src/components/Billing/Billing.jsx
//
// Facturación dentro del producto (ADR-0010 D6).
//
// El requisito es que el usuario NO salga a Stripe: aquí no hay Customer Portal
// ni Checkout hospedado. La única pieza que renderiza Stripe es el formulario
// de tarjeta, y lo hace dentro de un iframe suyo — así los datos de tarjeta no
// tocan ni nuestro servidor ni nuestro DOM, que es lo que mantiene el alcance
// de PCI acotado sin renunciar a que la pantalla sea nuestra.
//
// ⚠️ Esta página tiene que seguir siendo alcanzable con la suscripción
// suspendida: es el único sitio donde se corrige la tarjeta. No se le añade
// ningún gate de entitlement.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider,
  FormControl, InputLabel, MenuItem, Select, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { httpGetJson, httpPostJson } from "../../api/http";
import {
  TIERS, TIER_LABELS, TIER_PRICES, TIER_ADDS,
  estimateMonthly, classifyChange, graceCeiling, statusNotice,
} from "./billingModel";

const money = (cents, currency = "usd") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);

export default function Billing() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [configured, setConfigured] = useState(true);
  const [sub, setSub] = useState(null);
  const [invoices, setInvoices] = useState([]);

  const [tier, setTier] = useState("starter");
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await httpGetJson("/api/v1/billing/summary");
      setConfigured(Boolean(data?.configured));
      setSub(data?.subscription ?? null);
      if (data?.subscription) {
        setTier(data.subscription.tier ?? "starter");
        setQuantity(data.subscription.quantity ?? 1);
      }
      // Las facturas se piden aparte y su fallo NO tumba la pantalla: sin
      // historial el usuario todavía puede cambiar de plan o de tarjeta, que
      // es a lo que viene cuando algo va mal.
      try {
        const inv = await httpGetJson("/api/v1/billing/invoices");
        setInvoices(inv?.invoices ?? []);
      } catch {
        setInvoices([]);
      }
    } catch (err) {
      setError(err?.message ?? "No se pudo cargar la información de facturación.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const notice = useMemo(() => statusNotice(sub), [sub]);
  const change = useMemo(
    () => classifyChange(sub ? { tier: sub.tier, quantity: sub.quantity } : null, { tier, quantity }),
    [sub, tier, quantity]
  );
  const estimate = estimateMonthly(tier, quantity);

  const submit = async () => {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const r = await httpPostJson("/api/v1/billing/subscription", { tier, quantity });
      setSaved(r);
      await load();
    } catch (err) {
      setError(err?.message ?? "No se pudo actualizar la suscripción.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>;
  }

  if (!configured) {
    // Distinto de "no has contratado": esta instalación no tiene facturación
    // conectada, y no hay nada que el usuario pueda hacer al respecto.
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>Billing</Typography>
        <Alert severity="info">
          La facturación no está habilitada en esta instalación. Contacta con tu
          proveedor de servicio para contratar o cambiar de plan.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1100 }}>
      <Typography variant="h5" gutterBottom>Billing</Typography>

      {notice && <Alert severity={notice.severity} sx={{ mb: 2 }}>{notice.message}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {saved && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Suscripción actualizada ({saved.status}).
        </Alert>
      )}

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Plan actual</Typography>
          {sub ? (
            <Stack direction="row" spacing={3} flexWrap="wrap" alignItems="center">
              <Chip
                label={TIER_LABELS[sub.effectiveTier] ?? "Sin plan"}
                color={sub.status === "active" || sub.status === "trialing" ? "success" : "warning"}
              />
              {/* Durante el trial el efectivo y el contratado difieren, y decirlo
                  evita la sorpresa del día que se apaguen los plugins de más. */}
              {sub.inTrial && sub.tier !== sub.effectiveTier && (
                <Typography variant="body2" color="text.secondary">
                  contratado: {TIER_LABELS[sub.tier] ?? "—"}
                </Typography>
              )}
              <Typography variant="body2">
                <strong>{sub.quantity ?? "—"}</strong> licencias
              </Typography>
              {/* El margen del 10% es parte de lo contratado: si no se enseña,
                  el usuario no sabe que puede pasarse un poco. */}
              {sub.quantity > 0 && (
                <Typography variant="body2" color="text.secondary">
                  puedes enrolar hasta {graceCeiling(sub.quantity)} equipos
                </Typography>
              )}
              {sub.currentPeriodEnd && (
                <Typography variant="body2" color="text.secondary">
                  próximo corte: {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </Typography>
              )}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Todavía no hay una suscripción activa para este tenant.
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Cambiar plan</Typography>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
            <FormControl sx={{ minWidth: 220 }} size="small">
              <InputLabel id="tier-label">Plan</InputLabel>
              <Select
                labelId="tier-label" label="Plan" value={tier}
                onChange={(e) => setTier(e.target.value)}
              >
                {TIERS.map((t) => (
                  <MenuItem key={t} value={t}>
                    {TIER_LABELS[t]} — ${TIER_PRICES[t]}/equipo/mes
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              size="small" type="number" label="Licencias" value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              inputProps={{ min: 1 }} sx={{ width: 160 }}
            />
          </Stack>

          {/* Los planes se presentan por lo que SUMAN, no por su lista completa:
              es como se explican, y deja ver que subir nunca quita nada. */}
          <Stack spacing={0.5} sx={{ mb: 2 }}>
            {TIERS.map((t) => (
              <Typography
                key={t} variant="body2"
                color={t === tier ? "text.primary" : "text.secondary"}
              >
                <strong>{TIER_LABELS[t]}</strong>
                {t === "starter" ? ": " : " suma: "}
                {TIER_ADDS[t].map((p) => p.toUpperCase()).join(" · ")}
              </Typography>
            ))}
          </Stack>

          {estimate !== null && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              Estimado: <strong>${estimate}/mes</strong>{" "}
              <Typography component="span" variant="caption" color="text.secondary">
                — el importe final lo calcula Stripe e incluye impuestos y prorrateos
              </Typography>
            </Typography>
          )}

          {/* Subir y bajar se cobran distinto. Decirlo ANTES de confirmar es la
              diferencia entre un cambio informado y una reclamación. */}
          {change === "upgrade" && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Se cobrará la diferencia de inmediato, prorrateada por lo que queda del ciclo.
            </Alert>
          )}
          {change === "downgrade" && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              La reducción se aplica al cierre del ciclo actual, sin devolución.
              Los datos de los plugins que dejes de contratar se conservan 90 días.
            </Alert>
          )}

          <Button
            variant="contained" onClick={submit}
            disabled={saving || change === "none"}
          >
            {saving ? "Guardando…" : sub ? "Actualizar suscripción" : "Contratar"}
          </Button>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Facturas</Typography>
          <Divider sx={{ mb: 1 }} />
          {invoices.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Todavía no hay facturas.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Número</TableCell>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right">Importe</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.number ?? i.id}</TableCell>
                    <TableCell>{new Date(i.created).toLocaleDateString()}</TableCell>
                    <TableCell>{i.status}</TableCell>
                    <TableCell align="right">{money(i.amountDue, i.currency)}</TableCell>
                    <TableCell align="right">
                      {i.pdfUrl && (
                        <Button size="small" href={i.pdfUrl} target="_blank" rel="noopener">
                          PDF
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
