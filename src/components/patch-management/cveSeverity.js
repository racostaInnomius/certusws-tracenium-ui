// src/components/patch-management/cveSeverity.js
//
// Re-export of the canonical severity presentation (src/theme/severity.js).
// This module used to define its own SEVERITY_META with hardcoded oranges;
// it now forwards the single source of truth so the CVE views stay in lockstep
// with every other severity surface. Kept as a thin shim so existing imports
// from patch-management components don't have to change.

export {
  SEVERITY_RANK,
  SEVERITY_ORDER,
  SEVERITY_META,
  severityMeta,
} from "../../theme/severity";
