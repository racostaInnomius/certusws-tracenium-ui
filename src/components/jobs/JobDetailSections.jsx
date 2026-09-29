// src/components/jobs/JobDetailSections.jsx
//
// Las secciones de Job Detail que explican el job a una persona:
//
//   · What happened      — result_json leído (veredicto, datos, antes → después)
//   · What was requested — payload_json leído
//   · Raw data           — los dos en crudo, PLEGADOS, con «Copy JSON»
//
// Viven fuera de Jobs.jsx por lo de siempre: esa página no se puede probar por
// dentro. Toda la interpretación está en utils/jobDescribe.js; aquí sólo se
// pinta.

import * as React from "react";
import { Box, Button, Collapse, Paper, Typography } from "@mui/material";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";

import { BRAND, ICON, NEUTRAL, TEXT, TEXT_MUTED } from "../../theme/brand";
import { describeJobPayload, describeJobResult, rawJsonText } from "../../utils/jobDescribe";
import { hasJobResult } from "../../utils/jobResult";

export function DetailRow({ label, value, mono = false }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "baseline" }}>
      <Typography
        sx={{
          fontSize: TEXT.sm,
          color: TEXT_MUTED,
          fontWeight: 600,
          minWidth: 88,
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: TEXT.md,
          color: BRAND.dark,
          fontFamily: mono ? "monospace" : "inherit",
          // break-all es para ids (no tienen palabras); en prosa —el título
          // de un check— partía «set» en «se / t».
          wordBreak: mono ? "break-all" : "break-word",
          flex: 1,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

// Superficie + texto de cada tono. Los *Text son los que pasan AA sobre su
// fondo suave; el color «normal» de cada alerta es de relleno, no de letra.
const TONE_SX = {
  success: { bgcolor: BRAND.alert.successSoft, color: BRAND.alert.successText, borderColor: `${BRAND.alert.success}55` },
  info: { bgcolor: BRAND.alert.infoSoft, color: BRAND.alert.infoText, borderColor: `${BRAND.alert.info}55` },
  warning: { bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warningText, borderColor: `${BRAND.alert.warning}` },
  error: { bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.errorText, borderColor: `${BRAND.alert.error}55` },
  neutral: { bgcolor: BRAND.darkSoft, color: BRAND.dark, borderColor: BRAND.border },
};

const TONE_DOT = {
  success: BRAND.alert.success,
  info: BRAND.alert.info,
  warning: BRAND.alert.warning,
  error: BRAND.alert.error,
  neutral: BRAND.gray,
};

function SectionTitle({ children, color = BRAND.teal }) {
  return (
    <Typography variant="overline" sx={{ color, fontWeight: 800, letterSpacing: 1.2 }}>
      {children}
    </Typography>
  );
}

function SubLabel({ children }) {
  return (
    <Typography
      sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, mt: 1 }}
    >
      {children}
    </Typography>
  );
}

const MONO_BLOCK_SX = {
  mt: 0.5,
  p: 1.25,
  bgcolor: BRAND.dark,
  color: NEUTRAL[100],
  borderColor: BRAND.dark,
  overflow: "auto",
  maxHeight: 260,
  fontFamily: "monospace",
  fontSize: TEXT.sm,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

/**
 * Un bloque plegable. Empieza cerrado: es para quien lo busca, no para quien
 * lee el job.
 */
export function RawToggle({ label, text, copyable = true }) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const id = React.useId();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sin portapapeles (http, permisos): el texto sigue ahí para seleccionarlo */
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Button
          size="small"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          endIcon={open ? <ExpandLessOutlinedIcon /> : <ExpandMoreOutlinedIcon />}
          sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText, px: 0.5 }}
        >
          {label}
        </Button>
        {open && copyable ? (
          <Button
            size="small"
            onClick={copy}
            startIcon={<ContentCopyOutlinedIcon sx={{ fontSize: ICON.md }} />}
            sx={{ textTransform: "none", color: TEXT_MUTED, ml: "auto" }}
          >
            {copied ? "Copied" : "Copy JSON"}
          </Button>
        ) : null}
      </Box>
      <Collapse in={open} unmountOnExit>
        <Paper id={id} variant="outlined" sx={MONO_BLOCK_SX}>
          {text}
        </Paper>
      </Collapse>
    </Box>
  );
}

function ChangesTable({ changes }) {
  const hasAfter = changes.rows.some((r) => r.after !== null);
  const hasExpected = changes.rows.some((r) => r.expected);
  const cols = ["Setting", "Before", ...(hasAfter ? ["After"] : []), ...(hasExpected ? ["Expected"] : [])];
  const cell = { fontSize: TEXT.sm, py: 0.5, pr: 1, borderBottom: `1px solid ${BRAND.border}`, wordBreak: "break-word" };

  return (
    <Box>
      {/* El scroll horizontal es de la rejilla, no de la sección: la línea
          de «Compliant» de debajo no debe desplazarse con ella. */}
      <Box
        role="table"
        aria-label="Setting changes"
        sx={{
          display: "grid",
          gridTemplateColumns: `minmax(120px, 2fr) repeat(${cols.length - 1}, minmax(max-content, 1fr))`,
          overflowX: "auto",
          mt: 0.5,
        }}
      >
        {cols.map((c) => (
          <Typography key={c} role="columnheader" sx={{ ...cell, color: TEXT_MUTED, fontWeight: 700, textTransform: "uppercase" }}>
            {c}
          </Typography>
        ))}
        {changes.rows.map((r, i) => (
          <React.Fragment key={i}>
            <Box role="cell" sx={cell}>
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600, color: BRAND.dark }}>{r.setting}</Typography>
              {r.location ? (
                <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, fontFamily: "monospace" }}>{r.location}</Typography>
              ) : null}
            </Box>
            <Typography role="cell" sx={{ ...cell, fontFamily: "monospace" }}>{r.before}</Typography>
            {hasAfter ? (
              <Typography
                role="cell"
                sx={{
                  ...cell,
                  fontFamily: "monospace",
                  color: r.compliant === true ? BRAND.alert.successText : r.compliant === false ? BRAND.alert.errorText : BRAND.dark,
                  fontWeight: 700,
                }}
              >
                {r.after ?? "—"}
              </Typography>
            ) : null}
            {hasExpected ? <Typography role="cell" sx={{ ...cell, fontFamily: "monospace" }}>{r.expected ?? "—"}</Typography> : null}
          </React.Fragment>
        ))}
      </Box>
      {changes.compliantBefore !== null || changes.compliantAfter !== null ? (
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, mt: 0.5 }}>
          Compliant before: {changes.compliantBefore === null ? "—" : changes.compliantBefore ? "Yes" : "No"}
          {changes.compliantAfter !== null ? ` · after: ${changes.compliantAfter ? "Yes" : "No"}` : ""}
        </Typography>
      ) : null}
    </Box>
  );
}

const BATCH_VISIBLE = 25;

/** What happened — `null` si el agente no ha devuelto nada todavía. */
export function JobOutcomeSection({ job }) {
  const d = React.useMemo(() => describeJobResult(job), [job]);
  const [showAllItems, setShowAllItems] = React.useState(false);
  if (!d) return null;

  const items = showAllItems ? d.items : d.items.slice(0, BATCH_VISIBLE);

  return (
    <Box>
      <SectionTitle color={BRAND.tealText}>What happened</SectionTitle>
      <Paper
        variant="outlined"
        data-tone={d.tone}
        sx={{ mt: 0.5, p: 1.25, ...TONE_SX[d.tone] }}
      >
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: "inherit" }}>{d.headline}</Typography>
        {/* El código literal del agente, en pequeño: es lo que se busca en
            los logs y lo que distingue dos titulares parecidos. */}
        {d.code ? (
          <Typography sx={{ fontSize: TEXT.sm, fontFamily: "monospace", color: TEXT_MUTED, mt: 0.25, wordBreak: "break-all" }}>
            {d.code}
          </Typography>
        ) : null}
      </Paper>
      {d.endedAs ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.errorText, fontWeight: 700, mt: 0.5 }}>
          This was the agent’s last report — the job then ended as {d.endedAs}. See Last Error above.
        </Typography>
      ) : null}

      {d.facts.length || d.detection.length ? (
        <Box sx={{ mt: 1, display: "grid", gap: 0.5 }}>
          {d.detection.map((x) => (
            <DetailRow key={x.label} label={x.label} value={x.value} />
          ))}
          {d.facts.map((x) => (
            <DetailRow key={x.key} label={x.label} value={x.value} />
          ))}
        </Box>
      ) : null}

      {d.changes?.rows.length ? (
        <>
          <SubLabel>Changes</SubLabel>
          <ChangesTable changes={d.changes} />
        </>
      ) : null}

      {d.stages.length ? (
        <>
          <SubLabel>Checks</SubLabel>
          <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, mt: 0.5, display: "grid", gap: 0.5 }}>
            {d.stages.map((s) => (
              <Box component="li" key={s.label} sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                <Typography
                  sx={{
                    fontSize: TEXT.sm,
                    fontWeight: 800,
                    minWidth: 40,
                    color: !s.ok ? BRAND.alert.errorText : s.warn ? BRAND.alert.warningText : BRAND.alert.successText,
                  }}
                >
                  {!s.ok ? "FAIL" : s.warn ? "WARN" : "OK"}
                </Typography>
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
                  <b>{s.label}</b>
                  {s.detail ? ` — ${s.detail}` : ""}
                </Typography>
              </Box>
            ))}
          </Box>
        </>
      ) : null}

      {d.items.length ? (
        <>
          <SubLabel>Fixes in this batch</SubLabel>
          <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, mt: 0.5, display: "grid", gap: 0.5 }}>
            {items.map((it, i) => {
              const remediation = it.facts.find((x) => x.key === "remediationId")?.value;
              const setting = it.changes?.rows[0]?.setting;
              return (
                <Box component="li" key={i} data-tone={it.tone} sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                  <Box
                    aria-hidden
                    sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: TONE_DOT[it.tone], flexShrink: 0, alignSelf: "center" }}
                  />
                  <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, wordBreak: "break-word" }}>
                    {it.headline}
                    {setting ? <Box component="span" sx={{ color: TEXT_MUTED }}>{` · ${setting}`}</Box> : null}
                    {remediation ? <Box component="span" sx={{ color: TEXT_MUTED }}>{` · ${remediation}`}</Box> : null}
                  </Typography>
                </Box>
              );
            })}
          </Box>
          {d.items.length > BATCH_VISIBLE ? (
            <Button
              size="small"
              onClick={() => setShowAllItems((v) => !v)}
              sx={{ textTransform: "none", color: BRAND.tealText, px: 0.5 }}
            >
              {showAllItems ? "Show fewer" : `Show all ${d.items.length}`}
            </Button>
          ) : null}
        </>
      ) : null}

      {d.notes.length ? (
        <Box sx={{ mt: 1, display: "grid", gap: 0.25 }}>
          {d.notes.map((n, i) => (
            <Typography key={i} sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, fontFamily: "monospace" }}>
              {n}
            </Typography>
          ))}
        </Box>
      ) : null}

      {d.details.length ? (
        <Box sx={{ mt: 1 }}>
          {d.details.map((x) => (
            <RawToggle
              key={x.key}
              label={x.label}
              text={typeof x.value === "string" ? x.value : rawJsonText(x.value)}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

/** What was requested. */
export function JobRequestSection({ job }) {
  const p = React.useMemo(() => describeJobPayload(job), [job]);
  const empty = !p.facts.length && !p.list;

  return (
    <Box>
      <SectionTitle>What was requested</SectionTitle>
      {empty ? (
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, mt: 0.5 }}>No parameters.</Typography>
      ) : (
        <Box sx={{ mt: 0.5, display: "grid", gap: 0.5 }}>
          {p.facts.map((x) => (
            <DetailRow key={x.label} label={x.label} value={x.value} />
          ))}
        </Box>
      )}
      {p.list ? (
        <>
          <SubLabel>{p.list.label}</SubLabel>
          {p.list.items.length ? (
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
              {p.list.items.map((item, i) => (
                <Typography
                  component="li"
                  key={i}
                  sx={{ fontSize: TEXT.sm, color: BRAND.dark, wordBreak: "break-word", fontFamily: p.list.label === "Changes" ? "monospace" : "inherit" }}
                >
                  {item}
                </Typography>
              ))}
            </Box>
          ) : (
            <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, mt: 0.5 }}>{p.list.empty || "None"}</Typography>
          )}
        </>
      ) : null}
    </Box>
  );
}

/** Raw data — los dos JSON, plegados y con lo sensible tapado. */
export function JobRawDataSection({ job }) {
  const hasResult = hasJobResult(job?.result_json);
  return (
    <Box>
      <SectionTitle color={TEXT_MUTED}>Raw data</SectionTitle>
      <Box sx={{ display: "grid", gap: 0.25 }}>
        {hasResult ? <RawToggle label="Raw result" text={rawJsonText(job.result_json)} /> : null}
        <RawToggle label="Raw payload" text={rawJsonText(job?.payload_json ?? {})} />
      </Box>
    </Box>
  );
}
