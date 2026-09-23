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
import { BRAND, ICON, TEXT, TEXT_MUTED } from "../../theme/brand";
import { getCdpCertificateDetail } from "../../api/cdp";
import {
  ENDPOINT_SOURCE,
  endpointAddress,
  endpointSourceLabel,
  readEndpoints,
  summarizeEndpoints
} from "./certEndpoints";
import { chainFacts, chainNotAsserted, keyExportableState, keyStorageState } from "./certKeyStorage";

const FAMILY_LABEL = {
  quantum_broken: { text: "Quantum-broken", tone: "warn" },
  pq_safe: { text: "Post-quantum safe", tone: "good" },
  hybrid: { text: "Hybrid", tone: "good" },
  unknown: { text: "Unclassified", tone: "muted" },
};

function Field({ label, children, mono }) {
  return (
    <Box sx={{ mb: 1.25 }}>
      <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, fontWeight: 700, letterSpacing: 0.4 }}>
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
      <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, fontStyle: "italic" }}>
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
              color: ok ? BRAND.alert.successText : BRAND.alert.errorText,
              fontWeight: 700,
              fontSize: TEXT.xs,
            }}
          />
        </Tooltip>
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
          {tls.chainDepth} certificate{tls.chainDepth === 1 ? "" : "s"} sent
        </Typography>
      </Stack>
      {tls.coversDeviceHostname === false && (
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
          Does not cover this device&apos;s own hostname — normal for a proxy or virtual host,
          worth a look for a service that should present its own name.
        </Typography>
      )}
    </Box>
  );
}

/**
 * Ola 1.2 — dónde se sirve este certificado, extremo a extremo.
 *
 * No es lo mismo que «en N equipos»: eso es dónde ESTÁ GUARDADO. Esto es
 * dónde CONTESTA, que es la pregunta que se hace quien lo va a reemplazar.
 *
 * ⚠️ Dos cosas que la vista no puede confundir, y que por eso decide
 * `certEndpoints.js` y no este componente:
 *   · un extremo sin SNI no es un hueco: es lo que sirve la IP desnuda;
 *   · `kemHybrid: null` es «no se determinó», nunca «clásico».
 */
function EndpointsSection({ endpoints }) {
  const rows = React.useMemo(() => readEndpoints(endpoints), [endpoints]);
  // Sin el campo (backend anterior a la ola 1.2, o un tenant sin la
  // migración 20261023) la sección no se pinta: un «0 extremos» se leería
  // como «no se sirve en ninguna parte», que es lo contrario de no saberlo.
  if (!Array.isArray(endpoints)) return null;
  const summary = summarizeEndpoints(rows);

  return (
    <>
      <SectionHeading>Served at {summary.total} endpoint(s)</SectionHeading>
      {rows.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
          No live endpoint serves this certificate. It is in a store, but nothing was caught answering with it.
        </Typography>
      ) : (
        <>
          {summary.swept > 0 || summary.defaultSni > 0 ? (
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mb: 0.5 }}>
              {summary.swept > 0 ? `${summary.swept} found by a range sweep — nobody listed those hosts. ` : ""}
              {summary.defaultSni > 0 ? `${summary.defaultSni} served with no SNI: that is what the bare address answers with.` : ""}
            </Typography>
          ) : null}
          <Stack divider={<Divider />} spacing={0}>
            {rows.map((e, i) => (
              <Box key={`${e.agentId}-${e.targetHost}-${e.port}-${i}`} sx={{ py: 1.25 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5 }}>
                  <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, wordBreak: "break-all" }}>
                    {endpointAddress(e)}
                  </Typography>
                  <Tooltip arrow title={ENDPOINT_SOURCE[e.source]?.hint ?? ""}>
                    <Chip
                      size="small"
                      label={endpointSourceLabel(e.source)}
                      sx={{ height: 20, fontSize: TEXT.xs, bgcolor: BRAND.surfaceMuted, color: TEXT_MUTED }}
                    />
                  </Tooltip>
                  <Tooltip arrow title={e.discovery.hint}>
                    <Chip
                      size="small"
                      label={e.discovery.label}
                      sx={{
                        height: 20,
                        fontSize: TEXT.xs,
                        fontWeight: e.discovery.state === "sweep" ? 700 : 400,
                        // Lo que apareció solo se destaca; no es un fallo, así
                        // que ámbar de aviso y no rojo.
                        bgcolor: e.discovery.state === "sweep" ? BRAND.alert.warningSoft : BRAND.surfaceMuted,
                        color: e.discovery.state === "sweep" ? BRAND.alert.warningText : TEXT_MUTED
                      }}
                    />
                  </Tooltip>
                </Stack>

                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5, alignItems: "center" }}>
                  <Tooltip arrow title={e.sni.hint}>
                    <Chip
                      size="small"
                      label={`SNI: ${e.sni.label}`}
                      sx={{
                        height: 20,
                        fontSize: TEXT.xs,
                        fontFamily: e.sni.state === "named" ? "ui-monospace, Menlo, monospace" : undefined,
                        // «Sin SNI» se distingue de un nombre pedido, pero no
                        // se pinta como un problema: es un hecho medido.
                        bgcolor: e.sni.state === "named" ? BRAND.tealSoft : BRAND.surfaceMuted,
                        color: e.sni.state === "named" ? BRAND.tealText : TEXT_MUTED,
                        fontStyle: e.sni.state === "named" ? undefined : "italic"
                      }}
                    />
                  </Tooltip>
                  <Tooltip arrow title={e.kem.hint}>
                    <Chip
                      size="small"
                      label={e.kem.label}
                      sx={{
                        height: 20,
                        fontSize: TEXT.xs,
                        bgcolor:
                          e.kem.tone === "good"
                            ? BRAND.alert.successSoft
                            : e.kem.tone === "warn"
                              ? BRAND.alert.warningSoft
                              : BRAND.surfaceMuted,
                        color:
                          e.kem.tone === "good"
                            ? BRAND.alert.successText
                            : e.kem.tone === "warn"
                              ? BRAND.alert.warningText
                              : TEXT_MUTED
                      }}
                    />
                  </Tooltip>
                </Stack>

                <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5, wordBreak: "break-all" }}>
                  {[e.protocol, e.cipher, e.kexGroup].filter(Boolean).join(" · ") || "handshake details not recorded"}
                  {e.lastSeen ? ` · last seen ${formatDate(e.lastSeen)}` : ""}
                </Typography>
              </Box>
            ))}
          </Stack>
        </>
      )}
    </>
  );
}

/** Relleno por tono. ROLE.* rellena; BRAND.alert.*Text escribe. */
const FACT_TONE = {
  good: { bg: BRAND.alert.successSoft, fg: BRAND.alert.successText },
  warn: { bg: BRAND.alert.warningSoft, fg: BRAND.alert.warningText },
  bad: { bg: BRAND.alert.errorSoft, fg: BRAND.alert.errorText },
  // Lo no afirmado en gris: ni verde («bien») ni rojo («hallazgo»).
  neutral: { bg: BRAND.surfaceMuted, fg: TEXT_MUTED }
};

function FactChip({ tone = "neutral", label, hint, bold }) {
  const t = FACT_TONE[tone] ?? FACT_TONE.neutral;
  return (
    <Tooltip arrow title={hint ?? ""}>
      <Chip
        size="small"
        label={label}
        sx={{ height: 20, fontSize: TEXT.xs, fontWeight: bold ? 700 : 400, bgcolor: t.bg, color: t.fg }}
      />
    </Tooltip>
  );
}

/**
 * Ola 1.1 — dónde vive la clave privada de este equipo y si puede salir.
 *
 * Sólo cuando hay clave privada: sin ella el backend ni siquiera escribe
 * los campos, y preguntarlo no significa nada.
 */
function KeyHoldingChips({ device }) {
  if (device?.hasPrivateKey !== true) return null;
  const exportable = keyExportableState(device.keyExportable);
  const storage = keyStorageState(device.keyStorage);
  return (
    <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: "wrap", gap: 0.5 }}>
      <FactChip tone={storage.tone} label={storage.label} hint={storage.hint} />
      <FactChip tone={exportable.tone} label={exportable.label} hint={exportable.hint} />
    </Stack>
  );
}

/**
 * Ola 1.1 — lo que se sabe de la cadena en el ALMACÉN de este equipo (no
 * en el handshake: eso es `ChainSummary`).
 *
 * ⚠️ «No llega a una raíz de confianza» NO se pinta como hallazgo. En
 * Windows el almacén de raíces se rellena bajo demanda y eso se arregla
 * solo; el backend tampoco emite bandera para ello. Aquí va en gris, con la
 * explicación al lado.
 */
function StoredChainFacts({ chain }) {
  const facts = chainFacts(chain);
  // Sin `chain` no se pinta nada: un extremo de red nunca lo trae, y una
  // fila vacía se leería como «se miró y no hay nada que decir».
  if (!facts || facts.length === 0) return null;
  const notAsserted = chainNotAsserted(chain);
  return (
    <Box sx={{ mt: 0.75 }}>
      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
        {facts.map((f) => (
          <FactChip key={f.key} tone={f.tone} label={f.label} hint={f.hint} bold={f.tone === "bad"} />
        ))}
      </Stack>
      {notAsserted.length > 0 ? (
        // ⚠️ `signatureValid`/`trusted` son claves OPCIONALES: ausentes
        // significa que el agente no se pronunció. Callarlo dejaría creer
        // que lo que no se ve es que está bien.
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
          The agent did not report {notAsserted.join(" or ")} for this store — not asserted, which is not the same as
          a negative answer.
        </Typography>
      ) : null}
    </Box>
  );
}

/** `revocation_source` del backend: 'crl' u 'ocsp' (ola 1.7). */
const REVOCATION_SOURCE = { crl: "CRL", ocsp: "OCSP" };

function RevocationChip({ revocation }) {
  if (!revocation?.status) {
    return (
      <Tooltip arrow title="No revocation check has run for this certificate. Not the same as 'good'.">
        <Chip
          size="small"
          label="revocation not checked"
          sx={{ bgcolor: BRAND.surfaceMuted, color: TEXT_MUTED, fontWeight: 600, fontSize: TEXT.xs }}
        />
      </Tooltip>
    );
  }
  // ⚠️ Tres estados, no dos. `unknown` = se preguntó y no hubo veredicto
  // fiable (la CRL no bajó, el OCSP no respondió o su firma no verificó).
  // Se pintaba «not revoked» en verde —todo lo que no era `revoked` lo era—,
  // que es justo la afirmación que no se pudo hacer.
  const status = revocation.status;
  const source = REVOCATION_SOURCE[revocation.source] ?? revocation.source ?? null;
  const meta =
    status === "revoked"
      ? { label: "REVOKED", bg: BRAND.alert.errorSoft, fg: BRAND.alert.errorText }
      : status === "good"
        ? { label: "not revoked", bg: BRAND.alert.successSoft, fg: BRAND.alert.successText }
        : { label: "revocation could not be verified", bg: BRAND.alert.warningSoft, fg: BRAND.alert.warningText };
  const tip =
    status === "good" || status === "revoked"
      ? `Checked ${formatDate(revocation.checkedAt)}${source ? ` via ${source}` : ""}`
      : `Last attempt ${formatDate(revocation.checkedAt)}${source ? ` via ${source}` : ""}: no trustworthy answer. Not the same as 'good'.`;
  return (
    <Tooltip arrow title={tip}>
      <Chip
        size="small"
        // La fuente en la propia etiqueta: CRL y OCSP no dicen lo mismo con
        // la misma frescura, y en la ficha se compara entre equipos.
        label={source ? `${meta.label} · ${source}` : meta.label}
        sx={{ bgcolor: meta.bg, color: meta.fg, fontWeight: 700, fontSize: TEXT.xs }}
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
      <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, mb: 1 }}>
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
              color: family.tone === "good" ? BRAND.alert.successText : BRAND.alert.warningText,
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

      {/* ── Mitad post-cuántica de un certificado híbrido "catalyst" ──
          Sección propia y NO un chip más en Cryptography, porque son dos
          hechos distintos: arriba se dice qué protege este certificado
          hoy (su mitad clásica, quantum-broken), aquí qué DECLARA además.

          Sólo aparece cuando el certificado es catalyst. Hoy eso es 0 de
          10.277 en toda la flota: la sección existe para el día que deje
          de serlo, y su ausencia es la respuesta correcta mientras tanto. */}
      {detail.hybrid && (
        <>
          <SectionHeading>Hybrid (catalyst)</SectionHeading>
          <Box
            sx={{
              border: `1px solid ${BRAND.alert.warningSoft}`,
              borderLeft: `3px solid ${BRAND.alert.warning}`,
              borderRadius: 1,
              bgcolor: BRAND.alert.warningSoft,
              p: 1.25,
              mb: 1.5,
            }}
          >
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, lineHeight: 1.55 }}>
              This certificate <strong>declares</strong> a second, post-quantum key and
              signature in non-critical X.509 extensions. <strong>Nobody has verified
              them</strong> — not us, and almost certainly not the stacks that validate
              this certificate: they treat these extensions as optional and ignore them.
              What protects this certificate today is its classical half, above.
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5, mb: 1 }}>
            {[
              { label: "Alt signature", oid: detail.hybrid.altSignatureOid, fam: detail.hybrid.altSigFamily },
              { label: "Alt key", oid: detail.hybrid.altPublicKeyOid, fam: detail.hybrid.altKeyFamily },
            ]
              .filter((x) => x.oid)
              .map((x) => {
                const fam = FAMILY_LABEL[x.fam] ?? FAMILY_LABEL.unknown;
                return (
                  <Tooltip key={x.label} arrow title={`${x.label} algorithm OID: ${x.oid}`}>
                    <Chip
                      size="small"
                      label={`${x.label}: ${fam.text}`}
                      sx={{
                        bgcolor: BRAND.surfaceMuted,
                        color: BRAND.dark,
                        fontWeight: 700,
                        fontSize: TEXT.xs,
                      }}
                    />
                  </Tooltip>
                );
              })}
          </Stack>
          {/* El OID crudo se enseña siempre, igual que en Cryptography: un
              algoritmo que el catálogo aún no nombra —composite, hoy sin
              OID asignado en firme— sigue siendo inspeccionable en vez de
              aparecer como un hueco. */}
          {detail.hybrid.altSignatureOid && (
            <Field label="Alt signature algorithm (OID)" mono>
              {detail.hybrid.altSignatureOid}
            </Field>
          )}
          {detail.hybrid.altPublicKeyOid && (
            <Field label="Alt public key algorithm (OID)" mono>
              {detail.hybrid.altPublicKeyOid}
            </Field>
          )}
          {/* La firma alternativa puede venir sin un algoritmo legible, y
              eso NO lo hace menos híbrido. Decir "no hay nada" ahí sería
              el falso negativo que este trabajo vino a cerrar. */}
          {detail.hybrid.altSignatureDeclared && !detail.hybrid.altSignatureOid && (
            <Field label="Alt signature">
              Present, but its algorithm could not be read
            </Field>
          )}
        </>
      )}

      <EndpointsSection endpoints={detail.endpoints} />

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
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
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

            <KeyHoldingChips device={device} />
            <StoredChainFacts chain={device.chain} />

            <ChainSummary tls={device.tls} />

            {device.tls?.process && (
              <Box sx={{ mt: 1 }}>
                <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, fontWeight: 700, letterSpacing: 0.4 }}>
                  SERVED BY
                </Typography>
                <Typography sx={{ fontSize: TEXT.sm, wordBreak: "break-all" }}>
                  {device.tls.process.name} (pid {device.tls.process.pid})
                </Typography>
                {device.tls.process.path && (
                  <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, wordBreak: "break-all" }}>
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
