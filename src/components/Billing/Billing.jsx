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
  LINES, LINE_LABELS, LINE_HINTS, LINE_TIERS, LINE_PRICES,
  TIER_LABELS, TIER_ADDS, MDM_INCLUDES,
  estimateMonthly, estimateLine, classifyChange, graceCeiling, statusNotice,
} from "./billingModel";

const money = (cents, currency = "usd") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);

export default function Billing() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [configured, setConfigured] = useState(true);
  const [sub, setSub] = useState(null);
  const [invoices, setInvoices] = useState([]);

  // Selección POR LÍNEA. `null` significa "no contratada", que no es lo mismo
  // que cantidad 0: dar de baja una línea es quitar su item de la suscripción.
  const [selection, setSelection] = useState({ endpoint: null, mdm: null });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await httpGetJson("/api/v1/billing/summary");
      setConfigured(Boolean(data?.configured));
      setSub(data?.subscription ?? null);
      const s = data?.subscription;
      if (s) {
        setSelection({
          endpoint: s.tier ? { tier: s.tier, quantity: s.quantity ?? 1 } : null,
          mdm: s.mdmTier ? { tier: s.mdmTier, quantity: s.mdmQuantity ?? 1 } : null,
        });
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

  const current = useMemo(
    () =>
      sub
        ? {
            endpoint: sub.tier ? { tier: sub.tier, quantity: sub.quantity ?? 0 } : null,
            mdm: sub.mdmTier ? { tier: sub.mdmTier, quantity: sub.mdmQuantity ?? 0 } : null,
          }
        : null,
    [sub]
  );
  const change = useMemo(() => classifyChange(current, selection), [current, selection]);
  const estimate = estimateMonthly(selection);

  const setLine = (line, patch) =>
    setSelection((s) => ({ ...s, [line]: patch === null ? null : { ...s[line], ...patch } }));

  const submit = async () => {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      // Se manda sólo lo contratado: una línea ausente del cuerpo significa
      // darla de baja, y el backend lo traduce en quitar su item.
      const body = { isUpgrade: change === "upgrade" || change === "new" };
      for (const line of LINES) if (selection[line]) body[line] = selection[line];
      const r = await httpPostJson("/api/v1/billing/subscription", body);
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
            <Stack spacing={1.5}>
              {/* Una fila por LÍNEA: los topes son independientes, así que
                  mezclarlos en un solo número escondería que 500 licencias de
                  PC no sirven para enrolar un móvil. */}
              {LINES.map((line) => {
                const tierOf = line === "endpoint" ? sub.tier : sub.mdmTier;
                const qty = line === "endpoint" ? sub.quantity : sub.mdmQuantity;
                if (!tierOf) return null;
                return (
                  <Stack key={line} direction="row" spacing={2} flexWrap="wrap" alignItems="center">
                    <Chip
                      size="small"
                      label={`${LINE_LABELS[line]}: ${TIER_LABELS[tierOf] ?? "—"}`}
                      color={sub.status === "active" || sub.status === "trialing" ? "success" : "warning"}
                    />
                    <Typography variant="body2">
                      <strong>{qty ?? "—"}</strong> licencias
                    </Typography>
                    {/* El margen del 10% es parte de lo contratado: si no se
                        enseña, el usuario no sabe que puede pasarse un poco. */}
                    {qty > 0 && (
                      <Typography variant="body2" color="text.secondary">
                        puedes enrolar hasta {graceCeiling(qty)}
                      </Typography>
                    )}
                  </Stack>
                );
              })}

              {!sub.tier && !sub.mdmTier && (
                <Typography variant="body2" color="text.secondary">
                  Sin líneas contratadas.
                </Typography>
              )}

              {/* Durante el trial el efectivo y el contratado difieren, y decirlo
                  evita la sorpresa del día que se apaguen los plugins de más. */}
              {sub.inTrial && sub.tier !== sub.effectiveTier && (
                <Typography variant="body2" color="text.secondary">
                  durante la prueba estás usando {TIER_LABELS[sub.effectiveTier] ?? "—"}
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

          {LINES.map((line) => {
            const sel = selection[line];
            const tiers = LINE_TIERS[line];
            return (
              <Box key={line} sx={{ mb: 2.5 }}>
                <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 1 }}>
                  <Typography variant="body1"><strong>{LINE_LABELS[line]}</strong></Typography>
                  <Typography variant="caption" color="text.secondary">
                    {LINE_HINTS[line]}
                  </Typography>
                </Stack>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
                  <FormControl sx={{ minWidth: 240 }} size="small">
                    <InputLabel id={`tier-${line}`}>Plan</InputLabel>
                    <Select
                      labelId={`tier-${line}`} label="Plan"
                      value={sel?.tier ?? ""}
                      onChange={(e) =>
                        setLine(line, e.target.value ? { tier: e.target.value, quantity: sel?.quantity ?? 1 } : null)
                      }
                    >
                      {/* "No contratar" es una opción explícita, no la ausencia
                          de selección: dar de baja una línea es una decisión
                          que el usuario tiene que poder tomar aquí. */}
                      <MenuItem value=""><em>No contratar</em></MenuItem>
                      {tiers.map((tv) => (
                        <MenuItem key={tv} value={tv}>
                          {TIER_LABELS[tv]} — ${LINE_PRICES[line][tv]}/equipo/mes
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <TextField
                    size="small" type="number" label="Licencias"
                    value={sel?.quantity ?? ""}
                    disabled={!sel}
                    onChange={(e) =>
                      setLine(line, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })
                    }
                    inputProps={{ min: 1 }} sx={{ width: 150 }}
                  />

                  {sel && estimateLine(line, sel.tier, sel.quantity) !== null && (
                    <Typography variant="body2" color="text.secondary">
                      ${estimateLine(line, sel.tier, sel.quantity)}/mes
                    </Typography>
                  )}
                </Stack>

                {/* Endpoints se presenta por lo que SUMA cada nivel; MDM por lo
                    que incluye, porque es una línea sola y no una escalera. */}
                <Stack spacing={0.25} sx={{ mt: 1 }}>
                  {line === "endpoint"
                    ? tiers.map((tv) => (
                        <Typography
                          key={tv} variant="caption"
                          color={tv === sel?.tier ? "text.primary" : "text.secondary"}
                        >
                          <strong>{TIER_LABELS[tv]}</strong>
                          {tv === "starter" ? ": " : " suma: "}
                          {TIER_ADDS[tv].map((pl) => pl.toUpperCase()).join(" · ")}
                        </Typography>
                      ))
                    : (
                      <Typography variant="caption" color="text.secondary">
                        {MDM_INCLUDES.join(" · ")}
                      </Typography>
                    )}
                </Stack>
              </Box>
            );
          })}

          <Divider sx={{ mb: 2 }} />

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
