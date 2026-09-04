// src/components/Compliance/EvidenceView.jsx
//
// Renders a finding's evidence one row per probe instead of dumping the
// evaluator's JSON. The shapes come from the backend evaluator
// (modules/compliance/evaluator.ts) and are stable:
//
//   { path, value, expected | rejected | threshold | min/max | allowed |
//     forbidden | pattern/matched | observed/minVersion | length/sample }
//   { paths: [{ path, value }], expected }               all_equal / any_equal
//   { composite: "all_of" | "any_of", sub_evidence: [ { status, evidence } |
//     { status: "not_applicable", reason } ] }           composites
//   { reason }                                           not assessed
//   "free text"                                          legacy string
//
// Why now: the Windows hardening checks (TLS, ciphers, SMBv1) became
// all_of rules over up to 20 registry probes. As JSON that was a wall of
// escaped backslashes; an operator needs "which key, what it holds, what
// it should hold" — and for a composite, which sub-checks failed.
//
// Anything not recognised falls back to the JSON block, so a new evaluator
// shape never renders as nothing.

import * as React from "react";
import { Box, Typography, Tooltip } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { evidenceRows } from "./evidenceRows";

const STATUS_STYLE = {
  pass: { color: BRAND.tealText, label: "✓" },
  fail: { color: BRAND.alert.errorText, label: "✗" },
  not_applicable: { color: BRAND.gray, label: "–" },
  error: { color: BRAND.alert.errorText, label: "!" },
};

function StatusMark({ status }) {
  const s = STATUS_STYLE[status];
  if (!s) return null;
  return (
    <Typography component="span" sx={{ color: s.color, fontWeight: 800, fontSize: TEXT.xs, width: 14, display: "inline-block" }} aria-label={status}>
      {s.label}
    </Typography>
  );
}

function JsonFallback({ evidence }) {
  return (
    <Box
      component="pre"
      sx={{
        mt: 0.5, p: 1, borderRadius: 1, bgcolor: BRAND.surfaceMuted, fontSize: TEXT.xs,
        fontFamily: "monospace", maxHeight: 200, overflow: "auto", whiteSpace: "pre-wrap",
        wordBreak: "break-word", margin: 0,
      }}
    >
      {typeof evidence === "string" ? evidence : JSON.stringify(evidence, null, 2)}
    </Box>
  );
}

/**
 * @param {object} props
 * @param {unknown} props.evidence  finding.evidence as served by the API
 * @param {string=} props.status    finding status (pass/fail/…) for single-rule rows
 */
export default function EvidenceView({ evidence, status }) {
  if (evidence === null || evidence === undefined) return null;

  // Not assessed: the evaluator recorded why.
  if (typeof evidence === "object" && !Array.isArray(evidence) && typeof evidence.reason === "string" && !evidence.path && !evidence.paths && !evidence.sub_evidence) {
    return (
      <Typography variant="body2" sx={{ mt: 0.5, color: BRAND.gray, fontStyle: "italic" }} data-testid="evidence-reason">
        {evidence.reason}
      </Typography>
    );
  }

  const rows = evidenceRows(evidence, status);
  if (!rows || rows.length === 0) return <JsonFallback evidence={evidence} />;

  const composite = typeof evidence === "object" && evidence.composite ? evidence.composite : null;
  const failing = rows.filter((r) => r.status === "fail").length;
  const showStatus = composite !== null;

  return (
    <Box sx={{ mt: 0.5 }} data-testid="evidence-rows">
      {composite ? (
        <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 0.5 }}>
          {composite === "all_of" ? "All of the following must hold" : "Any of the following must hold"}
          {" · "}
          {rows.length} probe{rows.length === 1 ? "" : "s"}
          {failing > 0 ? `, ${failing} failing` : ""}
        </Typography>
      ) : null}
      <Box
        component="table"
        sx={{
          width: "100%", borderCollapse: "collapse", fontSize: TEXT.xs, fontFamily: "monospace",
          "& td, & th": { textAlign: "left", verticalAlign: "top", py: 0.25, pr: 1, borderBottom: `1px solid ${BRAND.border}` },
          "& th": { color: BRAND.gray, fontWeight: 600, fontFamily: "inherit" },
          "& td": { wordBreak: "break-all" },
        }}
      >
        <thead>
          <tr>
            {showStatus ? <th aria-label="status" /> : null}
            <th>Probe</th>
            <th>Value</th>
            <th>Expected</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} data-status={r.status ?? ""}>
              {showStatus ? <td><StatusMark status={r.status} /></td> : null}
              <td>
                {r.path ? (
                  <Tooltip title={r.path} enterDelay={600}>
                    <span>{r.path}</span>
                  </Tooltip>
                ) : (
                  <span style={{ color: BRAND.gray }}>—</span>
                )}
              </td>
              <td>{r.value}</td>
              <td>{r.expected ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}
