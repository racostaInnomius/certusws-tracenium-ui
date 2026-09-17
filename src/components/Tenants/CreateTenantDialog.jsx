// src/components/Tenants/CreateTenantDialog.jsx
//
// Manage Tenants → Create New Tenant. Dos pasos: el tenant y su plan.
//
// Identidad, como hasta ahora: SafeCertus ya tiene el tenant y el usuario; aquí
// se da de alta el tenant de Tracenium por su id externo y, al terminar, la
// página abre el diálogo de miembro para asignar el owner (que ya existe).
//
// El alta son DOS llamadas y no una transacción:
//
//   1. POST /api/v1/tenants — crea el tenant y su base de datos. El backend le
//      siembra Starter con el trial estándar.
//   2. PUT /api/v1/billing/admin/subscriptions/:id — fija el plan elegido.
//
// Si la segunda falla, el tenant YA existe: no se oculta ni se "deshace". Se
// entrega igual a la página con el motivo, para que el staff lo corrija desde
// "Edit plan" en vez de crear un duplicado al reintentar.

import * as React from "react";
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Step,
  StepLabel, Stepper, TextField, Typography,
} from "@mui/material";
import { createTenant } from "../../api/tenants";
import { setTenantPlan } from "../../api/billingAdmin";
import { usePluginCatalog } from "../../hooks/usePluginCatalog";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import StaffPlanForm from "../Billing/StaffPlanForm";
import { newPlan, planErrorMessage, planPayload, validatePlan } from "../Billing/staffPlanModel";

const STEPS = ["Tenant", "Plan"];

function createErrorMessage(err) {
  const code = err?.body?.error ?? null;
  if (code === "TENANT_ALREADY_EXISTS") return "A tenant with this External IdP tenant already exists.";
  if (code === "FORBIDDEN_GLOBAL_ONLY" || err?.status === 403) return "Only Tracenium staff can create tenants.";
  return err?.body?.message ?? err?.message ?? "Could not create the tenant.";
}

export default function CreateTenantDialog({ open, onClose, onCreated }) {
  const { catalog, loading: catalogLoading } = usePluginCatalog();
  const [step, setStep] = React.useState(0);
  const [name, setName] = React.useState("");
  const [externalIdpTenant, setExternalIdpTenant] = React.useState("");
  const [plan, setPlan] = React.useState(() => newPlan());
  const [showErrors, setShowErrors] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!open) return;
    setStep(0);
    setName("");
    setExternalIdpTenant("");
    setPlan(newPlan());
    setShowErrors(false);
    setError(null);
  }, [open]);

  const tenantReady = name.trim() !== "" && externalIdpTenant.trim() !== "";
  const errors = validatePlan(plan);
  const planReady = Object.keys(errors).length === 0;

  const submit = async () => {
    setShowErrors(true);
    if (!planReady || !tenantReady) return;
    setSaving(true);
    setError(null);

    let tenant;
    try {
      tenant = await createTenant({
        name: name.trim(),
        externalIdpTenant: externalIdpTenant.trim(),
        // Un solo número para el staff: las licencias son también el tope de
        // equipos con el que nace el tenant.
        maxDevices: Number(plan.quantity),
      });
    } catch (err) {
      setError(createErrorMessage(err));
      setSaving(false);
      return;
    }

    let planError = null;
    try {
      await setTenantPlan(tenant.id, planPayload(plan));
    } catch (err) {
      planError = planErrorMessage(err);
    }
    setSaving(false);
    onCreated?.(tenant, { planError });
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>Create New Tenant</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3, mt: 1 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {step === 0 ? (
          <Stack spacing={2}>
            <TextField
              label="Tenant name"
              size="small"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
            <TextField
              label="External IdP tenant"
              size="small"
              value={externalIdpTenant}
              onChange={(e) => setExternalIdpTenant(e.target.value)}
              required
              helperText="The tenant id in SafeCertus. The owner must already have an account there."
            />
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
              The tenant database is created automatically.
            </Typography>
          </Stack>
        ) : (
          <StaffPlanForm
            plan={plan}
            onChange={setPlan}
            errors={showErrors ? errors : {}}
            catalog={catalog ?? []}
            catalogLoading={catalogLoading}
            disabled={saving}
          />
        )}

        {saving && (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, mt: 2 }}>
            Creating the tenant and its database…
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving} color="inherit">
          Cancel
        </Button>
        {step === 1 && (
          <Button onClick={() => setStep(0)} disabled={saving}>
            Back
          </Button>
        )}
        {step === 0 ? (
          <Button variant="contained" onClick={() => setStep(1)} disabled={!tenantReady}>
            Next
          </Button>
        ) : (
          <Button variant="contained" onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create tenant"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
