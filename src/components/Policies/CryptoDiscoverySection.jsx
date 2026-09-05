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
  Button,
  Collapse,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { invalidProbeTargets, splitTargetLines, CDP_PROBE_TARGETS_MAX } from "./policyTransforms";
import { listCdpProbeCandidates } from "../../api/cdp";
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
  const badTargets = invalidProbeTargets(cdp.probeTargets ?? "");
  const targetLines = splitTargetLines(cdp.probeTargets ?? "");
  const targetCount = targetLines.length;

  // §5.2: candidatos descubiertos por los agentes (conexiones salientes a
  // servicios TLS internos). Solo se PROPONEN; nada se sonda hasta que el
  // operador lo añade a la lista. Se cargan al montar; un fallo deja la
  // lista vacía con su motivo, no una sección en blanco.
  const [candidates, setCandidates] = React.useState(null);
  const [candidatesError, setCandidatesError] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    listCdpProbeCandidates({ limit: 100 })
      .then((r) => alive && setCandidates(r?.candidates ?? []))
      .catch((e) => alive && setCandidatesError(e?.message || String(e)));
    return () => {
      alive = false;
    };
  }, []);
  const targetSet = new Set(targetLines.map((t) => t.toLowerCase()));
  const addTarget = (target) => {
    if (targetSet.has(target.toLowerCase())) return;
    const cur = String(cdp.probeTargets ?? "").trim();
    setField("probeTargets", cur ? `${cur}\n${target}` : target);
  };
  const targetsOverCap = targetCount > CDP_PROBE_TARGETS_MAX;
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

        <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark, mt: 2.5 }}>
          Probe remote TLS services (no agent needed)
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 1 }}>
          Devices running this policy connect to each <code>host:port</code> below, record the
          certificate it serves and what the handshake <strong>negotiates</strong> — protocol,
          cipher suite and whether the server accepts a <strong>post-quantum key exchange</strong>
          (X25519MLKEM768). That is the half of post-quantum readiness with real urgency, and it
          lives in the handshake, not in the certificate. Load balancers, appliances, managed
          databases, hypervisors: anything with TLS and no agent.
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 1 }}>
          Only what you list is probed. The socket closes the moment the handshake completes; no
          application bytes are ever sent. Loopback targets are rejected: the local probe above
          already covers them, with process attribution. Ports that start in clear text (SMTP, IMAP,
          POP3, LDAP, PostgreSQL, MySQL) are negotiated with their own StartTLS preamble.
        </Typography>
        <TextField
          size="small"
          fullWidth
          label="Targets (optional)"
          value={cdp.probeTargets ?? ""}
          onChange={(e) => setField("probeTargets", e.target.value)}
          disabled={readOnly}
          error={badTargets.length > 0 || targetsOverCap}
          helperText={
            badTargets.length > 0
              ? `Not a valid host:port — ${badTargets.slice(0, 3).join(", ")}${badTargets.length > 3 ? "…" : ""}`
              : targetsOverCap
                ? `At most ${CDP_PROBE_TARGETS_MAX} targets.`
                : `One host:port per line. ${targetCount} target(s).`
          }
          multiline
          minRows={2}
          maxRows={8}
          placeholder={"lb.corp.example:443\nvcenter.corp.example:443\n10.0.0.12:636"}
          sx={{ "& textarea": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: TEXT.sm } }}
        />

        {/*
          §5.2 — lo que los agentes ya ven: servicios TLS internos con los
          que sus equipos hablan. Se ofrecen para promover a objetivo con un
          clic; nunca se sondean solos. Los que ya están en la lista salen
          marcados, y los que ya se sondan también.
        */}
        <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark, mt: 2 }}>
          Discovered internal TLS services
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 1 }}>
          Endpoints on private addresses that devices running the local probe connect to (established
          outbound connections, last 14 days). Add the ones you want probed; nothing here is probed on
          its own.
        </Typography>
        {candidatesError ? (
          <Typography variant="caption" sx={{ color: BRAND.alert.errorText, display: "block" }}>
            Couldn&apos;t load discovered services: {candidatesError}
          </Typography>
        ) : candidates === null ? (
          <Typography variant="caption" sx={{ color: BRAND.gray }}>Loading…</Typography>
        ) : candidates.length === 0 ? (
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            Nothing discovered yet. Devices report candidates once the local TLS probe is on and they
            have talked to an internal TLS service.
          </Typography>
        ) : (
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: TEXT.sm }}>
            <Box component="thead">
              <Box component="tr" sx={{ textAlign: "left", color: BRAND.gray }}>
                <Box component="th" sx={{ py: 0.5 }}>Service</Box>
                <Box component="th">Devices</Box>
                <Box component="th">Connections</Box>
                <Box component="th">Seen from</Box>
                <Box component="th" />
              </Box>
            </Box>
            <Box component="tbody">
              {candidates.map((c) => {
                const listed = targetSet.has(c.target.toLowerCase());
                return (
                  <Box component="tr" key={c.target} sx={{ borderTop: `1px solid ${BRAND.border}` }}>
                    <Box component="td" sx={{ py: 0.5, fontFamily: "ui-monospace, Menlo, monospace" }}>{c.target}</Box>
                    <Box component="td">{c.devices}</Box>
                    <Box component="td">{c.connections}</Box>
                    <Box component="td" sx={{ color: BRAND.gray }}>{(c.processes ?? []).join(", ") || "—"}</Box>
                    <Box component="td" sx={{ textAlign: "right" }}>
                      {listed ? (
                        <Typography variant="caption" sx={{ color: BRAND.tealText, fontWeight: 700 }}>{c.probed ? "probed" : "listed"}</Typography>
                      ) : (
                        <Button size="small" variant="outlined" disabled={readOnly || targetsOverCap} onClick={() => addTarget(c.target)} aria-label={`Add ${c.target} to probe targets`}>
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

      <Box sx={{ mt: 3, pt: 2, borderTop: `1px dashed ${BRAND.border}` }}>
        <FormControlLabel
          disabled={readOnly}
          control={
            <Switch
              size="small"
              checked={cdp.adcsEnabled === true}
              onChange={(e) => setField("adcsEnabled", e.target.checked)}
              inputProps={{ "aria-label": "Read Active Directory Certificate Services issuance" }}
            />
          }
          label={
            <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark }}>
              Read Active Directory Certificate Services (AD CS) issuance
            </Typography>
          }
        />
        <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mt: 0.5 }}>
          Only acts on a device that holds the <strong>Certification Authority</strong> role; on any
          other device the agent asks, learns it is not a CA, and runs nothing. On a CA it reads the
          issuance database incrementally (<code>certutil -view</code>, read-only) and reports what the
          CA issued — including certificates that never landed on a device with an agent — and the
          <strong> template</strong> each one came from. Findings appear under{" "}
          <em>Explore → Imported inventories</em> as source <code>adcs:&lt;CA name&gt;</code>, never mixed
          into the CA server&rsquo;s own certificate list.
        </Typography>
      </Box>
    </Box>
  );
}
