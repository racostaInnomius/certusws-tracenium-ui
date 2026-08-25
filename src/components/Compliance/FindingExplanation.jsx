// src/components/Compliance/FindingExplanation.jsx
//
// Sprint 4 — AI explanation panel for one finding. Self-contained:
// owns its fetch + states; the parent just mounts it inside the card
// when the operator clicks "Explain". Renders the structured fields the
// backend's explainer returns (finding-explainer.ts) — never free text.
//
// Error mapping mirrors the backend's status codes so the operator gets
// a real reason, not "failed":
//   429 AI_QUOTA_EXCEEDED → AI not enabled for this tenant / budget reached
//   422 AI_REFUSAL        → the model declined (rare; shows the message)
//   502 AI_INVALID_OUTPUT → transient; offer retry

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { BRAND, ICON, TEXT } from "../../theme/brand";
import { explainFinding } from "../../api/compliance";

const CONFIDENCE_META = {
  high: { label: "High confidence", bg: BRAND.tealSoft, fg: BRAND.tealText },
  medium: { label: "Medium confidence", bg: BRAND.alert?.warningSoft, fg: BRAND.alert?.warning },
  low: { label: "Low confidence — verify", bg: BRAND.alert?.errorSoft, fg: BRAND.alert?.error },
};

function errorMessageFor(err) {
  const code = err?.body?.error || err?.code;
  if (err?.status === 429 || code === "AI_QUOTA_EXCEEDED") {
    return (
      err?.body?.message ||
      "AI features are not enabled for this tenant, or today's AI budget is used up."
    );
  }
  if (err?.status === 422 || code === "AI_REFUSAL") {
    return `The model declined to explain this finding${err?.body?.message ? `: ${err.body.message}` : "."}`;
  }
  if (err?.status === 502 || code === "AI_INVALID_OUTPUT") {
    return "The model returned something we couldn't validate. Try again.";
  }
  return err?.body?.message || err?.message || "Failed to generate an explanation.";
}

export default function FindingExplanation({ findingId }) {
  const [state, setState] = React.useState({ loading: true, error: null, data: null });

  const load = React.useCallback(
    async ({ refresh = false } = {}) => {
      setState({ loading: true, error: null, data: null });
      try {
        const res = await explainFinding(findingId, { refresh });
        setState({ loading: false, error: null, data: res });
      } catch (err) {
        setState({ loading: false, error: errorMessageFor(err), data: null });
      }
    },
    [findingId]
  );

  React.useEffect(() => {
    load();
  }, [load]);

  const ex = state.data?.explanation;
  const conf = ex ? CONFIDENCE_META[ex.confidence] ?? CONFIDENCE_META.medium : null;
  const basedOn = state.data?.basedOn;

  return (
    <Box
      sx={{
        mt: 1,
        p: 1.5,
        borderRadius: 1.5,
        border: `1px dashed ${BRAND.teal}`,
        bgcolor: `${BRAND.tealSoft}55`,
      }}
      aria-live="polite"
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <AutoAwesomeOutlinedIcon sx={{ fontSize: ICON.md, color: BRAND.teal }} />
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 800, color: BRAND.dark, flex: 1 }}>
          AI explanation
        </Typography>
        {state.data ? (
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            {state.data.cached ? "cached" : state.data.model || ""}
            {basedOn?.platform ? ` · ${basedOn.platform}${basedOn.osRelease ? ` ${basedOn.osRelease}` : ""}` : ""}
          </Typography>
        ) : null}
        {!state.loading ? (
          <Tooltip title="Regenerate (bypasses the cache; spends AI budget)" arrow>
            <Button
              size="small"
              onClick={() => load({ refresh: true })}
              startIcon={<RefreshOutlinedIcon sx={{ fontSize: ICON.sm }} />}
              sx={{ textTransform: "none", minWidth: 0, px: 1 }}
            >
              Regenerate
            </Button>
          </Tooltip>
        ) : null}
      </Stack>

      {state.loading ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={14} sx={{ color: BRAND.teal }} />
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            Asking the model…
          </Typography>
        </Stack>
      ) : state.error ? (
        <Alert severity="warning" sx={{ py: 0.5 }}>
          {state.error}
        </Alert>
      ) : ex ? (
        <Stack spacing={1}>
          <Section label="What it means" text={ex.whatItMeans} />
          <Section label="Why it matters" text={ex.whyItMatters} />
          <Box>
            <Typography sx={{ fontSize: TEXT.xs, fontWeight: 800, color: BRAND.gray, textTransform: "uppercase" }}>
              How to fix it here
            </Typography>
            <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
              {ex.remediationSteps.map((step, i) => (
                <Typography key={i} component="li" variant="body2" sx={{ color: BRAND.dark, mb: 0.25 }}>
                  {step}
                </Typography>
              ))}
            </Box>
          </Box>
          <Section label="If ignored" text={ex.riskIfIgnored} />
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", gap: 0.5 }}>
            {conf ? (
              <Chip size="small" label={conf.label} sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: conf.bg, color: conf.fg }} />
            ) : null}
            {ex.caveats ? (
              <Typography variant="caption" sx={{ color: BRAND.gray }}>
                ⚠ {ex.caveats}
              </Typography>
            ) : null}
          </Stack>
          {Array.isArray(basedOn?.frameworkRefs) && basedOn.frameworkRefs.length ? (
            <Typography variant="caption" sx={{ color: BRAND.gray }}>
              Based on: {basedOn.frameworkRefs.join(" · ")}
            </Typography>
          ) : null}
        </Stack>
      ) : null}
    </Box>
  );
}

function Section({ label, text }) {
  return (
    <Box>
      <Typography sx={{ fontSize: TEXT.xs, fontWeight: 800, color: BRAND.gray, textTransform: "uppercase" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: BRAND.dark }}>
        {text}
      </Typography>
    </Box>
  );
}
