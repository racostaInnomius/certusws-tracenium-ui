// src/components/CryptoDiscovery/SshUserKeysPanel.jsx
//
// Ola 1.4 — quién puede entrar por SSH en qué cuenta de qué equipo.
//
// ── Por qué una pestaña propia y no una fila más del inventario ──────
//
// El inventario de Crypto Discovery es una lista de CERTIFICADOS,
// deduplicada por huella y con columnas de emisor y caducidad. Una clave
// autorizada no tiene emisor, no caduca, no la revoca nadie y no se
// deduplica por huella —la MISMA clave en dos cuentas son dos concesiones
// distintas, y retirar una no retira la otra—. Meterla ahí obligaría a
// vaciar media tabla.
//
// Y sobre todo: la pregunta que se contesta aquí no es «qué tengo» sino
// «quién entra». El hallazgo es la clave que abre N máquinas a la vez, y
// por eso va ARRIBA, antes que la lista.
//
// ⚠️ Con `mode = "public-only"` —el defecto— el agente NO abre las claves
// privadas. `encrypted: null` es «no se miró», nunca «sin cifrar»: la
// palabra sale de `encryptionState` y de ningún otro sitio.

import * as React from "react";
import { Alert, Box, Chip, MenuItem, Skeleton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import SectionPaper from "../common/SectionPaper";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { listCdpSharedAuthorizedKeys, listCryptoAssets } from "../../api/cdp";
import {
  SSH_KIND_LABEL,
  encryptionState,
  filterSshUserKeys,
  formatBytes,
  isSshUserKey,
  readSshUserKey,
  sshLegacyLabel,
  sshUserOptions
} from "./sshUserKeys";

const MONO = "ui-monospace, Menlo, monospace";
const SSH_USER_ORIGIN = "ssh-user";

const when = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

const TONE = {
  good: { bg: BRAND.alert.successSoft, fg: BRAND.alert.successText },
  bad: { bg: BRAND.alert.errorSoft, fg: BRAND.alert.errorText },
  // Lo no evaluado en gris: ni verde («bien») ni rojo («hallazgo»). Es la
  // tercera categoría, y tiene que verse como tal.
  neutral: { bg: BRAND.surfaceMuted, fg: TEXT_MUTED }
};

function ToneChip({ tone = "neutral", label, hint }) {
  const t = TONE[tone] ?? TONE.neutral;
  const chip = (
    <Chip size="small" label={label} sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: t.bg, color: t.fg }} />
  );
  return hint ? (
    <Tooltip arrow title={hint}>
      <span>{chip}</span>
    </Tooltip>
  ) : (
    chip
  );
}

const Th = ({ children, ...rest }) => (
  <Box component="th" sx={{ py: 0.5, pr: 1.5, textAlign: "left", whiteSpace: "nowrap" }} {...rest}>
    {children}
  </Box>
);
const Td = ({ children, ...rest }) => (
  <Box component="td" sx={{ py: 0.75, pr: 1.5, verticalAlign: "top" }} {...rest}>
    {children}
  </Box>
);

// ─────────────────────────────────────────────────────────────────────
// La cabecera: una clave, N equipos
// ─────────────────────────────────────────────────────────────────────

export function SharedAuthorizedKeysPanel({ items, error, loading }) {
  return (
    <SectionPaper sx={{ p: 2 }}>
      <Typography component="h3" sx={{ fontWeight: 800, fontSize: TEXT.base, color: BRAND.dark, m: 0 }}>
        One key, several machines
      </Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.85, mt: 0.5, mb: 1.5 }}>
        The same public key authorised on more than one device. It is the finding that turns a key inventory into a
        decision: one person — or one stolen laptop — opens all of them, and retiring that key means touching every
        machine listed here. An SSH grant does not expire, no CA revokes it and nothing logs that it was given.
      </Typography>

      {error ? (
        // Un fallo NO se pinta como «ninguna clave compartida»: eso sería
        // afirmar algo tranquilizador sobre la flota que nadie ha medido.
        <Alert severity="error">These could not be read: {error}</Alert>
      ) : loading ? (
        <Skeleton height={80} />
      ) : items.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
          No public key is authorised on two or more devices. That is a real answer about what was collected — it says
          nothing about accounts on machines with no agent.
        </Typography>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: TEXT.sm }} aria-label="Keys authorised on several devices">
            <Box component="thead">
              <Box component="tr" sx={{ color: TEXT_MUTED, fontSize: TEXT.xs, textTransform: "uppercase", letterSpacing: ".06em" }}>
                <Th>Devices</Th>
                <Th>Grants</Th>
                <Th>Key</Th>
                <Th>Accounts</Th>
                <Th>Comments</Th>
                <Th>Last seen</Th>
              </Box>
            </Box>
            <Box component="tbody">
              {items.map((k) => (
                <Box component="tr" key={k.fingerprintSha256} sx={{ borderTop: `1px solid ${BRAND.border}` }}>
                  <Td>
                    <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark, lineHeight: 1 }}>{k.devices}</Typography>
                  </Td>
                  <Td>
                    <Tooltip arrow title="One grant is one authorized_keys line. The same key in two accounts of the same device is two grants and one device.">
                      <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, cursor: "help" }}>{k.grants}</Typography>
                    </Tooltip>
                  </Td>
                  <Td>
                    <Typography sx={{ fontFamily: MONO, fontSize: TEXT.xs, wordBreak: "break-all" }}>{k.fingerprintSha256}</Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5 }}>
                      <Chip size="small" label={[k.keyType, k.bits].filter(Boolean).join(" ") || "unknown type"} sx={{ height: 20, fontSize: TEXT.xs, fontFamily: MONO }} />
                      {k.anyUnrestricted ? (
                        <ToneChip
                          tone="bad"
                          label="unrestricted somewhere"
                          hint="On at least one device this key carries no options (no command=, no from=): full access to that account."
                        />
                      ) : null}
                      {k.legacyReason ? <ToneChip tone="bad" label="legacy key type" hint={sshLegacyLabel(k.legacyReason)} /> : null}
                    </Stack>
                  </Td>
                  <Td>{(k.users ?? []).join(", ") || <span style={{ color: TEXT_MUTED }}>—</span>}</Td>
                  <Td sx={{ color: TEXT_MUTED, fontSize: TEXT.xs, maxWidth: 260 }}>{(k.comments ?? []).join(" · ") || "—"}</Td>
                  <Td sx={{ color: TEXT_MUTED, fontSize: TEXT.xs, whiteSpace: "nowrap" }}>{when(k.lastSeen)}</Td>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </SectionPaper>
  );
}

// ─────────────────────────────────────────────────────────────────────
// La lista, clave a clave
// ─────────────────────────────────────────────────────────────────────

function KeyRow({ k }) {
  const enc = encryptionState(k);
  return (
    <Box component="tr" sx={{ borderTop: `1px solid ${BRAND.border}` }}>
      <Td>
        <Tooltip arrow title={SSH_KIND_LABEL[k.kind] ?? ""}>
          <Chip
            size="small"
            label={k.kind}
            sx={{
              height: 20,
              fontSize: TEXT.xs,
              fontWeight: 700,
              // La concesión es el hecho de seguridad; las otras dos son
              // inventario. El color dice cuál es cuál sin decir «malo».
              bgcolor: k.kind === "authorized" ? BRAND.tealSoftStrong : BRAND.surfaceMuted,
              color: k.kind === "authorized" ? BRAND.tealText : TEXT_MUTED
            }}
          />
        </Tooltip>
      </Td>
      <Td sx={{ fontWeight: 700 }}>{k.user ?? "—"}</Td>
      <Td>
        <Typography sx={{ fontFamily: MONO, fontSize: TEXT.xs, wordBreak: "break-all" }}>{k.path ?? "—"}</Typography>
        {k.publicHalfPath ? (
          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, wordBreak: "break-all" }}>
            public half: <Box component="span" sx={{ fontFamily: MONO }}>{k.publicHalfPath}</Box>
          </Typography>
        ) : null}
      </Td>
      <Td>
        <Typography sx={{ fontSize: TEXT.xs, fontFamily: MONO }}>{[k.keyType, k.bits].filter(Boolean).join(" ") || "—"}</Typography>
        {k.curve ? <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>{k.curve}</Typography> : null}
      </Td>
      <Td sx={{ maxWidth: 220 }}>
        <Typography sx={{ fontFamily: MONO, fontSize: TEXT.xs, wordBreak: "break-all" }}>{k.fingerprintSha256 ?? "—"}</Typography>
        {k.comment ? <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, wordBreak: "break-word" }}>{k.comment}</Typography> : null}
      </Td>
      <Td>
        <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
          {k.unrestricted === true ? (
            <ToneChip tone="bad" label="unrestricted" hint="No options on the authorized_keys line: full access to this account. Whether that is acceptable is your policy's call — this is the fact, not the verdict." />
          ) : null}
          {k.options.length > 0 ? (
            <Tooltip arrow title={k.options.join("  ·  ")}>
              <Chip size="small" label={`${k.options.length} option${k.options.length === 1 ? "" : "s"}`} sx={{ height: 20, fontSize: TEXT.xs }} />
            </Tooltip>
          ) : null}
          {k.legacyReason ? <ToneChip tone="bad" label="legacy" hint={sshLegacyLabel(k.legacyReason)} /> : null}
          {enc ? <ToneChip tone={enc.tone} label={enc.label} hint={enc.hint} /> : null}
        </Stack>
      </Td>
      <Td sx={{ color: TEXT_MUTED, fontSize: TEXT.xs, whiteSpace: "nowrap" }}>
        {k.filePermissions ? <div>mode {k.filePermissions}</div> : null}
        {formatBytes(k.sizeBytes) ? <div>{formatBytes(k.sizeBytes)}</div> : null}
        {k.modifiedAt ? <div>modified {when(k.modifiedAt)}</div> : null}
        {!k.filePermissions && !Number.isFinite(k.sizeBytes) && !k.modifiedAt ? "—" : null}
      </Td>
    </Box>
  );
}

export default function SshUserKeysPanel({ refreshNonce }) {
  const [shared, setShared] = React.useState({ loading: true, items: [], error: null });
  const [assets, setAssets] = React.useState({ loading: true, keys: [], returned: 0, error: null });
  const [filter, setFilter] = React.useState({ kind: "", legacyReason: "", unrestricted: false, user: "", search: "" });

  React.useEffect(() => {
    let alive = true;
    setShared((s) => ({ ...s, loading: true }));
    listCdpSharedAuthorizedKeys({ minDevices: 2, limit: 100 })
      .then((r) => alive && setShared({ loading: false, items: Array.isArray(r?.items) ? r.items : [], error: null }))
      .catch((e) => alive && setShared({ loading: false, items: [], error: e?.message || String(e) }));
    return () => {
      alive = false;
    };
  }, [refreshNonce]);

  React.useEffect(() => {
    let alive = true;
    setAssets((s) => ({ ...s, loading: true }));
    listCryptoAssets({ origin: SSH_USER_ORIGIN, limit: 1000 })
      .then((r) => {
        if (!alive) return;
        const items = Array.isArray(r?.items) ? r.items : [];
        // ⚠️ Sólo las filas que TRAEN el detalle de una clave de usuario.
        // Si el servidor ignora `origin=ssh-user` (su lista blanca no lo
        // incluía cuando esto se escribió), lo que llegue serán activos de
        // otro origen — y enseñarlos aquí sería inventarse el inventario.
        // Se descartan, y abajo se dice por qué la lista está vacía.
        setAssets({ loading: false, keys: items.filter(isSshUserKey).map(readSshUserKey), returned: items.length, error: null });
      })
      .catch((e) => alive && setAssets({ loading: false, keys: [], returned: 0, error: e?.message || String(e) }));
    return () => {
      alive = false;
    };
  }, [refreshNonce]);

  const rows = React.useMemo(() => filterSshUserKeys(assets.keys, filter), [assets.keys, filter]);
  const users = React.useMemo(() => sshUserOptions(assets.keys), [assets.keys]);
  // El servidor contestó bien, con filas, y ninguna es una clave de usuario:
  // o no hay ninguna, o la API todavía no manda `detail`. No se puede saber
  // desde aquí, y decir «no hay claves» sería afirmar lo primero.
  const detailMissing = !assets.loading && !assets.error && assets.keys.length === 0 && assets.returned > 0;

  const set = (patch) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <Stack spacing={2}>
      <SharedAuthorizedKeysPanel items={shared.items} error={shared.error} loading={shared.loading} />

      <SectionPaper sx={{ p: 2 }}>
        <Typography component="h3" sx={{ fontWeight: 800, fontSize: TEXT.base, color: BRAND.dark, m: 0 }}>
          Every user SSH key
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.85, mt: 0.5, mb: 1.5 }}>
          Three different things, deliberately kept apart: an <strong>authorized</strong> key grants access to an
          account on this device, a <strong>public</strong> key says where its owner can go, and a{" "}
          <strong>private</strong> key is a key file found on disk. No key material is ever collected — fingerprints,
          paths and file metadata only. Collected under <em>SSH keys in user home directories</em> in Agent Settings.
        </Typography>

        <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1 }}>
          <TextField
            select size="small" label="Kind" value={filter.kind} onChange={(e) => set({ kind: e.target.value })}
            sx={{ minWidth: 150 }} slotProps={{ htmlInput: { "aria-label": "Kind" } }}
          >
            <MenuItem value="">All kinds</MenuItem>
            <MenuItem value="authorized">Authorized</MenuItem>
            <MenuItem value="public">Public</MenuItem>
            <MenuItem value="private">Private</MenuItem>
          </TextField>
          <TextField
            select size="small" label="Key age" value={filter.legacyReason} onChange={(e) => set({ legacyReason: e.target.value })}
            sx={{ minWidth: 190 }} slotProps={{ htmlInput: { "aria-label": "Key age" } }}
          >
            <MenuItem value="">Any key type</MenuItem>
            <MenuItem value="any">Legacy (any reason)</MenuItem>
            <MenuItem value="dsa_removed_from_openssh">DSA</MenuItem>
            <MenuItem value="rsa_below_3072">RSA under 3072 bits</MenuItem>
          </TextField>
          <TextField
            select size="small" label="Restrictions" value={filter.unrestricted ? "1" : ""} onChange={(e) => set({ unrestricted: e.target.value === "1" })}
            sx={{ minWidth: 190 }} slotProps={{ htmlInput: { "aria-label": "Restrictions" } }}
          >
            <MenuItem value="">Any</MenuItem>
            <MenuItem value="1">Unrestricted grants only</MenuItem>
          </TextField>
          <TextField
            select size="small" label="Account" value={filter.user} onChange={(e) => set({ user: e.target.value })}
            sx={{ minWidth: 160 }} slotProps={{ htmlInput: { "aria-label": "Account" } }}
          >
            <MenuItem value="">All accounts</MenuItem>
            {users.map((u) => (
              <MenuItem key={u} value={u}>{u}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small" label="Search" placeholder="path, comment, fingerprint" value={filter.search}
            onChange={(e) => set({ search: e.target.value })} sx={{ minWidth: 220 }}
            slotProps={{ htmlInput: { "aria-label": "Search" } }}
          />
        </Stack>

        {assets.error ? (
          <Alert severity="error">The user SSH keys could not be read: {assets.error}</Alert>
        ) : assets.loading ? (
          <Skeleton height={120} />
        ) : detailMissing ? (
          <Alert severity="warning">
            The inventory endpoint answered, but none of the {assets.returned} rows it returned carries the per-key
            detail this view needs (<code>kind</code>, <code>user</code>, <code>path</code>, fingerprint). Nothing is
            being hidden and nothing is being guessed — this build of <code>GET /cdp/assets</code> does not return the
            <code> detail</code> column, so the keys cannot be listed here yet. The shared-key panel above uses its own
            endpoint and is unaffected.
          </Alert>
        ) : assets.keys.length === 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
            No user SSH key has been collected. Devices report them once <em>SSH keys in user home directories</em> is
            anything other than <em>off</em> and their next Crypto Discovery scan runs.
          </Typography>
        ) : rows.length === 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
            No key matches these filters. {assets.keys.length.toLocaleString()} collected in total.
          </Typography>
        ) : (
          <>
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mb: 0.5 }}>
              {rows.length.toLocaleString()} of {assets.keys.length.toLocaleString()} keys
            </Typography>
            <Box sx={{ overflowX: "auto" }}>
              <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: TEXT.sm }} aria-label="User SSH keys">
                <Box component="thead">
                  <Box component="tr" sx={{ color: TEXT_MUTED, fontSize: TEXT.xs, textTransform: "uppercase", letterSpacing: ".06em" }}>
                    <Th>Kind</Th>
                    <Th>Account</Th>
                    <Th>Path</Th>
                    <Th>Key</Th>
                    <Th>Fingerprint</Th>
                    <Th>Notes</Th>
                    <Th>File</Th>
                  </Box>
                </Box>
                <Box component="tbody">
                  {rows.map((k) => (
                    <KeyRow key={k.assetId ?? `${k.path}-${k.fingerprintSha256}`} k={k} />
                  ))}
                </Box>
              </Box>
            </Box>
          </>
        )}
      </SectionPaper>
    </Stack>
  );
}
