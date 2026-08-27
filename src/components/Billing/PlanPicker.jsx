// src/components/Billing/PlanPicker.jsx
//
// Elegir plan y licencias para UNA línea de producto.
//
// DOS CAMBIOS DE FONDO RESPECTO AL FORMULARIO QUE HABÍA
// ----------------------------------------------------------------------------
// 1. Los planes eran un `<select>`. Se diferencian por QUÉ PLUGINS traen, y eso
//    es justo lo que un desplegable esconde: hay que abrirlo, leer una opción
//    cada vez y recordar. Como tarjetas se comparan de un vistazo, que es la
//    operación que el usuario está haciendo en realidad.
//
// 2. La cantidad se pedía a ciegas. Es la decisión más cara de la pantalla
//    —de ella depende que puedas enrolar equipos— y no se decía cuántos tienes.
//    Ahora el número real está al lado, con un atajo para adoptarlo.

import { useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, Stack, TextField, Typography,
} from "@mui/material";
import SectionPaper from "../common/SectionPaper";
import CheckIcon from "@mui/icons-material/Check";
import { BRAND, ICON, TEXT } from "../../theme/brand";
import {
  LINE_LABELS, LINE_HINTS, TIER_LABELS, MDM_INCLUDES,
  availableTiers, estimateLine, usageWarning, suggestedQuantity, pluginsIncludedIn,
} from "./billingModel";

const money = (cents, currency = "usd") =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: (cents ?? 0) % 100 === 0 ? 0 : 2,
  }).format((cents ?? 0) / 100);

function PlanCard({ tier, line, price, currency, interval, selected, onSelect, catalog }) {
  // Every plugin the tier includes, ACCUMULATED (not just what it adds
  // over the one below) — this card stands alone in a comparison, so
  // "everything above +" framing doesn't apply the way it does reading
  // top-to-bottom in a chart.
  const includedKeys = line === "endpoint" ? pluginsIncludedIn(tier) : null;
  const [expandedKey, setExpandedKey] = useState(null);
  const expanded = expandedKey ? (catalog || []).find((p) => p.key === expandedKey) : null;

  const toggleChip = (e, key) => {
    e.stopPropagation(); // don't also select this tier — the chip has its own click meaning
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  return (
    <Card
      variant="outlined"
      onClick={onSelect}
      sx={{
        flex: 1,
        minWidth: 190,
        cursor: "pointer",
        position: "relative",
        borderColor: selected ? BRAND.teal : "divider",
        borderWidth: selected ? 2 : 1,
        // El seleccionado se distingue por color Y por marca, no sólo por un
        // borde: un borde de 2px es invisible para media oficina.
        bgcolor: selected ? "#f2f8f8" : "#fff",
        transition: "border-color 120ms ease, background-color 120ms ease",
        "&:hover": { borderColor: selected ? BRAND.teal : BRAND.gray },
      }}
    >
      <CardContent sx={{ py: 1.75 }}>
        {selected && (
          <CheckIcon sx={{ position: "absolute", top: 10, right: 10, fontSize: ICON.lg, color: BRAND.teal }} />
        )}
        <Typography variant="body2" sx={{ fontWeight: 800, color: BRAND.dark }}>
          {TIER_LABELS[tier]}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 800, my: 0.25 }}>
          {money(price, currency)}
          <Typography component="span" variant="caption" color="text.secondary">
            {" "}/device/{interval === "yearly" ? "yr" : "mo"}
          </Typography>
        </Typography>

        {/* Full accumulated list, not just what this tier adds over the
            one below — a card standing alone in a side-by-side
            comparison needs to say what it IS, not what changed.
            Clicking a chip expands its detail (title + description)
            right below, tab-style: one open at a time per card. */}
        {includedKeys ? (
          <Box sx={{ mt: 0.75 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 800, letterSpacing: 0.4, display: "block", mb: 0.5 }}
            >
              WHAT&apos;S INCLUDED ({includedKeys.length} PLUGIN{includedKeys.length === 1 ? "" : "S"})
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {includedKeys.map((key) => (
                <Chip
                  key={key}
                  size="small"
                  label={key.toUpperCase()}
                  onClick={(e) => toggleChip(e, key)}
                  sx={{
                    height: 22,
                    fontSize: TEXT.xs,
                    fontWeight: 700,
                    cursor: "pointer",
                    bgcolor: expandedKey === key ? BRAND.teal : undefined,
                    color: expandedKey === key ? "#fff" : undefined,
                    "&:hover": { bgcolor: expandedKey === key ? BRAND.tealHover : BRAND.tealSoft },
                  }}
                />
              ))}
            </Stack>
            {expanded && (
              <Box sx={{ mt: 1, pt: 1, borderTop: `1px dashed ${BRAND.border}` }}>
                <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>
                  {expanded.label} — {expanded.title}
                  {expanded.required ? (
                    <Typography
                      component="span"
                      sx={{ ml: 0.75, fontSize: TEXT.xs, fontWeight: 800, color: BRAND.tealText }}
                    >
                      Required
                    </Typography>
                  ) : null}
                </Typography>
                <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 0.25 }}>
                  {expanded.description}
                </Typography>
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ mt: 0.75 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 800, letterSpacing: 0.4, display: "block", mb: 0.5 }}
            >
              WHAT&apos;S INCLUDED ({MDM_INCLUDES.length} FEATURE{MDM_INCLUDES.length === 1 ? "" : "S"})
            </Typography>
            <Stack spacing={0.25}>
              {MDM_INCLUDES.map((f) => (
                <Typography key={f} variant="caption" color="text.secondary">
                  · {f}
                </Typography>
              ))}
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

export default function PlanPicker({ line, prices, currency, interval, selection, used, onChange, catalog }) {
  const tiers = availableTiers(prices, line);
  const sel = selection ?? null;
  const subtotal = sel ? estimateLine(prices, line, sel.tier, sel.quantity) : null;
  const warning = sel ? usageWarning(sel.quantity, used) : null;
  const suggestion = suggestedQuantity(used);

  return (
    <SectionPaper variant="panel">
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: BRAND.dark }}>
              {LINE_LABELS[line]}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {LINE_HINTS[line]}
              {Number.isFinite(used) ? ` · ${used} enrolled` : ""}
            </Typography>
          </Box>
          {/* Dar de baja una línea tiene que ser una decisión tomable AQUÍ, no
              la ausencia de selección en un desplegable. */}
          {sel && (
            <Button size="small" color="inherit" onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
        </Stack>

        {tiers.length === 0 ? (
          <Alert severity="warning">
            No prices configured in Stripe for this line and billing period.
          </Alert>
        ) : (
          <>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              {tiers.map((tier) => (
                <PlanCard
                  key={tier}
                  tier={tier}
                  line={line}
                  price={prices[line][tier]}
                  currency={currency}
                  interval={interval}
                  selected={sel?.tier === tier}
                  catalog={catalog}
                  onSelect={() =>
                    onChange({ tier, quantity: sel?.quantity ?? suggestion })
                  }
                />
              ))}
            </Stack>

            {sel && (
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                alignItems={{ sm: "center" }}
                sx={{ mt: 2 }}
              >
                <TextField
                  size="small"
                  type="number"
                  label="Licenses"
                  value={sel.quantity}
                  // ⚠️ El vacío se DEJA PASAR mientras se escribe. Forzar el
                  // mínimo en cada tecla hacía que borrar el campo lo dejara en
                  // "1", así que teclear "10" encima daba 110 — el usuario
                  // contrataba diez veces lo que quería sin ver nada raro.
                  // Con `quantity` vacío el total no se puede estimar y la
                  // barra de confirmar se desactiva sola, así que no se puede
                  // enviar a medias.
                  onChange={(e) => {
                    const raw = e.target.value;
                    onChange({ ...sel, quantity: raw === "" ? "" : Math.max(1, parseInt(raw, 10) || 1) });
                  }}
                  onBlur={() => {
                    if (sel.quantity === "" ) onChange({ ...sel, quantity: suggestion });
                  }}
                  inputProps={{ min: 1 }}
                  sx={{ width: 140 }}
                />
                {/* El atajo importa: sin él, "tienes 143" es un dato que el
                    usuario tiene que teclear a mano, y ahí es donde se cuela
                    el 14 o el 1430. */}
                {Number.isFinite(used) && used > 0 && sel.quantity !== suggestion && (
                  <Button size="small" onClick={() => onChange({ ...sel, quantity: suggestion })}>
                    use {suggestion}
                  </Button>
                )}
                {subtotal !== null && (
                  <Typography variant="body2" color="text.secondary">
                    {money(subtotal, currency)}/{interval === "yearly" ? "yr" : "mo"}
                  </Typography>
                )}
              </Stack>
            )}

            {warning && (
              <Alert severity={warning.severity} sx={{ mt: 1.5 }}>
                {warning.message}
              </Alert>
            )}
          </>
        )}
    </SectionPaper>
  );
}
