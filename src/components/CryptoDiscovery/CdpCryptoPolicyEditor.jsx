// src/components/CryptoDiscovery/CdpCryptoPolicyEditor.jsx
//
// Settings → Crypto policy (ola 1.6): lo que ESTA organización decidió que
// no acepta. Cada regla incumplida suma puntos al riesgo del certificado
// (los pesos, en la pestaña Risk → «How is this calculated?»).
//
// ── Decisiones ───────────────────────────────────────────────────────
//
// · El PUT REEMPLAZA la política entera: lo que se deja vacío deja de
//   evaluarse, y guardar el formulario vacío es «sin reglas». Por eso, si
//   la lectura inicial FALLA, el formulario se bloquea: pintarlo vacío y
//   dejar guardar borraría en silencio unas reglas que existen («no hay» ≠
//   «no pude leer»).
// · Un 400 trae el campo en el código (`MIN_RSA_BITS_INVALID`…): se marca
//   ESE campo, no un error genérico arriba.
// · 503 SCHEMA_NOT_MIGRATED: la tabla no existe en este tenant. Se dice
//   tal cual; no es algo que el operador pueda arreglar reintentando.
// · Tras guardar, el backend vuelve a puntuar el tenant en el acto y
//   devuelve cuántos certificados miró y cuántos cambiaron: se enseña,
//   porque es la prueba de que la regla tuvo efecto.

import * as React from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, FormGroup, FormHelperText, FormLabel, Stack, Switch, TextField, Typography } from "@mui/material";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { getCdpCryptoPolicy, putCdpCryptoPolicy } from "../../api/cdp";

/** Las curvas que casi todo el mundo usa; cualquier otra va en «Other curves». */
export const STANDARD_CURVES = ["p-256", "p-384", "p-521"];
/** Los únicos hashes que el backend acepta en `forbiddenSignatureHashes`. */
export const SIGNATURE_HASHES = ["md5", "sha1", "sha224", "sha256", "sha384", "sha512"];

/** Código de error del backend → campo del formulario. */
export const ERROR_FIELD = {
  MIN_RSA_BITS_INVALID: "minRsaBits",
  MAX_VALIDITY_DAYS_INVALID: "maxValidityDays",
  ALLOWED_CURVES_INVALID: "allowedCurves",
  FORBIDDEN_HASHES_INVALID: "forbiddenSignatureHashes",
  BLOCKED_ISSUERS_INVALID: "blockedIssuers",
  REQUIRE_EKU_INVALID: "requireEku"
};

// Los rangos son los de normalizeCryptoPolicy (risk.ts). Aquí sólo para la
// frase de ayuda y el mensaje de error: la validación de verdad es del
// servidor, que es quien devuelve el 400.
const FIELD_ERROR_TEXT = {
  minRsaBits: "Must be a whole number between 1024 and 16384.",
  maxValidityDays: "Must be a whole number of days between 1 and 3650.",
  allowedCurves: "Too many curves, or a name longer than 128 characters (at most 32).",
  forbiddenSignatureHashes: "Only md5, sha1, sha224, sha256, sha384 and sha512 are accepted.",
  blockedIssuers: "Too many issuers, or one longer than 128 characters (at most 64).",
  requireEku: "Must be on or off."
};

const EMPTY_FORM = { minRsaBits: "", maxValidityDays: "", curves: [], otherCurves: "", hashes: [], blockedIssuers: "", requireEku: false };

/** Reglas del servidor → estado del formulario. */
export function formFromRules(rules) {
  const r = rules && typeof rules === "object" ? rules : {};
  const curves = Array.isArray(r.allowedCurves) ? r.allowedCurves.map(String) : [];
  return {
    minRsaBits: r.minRsaBits != null ? String(r.minRsaBits) : "",
    maxValidityDays: r.maxValidityDays != null ? String(r.maxValidityDays) : "",
    curves: curves.filter((c) => STANDARD_CURVES.includes(c)),
    otherCurves: curves.filter((c) => !STANDARD_CURVES.includes(c)).join(", "),
    hashes: Array.isArray(r.forbiddenSignatureHashes) ? r.forbiddenSignatureHashes.map(String) : [],
    blockedIssuers: Array.isArray(r.blockedIssuers) ? r.blockedIssuers.join("\n") : "",
    requireEku: r.requireEku === true
  };
}

/**
 * Formulario → cuerpo `rules`. Lo vacío NO viaja: una regla ausente no se
 * evalúa, y el formulario vacío da `{}`. Los números van como el texto
 * escrito convertido con Number(); si no es un entero en rango, que lo diga
 * el servidor con su 400 (una sola fuente de verdad para los límites).
 */
export function rulesFromForm(form) {
  const out = {};
  const num = (v) => {
    const t = String(v ?? "").trim();
    return t === "" ? undefined : Number(t);
  };
  const minRsaBits = num(form.minRsaBits);
  if (minRsaBits !== undefined) out.minRsaBits = minRsaBits;
  const maxValidityDays = num(form.maxValidityDays);
  if (maxValidityDays !== undefined) out.maxValidityDays = maxValidityDays;
  const curves = [
    ...form.curves,
    ...String(form.otherCurves ?? "")
      .split(/[,\n]/)
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean)
  ];
  if (curves.length) out.allowedCurves = [...new Set(curves)];
  if (form.hashes.length) out.forbiddenSignatureHashes = [...form.hashes];
  const issuers = String(form.blockedIssuers ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  if (issuers.length) out.blockedIssuers = issuers;
  if (form.requireEku) out.requireEku = true;
  return out;
}

export default function CdpCryptoPolicyEditor() {
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [loaded, setLoaded] = React.useState(false);
  const [loadError, setLoadError] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState({});
  // { severity, text } — el resultado del último guardado.
  const [result, setResult] = React.useState(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setLoadError(null);
    getCdpCryptoPolicy()
      .then((r) => {
        if (!alive) return;
        setForm(formFromRules(r?.rules));
        setLoaded(true);
      })
      .catch((err) => {
        if (!alive) return;
        setLoaded(false);
        setLoadError(err?.message || String(err));
      });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    // El campo que se toca deja de estar en rojo: el error era del valor anterior.
    setFieldErrors((e) => {
      const field = key === "curves" || key === "otherCurves" ? "allowedCurves" : key === "hashes" ? "forbiddenSignatureHashes" : key;
      if (!e[field]) return e;
      const next = { ...e };
      delete next[field];
      return next;
    });
  };
  const toggleIn = (key, value) => (e) => {
    const checked = e.target.checked;
    set(key)(checked ? [...form[key], value] : form[key].filter((x) => x !== value));
  };

  const save = async () => {
    setSaving(true);
    setResult(null);
    setFieldErrors({});
    try {
      const r = await putCdpCryptoPolicy(rulesFromForm(form));
      // Lo que el servidor guardó, normalizado (minúsculas, ordenado): el
      // formulario pasa a enseñar eso, no lo que se escribió.
      setForm(formFromRules(r?.rules));
      const rs = r?.rescored ?? {};
      if (rs.skipped === "not_migrated") {
        setResult({
          severity: "warning",
          text: "Policy saved, but scores could not be recomputed: the risk migration has not been applied to this tenant yet."
        });
      } else {
        const scanned = Number(rs.scanned ?? 0);
        const updated = Number(rs.updated ?? 0);
        setResult({
          severity: "success",
          text: `Policy saved. Rescored ${scanned.toLocaleString()} certificate${scanned === 1 ? "" : "s"}; ${updated.toLocaleString()} changed score.`
        });
      }
    } catch (err) {
      const code = String(err?.code || err?.body?.error || "");
      const field = ERROR_FIELD[code];
      if (field) {
        setFieldErrors({ [field]: FIELD_ERROR_TEXT[field] });
        setResult({ severity: "error", text: "Not saved: one of the rules is invalid — see the highlighted field." });
      } else if (code === "SCHEMA_NOT_MIGRATED") {
        setResult({
          severity: "error",
          text: "Not saved: this tenant's database doesn't have the crypto policy table yet (migration 20261021_cdp_risk_score pending). Retrying won't help until it is applied — contact your Tracenium administrator."
        });
      } else if (code === "POLICY_INVALID") {
        setResult({ severity: "error", text: "Not saved: the server rejected the policy as malformed." });
      } else {
        setResult({ severity: "error", text: `Not saved: ${err?.message || String(err)}` });
      }
    } finally {
      setSaving(false);
    }
  };

  const disabled = !loaded || saving;

  return (
    <Box>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8, mb: 1.5 }}>
        Rules your organization does not accept. Every rule a certificate breaks adds points to its risk score, on top of the
        built-in hygiene and CA/B Forum checks. Leave a field empty to not evaluate it; saving an empty form removes every rule.
        Saving rescores all certificates immediately.
      </Typography>

      {loadError ? (
        <Alert
          severity="error"
          sx={{ mb: 1.5 }}
          action={
            <Button color="inherit" size="small" onClick={() => setNonce((n) => n + 1)}>
              Retry
            </Button>
          }
        >
          Couldn&apos;t load the current policy: {loadError}. Editing is disabled so an empty form can&apos;t overwrite rules that
          exist.
        </Alert>
      ) : null}

      <Stack spacing={2} sx={{ maxWidth: 640 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            size="small"
            label="Minimum RSA key size (bits)"
            value={form.minRsaBits}
            onChange={(e) => set("minRsaBits")(e.target.value)}
            disabled={disabled}
            inputProps={{ inputMode: "numeric" }}
            error={Boolean(fieldErrors.minRsaBits)}
            helperText={fieldErrors.minRsaBits ?? "e.g. 3072. Empty = not evaluated."}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            label="Maximum validity (days)"
            value={form.maxValidityDays}
            onChange={(e) => set("maxValidityDays")(e.target.value)}
            disabled={disabled}
            inputProps={{ inputMode: "numeric" }}
            error={Boolean(fieldErrors.maxValidityDays)}
            helperText={fieldErrors.maxValidityDays ?? "End-entity certificates only. Empty = not evaluated."}
            sx={{ flex: 1 }}
          />
        </Stack>

        <Box>
          <FormLabel component="legend" error={Boolean(fieldErrors.allowedCurves)} sx={{ fontSize: TEXT.sm }}>
            Allowed EC curves
          </FormLabel>
          <FormGroup row>
            {STANDARD_CURVES.map((c) => (
              <FormControlLabel
                key={c}
                control={<Checkbox size="small" checked={form.curves.includes(c)} onChange={toggleIn("curves", c)} disabled={disabled} />}
                label={<Typography sx={{ fontSize: TEXT.md }}>{c.toUpperCase()}</Typography>}
              />
            ))}
          </FormGroup>
          <TextField
            size="small"
            fullWidth
            label="Other curves"
            value={form.otherCurves}
            onChange={(e) => set("otherCurves")(e.target.value)}
            disabled={disabled}
            error={Boolean(fieldErrors.allowedCurves)}
            helperText={fieldErrors.allowedCurves ?? "Comma-separated. None ticked and none written = any curve is accepted."}
          />
        </Box>

        <Box>
          <FormLabel component="legend" error={Boolean(fieldErrors.forbiddenSignatureHashes)} sx={{ fontSize: TEXT.sm }}>
            Forbidden signature hashes
          </FormLabel>
          <FormGroup row>
            {SIGNATURE_HASHES.map((h) => (
              <FormControlLabel
                key={h}
                control={<Checkbox size="small" checked={form.hashes.includes(h)} onChange={toggleIn("hashes", h)} disabled={disabled} />}
                label={<Typography sx={{ fontSize: TEXT.md }}>{h.toUpperCase()}</Typography>}
              />
            ))}
          </FormGroup>
          {fieldErrors.forbiddenSignatureHashes ? <FormHelperText error>{fieldErrors.forbiddenSignatureHashes}</FormHelperText> : null}
        </Box>

        <TextField
          size="small"
          fullWidth
          multiline
          minRows={2}
          label="Blocked issuers"
          value={form.blockedIssuers}
          onChange={(e) => set("blockedIssuers")(e.target.value)}
          disabled={disabled}
          error={Boolean(fieldErrors.blockedIssuers)}
          helperText={fieldErrors.blockedIssuers ?? "One per line. Matches any issuer whose name contains the text, ignoring case."}
        />

        <Box>
          <FormControlLabel
            control={<Switch size="small" checked={form.requireEku} onChange={(e) => set("requireEku")(e.target.checked)} disabled={disabled} />}
            label={<Typography sx={{ fontSize: TEXT.md }}>Require Extended Key Usage on certificates whose private key is on the device</Typography>}
          />
          {fieldErrors.requireEku ? <FormHelperText error>{fieldErrors.requireEku}</FormHelperText> : null}
        </Box>

        {result ? <Alert severity={result.severity}>{result.text}</Alert> : null}

        <Stack direction="row" spacing={1} alignItems="center">
          <Button variant="contained" onClick={save} disabled={disabled}>
            {saving ? "Saving…" : "Save policy"}
          </Button>
          {!loaded && !loadError ? <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>Loading…</Typography> : null}
        </Stack>
      </Stack>
    </Box>
  );
}
