// src/components/Billing/StaffPlanForm.jsx
//
// El formulario del plan que fija el staff: tier, licencias, trial, plugins de
// Enterprise y MDM/MAM. Lo usan el alta de tenant (Manage Tenants → Create New
// Tenant) y "Edit plan" en Subscriptions. Controlado: el estado vive en quien
// lo monta, y las reglas en staffPlanModel.js.

import {
  Alert, Box, CircularProgress, FormControlLabel, Stack, Switch, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { MANAGED_TIER, TIERS, tierLabel, pluginsIncludedIn } from "./billingModel";
import { dateInMonths, MAX_TRIAL_MONTHS, tierDefaults } from "./staffPlanModel";

const TIER_HINTS = {
  starter: "Self-service package, billed through Stripe.",
  professional: "Self-service package, billed through Stripe.",
  business: "Self-service package, billed through Stripe.",
  enterprise: "Managed by Tracenium — billed outside Stripe. You choose the plugins.",
};

export default function StaffPlanForm({
  plan,
  onChange,
  errors = {},
  catalog = [],
  catalogLoading = false,
  stripeManaged = false,
  disabled = false,
}) {
  const managed = plan.tier === MANAGED_TIER;
  const set = (patch) => onChange({ ...plan, ...patch });
  const lockedByStripe = disabled || stripeManaged;

  const titleOf = (key) => catalog.find((p) => p.key === key)?.title ?? key;
  const included = managed ? null : pluginsIncludedIn(plan.tier);
  const chosenOptional = managed
    ? (plan.pluginKeys ?? []).filter((k) => !catalog.find((p) => p.key === k)?.required)
    : [];

  const togglePlugin = (key, on) => {
    const current = new Set(plan.pluginKeys ?? []);
    if (on) current.add(key);
    else current.delete(key);
    set({ pluginKeys: [...current].sort() });
  };

  return (
    <Stack spacing={2.5}>
      {stripeManaged && (
        <Alert severity="info">
          This tenant pays through Stripe. Plan, licenses and MDM follow the Stripe subscription;
          only the full-access date can change here.
        </Alert>
      )}

      <Box>
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.75 }}>Plan</Typography>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          aria-label="Plan"
          value={plan.tier}
          disabled={lockedByStripe}
          onChange={(_e, tier) => {
            // Cada tier trae su trial por defecto: un paquete, el mes estándar;
            // Enterprise, ninguno.
            if (tier) set({ tier, ...tierDefaults(tier) });
          }}
        >
          {TIERS.map((t) => (
            <ToggleButton key={t} value={t} sx={{ textTransform: "none", fontWeight: 700 }}>
              {tierLabel(t)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.75 }}>
          {TIER_HINTS[plan.tier]}
          {included && included.length > 0 && ` Includes ${included.map(titleOf).join(", ")}.`}
        </Typography>
        {errors.tier && <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.errorText }}>{errors.tier}</Typography>}
      </Box>

      <TextField
        label="Endpoint licenses"
        type="number"
        size="small"
        value={plan.quantity}
        disabled={lockedByStripe}
        onChange={(e) => set({ quantity: e.target.value })}
        error={Boolean(errors.quantity)}
        helperText={
          errors.quantity ??
          (managed ? "Also sets the device cap." : "The device cap of a package follows its Stripe subscription.")
        }
        slotProps={{ htmlInput: { min: 1, "aria-label": "Endpoint licenses" } }}
      />

      <Box>
        <FormControlLabel
          control={
            <Switch
              checked={Boolean(plan.trialEnabled)}
              disabled={disabled}
              onChange={(e) =>
                set({
                  trialEnabled: e.target.checked,
                  trialEndsOn: e.target.checked ? plan.trialEndsOn || tierDefaults("starter").trialEndsOn : plan.trialEndsOn,
                })
              }
            />
          }
          label="Full-access trial"
        />
        {plan.trialEnabled && (
          <TextField
            label="Full access until"
            type="date"
            size="small"
            value={plan.trialEndsOn}
            disabled={disabled}
            onChange={(e) => set({ trialEndsOn: e.target.value })}
            error={Boolean(errors.trialEndsOn)}
            helperText={
              errors.trialEndsOn ??
              `Every plugin is open until this day; then the tenant falls back to its plan. At most ${MAX_TRIAL_MONTHS} months.`
            }
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { max: dateInMonths(MAX_TRIAL_MONTHS), "aria-label": "Full access until" },
            }}
            sx={{ mt: 1, display: "flex" }}
          />
        )}
      </Box>

      {managed && (
        <Box>
          <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>Plugins</Typography>
          {catalogLoading && catalog.length === 0 ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={16} sx={{ color: BRAND.teal }} />
              <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>Loading plugins…</Typography>
            </Stack>
          ) : (
            <Stack role="group" aria-label="Enterprise plugins" divider={<Box sx={{ borderTop: `1px solid ${BRAND.border}` }} />}>
              {catalog.map((p) => {
                const on = p.required || (plan.pluginKeys ?? []).includes(p.key);
                return (
                  <Stack key={p.key} direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 0.5 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>{p.title}</Typography>
                      {p.required && (
                        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>Always included</Typography>
                      )}
                    </Box>
                    <Switch
                      checked={on}
                      disabled={disabled || p.required}
                      onChange={(e) => togglePlugin(p.key, e.target.checked)}
                      slotProps={{ input: { "aria-label": p.title } }}
                    />
                  </Stack>
                );
              })}
            </Stack>
          )}
          {!catalogLoading && catalog.length > 0 && chosenOptional.length === 0 && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              No plugins chosen: only {titleOf("amp")} will be active.
            </Alert>
          )}
        </Box>
      )}

      <Box>
        <FormControlLabel
          control={
            <Switch
              checked={Boolean(plan.mdmIncluded)}
              disabled={lockedByStripe}
              onChange={(e) => set({ mdmIncluded: e.target.checked })}
            />
          }
          label="MDM / MAM"
        />
        {plan.mdmIncluded && (
          <TextField
            label="MDM / MAM licenses"
            type="number"
            size="small"
            value={plan.mdmQuantity}
            disabled={lockedByStripe}
            onChange={(e) => set({ mdmQuantity: e.target.value })}
            error={Boolean(errors.mdmQuantity)}
            helperText={errors.mdmQuantity}
            slotProps={{ htmlInput: { min: 1, "aria-label": "MDM / MAM licenses" } }}
            sx={{ mt: 1, display: "flex" }}
          />
        )}
      </Box>

      {managed && (
        <FormControlLabel
          control={
            <Switch
              checked={Boolean(plan.canceled)}
              disabled={disabled}
              onChange={(e) => set({ canceled: e.target.checked })}
            />
          }
          label="Suspended (canceled) — the tenant keeps only Asset Management"
        />
      )}
    </Stack>
  );
}
