// src/components/CryptoDiscovery/CertificateDetailDrawer.jsx
//
// Everything ADR-0004 fase 1 collected, in the one place an operator
// looks when they ask "what IS this certificate, and whose is it?".
//
// Until now none of it had a surface: attribution, the TLS chain verdict
// and the revocation status all shipped in GET /cdp/certificates/:fp and
// were never rendered. The list answers "which certificates"; this
// answers "and what do I do about this one".
//
// The per-device section is the point. A certificate is not one thing —
// it is the same bytes sitting in N places, and the interesting
// differences (who serves it, whether that host trusts its own chain,
// whether the private key is there) are per-device.

import * as React from "react";
import { Box, Chip, CircularProgress, Divider, Stack, Tooltip, Typography } from "@mui/material";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import { BRAND, ICON, TEXT } from "../../theme/brand";
import { getCdpCertificateDetail } from "../../api/cdp";

const FAMILY_LABEL = {
  quantum_broken: { text: "Quantum-broken", tone: "warn" },
  pq_safe: { text: "Post-quantum safe", tone: "good" },
  hybrid: { text: "Hybrid", tone: "good" },
  unknown: { text: "Unclassified", tone: "muted" },
};

function Field({ label, children, mono }) {
  return (
    <Box sx={{ mb: 1.25 }}>
      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontWeight: 700, letterSpacing: 0.4 }}>
        {label.toUpperCase()}
      </Typography>
      <Typography
        sx={{
          fontSize: TEXT.sm,
          color: BRAND.dark,
          wordBreak: "break-all",
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
        }}
      >
        {children ?? "—"}
      </Typography>
    </Box>
  );
}

function SectionHeading({ children }) {
  return (
    <Typography
      variant="overline"
      sx={{ color: BRAND.dark, fontWeight: 800, letterSpacing: 1.1, display: "block", mt: 2 }}
    >
      {children}
    </Typography>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/** Owner attribution — deliberately shows its own confidence. */
function OwnerChips({ owners }) {
  if (!Array.isArray(owners) || owners.length === 0) {
    return (
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, fontStyle: "italic" }}>
        No matching application found. That is an honest answer, not a failure — a wrong
        owner sends someone to renew a certificate that is not theirs.
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
      {owners.map((owner) => (
        <Tooltip
          key={`${owner.appName}-${owner.confidence}`}
          arrow
          title={
            owner.confidence === "path"
              ? `The executable lives under ${owner.installLocation}. Unambiguous.`
              : "The application's name appears in the executable's path. A strong hint, not proof."
          }
        >
          <Chip
            size="small"
            label={`${owner.appName}${owner.version ? ` ${owner.version}` : ""}${
              owner.confidence === "name" ? " (likely)" : ""
            }`}
            sx={{
              bgcolor: owner.confidence === "path" ? BRAND.tealSoftStrong : BRAND.surfaceMuted,
              color: BRAND.tealText,
              fontWeight: 700,
              fontSize: TEXT.xs,
            }}
          />
        </Tooltip>
      ))}
    </Stack>
  );
}

/** The live-handshake verdict for a served certificate. */
function ChainSummary({ tls }) {
  if (!tls) return null;
  const ok = tls.chainAuthorized === true;
  return (
    <Box sx={{ mt: 0.75 }}>
      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5, alignItems: "center" }}>
        <Chip
          size="small"
          label={`tcp/${tls.port}`}
          sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.dark, fontWeight: 700, fontSize: TEXT.xs }}
        />
        <Tooltip
          arrow
          title={
            ok
              ? "This device's own trust store accepts the chain the service serves."
              : `The device's trust store rejected the chain: ${tls.chainError ?? "unknown"}`
          }
        >
          <Chip
            size="small"
            // Short on purpose: the OpenSSL code is in the tooltip, and the
            // hygiene flag beside it already names the finding. A chip
            // reading "chain: UNABLE_TO_VERIFY_LEAF_SIGNATURE" next to a
            // `chain_incomplete` flag says the same thing twice, at width.
            label={ok ? "chain trusted" : "chain rejected"}
            sx={{
              bgcolor: ok ? BRAND.alert.successSoft : BRAND.alert.errorSoft,
              color: ok ? BRAND.alert.success : BRAND.alert.error,
              fontWeight: 700,
              fontSize: TEXT.xs,
            }}
          />
        </Tooltip>
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
          {tls.chainDepth} certificate{tls.chainDepth === 1 ? "" : "s"} sent
        </Typography>
      </Stack>
      {tls.coversDeviceHostname === false && (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 0.5 }}>
          Does not cover this device&apos;s own hostname — normal for a proxy or virtual host,
          worth a look for a service that should present its own name.
        </Typography>
      )}
    </Box>
  );
}

function RevocationChip({ revocation }) {
  if (!revocation?.status) {
    return (
      <Tooltip arrow title="No revocation check has run for this certificate. Not the same as 'good'.">
        <Chip
          size="small"
          label="revocation not checked"
          sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.gray, fontWeight: 600, fontSize: TEXT.xs }}
        />
      </Tooltip>
    );
  }
  const revoked = revocation.status === "revoked";
  return (
    <Tooltip arrow title={`Checked ${formatDate(revocation.checkedAt)} via ${revocation.source ?? "?"}`}>
      <Chip
        size="small"
        label={revoked ? "REVOKED" : "not revoked"}
        sx={{
          bgcolor: revoked ? BRAND.alert.errorSoft : BRAND.alert.successSoft,
          color: revoked ? BRAND.alert.error : BRAND.alert.success,
          fontWeight: 700,
          fontSize: TEXT.xs,
        }}
      />
    </Tooltip>
  );
}

export default function CertificateDetailDrawer({
  fingerprint,
  flagLabels = {},
  /** Pre-fetched detail. Lets a caller (or a test) supply the payload
   *  instead of hitting the API — the component is otherwise only
   *  reachable through an authenticated dashboard. */
  initialDetail = null,
}) {
  const [detail, setDetail] = React.useState(initialDetail);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (initialDetail) return undefined;
    let alive = true;
    setDetail(null);
    setError(null);
    getCdpCertificateDetail(fingerprint)
      .then((resp) => alive && setDetail(resp?.certificate ?? null))
      .catch((err) => alive && setError(err?.message || String(err)));
    return () => {
      alive = false;
    };
  }, [fingerprint, initialDetail]);

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error" sx={{ fontSize: TEXT.md }}>
          Failed to load certificate: {error}
        </Typography>
      </Box>
    );
  }

  if (!detail) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress size={22} sx={{ color: BRAND.teal }} />
      </Stack>
    );
  }

  const family = FAMILY_LABEL[detail.keyFamily] ?? FAMILY_LABEL.unknown;

  return (
    <Box sx={{ p: 2, pt: 0, overflowY: "auto" }}>
      <Typography sx={{ fontWeight: 800, fontSize: TEXT.lg, color: BRAND.dark, wordBreak: "break-word" }}>
        {detail.subjectCN || `${detail.fingerprint256?.slice(0, 24)}…`}
      </Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1 }}>
        issued by {detail.issuerCN || "unknown issuer"}
      </Typography>

      <SectionHeading>Validity</SectionHeading>
      <Stack direction="row" spacing={3}>
        <Field label="Not before">{formatDate(detail.notBefore)}</Field>
        <Field label="Not after">{formatDate(detail.notAfter)}</Field>
      </Stack>

      <SectionHeading>Cryptography</SectionHeading>
      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5, mb: 1 }}>
        <Chip
          size="small"
          label={[detail.keyAlgorithm, detail.keySizeBits].filter(Boolean).join(" ")}
          sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.dark, fontWeight: 700, fontSize: TEXT.xs }}
        />
        <Tooltip
          arrow
          title="Whether this algorithm survives a cryptographically relevant quantum computer. A statement about migration deadlines, not about the certificate being unsafe today."
        >
          <Chip
            size="small"
            label={family.text}
            sx={{
              bgcolor: family.tone === "good" ? BRAND.alert.successSoft : BRAND.alert.warningSoft,
              color: family.tone === "good" ? BRAND.alert.success : BRAND.alert.warningText,
              fontWeight: 700,
              fontSize: TEXT.xs,
            }}
          />
        </Tooltip>
      </Stack>
      <Field label="Signature">{detail.signatureAlgorithm}</Field>
      <Field label="Public key hash (pin-sha256)" mono>
        {detail.publicKeyHash}
      </Field>
      <Field label="Fingerprint (SHA-256)" mono>
        {detail.fingerprint256}
      </Field>
      {detail.san?.length > 0 && <Field label="Subject alternative names">{detail.san.join(", ")}</Field>}

      <SectionHeading>On {detail.devices?.length ?? 0} device(s)</SectionHeading>
      <Stack divider={<Divider />} spacing={0}>
        {(detail.devices ?? []).map((device) => (
          <Box key={device.agentId} sx={{ py: 1.5 }}>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              {device.hasPrivateKey && (
                <Tooltip arrow title="This device holds the private key — you renew this one">
                  <KeyOutlinedIcon sx={{ fontSize: ICON.sm, color: BRAND.tealText }} />
                </Tooltip>
              )}
              <Typography sx={{ fontSize: TEXT.md, fontWeight: 700 }}>
                {device.host || device.agentId}
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
              {device.storeName} · {device.storeScope}
            </Typography>

            <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: "wrap", gap: 0.5 }}>
              <RevocationChip revocation={device.revocation} />
              {(device.flags ?? []).map((flag) => (
                <Tooltip key={flag} arrow title={flagLabels[flag] ?? flag}>
                  <Chip
                    size="small"
                    label={flag}
                    sx={{
                      bgcolor: BRAND.alert.highSoft,
                      color: BRAND.alert.high,
                      fontWeight: 700,
                      fontSize: TEXT.xs,
                    }}
                  />
                </Tooltip>
              ))}
            </Stack>

            <ChainSummary tls={device.tls} />

            {device.tls?.process && (
              <Box sx={{ mt: 1 }}>
                <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontWeight: 700, letterSpacing: 0.4 }}>
                  SERVED BY
                </Typography>
                <Typography sx={{ fontSize: TEXT.sm, wordBreak: "break-all" }}>
                  {device.tls.process.name} (pid {device.tls.process.pid})
                </Typography>
                {device.tls.process.path && (
                  <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, wordBreak: "break-all" }}>
                    {device.tls.process.path}
                  </Typography>
                )}
                <Box sx={{ mt: 0.75 }}>
                  <OwnerChips owners={device.owners} />
                </Box>
              </Box>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
