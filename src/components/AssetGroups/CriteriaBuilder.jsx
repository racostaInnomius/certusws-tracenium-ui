// src/components/AssetGroups/CriteriaBuilder.jsx
//
// Dynamic-criteria builder for Asset Groups, extracted from the AssetGroups
// god-component. Fully props-driven: the page owns the catalog + predicates
// array and passes onChange; this renders one [field ▼][op ▼][value] row per
// predicate. CriteriaValueEditor owns the per-value interaction (remote
// autocomplete via getCriteriaSuggestions, debounced, with local + catalog
// fallbacks); CriteriaValueInput is a thin pass-through kept for a stable
// seam. Pure helpers + lookup tables live in ./criteriaHelpers.

import * as React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import RemoveCircleOutlineOutlinedIcon from "@mui/icons-material/RemoveCircleOutlineOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import { BRAND, ROLE } from "../../theme/brand";
import { getCriteriaSuggestions } from "../../api/assetGroups";
import {
  normalizeOptionLabel,
  normalizeSuggestionValue,
  normalizeSuggestionOption,
  getCatalogOptions,
  getSuggestionFieldKey,
  isIpSubnetOperator,
  operatorExpectsArray,
  parseCommaSeparatedValues,
  operatorAllowsPartialText,
  shouldUseRemoteAutocomplete,
  isCatalogLikeField,
  getLocalFallbackOptions,
  getPlaceholder,
  getHelperText
} from "./criteriaHelpers";
import { listFrom } from "../../api/shape";

export function CriteriaValueEditor({ pred, fieldSpec, opSpec, disabled, onChange }) {
  const fieldKey = getSuggestionFieldKey(fieldSpec, pred?.field);
  const expectsArray = operatorExpectsArray(opSpec);
  const partialText = operatorAllowsPartialText(opSpec);
  const isSubnet = isIpSubnetOperator(opSpec);
  const useAutocomplete = shouldUseRemoteAutocomplete(fieldKey) && !isSubnet;
  const isCatalog = isCatalogLikeField(fieldKey);
  const freeSolo = !["platform", "pluginEnabled"].includes(fieldKey);

  const currentArrayValue = React.useMemo(() => {
    if (Array.isArray(pred?.value)) return pred.value.map((item) => String(item ?? "").trim()).filter(Boolean);
    const single = String(pred?.value ?? "").trim();
    return single ? [single] : [];
  }, [pred?.value]);

  const currentSingleValue = React.useMemo(() => {
    if (Array.isArray(pred?.value)) return String(pred.value[0] ?? "").trim();
    return String(pred?.value ?? "").trim();
  }, [pred?.value]);

  const [inputValue, setInputValue] = React.useState(currentSingleValue);
  const [search, setSearch] = React.useState(currentSingleValue);
  const [options, setOptions] = React.useState(() => getLocalFallbackOptions(fieldKey));
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const requestIdRef = React.useRef(0);

  React.useEffect(() => {
    setInputValue(expectsArray ? "" : currentSingleValue);
    setSearch(expectsArray ? "" : currentSingleValue);
  }, [fieldKey, pred?.op, expectsArray, currentSingleValue]);

  React.useEffect(() => {
    if (!useAutocomplete) return;

    const localFallbacks = getLocalFallbackOptions(fieldKey);
    const catalogOptions = getCatalogOptions(fieldSpec, fieldKey);
    const mergedLocal = [...localFallbacks, ...catalogOptions]
      .map((option) => normalizeSuggestionOption(option, fieldKey))
      .filter(Boolean);

    const normalizedSearch = String(search || "").trim();
    const shouldFetch = isCatalog || normalizedSearch.length >= 2;

    if (!shouldFetch) {
      setOptions(mergedLocal);
      setLoading(false);
      setError("");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError("");

    const handle = setTimeout(async () => {
      try {
        const res = await getCriteriaSuggestions({
          field: fieldKey,
          search: normalizedSearch || undefined,
          limit: 15,
        });

        if (requestIdRef.current !== requestId) return;

        const remoteOptions = listFrom(res, { context: "criteriaSuggestions" })
          .map((option) => normalizeSuggestionOption(option, fieldKey))
          .filter(Boolean);

        const deduped = new Map();
        [...mergedLocal, ...remoteOptions, ...currentArrayValue.map((value) => ({ label: normalizeOptionLabel(value), value, description: "Selected value" }))].forEach((option) => {
          const key = String(option?.value ?? "").toLowerCase();
          if (key && !deduped.has(key)) deduped.set(key, option);
        });

        setOptions(Array.from(deduped.values()));
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        setOptions(mergedLocal);
        setError(err?.body?.message || err?.message || "Failed to load suggestions");
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    }, isCatalog ? 0 : 400);

    return () => clearTimeout(handle);
  }, [useAutocomplete, isCatalog, fieldKey, fieldSpec, search, currentArrayValue]);

  const optionByValue = React.useMemo(() => {
    const map = new Map();
    options.forEach((option) => {
      const value = String(option?.value ?? "");
      if (value) map.set(value.toLowerCase(), option);
    });
    return map;
  }, [options]);

  const optionValues = React.useMemo(() => {
    const values = options.map((option) => String(option?.value ?? "").trim()).filter(Boolean);
    currentArrayValue.forEach((value) => {
      if (value && !values.some((item) => item.toLowerCase() === value.toLowerCase())) {
        values.push(value);
      }
    });
    return values;
  }, [options, currentArrayValue]);

  const getOption = React.useCallback(
    (value) => optionByValue.get(String(value ?? "").toLowerCase()),
    [optionByValue]
  );

  const getOptionLabel = React.useCallback(
    (value) => {
      const rawValue = String(value ?? "").trim();
      if (!rawValue) return "";
      const option = getOption(rawValue);
      return option?.label || normalizeOptionLabel(rawValue);
    },
    [getOption]
  );

  const renderOption = React.useCallback(
    (props, value) => {
      const { key, ...optionProps } = props;
      const rawValue = String(value ?? "").trim();
      const option = getOption(rawValue) || {
        label: normalizeOptionLabel(rawValue),
        value: rawValue,
        description: "Custom value",
      };

      return (
        <Box
          key={key || option.value}
          component="li"
          {...optionProps}
          sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", py: 0.75 }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}>
            {option.label}
          </Typography>
          {option.description ? (
            <Typography sx={{ fontSize: 11, color: BRAND.gray, lineHeight: 1.25 }}>
              {option.description}
            </Typography>
          ) : null}
        </Box>
      );
    },
    [getOption]
  );

  if (!useAutocomplete) {
    return (
      <TextField
        size="small"
        label="Value"
        value={String(pred?.value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        fullWidth
        sx={{ flex: 1, minWidth: 200 }}
        placeholder={fieldKey === "ip" && isSubnet ? "192.168.1.0/24" : undefined}
        helperText={fieldKey === "ip" && isSubnet ? "Enter a CIDR subnet range." : undefined}
      />
    );
  }

  if (expectsArray) {
    return (
      <Autocomplete
        key={`${fieldKey}-${String(pred?.op || "")}-multi`}
        multiple
        freeSolo={freeSolo}
        openOnFocus
        forcePopupIcon
        clearOnEscape
        disableCloseOnSelect
        autoHighlight
        filterOptions={(items) => items}
        options={optionValues}
        value={currentArrayValue}
        inputValue={inputValue}
        limitTags={2}
        loading={loading}
        disabled={disabled}
        noOptionsText={!isCatalog && String(search || "").trim().length < 2 ? "Type at least 2 characters" : "No suggestions found"}
        loadingText="Loading suggestions..."
        getOptionLabel={getOptionLabel}
        isOptionEqualToValue={(option, value) =>
          String(option ?? "").toLowerCase() === String(value ?? "").toLowerCase()
        }
        onInputChange={(_, nextInputValue, reason) => {
          if (reason === "reset") return;
          setInputValue(nextInputValue || "");
          setSearch(nextInputValue || "");
        }}
        onChange={(_, nextValue) => {
          const safeNext = (Array.isArray(nextValue) ? nextValue : [])
            .map((item) => normalizeSuggestionValue(fieldKey, item))
            .filter(Boolean);
          const deduped = Array.from(new Set(safeNext));
          onChange(deduped);
          setInputValue("");
          setSearch("");
        }}
        renderOption={renderOption}
        renderTags={(value, getTagProps) =>
          (Array.isArray(value) ? value : []).map((item, index) => {
            const { key, ...tagProps } = getTagProps({ index });
            return (
              <Chip
                key={key || `${item}-${index}`}
                {...tagProps}
                size="small"
                label={getOptionLabel(item)}
                sx={{
                  height: 22,
                  bgcolor: BRAND.tealSoft,
                  color: BRAND.tealText,
                  border: `1px solid ${BRAND.teal}44`,
                  fontWeight: 700,
                }}
              />
            );
          })
        }
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            label="Value"
            placeholder={currentArrayValue.length ? "" : getPlaceholder(fieldKey, true, partialText)}
            helperText={getHelperText({ fieldKey, search, error, loading, multiple: true, freeSolo })}
            error={Boolean(error)}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={16} sx={{ color: BRAND.teal }} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        sx={{ flex: 1, minWidth: { xs: "100%", md: 240 } }}
      />
    );
  }

  return (
    <Autocomplete
      key={`${fieldKey}-${String(pred?.op || "")}-single`}
      freeSolo={freeSolo}
      openOnFocus
      forcePopupIcon
      clearOnEscape
      autoHighlight
      selectOnFocus
      clearOnBlur={false}
      handleHomeEndKeys
      filterOptions={(items) => items}
      options={optionValues}
      value={currentSingleValue || null}
      inputValue={inputValue}
      loading={loading}
      disabled={disabled}
      noOptionsText={!isCatalog && String(search || "").trim().length < 2 ? "Type at least 2 characters" : "No suggestions found"}
      loadingText="Loading suggestions..."
      getOptionLabel={getOptionLabel}
      isOptionEqualToValue={(option, value) =>
        String(option ?? "").toLowerCase() === String(value ?? "").toLowerCase()
      }
      onInputChange={(_, nextInputValue, reason) => {
        if (reason === "reset") return;
        const next = normalizeSuggestionValue(fieldKey, nextInputValue);
        setInputValue(next);
        setSearch(next);
        if (freeSolo) onChange(next);
      }}
      onChange={(_, nextOption) => {
        const next = normalizeSuggestionValue(fieldKey, nextOption || "");
        onChange(next);
        setInputValue(next);
        setSearch(next);
      }}
      renderOption={renderOption}
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          label="Value"
          placeholder={getPlaceholder(fieldKey, false, partialText)}
          helperText={getHelperText({ fieldKey, search, error, loading, multiple: false, freeSolo })}
          error={Boolean(error)}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={16} sx={{ color: BRAND.teal }} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      sx={{ flex: 1, minWidth: { xs: "100%", md: 240 } }}
    />
  );
}

function CriteriaValueInput({ pred, fieldSpec, opSpec, disabled, onChange }) {
  return (
    <CriteriaValueEditor
      pred={pred}
      fieldSpec={fieldSpec}
      opSpec={opSpec}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

// ── Criteria builder (dynamic groups) ────────────────────────────
//
// One row per predicate: [field ▼] [op ▼] [value]. The field
// dropdown drives the available ops (each field exposes its own
// subset). Adding a field to the catalog server-side automatically
// shows up here without a UI change.
//
// Live preview: every change debounces a call to the backend's
// `/preview` endpoint, which validates + evaluates the criteria
// against the tenant DB and returns count + sample. The debounce
// keeps the rate down while the operator types into a value field.

export default function CriteriaBuilder({ catalog, predicates, onChange, error }) {
  const fields = catalog?.fields || [];

  const updatePredicate = (idx, patch) => {
    const next = predicates.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange(next);
  };
  const removePredicate = (idx) => {
    onChange(predicates.filter((_, i) => i !== idx));
  };
  const addPredicate = () => {
    const firstField = fields[0];
    if (!firstField) return;
    const firstOp = firstField.ops[0];
    onChange([
      ...predicates,
      {
        field: firstField.key,
        op: firstOp?.key || "eq",
        value: firstOp?.expectsArray ? [] : "",
      },
    ]);
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
        <Typography
          variant="caption"
          sx={{
            color: BRAND.gray,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Criteria · all of the following must match
        </Typography>
      </Box>
      <Stack spacing={1}>
        {predicates.map((pred, idx) => {
          const fieldSpec = fields.find((f) => f.key === pred.field);
          const opSpec = fieldSpec?.ops.find((o) => o.key === pred.op);
          return (
            <Stack
              key={idx}
              direction={{ xs: "column", md: "row" }}
              spacing={1}
              alignItems={{ xs: "stretch", md: "flex-start" }}
              sx={{
                p: 1,
                bgcolor: BRAND.surfaceMuted,
                borderRadius: 2,
                border: `1px solid ${BRAND.border}`,
              }}
            >
              <TextField
                select
                size="small"
                label="Field"
                value={pred.field}
                onChange={(e) => {
                  const newField = e.target.value;
                  const newSpec = fields.find((f) => f.key === newField);
                  // Reset op + value to safe defaults whenever the
                  // field changes — the previous op might not be
                  // allowed for the new field, and the previous
                  // value's type might not coerce.
                  const firstOp = newSpec?.ops[0];
                  updatePredicate(idx, {
                    field: newField,
                    op: firstOp?.key || "eq",
                    value: operatorExpectsArray(firstOp) ? [] : "",
                  });
                }}
                sx={{ width: { xs: "100%", md: 180 }, flexShrink: 0 }}
              >
                {fields.map((f) => (
                  <MenuItem key={f.key} value={f.key}>
                    {f.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Op"
                value={pred.op}
                onChange={(e) => {
                  const newOp = e.target.value;
                  const newOpSpec = fieldSpec?.ops.find((o) => o.key === newOp);
                  // Coerce value shape if the op switched between
                  // single and array variants.
                  const wasArray = Array.isArray(pred.value);
                  const expectsArray = operatorExpectsArray(newOpSpec);
                  let newValue = pred.value;
                  if (expectsArray && !wasArray) {
                    newValue = pred.value ? parseCommaSeparatedValues(pred.value) : [];
                  } else if (!expectsArray && wasArray) {
                    newValue = pred.value[0] || "";
                  }
                  updatePredicate(idx, { op: newOp, value: newValue });
                }}
                sx={{ width: { xs: "100%", md: 136 }, flexShrink: 0 }}
              >
                {(fieldSpec?.ops || []).map((o) => (
                  <MenuItem key={o.key} value={o.key}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <CriteriaValueInput
                pred={pred}
                fieldSpec={fieldSpec}
                opSpec={opSpec}
                disabled={false}
                onChange={(value) => updatePredicate(idx, { value })}
              />
              <IconButton
                aria-label="Remove condition"
                size="small"
                onClick={() => removePredicate(idx)}
                sx={{ color: BRAND.gray, "&:hover": { color: ROLE.critical } }}
                title="Remove predicate"
              >
                <RemoveCircleOutlineOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>
          );
        })}
        <Button
          size="small"
          variant="text"
          startIcon={<AddOutlinedIcon />}
          onClick={addPredicate}
          disabled={fields.length === 0}
          sx={{
            textTransform: "none",
            color: BRAND.teal,
            alignSelf: "flex-start",
            "&:hover": { bgcolor: BRAND.tealSoft },
          }}
        >
          Add predicate
        </Button>
      </Stack>
      {error ? (
        <Alert severity="error" variant="outlined" sx={{ mt: 1 }}>
          {error}
        </Alert>
      ) : null}
    </Box>
  );
}
