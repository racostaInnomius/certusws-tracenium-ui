// src/components/Policies/CryptoDiscoverySection.jsx
//
// "Crypto Discovery (CDP)" section of the PolicyForm. Authors
// policyJson.cdp for the cdp agent plugin:
//
//   intervalSeconds    — scan cadence (blank = agent default, 6h)
//   javaKeystorePaths  — APPLICATION Java keystores to inventory on top
//                        of the JVM cacerts the agent discovers by itself
//   scanTlsListeners   — opt-in probe of local TLS services
//   tlsListenerPorts   — optional narrowing of that probe
//
// Why the keystore list matters: JKS/PKCS12 keystores are invisible to
// the OS certificate stores, so a Tomcat cert expiring inside one is
// exactly the outage CDP exists to prevent — and the agent cannot guess
// where those files live. Everything else in CDP is zero-config.
//
// Why the listener probe is here at all: the agent has read
// `cdp.scanTlsListeners` since that collector shipped, but no authoring
// surface knew the key existed, so it could never be turned on. It was
// off across every tenant and the two capabilities that feed exclusively
// from it — TLS chain validation and certificate-to-process attribution
// — had no data at all. It is the only collector that opens sockets, so
// it stays opt-in; what it must not stay is unreachable.
//
// Only rendered when the cdp plugin is enabled (see Policies.jsx).

import * as React from "react";
import {
  Box,
  Collapse,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import {
  CDP_INTERVAL_MIN,
  CDP_INTERVAL_MAX,
  CDP_KEYSTORE_PATHS_MAX,
  CDP_TLS_PORTS_MAX,
  invalidPortTokens,
  parsePortList,
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

  const scanListeners = cdp.scanTlsListeners === true;
  const badPorts = invalidPortTokens(cdp.tlsListenerPorts ?? "");
  const portCount = parsePortList(cdp.tlsListenerPorts ?? "").length;
  const portsOverCap = portCount > CDP_TLS_PORTS_MAX;

  const portsHelp = badPorts.length > 0
    ? `Not valid ports: ${badPorts.slice(0, 3).join(", ")}${badPorts.length > 3 ? "…" : ""}. Each must be 1–65535.`
    : portsOverCap
      ? `Too many ports (${portCount}). At most ${CDP_TLS_PORTS_MAX}.`
      : portCount > 0
        ? `${portCount} port(s). Only these are probed — everything else is skipped.`
        : "Blank = probe every listening port the agent finds. Narrow it here if you'd rather be specific.";

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
          sx={{ "& textarea": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: TEXT.sm } }}
        />
      </Box>

      <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mt: 1.5 }}>
        Password-protected PKCS12 keystores are reported as a scan error rather than
        skipped silently — check the device&apos;s certificate list if one never appears.
      </Typography>

      <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px dashed ${BRAND.border}` }}>
        <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>
          Certificate files on disk
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 1 }}>
          Where most server certificates actually live. nginx, HAProxy, Apache and Postgres
          are pointed at a <code>.pem</code> path in a config file — they never read the OS
          trust store, so without this the certificate a service serves is invisible unless
          the listener probe happens to catch it. <strong>Private keys are never read</strong>:
          a file containing a key block is skipped whole, by content rather than by name,
          because <code>server.pem</code> routinely holds both halves.
        </Typography>
        <TextField
          size="small"
          fullWidth
          label="Directories to scan (optional)"
          value={cdp.certFilePaths ?? ""}
          onChange={(e) => setField("certFilePaths", e.target.value)}
          disabled={readOnly}
          helperText="One absolute directory per line. Blank = off — there is no default, because a default would either find nothing or recursively scan something large on every endpoint."
          multiline
          minRows={2}
          maxRows={6}
          placeholder={"/etc/ssl/certs\n/etc/nginx/ssl\nC:\\inetpub\\certs"}
          sx={{ mb: 2.5, "& textarea": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: TEXT.sm } }}
        />

        <FormControlLabel
          disabled={readOnly}
          control={
            <Switch
              size="small"
              checked={scanListeners}
              onChange={(e) => setField("scanTlsListeners", e.target.checked)}
            />
          }
          label={
            <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark }}>
              Probe local TLS services
            </Typography>
          }
        />
        <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mt: 0.5 }}>
          Captures the certificate each service <strong>actually serves</strong>, which can
          differ from anything in a store — a service pinned to an old file, or never
          reloaded after renewal. This is what makes <strong>chain validation</strong> and
          <strong> &ldquo;which process serves this certificate&rdquo;</strong> possible;
          without it both stay empty.
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mt: 0.75 }}>
          Every probe goes to <code>127.0.0.1</code> — nothing leaves the host and no remote
          service is touched. The socket closes the moment the handshake yields a
          certificate, so not one byte of application protocol is ever written. Ports whose
          protocols react badly to a stray <code>ClientHello</code> (SSH, SMTP, MySQL,
          PostgreSQL and others) are never probed.
        </Typography>

        <Collapse in={scanListeners}>
          <TextField
            size="small"
            label="Limit to ports (optional)"
            value={cdp.tlsListenerPorts ?? ""}
            onChange={(e) => setField("tlsListenerPorts", e.target.value)}
            disabled={readOnly}
            error={badPorts.length > 0 || portsOverCap}
            helperText={portsHelp}
            placeholder="443, 8443, 9443"
            sx={{ mt: 1.5, width: { xs: "100%", md: 360 } }}
          />
        </Collapse>
      </Box>
    </Box>
  );
}
