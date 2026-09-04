// src/components/CryptoDiscovery/CbomAssetsPanel.jsx
//
// Fase 4: activos criptográficos que NO vienen de un agente. Un CBOM
// CycloneDX importado — de un escáner de código, de una imagen de
// contenedor, de otro inventario. Vive en Explore porque «dónde viven»
// es la pregunta, y aquí la respuesta es «en un sitio sin agente».
//
// Lo importado se enseña siempre con su origen y nunca mezclado con lo
// que un agente vio con sus propios ojos: un CBOM es una afirmación de
// quien lo produjo. Lo único que cruza con la flota es la huella.

import * as React from "react";
import { Alert, Box, Button, Chip, Stack, TextField, Typography } from "@mui/material";
import SectionPaper from "../common/SectionPaper";
import { BRAND, TEXT } from "../../theme/brand";
import { getCryptoAssetsSummary, importCdpCbom, listCryptoAssets } from "../../api/cdp";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
const TYPE_LABEL = {
  certificate: "Certificates",
  algorithm: "Algorithms",
  "related-crypto-material": "Keys & material",
  protocol: "Protocols",
  library: "Libraries",
  unknown: "Unclassified"
};
const FAMILY_LABEL = { quantum_broken: "quantum-broken", pq_safe: "post-quantum", hybrid: "hybrid", unknown: "unclassified" };

export function CbomImportForm({ onImported }) {
  const [sourceName, setSourceName] = React.useState("");
  const [file, setFile] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      let doc;
      try {
        doc = JSON.parse(text);
      } catch {
        throw new Error("The file is not valid JSON");
      }
      const r = await importCdpCbom(sourceName.trim(), doc);
      if (!r?.ok) throw new Error(r?.message || r?.error || "Import failed");
      setResult(r);
      onImported?.(r);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
        <TextField
          size="small"
          label="Source (which scanner or pipeline)"
          value={sourceName}
          onChange={(e) => setSourceName(e.target.value)}
          placeholder="cbomkit · trivy · ci/main"
          sx={{ minWidth: 260 }}
        />
        <Button component="label" size="small" variant="outlined">
          {file ? file.name : "Choose CycloneDX JSON"}
          <input hidden type="file" accept=".json,application/json" aria-label="CycloneDX file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Button>
        <Button size="small" variant="contained" disabled={busy || !file || sourceName.trim().length < 2} onClick={submit}>
          {busy ? "Importing…" : "Import"}
        </Button>
      </Stack>
      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 0.5 }}>
        Each import is a full picture for its source: assets missing from the next import of the same source are
        retired. Nothing here is verified — it is what the producer declared.
      </Typography>
      {error ? <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert> : null}
      {result ? (
        <Alert severity={result.problems?.length ? "warning" : "success"} sx={{ mt: 1 }}>
          Imported {fmt(result.accepted)} crypto asset(s) from {fmt(result.components)} component(s)
          {result.skipped ? ` (${fmt(result.skipped)} non-crypto skipped)` : ""}
          {result.removed ? ` · ${fmt(result.removed)} retired` : ""}
          {" · "}
          {fmt(result.matchedFleetCertificates)} certificate(s) also seen on your devices.
          {result.problems?.length ? ` Problems: ${result.problems.join(", ")}.` : ""}
        </Alert>
      ) : null}
    </Box>
  );
}

export default function CbomAssetsPanel({ refreshNonce, onSelect }) {
  const [summary, setSummary] = React.useState(null);
  const [items, setItems] = React.useState([]);
  const [source, setSource] = React.useState("");
  const [error, setError] = React.useState(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([getCryptoAssetsSummary(), listCryptoAssets({ sourceName: source || undefined, limit: 200 })])
      .then(([s, l]) => {
        if (!alive) return;
        setSummary(s ?? null);
        setItems(l?.items ?? []);
      })
      .catch((e) => alive && setError(e?.message || String(e)));
    return () => {
      alive = false;
    };
  }, [refreshNonce, nonce, source]);

  const total = (summary?.sources ?? []).reduce((s, x) => s + x.assets, 0);

  return (
    <SectionPaper>
      <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark, mb: 0.5 }}>Imported inventories</Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8, mb: 1.5 }}>
        Crypto assets from places without an agent: CycloneDX 1.6 files from code scanners, container
        images or other inventories, and what an <strong>AD CS</strong> Certification Authority reports it
        issued (source <code>adcs:&lt;CA&gt;</code>, enabled per policy). Shown by source, never mixed
        with what agents saw on devices.
      </Typography>
      <CbomImportForm onImported={() => setNonce((n) => n + 1)} />
      {error ? <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert> : null}

      {summary && total === 0 ? (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          Nothing imported yet. Export this tenant&apos;s own CBOM from Reports and import it here to see the round trip, or
          point a scanner at a repository.
        </Alert>
      ) : null}

      {summary && total > 0 ? (
        <>
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1 }}>
            <Chip size="small" label={`All sources · ${fmt(total)}`} onClick={() => setSource("")} variant={source ? "outlined" : "filled"} />
            {summary.sources.map((s) => (
              <Chip key={s.sourceName} size="small" label={`${s.sourceName} · ${fmt(s.assets)}`} onClick={() => setSource(s.sourceName)} variant={source === s.sourceName ? "filled" : "outlined"} />
            ))}
          </Stack>
          <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.5 }}>
            {summary.byType.map((t) => (
              <Typography key={`${t.assetType}:${t.family}`} sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
                {TYPE_LABEL[t.assetType] ?? t.assetType}
                {t.family ? ` (${FAMILY_LABEL[t.family] ?? t.family})` : ""}: <strong>{fmt(t.assets)}</strong>
              </Typography>
            ))}
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.tealText, fontWeight: 600 }}>
              {fmt(summary.matchedFleetCertificates)} certificate(s) also on your devices
            </Typography>
          </Stack>
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: TEXT.sm, mt: 1.5 }}>
            <Box component="thead">
              <Box component="tr" sx={{ textAlign: "left", color: BRAND.gray, fontSize: TEXT.xs, textTransform: "uppercase", letterSpacing: ".06em" }}>
                <Box component="th" sx={{ py: 0.5 }}>Asset</Box><Box component="th">Type</Box><Box component="th">Algorithm</Box><Box component="th">Family</Box><Box component="th">Source</Box><Box component="th">On devices</Box>
              </Box>
            </Box>
            <Box component="tbody">
              {items.map((a) => (
                <Box component="tr" key={a.assetId} sx={{ borderTop: `1px solid ${BRAND.border}` }}>
                  <Box component="td" sx={{ py: 0.5, pr: 1 }}>
                    <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600 }}>{a.name || a.subjectName || a.bomRef}</Typography>
                    {a.subjectName && a.name !== a.subjectName ? <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{a.subjectName}</Typography> : null}
                  </Box>
                  <Box component="td">{TYPE_LABEL[a.assetType] ?? a.assetType}</Box>
                  <Box component="td">{a.algorithmName ? `${a.algorithmName}${a.keySizeBits ? `-${a.keySizeBits}` : ""}` : a.protocolType ? `${a.protocolType} ${a.protocolVersion ?? ""}` : "—"}</Box>
                  <Box component="td">{a.family ? FAMILY_LABEL[a.family] ?? a.family : "—"}</Box>
                  <Box component="td" sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{a.sourceName}</Box>
                  <Box component="td">
                    {a.inFleet ? (
                      <Chip size="small" label="seen by an agent" onClick={() => onSelect?.({ search: a.fingerprint256 })} sx={{ height: 20, fontSize: TEXT.xs, bgcolor: BRAND.tealSoft, color: BRAND.tealText }} />
                    ) : a.assetType === "certificate" ? (
                      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>not on any device</Typography>
                    ) : null}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </>
      ) : null}
    </SectionPaper>
  );
}
