// src/components/AgentSettings/CdpProbeCandidates.jsx
//
// Internal TLS services the agents already talk to (established outbound
// connections to private addresses, last 14 days), offered for promotion to
// remote probe targets with one click. Nothing here is probed on its own.

import * as React from "react";
import { Box, Button, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { listCdpProbeCandidates } from "../../api/cdp";
import { CDP_PROBE_TARGETS_MAX, splitTargetLines } from "../Policies/policyTransforms";
import { getFormValue, MONO_FONT, setFormValue } from "./fieldSpecs";

export default function CdpProbeCandidates({ form, onChange, readOnly = false }) {
  const [candidates, setCandidates] = React.useState(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    listCdpProbeCandidates({ limit: 100 })
      .then((r) => alive && setCandidates(r?.candidates ?? []))
      .catch((e) => alive && setError(e?.message || String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const current = String(getFormValue(form, "cdp.probeTargets") ?? "");
  const lines = splitTargetLines(current);
  const listed = new Set(lines.map((t) => t.toLowerCase()));
  const overCap = lines.length >= CDP_PROBE_TARGETS_MAX;
  const add = (target) => {
    if (listed.has(target.toLowerCase())) return;
    onChange(setFormValue(form, "cdp.probeTargets", current.trim() ? `${current.trim()}\n${target}` : target));
  };

  return (
    <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px dashed ${BRAND.border}` }}>
      <Typography sx={{ fontSize: TEXT.base, fontWeight: 600, color: BRAND.dark }}>Discovered internal TLS services</Typography>
      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mb: 1 }}>
        Endpoints on private addresses that devices running the local probe connect to (last 14 days). Add the ones you want probed; nothing here is probed on its own.
      </Typography>
      {error ? (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.errorText }}>Couldn&apos;t load discovered services: {error}</Typography>
      ) : candidates === null ? (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>Loading…</Typography>
      ) : candidates.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>Nothing discovered yet. Devices report candidates once the local probe is on and they have talked to an internal TLS service.</Typography>
      ) : (
        <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: TEXT.sm }}>
          <Box component="thead">
            <Box component="tr" sx={{ textAlign: "left", color: BRAND.gray }}>
              <Box component="th" sx={{ py: 0.5, fontWeight: 600 }}>Service</Box>
              <Box component="th" sx={{ fontWeight: 600 }}>Devices</Box>
              <Box component="th" sx={{ fontWeight: 600 }}>Connections</Box>
              <Box component="th" sx={{ fontWeight: 600 }}>Seen from</Box>
              <Box component="th" />
            </Box>
          </Box>
          <Box component="tbody">
            {candidates.map((c) => {
              const isListed = listed.has(String(c.target).toLowerCase());
              return (
                <Box component="tr" key={c.target} sx={{ borderTop: `1px solid ${BRAND.border}` }}>
                  <Box component="td" sx={{ py: 0.5, fontFamily: MONO_FONT }}>{c.target}</Box>
                  <Box component="td">{c.devices}</Box>
                  <Box component="td">{c.connections}</Box>
                  <Box component="td" sx={{ color: BRAND.gray }}>{(c.processes ?? []).join(", ") || "—"}</Box>
                  <Box component="td" sx={{ textAlign: "right" }}>
                    {isListed ? (
                      <Typography component="span" sx={{ fontSize: TEXT.xs, color: BRAND.tealText, fontWeight: 700 }}>{c.probed ? "probed" : "listed"}</Typography>
                    ) : (
                      <Button size="small" variant="outlined" disabled={readOnly || overCap} onClick={() => add(c.target)} aria-label={`Add ${c.target} to probe targets`} sx={{ textTransform: "none" }}>
                        Add
                      </Button>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}
