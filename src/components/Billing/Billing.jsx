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
  Alert, AlertTitle, Box, Button, CircularProgress, Stack, Tab, Table, TableBody,
  TableCell, TableHead, TableRow, Tabs, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import { httpGetJson, httpPostJson } from "../../api/http";
import { BRAND } from "../../theme/brand";
import PageHeader from "../common/PageHeader";
import SectionPaper from "../common/SectionPaper";
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
  const [missingConfig, setMissingConfig] = useState([]);
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
      setMissingConfig(data?.missingConfig ?? []);
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
          // ⚠️ Sin cantidad NO se cae a 1. Con `quantity` vacía —el caso de
          // los tenants heredados— ese 1 no era un valor por defecto inocente:
          // quedaba preseleccionado, y confirmar cualquier otro cambio habría
          // recortado el tope del cliente a un equipo. Se prefiere el tope que
          // el gate aplica de verdad, y en su defecto la flota que ya existe.
          endpoint: s.tier
            ? { tier: s.tier, quantity: s.quantity ?? s.licensedQuantity ?? s.usage?.endpoint ?? 1 }
            : null,
          // ⚠️ MDM sólo se preselecciona si hay CANTIDAD contratada. Con tier
          // pero sin cantidad —lo que el grandfathering dejó en todos los
          // tenants— se preseleccionaba 1, y quien entraba a tocar otra cosa
          // se llevaba una licencia de móvil que no había pedido.
          mdm: s.mdmTier && s.mdmQuantity > 0
            ? { tier: s.mdmTier, quantity: s.mdmQuantity }
            : null,
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
      setError(err?.message ?? "Could not load billing information.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const notice = useMemo(() => statusNotice(sub), [sub]);

  // ⚠️ UNA LÍNEA SIN CANTIDAD NO ESTÁ CONTRATADA — es `null`, no "× 0".
  //
  // Representarla como `{tier, quantity: 0}` rompía dos cosas a la vez:
  //
  //   * el diálogo decía "Professional × 0 → Professional × 1", que no es lo
  //     que ocurre; lo que ocurre es que se contrata una línea que no existía;
  //   * y peor, `estimateTotal` no sabe poner precio a una cantidad 0, así que
  //     devolvía null para TODO el estado actual. Sin coste anterior no hay
  //     comparación posible, y añadir una licencia se clasificaba como BAJADA:
  //     el diálogo ofrecía "Programar cambio" y avisaba de una reducción, para
  //     un alta que Stripe iba a cobrar.
  const asLine = (tier, quantity) =>
    tier && Number.isFinite(quantity) && quantity > 0 ? { tier, quantity } : null;

  const current = useMemo(
    () =>
      sub
        ? {
            interval: sub.billingInterval ?? "monthly",
            endpoint: asLine(sub.tier, sub.quantity ?? sub.licensedQuantity),
            mdm: asLine(sub.mdmTier, sub.mdmQuantity),
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
      setError(err?.message ?? "Could not update the subscription.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>;
  }

  if (!configured) {
    // Distinto de "no has contratado": esta instalación no tiene la facturación
    // conectada.
    //
    // ⚠️ Aquí ponía "contacta con tu proveedor de servicio". A esta página sólo
    // llega el OWNER, que en un despliegue propio ES el proveedor: era mandarlo
    // a hablar consigo mismo, sin decirle qué falta. Ahora se nombra la
    // variable ausente — nombres, nunca valores.
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <PageHeader title="Billing" icon={<CreditCardOutlinedIcon />} />
        <Alert severity="warning">
          <AlertTitle>Billing is not configured on this backend</AlertTitle>
          {missingConfig.length > 0 ? (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>
                These environment variables are missing on the server handling{" "}
                <code>/api/v1/billing</code>:
              </Typography>
              <Box component="ul" sx={{ pl: 2.5, my: 0.5 }}>
                {missingConfig.map((k) => (
                  <li key={k}>
                    <code>{k}</code>
                  </li>
                ))}
              </Box>
              {/* El paso que se olvida: ponerlas no basta si el proceso no se
                  reinicia — y entonces la pantalla sigue diciendo lo mismo y
                  parece que el cambio no sirvió. */}
              <Typography variant="body2" sx={{ mt: 1 }}>
                Add them and restart the process: values are read at startup.
              </Typography>
            </>
          ) : (
            <Typography variant="body2">
              Contact your service provider to subscribe or change plan.
            </Typography>
          )}
        </Alert>
      </Box>
    );
  }

  return (
    // El resto de páginas no ponen padding propio ni ancho máximo: el AppShell
    // ya es el marco. Billing lo hacía y salía desalineada de todo lo demás.
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <PageHeader
        title="Billing"
        subtitle="Subscribed plan, licenses and payment method."
        icon={<CreditCardOutlinedIcon />}
      />

      {notice && <Alert severity={notice.severity} sx={{ mb: 2 }}>{notice.message}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {saved && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSaved(null)}>
          Subscription updated.
        </Alert>
      )}

      <SubscriptionSummary sub={sub} estimate={beforeTotal} currency={currency} />

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ borderBottom: `1px solid ${BRAND.border}` }}>
        <Tab label="Plan" />
        <Tab label={`Invoices${invoices.length ? ` (${invoices.length})` : ""}`} />
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
              Save a card before subscribing. Without a payment method the
              subscription never activates.
            </Alert>
          )}

          <SectionPaper variant="panel">
            <Typography variant="overline" color="text.secondary">
              Billing period
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
          </SectionPaper>

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

          {/* ⚠️ ESTO ERA UNA BARRA `position: sticky` Y SE QUITÓ.
              Flotaba sobre el contenido y tapaba justo las tarjetas de plan que
              el usuario estaba comparando — el elemento que resume la decisión
              escondía la decisión. Ninguna otra página de la consola flota nada
              sobre su contenido.

              Como bloque al final del formulario cumple lo mismo: sólo aparece
              cuando hay algo que confirmar, así que sigue distinguiendo "no he
              tocado nada" de "tengo un cambio pendiente". */}
          {change !== "none" && (
            <SectionPaper
              variant="panel"
              sx={{ borderColor: BRAND.teal, bgcolor: BRAND.tealSoft ?? "#f2f8f8" }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ sm: "center" }}
                spacing={1.5}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {afterTotal !== null
                      ? `${money(afterTotal, currency)}/${selection.interval === "yearly" ? "yr" : "mo"}`
                      : "Incomplete selection"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {change === "downgrade"
                      ? "applies at the end of the cycle"
                      : "charged on confirm"}
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  disabled={!hasCard || afterTotal === null}
                  onClick={() => setConfirming(true)}
                >
                  Review change
                </Button>
              </Stack>
            </SectionPaper>
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
        <SectionPaper variant="panel">
          {invoices.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No invoices yet.
            </Typography>
          ) : (
            <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Number</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Amount</TableCell>
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
        </SectionPaper>
      )}
    </Box>
  );
}
