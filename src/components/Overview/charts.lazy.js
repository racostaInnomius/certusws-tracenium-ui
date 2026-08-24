// src/components/Overview/charts.lazy.js
//
// One dynamic-import boundary for all five Recharts-backed Overview cards.
//
// Why a barrel instead of five lazy() imports: each React.lazy() call is its
// own chunk, and each chunk is its own round-trip. These five wrappers are
// 1–2 KB each — the 109 KB of Recharts lives in the shared `charts` chunk they
// all depend on — so splitting them bought nothing and cost four extra
// requests on the critical path.
//
// Measured on a real MSP client switch (portal → tenant), before this barrel:
// the five chunks landed at 1194, 1196, 1200, 1207 and 2769 ms, the last one a
// full third waterfall level. Each is ~264 ms alone but 1.5–2.8 s while the
// switch's other ~40 requests are in flight, and the API calls those cards
// issue cannot start until their chunk renders. Collapsing them to one import
// removes four round-trips and flattens that level.
//
// The lazy boundary itself is kept deliberately. On a cold load straight to
// Overview, Recharts is genuinely not needed for first paint, which is what
// `4da9c03` set out to fix. This changes only HOW MANY requests that deferral
// costs, not whether it happens — importing this module still pulls the
// `charts` chunk, and still only when the Overview actually renders.
//
// Consumers must import the whole module once (see Overview.jsx) so the
// browser's module cache serves all five from the single in-flight promise.

export { default as FleetComposition } from "./FleetComposition";
export { default as AuditTimeseriesChart } from "./AuditTimeseriesChart";
export { default as JobsTimeseriesChart } from "./JobsTimeseriesChart";
export { default as PatchCoverageCard } from "./PatchCoverageCard";
export { default as ComplianceTrendCard } from "./ComplianceTrendCard";
