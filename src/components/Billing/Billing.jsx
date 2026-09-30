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
// suspendida o la prueba vencida: es el único sitio donde se paga. No se le
// añade ningún gate de entitlement.
//
// LA PÁGINA MIRA, Y SÓLO COMPRA CUANDO SE LE PIDE
// ----------------------------------------------------------------------------
// La versión anterior tenía el selector de planes siempre abierto: tres
// tarjetas de endpoints, una a todo el ancho para MDM y un panel para la
// periodicidad, debajo del resumen, aunque quien ya paga viene a mirar. Ahora
// arriba va el plan (PlanOverview) y, sólo al pulsar "Change plan" / "Choose a
// plan", el selector (PlanChangePanel). Tarjeta, complementos y facturas van
// en la página, compactos, sin pestañas.
//
// ⚠️ LA TARJETA SIGUE YENDO ANTES QUE EL ALTA. Sin método de pago Stripe crea
// la suscripción `incomplete`, y una `incomplete` no se puede modificar. El
// selector pide la tarjeta dentro de su propio flujo.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertTitle, Box, Button, CircularProgress, Typography } from "@mui/material";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import { httpGetJson, httpPostJson } from "../../api/http";
import PageHeader from "../common/PageHeader";
import PaymentMethodCard from "./PaymentMethodCard";
import PlanOverview from "./PlanOverview";
import PlanChangePanel from "./PlanChangePanel";
import ConfirmChangeDialog from "./ConfirmChangeDialog";
import AddonOffers from "./AddonOffers";
import InvoiceList from "./InvoiceList";
import { usePluginCatalog } from "../../hooks/usePluginCatalog";
import { notifyLicenseStateChanged } from "../../utils/licenseEvents";
import {
  LINES,
  pricesFrom, currencyOf, estimateTotal, classifyChange, statusNotice,
  addonsTotal, withAddons, contractedSelection, initialSelection,
} from "./billingModel";

export default function Billing() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [configured, setConfigured] = useState(true);
  const [missingConfig, setMissingConfig] = useState([]);
  const [publishableKey, setPublishableKey] = useState(null);
  const [sub, setSub] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [invoicesFailed, setInvoicesFailed] = useState(false);
  // Los precios vienen de Stripe: con mensual y anual —el anual lleva
  // descuento— llevarlos escritos a mano garantizaba cifras falsas.
  const [catalog, setCatalog] = useState([]);
  const [catalogFailed, setCatalogFailed] = useState(false);
  // El catálogo de PLUGINS (label/title/tier_required) — otro backend que el de
  // precios de arriba, aunque se llamen igual.
  const { catalog: pluginCatalog, refetch: refetchPluginCatalog } = usePluginCatalog();
  // ADR-0026 — complementos contratables aquí (sólo los que tienen precio).
  const [addonCatalog, setAddonCatalog] = useState([]);

  const [changing, setChanging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changeError, setChangeError] = useState(null);
  const [saved, setSaved] = useState(null);

  // La periodicidad va DENTRO de la selección: es de la suscripción entera
  // —Stripe no admite mezclar mensual y anual entre items— y valorar los dos
  // lados de un cambio con la misma tabla escondería el paso a anual.
  const [selection, setSelection] = useState({ interval: "monthly", endpoint: null, mdm: null });
  const changingRef = useRef(false);
  changingRef.current = changing;

  /**
   * ⚠️ UNA RECARGA NO DESMONTA LA PÁGINA.
   *
   * Recargar ponía el spinner a pantalla completa: al guardar la tarjeta se
   * desmontaba todo, se perdía el aviso de "tarjeta guardada" y la selección
   * volvía a lo contratado — el plan que el usuario estaba eligiendo, borrado
   * justo en el paso que le faltaba para confirmarlo. Sólo la PRIMERA carga
   * enseña el spinner, y la selección sólo se reinicia fuera del selector.
   */
  const load = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true);
    setLoadError(null);
    try {
      const data = await httpGetJson("/api/v1/billing/summary");
      setConfigured(Boolean(data?.configured));
      setMissingConfig(data?.missingConfig ?? []);
      // La clave publicable la sirve el backend: la SPA es la misma para todos
      // los entornos, así que no puede llevarla horneada.
      setPublishableKey(data?.publishableKey ?? null);
      setSub(data?.subscription ?? null);
      if (data?.subscription && !changingRef.current) setSelection(initialSelection(data.subscription));

      // Catálogo y facturas fallan por separado y ninguno tumba la pantalla: se
      // entra a Billing justo cuando algo va mal. Pero un fallo se DICE: antes
      // un catálogo caído se leía como "no hay precios en Stripe" y unas
      // facturas caídas como "aún no hay facturas".
      try {
        const c = await httpGetJson("/api/v1/billing/catalog");
        setCatalog(c?.prices ?? []);
        setAddonCatalog(c?.addons ?? []);
        setCatalogFailed(false);
      } catch {
        setCatalogFailed(true);
      }
      try {
        const inv = await httpGetJson("/api/v1/billing/invoices");
        setInvoices(inv?.invoices ?? []);
        setInvoicesFailed(false);
      } catch {
        setInvoicesFailed(true);
      }
    } catch (err) {
      setLoadError(err?.message ?? "Could not load billing information.");
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ initial: true });
  }, [load]);

  const notice = useMemo(() => statusNotice(sub), [sub]);

  // Lo contratado EN STRIPE, o null. Un plan asignado por el alta no es un
  // plan contratado (ver contractedSelection).
  const current = useMemo(() => contractedSelection(sub), [sub]);
  const change = useMemo(() => classifyChange(catalog, current, selection), [catalog, current, selection]);
  const prices = useMemo(() => pricesFrom(catalog, selection.interval), [catalog, selection.interval]);
  const currency = currencyOf(catalog);

  // ADR-0026 — los complementos contratados van en el total: sin ellos el
  // «próximo cargo» es una cifra que la factura no confirma.
  const contractedAddons = sub?.addons ?? [];
  const beforeTotal = current
    ? withAddons(estimateTotal(catalog, current), addonsTotal(addonCatalog, contractedAddons, current.interval))
    : null;
  const afterTotal = withAddons(
    estimateTotal(catalog, selection),
    addonsTotal(addonCatalog, contractedAddons, selection.interval)
  );

  const hasCard = Boolean(sub?.hasPaymentMethod);
  const managed = Boolean(sub?.managed);
  const openChange = () => {
    setSaved(null);
    setChangeError(null);
    setSelection(initialSelection(sub));
    setChanging(true);
  };
  const closeChange = () => {
    setChanging(false);
    setChangeError(null);
    setSelection(initialSelection(sub));
  };

  const submit = async () => {
    setSaving(true);
    setChangeError(null);
    try {
      // Se manda sólo lo contratado: una línea ausente del cuerpo significa
      // darla de baja, y el backend lo traduce en quitar su item.
      const body = { isUpgrade: change === "upgrade" || change === "new", interval: selection.interval };
      for (const line of LINES) if (selection[line]) body[line] = selection[line];

      const r = await httpPostJson("/api/v1/billing/subscription", body);
      setConfirming(false);
      setChanging(false);
      setSaved({ kind: change === "new" ? "subscribed" : "changed", status: r?.status ?? null });
      await load();
      // La consola bloqueada por prueba vencida se levanta al contratar.
      notifyLicenseStateChanged();
    } catch (err) {
      // El error va DENTRO del selector, junto al botón que lo provocó. Arriba
      // de la página no lo veía nadie: el usuario está abajo, confirmando.
      setConfirming(false);
      setChangeError(err?.message ?? "Could not update the subscription.");
    } finally {
      setSaving(false);
    }
  };

  const onCardSaved = async () => {
    await load();
    notifyLicenseStateChanged();
  };

  if (loading) {
    return (
      <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress aria-label="Loading billing" />
      </Box>
    );
  }

  if (!configured) {
    // Distinto de "no has contratado": esta instalación no tiene la facturación
    // conectada. A esta página sólo llega el OWNER, que en un despliegue propio
    // ES el proveedor: se nombra la variable ausente — nombres, nunca valores.
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <PageHeader title="Billing" icon={<CreditCardOutlinedIcon />} />
        <Alert severity="warning">
          <AlertTitle>Billing is not configured on this backend</AlertTitle>
          {missingConfig.length > 0 ? (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>
                These environment variables are missing on the server handling <code>/api/v1/billing</code>:
              </Typography>
              <Box component="ul" sx={{ pl: 2.5, my: 0.5 }}>
                {missingConfig.map((k) => (
                  <li key={k}>
                    <code>{k}</code>
                  </li>
                ))}
              </Box>
              {/* El paso que se olvida: sin reiniciar, la pantalla sigue igual y
                  parece que el cambio no sirvió. */}
              <Typography variant="body2" sx={{ mt: 1 }}>
                Add them and restart the process: values are read at startup.
              </Typography>
            </>
          ) : (
            <Typography variant="body2">Contact your service provider to subscribe or change plan.</Typography>
          )}
        </Alert>
      </Box>
    );
  }

  const isNew = !current;
  const planAction = managed ? null : changing ? null : (
    <Button variant={isNew ? "contained" : "outlined"} onClick={openChange} disabled={catalogFailed}>
      {isNew ? "Choose a plan" : "Change plan"}
    </Button>
  );

  return (
    // El resto de páginas no ponen padding propio ni ancho máximo: el AppShell
    // ya es el marco. Separación ÚNICA por `gap`: los `mb` sobre él duplicaban
    // el hueco entre avisos.
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <PageHeader
        title="Billing"
        subtitle="Your plan, payment method and invoices."
        icon={<CreditCardOutlinedIcon />}
      />

      {notice && <Alert severity={notice.severity}>{notice.message}</Alert>}
      {loadError && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => load()}>Retry</Button>}>
          {loadError}
        </Alert>
      )}
      {catalogFailed && !managed && (
        <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => load()}>Retry</Button>}>
          Couldn't load prices from Stripe right now, so plans can't be changed. Your subscription is not affected.
        </Alert>
      )}
      {saved && (
        <Alert severity="success" onClose={() => setSaved(null)}>
          {saved.addon
            ? `${saved.addon} ${saved.action === "add" ? "added to" : "removed from"} your subscription.`
            : saved.kind === "subscribed"
            ? saved.status === "trialing"
              ? "You're subscribed. Nothing is charged until your trial ends."
              : "You're subscribed."
            : "Subscription updated."}
        </Alert>
      )}

      <PlanOverview
        sub={sub}
        estimate={beforeTotal}
        currency={currency}
        pluginCatalog={pluginCatalog}
        addonTitles={contractedAddons.map((k) => addonCatalog.find((a) => a.key === k)?.title ?? k)}
        action={planAction}
      />

      {/* ENTERPRISE: plan gestionado por Tracenium, fuera de Stripe. Se enseña
          lo contratado y nada más. El servidor rechaza igualmente contratar
          (409 MANAGED_PLAN): esto no es la barrera, es no ofrecer un botón que
          falla. */}
      {managed ? (
        <Alert severity="info">
          <AlertTitle>Managed by Tracenium</AlertTitle>
          Your plan, plugins and licenses are set by Tracenium. Contact your account manager to change them.
        </Alert>
      ) : (
        <>
          {changing && (
            <PlanChangePanel
              sub={sub}
              catalog={catalog}
              prices={prices}
              currency={currency}
              pluginCatalog={pluginCatalog}
              selection={selection}
              onSelectionChange={setSelection}
              current={current}
              change={change}
              beforeTotal={beforeTotal}
              afterTotal={afterTotal}
              hasCard={hasCard}
              publishableKey={publishableKey}
              onCardSaved={onCardSaved}
              error={changeError}
              onCancel={closeChange}
              onReview={() => setConfirming(true)}
            />
          )}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: addonCatalog.length ? "repeat(2, minmax(0, 1fr))" : "1fr" },
              gap: 2,
              alignItems: "start",
            }}
          >
            {/* Dentro del selector ya se pide la tarjeta cuando falta: dos
                formularios de tarjeta a la vez serían dos SetupIntents. */}
            {!(changing && !hasCard) && (
              <PaymentMethodCard
                publishableKey={publishableKey}
                hasPaymentMethod={hasCard}
                paymentMethod={sub?.paymentMethod ?? null}
                onSaved={onCardSaved}
              />
            )}
            {/* ADR-0026 — complemento de la misma suscripción. */}
            <AddonOffers
              sub={sub}
              addons={addonCatalog}
              pluginCatalog={pluginCatalog}
              onChanged={async (addon, action) => {
                setSaved({ addon: addon.title, action });
                await load();
                // El derecho lo leen otras pantallas desde un catálogo cacheado
                // 5 min: sin esto, CDP seguiría enseñando los conectores
                // congelados un rato después de haber pagado.
                try {
                  await refetchPluginCatalog();
                } catch {
                  // el hook vuelve a intentarlo solo al quedar obsoleto
                }
              }}
            />
          </Box>

          <InvoiceList invoices={invoices} failed={invoicesFailed} onRetry={() => load()} />

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
            sub={sub}
          />
        </>
      )}
    </Box>
  );
}
