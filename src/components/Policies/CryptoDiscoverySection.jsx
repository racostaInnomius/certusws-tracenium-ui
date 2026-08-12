// src/components/Policies/CryptoDiscoverySection.jsx
//
// "Crypto Discovery (CDP)" section of the PolicyForm. Authors
// policyJson.cdp for the cdp agent plugin:
//
//   intervalSeconds    — scan cadence (blank = agent default, 6h)
//   javaKeystorePaths  — APPLICATION Java keystores to inventory on top
//                        of the JVM cacerts the agent discovers by itself
//
// Why the keystore list matters: JKS/PKCS12 keystores are invisible to
// the OS certificate stores, so a Tomcat cert expiring inside one is
// exactly the outage CDP exists to prevent — and the agent cannot guess
// where those files live. Everything else in CDP is zero-config.
//
// Only rendered when the cdp plugin is enabled (see Policies.jsx).

import * as React from "react";
import { Box, TextField, Typography } from "@mui/material";
import { BRAND } from "../../theme/brand";
import {
  CDP_INTERVAL_MIN,
  CDP_INTERVAL_MAX,
  CDP_KEYSTORE_PATHS_MAX,
  splitPathLines,
} from "./policyTransforms";

export default function CryptoDiscoverySection({ form, onChange, readOnly = false }) {
  const cdp = form?.cdp ?? {};

  const setField = (key, value) => {
    onChange({ ...form, cdp: { ...cdp, [key]: value } });
  };

  // Live authoring feedback that mirrors the backend validator, so the
  // operator sees the problem before the save round-trip rejects it.
  const paths = splitPathLines(cdp.javaKeystorePaths);
  const relative = paths.filter((p) => !(p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p)));
  const overCap = paths.length > CDP_KEYSTORE_PATHS_MAX;

  const rawInterval = cdp.intervalSeconds;
  const intervalNum = Number(rawInterval);
  const intervalInvalid =
    rawInterval !== "" &&
    rawInterval !== null &&
    rawInterval !== undefined &&
    (!Number.isInteger(intervalNum) ||
      intervalNum < CDP_INTERVAL_MIN ||
      intervalNum > CDP_INTERVAL_MAX);

  const pathsHelp = overCap
    ? `Too many paths (${paths.length}). At most ${CDP_KEYSTORE_PATHS_MAX}; the agent drops the remainder.`
    : relative.length > 0
      ? `Not absolute: ${relative.slice(0, 3).join(", ")}${relative.length > 3 ? "…" : ""}. The agent ignores relative paths.`
      : `One absolute path per line. ${paths.length} configured. JVM cacerts are found automatically — list only application keystores.`;

  return (
    <Box
      sx={{
        mt: 4,
        p: 1.5,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 2,
        bgcolor: BRAND.surfaceMuted,
      }}
    >
      <Typography
        variant="overline"
        sx={{ color: BRAND.dark, fontWeight: 800, letterSpacing: 1.2 }}
      >
        Crypto Discovery (CDP)
      </Typography>
      <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 1 }}>
        Certificate inventory on <strong>Windows, macOS &amp; Linux</strong> endpoints. OS
        certificate stores and each JVM&apos;s <code>cacerts</code> are discovered
        automatically — leave both fields blank for that default. Metadata only:
        private keys are never read.
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "220px 1fr" },
          gap: 2,
          mt: 1.5,
          alignItems: "start",
        }}
      >
        <TextField
          size="small"
          type="number"
          label="Scan interval (seconds)"
          value={cdp.intervalSeconds ?? ""}
          onChange={(e) => setField("intervalSeconds", e.target.value === "" ? "" : Number(e.target.value))}
          disabled={readOnly}
          error={intervalInvalid}
          helperText={
            intervalInvalid
              ? `Must be ${CDP_INTERVAL_MIN}–${CDP_INTERVAL_MAX}.`
              : `Blank = agent default (6h). Range ${CDP_INTERVAL_MIN}–${CDP_INTERVAL_MAX}.`
          }
          inputProps={{ min: CDP_INTERVAL_MIN, max: CDP_INTERVAL_MAX }}
        />

        <TextField
          size="small"
          label="Application Java keystores (JKS / PKCS12)"
          value={cdp.javaKeystorePaths ?? ""}
          onChange={(e) => setField("javaKeystorePaths", e.target.value)}
          disabled={readOnly}
          error={relative.length > 0 || overCap}
          helperText={pathsHelp}
          multiline
          minRows={3}
          maxRows={10}
          placeholder={"/opt/tomcat/conf/keystore.jks\nC:\\Program Files\\App\\keystore.p12"}
          sx={{ "& textarea": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5 } }}
        />
      </Box>

      <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mt: 1.5 }}>
        Password-protected PKCS12 keystores are reported as a scan error rather than
        skipped silently — check the device&apos;s certificate list if one never appears.
      </Typography>
    </Box>
  );
}
