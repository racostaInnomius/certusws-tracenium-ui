// src/components/Billing/PlanChangePanel.jsx
//
// Elegir o cambiar de plan. Sustituye a PlanPicker, y la diferencia de fondo es
// CUÁNDO aparece: antes estaba siempre abierto debajo del resumen —tres
// tarjetas grandes de endpoints, una a todo el ancho para el único plan de MDM
// y un panel entero sólo para mensual/anual—, aunque quien entra a Billing ya
// pagando casi nunca viene a comprar. Ahora se abre desde "Change plan" /
// "Choose a plan" y se cierra al cancelar o confirmar.
//
// Lo que se conserva de PlanPicker, porque eran decisiones y no maquetación:
//   · la cantidad se elige VIENDO la flota real, con atajo para adoptarla;
//   · el aviso de que las licencias no dan para los equipos que ya hay;
//   · la periodicidad es de la suscripción entera (Stripe no mezcla).
//
// Y la tarjeta va DENTRO del flujo: sin ella la suscripción nace `incomplete`
// y no se puede modificar. Guardarla aquí ya no recarga la página ni borra lo
// que el usuario estaba eligiendo.

import {
  Alert, Box, Button, ButtonBase, Checkbox, FormControlLabel, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SectionPaper from "../common/SectionPaper";
import { BRAND, FOCUS_RING, ICON, TEXT } from "../../theme/brand";
import StatusPill from "./StatusPill";
import { PluginTag } from "./PluginPills";
import PaymentMethodCard from "./PaymentMethodCard";
import {
  LINES, LINE_LABELS, LINE_HINTS, INTERVALS, INTERVAL_LABELS, MDM_INCLUDES, TIER_ADDS,
  availableTiers, estimateLine, usageWarning, suggestedQuantity, tierLabel, chargeTiming,
  yearlySavingsLabel,
} from "./billingModel";
import { formatMoney } from "./money";

const per = (interval) => (interval === "yearly" ? "yr" : "mo");

function TierOption({ tier, line, price, currency, interval, selected, current, pluginCatalog, onSelect }) {
  const adds = line === "endpoint" ? TIER_ADDS[tier] ?? [] : [];
  const first = line === "endpoint" && tier === "starter";
  const pluginsOf = adds.map(
    (key) => pluginCatalog.find((p) => p.key === key) ?? { key, label: key.toUpperCase(), title: key.toUpperCase() }
  );
  // El nombre de la opción lo dice TODO: precio y plugins por su nombre
  // completo. Las pastillas de dentro no son enfocables (ver PluginTag).
  const name =
    `${tierLabel(tier)}${current ? " (current plan)" : ""}, ${formatMoney(price, currency)} per device per ` +
    `${interval === "yearly" ? "year" : "month"}` +
    (pluginsOf.length ? `, ${first ? "includes" : "adds"} ${pluginsOf.map((p) => p.title).join(", ")}` : "");
  return (
    <ButtonBase
      role="radio"
      aria-checked={selected}
      aria-label={name}
      onClick={onSelect}
      sx={{
        display: "block",
        textAlign: "left",
        width: "100%",
        p: 1.25,
        borderRadius: 2,
        border: `${selected ? 2 : 1}px solid ${selected ? BRAND.teal : BRAND.borderStrong}`,
        // Compensa el borde de 2 px para que el contenido no salte al elegir.
        m: selected ? 0 : "1px",
        bgcolor: selected ? BRAND.tealSoft : BRAND.surface,
        "&:hover": { borderColor: BRAND.teal },
        "&.Mui-focusVisible": { boxShadow: FOCUS_RING },
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Typography sx={{ fontSize: TEXT.base, fontWeight: 800, color: BRAND.dark }}>{tierLabel(tier)}</Typography>
        {current && <StatusPill tone="info">Current</StatusPill>}
      </Stack>
      <Typography sx={{ fontSize: TEXT.base, color: BRAND.dark }}>
        <strong>{formatMoney(price, currency)}</strong>
        <Box component="span" sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          {" "}/device/{per(interval)}
        </Box>
      </Typography>
      {adds.length > 0 && (
        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
          {!first && <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>+</Typography>}
          {pluginsOf.map((plugin) => (
            <PluginTag key={plugin.key} plugin={plugin} tone={selected ? "info" : "neutral"} focusable={false} />
          ))}
        </Stack>
      )}
    </ButtonBase>
  );
}

function LineChooser({ line, prices, currency, interval, value, current, used, pluginCatalog, onChange }) {
  const tiers = availableTiers(prices, line);
  const suggestion = suggestedQuantity(used);
  const subtotal = value ? estimateLine(prices, line, value.tier, value.quantity) : null;
  const warning = value ? usageWarning(value.quantity, used) : null;
  const include = (on) => onChange(on ? { tier: current?.tier ?? tiers[0], quantity: current?.quantity ?? suggestion } : null);

  if (tiers.length === 0) {
    return (
      <Box>
        <Typography sx={{ fontSize: TEXT.base, fontWeight: 800, color: BRAND.dark }}>{LINE_LABELS[line]}</Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
          Not available with {INTERVAL_LABELS[interval].toLowerCase()} billing.
        </Typography>
      </Box>
    );
  }

  const single = tiers.length === 1;

  return (
    <Box>
      <FormControlLabel
        sx={{ m: 0 }}
        control={<Checkbox size="small" checked={Boolean(value)} onChange={(e) => include(e.target.checked)} />}
        label={
          <Typography component="span" sx={{ fontSize: TEXT.base, color: BRAND.dark }}>
            <strong>{LINE_LABELS[line]}</strong>
            <Box component="span" sx={{ color: "text.secondary", fontSize: TEXT.sm }}>
              {" "}· {LINE_HINTS[line]}
              {Number.isFinite(used) ? ` · ${used} enrolled` : ""}
              {single ? ` · ${formatMoney(prices[line][tiers[0]], currency)}/device/${per(interval)}` : ""}
            </Box>
          </Typography>
        }
      />
      {single && line === "mdm" && value && (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", ml: 4 }}>{MDM_INCLUDES.join(" · ")}</Typography>
      )}

      {value && (
        <Box sx={{ pl: { sm: 4 }, mt: 1 }}>
          {!single && (
            <Box
              role="radiogroup"
              aria-label={`${LINE_LABELS[line]} plan`}
              sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: `repeat(${tiers.length}, minmax(0, 1fr))` }, gap: 1 }}
            >
              {tiers.map((tier) => (
                <TierOption
                  key={tier}
                  tier={tier}
                  line={line}
                  price={prices[line][tier]}
                  currency={currency}
                  interval={interval}
                  selected={value.tier === tier}
                  current={current?.tier === tier}
                  pluginCatalog={pluginCatalog}
                  onSelect={() => onChange({ ...value, tier })}
                />
              ))}
            </Box>
          )}

          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: single ? 0 : 1.25 }}>
            <TextField
              size="small"
              type="number"
              label="Licenses"
              value={value.quantity}
              // ⚠️ El vacío se DEJA PASAR mientras se escribe: forzar el mínimo en
              // cada tecla dejaba "1" al borrar, y teclear "10" encima daba 110.
              // Con la cantidad vacía el total no se estima y no se puede
              // confirmar, así que no se envía a medias.
              onChange={(e) => {
                const raw = e.target.value;
                onChange({ ...value, quantity: raw === "" ? "" : Math.max(1, parseInt(raw, 10) || 1) });
              }}
              onBlur={() => {
                if (value.quantity === "") onChange({ ...value, quantity: suggestion });
              }}
              slotProps={{ htmlInput: { min: 1, "aria-label": `${LINE_LABELS[line]} licenses` } }}
              sx={{ width: 130 }}
            />
            {/* El atajo importa: "tienes 143" tecleado a mano es donde se cuela
                el 14 o el 1430. */}
            {Number.isFinite(used) && used > 0 && value.quantity !== suggestion && (
              <Button size="small" onClick={() => onChange({ ...value, quantity: suggestion })}>
                Use {suggestion}
              </Button>
            )}
            {subtotal !== null && (
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                {formatMoney(subtotal, currency)}/{per(interval)}
              </Typography>
            )}
          </Stack>

          {warning && (
            <Alert severity={warning.severity} sx={{ mt: 1 }}>
              {warning.message}
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
}

export default function PlanChangePanel({
  sub, catalog, prices, currency, pluginCatalog = [], selection, onSelectionChange,
  current, change, beforeTotal, afterTotal, hasCard, publishableKey, onCardSaved,
  error, onCancel, onReview,
}) {
  const isNew = change === "new" || !current;
  const savings = yearlySavingsLabel(catalog);
  const timing = chargeTiming(change, sub);
  const setLine = (line, value) => onSelectionChange((s) => ({ ...s, [line]: value }));
  const nothingSelected = !LINES.some((l) => selection[l]);

  // El motivo va donde está el botón: deshabilitar sin decir por qué convierte
  // un paso que falta en un fallo aparente.
  let blocker = null;
  if (nothingSelected) blocker = "Select at least one line.";
  else if (afterTotal === null) blocker = "Enter a license count.";
  else if (!hasCard) blocker = "Add a card to continue.";
  else if (change === "none") blocker = "No changes yet.";

  return (
    <SectionPaper variant="panel" component="section" aria-label={isNew ? "Choose a plan" : "Change plan"} sx={{ borderColor: BRAND.teal }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1} sx={{ mb: 1.5 }}>
        <Typography component="h2" sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark }}>
          {isNew ? "Choose a plan" : "Change plan"}
        </Typography>
        {/* Una sola para toda la suscripción: Stripe rechaza mezclar mensual y
            anual entre los items de una misma. */}
        <ToggleButtonGroup
          exclusive
          size="small"
          value={selection.interval}
          aria-label="Billing period"
          onChange={(_e, v) => v && onSelectionChange((s) => ({ ...s, interval: v }))}
        >
          {INTERVALS.map((i) => (
            <ToggleButton key={i} value={i} sx={{ px: 1.5, textTransform: "none", fontWeight: 700 }}>
              {INTERVAL_LABELS[i]}
              {i === "yearly" && savings ? ` · ${savings}` : ""}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {!prices || Object.keys(prices).length === 0 ? (
        <Alert severity="warning">
          No {INTERVAL_LABELS[selection.interval].toLowerCase()} prices are available. Try the other billing period.
        </Alert>
      ) : (
        <Stack spacing={2}>
          {LINES.map((line) => (
            <LineChooser
              key={line}
              line={line}
              prices={prices}
              currency={currency}
              interval={selection.interval}
              value={selection[line]}
              current={current?.[line] ?? null}
              used={sub?.usage?.[line] ?? null}
              pluginCatalog={pluginCatalog}
              onChange={(v) => setLine(line, v)}
            />
          ))}
        </Stack>
      )}

      {!hasCard && (
        <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: BRAND.tealSoft }}>
          <Typography sx={{ fontSize: TEXT.base, fontWeight: 800, color: BRAND.dark }}>Payment method</Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1 }}>
            {isNew && timing?.when === "trial_end"
              ? "Add a card now; it isn't charged until your trial ends."
              : "Add a card before subscribing. Without one the subscription never activates."}
          </Typography>
          <PaymentMethodCard embedded publishableKey={publishableKey} hasPaymentMethod={false} onSaved={onCardSaved} />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ md: "center" }}
        spacing={1.5}
        sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${BRAND.border}` }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {beforeTotal !== null && beforeTotal !== undefined && change !== "none" && (
              <>
                <Typography sx={{ fontSize: TEXT.base, color: "text.secondary" }}>
                  {formatMoney(beforeTotal, currency)}/{per(current?.interval)}
                </Typography>
                <ArrowForwardIcon aria-label="to" sx={{ fontSize: ICON.md, color: "text.secondary" }} />
              </>
            )}
            <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
              {afterTotal !== null ? `${formatMoney(afterTotal, currency)}/${per(selection.interval)}` : "—"}
            </Typography>
          </Stack>
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
            {blocker ?? `${timing?.text ?? ""} Estimated, before taxes.`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button color="inherit" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="contained" disabled={Boolean(blocker)} onClick={onReview}>
            {isNew ? "Review subscription" : "Review change"}
          </Button>
        </Stack>
      </Stack>
    </SectionPaper>
  );
}
