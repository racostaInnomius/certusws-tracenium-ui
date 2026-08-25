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
//
// ⚠️ LA TARJETA VA PRIMERO, Y NO ES UNA PREFERENCIA DE MAQUETACIÓN.
//
// La versión anterior dejaba elegir plan sin método de pago. Stripe creaba
// entonces la suscripción en estado `incomplete`... y una suscripción
// `incomplete` NO SE PUEDE MODIFICAR: el cliente quedaba con un ladrillo del
// que no salía ni pagando ni cambiando de plan. El backend ahora lo rechaza, y
// esta pantalla lo refleja poniendo la tarjeta como paso 1 en vez de dejar
// pulsar un botón que va a fallar.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Stack,
  Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, ToggleButton,
  ToggleButtonGroup, Typography,
} from "@mui/material";
import { httpGetJson, httpPostJson } from "../../api/http";
import { BRAND } from "../../theme/brand";
import PaymentMethodCard from "./PaymentMethodCard";
import SubscriptionSummary from "./SubscriptionSummary";
import PlanPicker from "./PlanPicker";
import ConfirmChangeDialog from "./ConfirmChangeDialog";
import {
  LINES, INTERVALS, INTERVAL_LABELS,
  pricesFrom, currencyOf, estimateTotal, classifyChange, statusNotice,
} from "./billingModel";

const money = (cents, currency = "usd") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format((cents ?? 0) / 100);

export default function Billing() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [configured, setConfigured] = useState(true);
  const [publishableKey, setPublishableKey] = useState(null);
  const [sub, setSub] = useState(null);
  const [invoices, setInvoices] = useState([]);
  // Los precios vienen de Stripe. La UI los llevaba escritos a mano, y con
  // mensual y anual —el anual lleva descuento— eso garantizaba cifras falsas.
  const [catalog, setCatalog] = useState([]);

  const [tab, setTab] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);

  // La periodicidad va DENTRO de la selección: es de la suscripción entera
  // —Stripe no admite mezclar mensual y anual entre items— y valorar los dos
  // lados de un cambio con la misma tabla escondería el paso a anual.
  const [selection, setSelection] = useState({ interval: "monthly", endpoint: null, mdm: null });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await httpGetJson("/api/v1/billing/summary");
      setConfigured(Boolean(data?.configured));
      // La clave publicable la sirve el backend: la SPA se construye una sola
      // vez para todos los entornos, así que no puede llevarla horneada.
      setPublishableKey(data?.publishableKey ?? null);
      setSub(data?.subscription ?? null);

      const s = data?.subscription;
      if (s) {
        setSelection({
          // Sin preseleccionar lo contratado, un cliente anual entra, ve
          // "mensual" marcado y al tocar sus licencias se lo lleva a mensual
          // sin haberlo pedido — y eso refactura.
          interval: s.billingInterval ?? "monthly",
          endpoint: s.tier ? { tier: s.tier, quantity: s.quantity ?? 1 } : null,
          mdm: s.mdmTier ? { tier: s.mdmTier, quantity: s.mdmQuantity ?? 1 } : null,
        });
      }

      // Catálogo y facturas fallan por separado y ninguno tumba la pantalla: se
      // entra a Billing justo cuando algo va mal, y es el único sitio donde se
      // corrige la tarjeta.
      try {
        const c = await httpGetJson("/api/v1/billing/catalog");
        setCatalog(c?.prices ?? []);
      } catch {
        setCatalog([]);
      }
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

  const current = useMemo(
    () =>
      sub
        ? {
            interval: sub.billingInterval ?? "monthly",
            endpoint: sub.tier ? { tier: sub.tier, quantity: sub.quantity ?? 0 } : null,
            mdm: sub.mdmTier ? { tier: sub.mdmTier, quantity: sub.mdmQuantity ?? 0 } : null,
          }
        : null,
    [sub]
  );

  const change = useMemo(
    () => classifyChange(catalog, current, selection),
    [catalog, current, selection]
  );
  const prices = useMemo(
    () => pricesFrom(catalog, selection.interval),
    [catalog, selection.interval]
  );
  const currency = currencyOf(catalog);
  const beforeTotal = estimateTotal(catalog, current);
  const afterTotal = estimateTotal(catalog, selection);

  const hasCard = Boolean(sub?.hasPaymentMethod);
  const setLine = (line, patch) => setSelection((s) => ({ ...s, [line]: patch }));

  const submit = async () => {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      // Se manda sólo lo contratado: una línea ausente del cuerpo significa
      // darla de baja, y el backend lo traduce en quitar su item.
      const body = {
        isUpgrade: change === "upgrade" || change === "new",
        interval: selection.interval,
      };
      for (const line of LINES) if (selection[line]) body[line] = selection[line];

      const r = await httpPostJson("/api/v1/billing/subscription", body);
      setSaved(r);
      setConfirming(false);
      await load();
    } catch (err) {
      setConfirming(false);
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
    <Box sx={{ p: 3, maxWidth: 1000 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, color: BRAND.dark, mb: 2 }}>
        Billing
      </Typography>

      {notice && <Alert severity={notice.severity} sx={{ mb: 2 }}>{notice.message}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {saved && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSaved(null)}>
          Suscripción actualizada.
        </Alert>
      )}

      <SubscriptionSummary sub={sub} estimate={beforeTotal} currency={currency} />

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Plan" />
        <Tab label={`Facturas${invoices.length ? ` (${invoices.length})` : ""}`} />
      </Tabs>

      {tab === 0 ? (
        <>
          <PaymentMethodCard
            publishableKey={publishableKey}
            hasPaymentMethod={hasCard}
            onSaved={load}
          />

          {/* El motivo va donde está el obstáculo. Deshabilitar el botón sin
              decir por qué convierte un paso que falta en un fallo aparente. */}
          {!hasCard && (
            <Alert severity="info" sx={{ mb: 2.5 }}>
              Guarda una tarjeta para poder contratar. Sin método de pago la
              suscripción no llega a activarse.
            </Alert>
          )}

          <Card variant="outlined" sx={{ mb: 2.5 }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Periodicidad
              </Typography>
              {/* Una sola para toda la suscripción: Stripe rechaza mezclar
                  mensual y anual entre los items de una misma. */}
              <Box sx={{ mt: 0.5 }}>
                <ToggleButtonGroup
                  exclusive size="small" value={selection.interval}
                  onChange={(_e, v) => v && setSelection((s) => ({ ...s, interval: v }))}
                >
                  {INTERVALS.map((i) => (
                    <ToggleButton key={i} value={i} sx={{ px: 2.5 }}>
                      {INTERVAL_LABELS[i]}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
            </CardContent>
          </Card>

          {LINES.map((line) => (
            <PlanPicker
              key={line}
              line={line}
              prices={prices}
              currency={currency}
              interval={selection.interval}
              selection={selection[line]}
              used={sub?.usage?.[line] ?? null}
              onChange={(patch) => setLine(line, patch)}
            />
          ))}

          {/* La barra de cambios sólo existe cuando hay algo que confirmar. Un
              botón permanentemente en pantalla no distingue "no he tocado nada"
              de "tengo un cambio pendiente". */}
          {change !== "none" && (
            <Card
              variant="outlined"
              sx={{
                position: "sticky", bottom: 16, zIndex: 2,
                borderColor: BRAND.teal, bgcolor: "#f2f8f8",
              }}
            >
              <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  justifyContent="space-between"
                  alignItems={{ sm: "center" }}
                  spacing={1.5}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {afterTotal !== null
                        ? `${money(afterTotal, currency)}/${selection.interval === "yearly" ? "año" : "mes"}`
                        : "Selección incompleta"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {change === "downgrade"
                        ? "se aplica al cierre del ciclo"
                        : "se cobra al confirmar"}
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    disabled={!hasCard || afterTotal === null}
                    onClick={() => setConfirming(true)}
                  >
                    Revisar cambio
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          )}

          <ConfirmChangeDialog
            open={confirming}
            busy={saving}
            onClose={() => setConfirming(false)}
            onConfirm={submit}
            current={current}
            next={selection}
            change={change}
            beforeTotal={beforeTotal}
            afterTotal={afterTotal}
            currency={currency}
          />
        </>
      ) : (
        <Card variant="outlined">
          <CardContent>
            {invoices.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Todavía no hay facturas.
              </Typography>
            ) : (
              <>
                <Divider sx={{ mb: 1 }} />
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
              </>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
