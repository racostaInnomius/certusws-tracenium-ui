// src/components/DeviceManagement/MdmPoliciesTab.jsx
//
// Pestaña Policies de MDM / MAM (rediseño 1-oct-2026).
//
// Antes: la política de la app (MAM) y la de equipos (MDM) apiladas en un
// solo scroll, cada una con su botón de guardar al final —el de macOS, debajo
// de 45 ajustes—, con pestañas macOS / iPhone & iPad dentro de la pestaña, la
// versión del documento ENTERO colgada de la sección MAM, y sin forma de ver
// qué estaba configurado ni qué llegaba de verdad a los equipos.
//
// Ahora: tres tarjetas, una por política, que dicen cuánto tienen puesto, a
// quién llega y si hay cambios sin guardar; el editor de la elegida debajo,
// con una barra de guardado que se queda a la vista. La elegida va en la URL
// (`?mdmPolicy=`). Los datos y el guardado siguen en la página: el refresco
// necesita saber si hay algo a medio editar en cualquiera de las tres.

import * as React from "react";
import { Alert, Box, Button, ButtonBase, Chip, Tooltip, Typography } from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import LaptopMacOutlinedIcon from "@mui/icons-material/LaptopMacOutlined";
import PhoneIphoneOutlinedIcon from "@mui/icons-material/PhoneIphoneOutlined";
import AppShortcutOutlinedIcon from "@mui/icons-material/AppShortcutOutlined";

import SectionPaper from "../common/SectionPaper";
import { BRAND, ICON, TEXT } from "../../theme/brand";
import { formatDate } from "../../utils/format";
import { getSearchParam, updateSearchParams } from "../../utils/browserState";
import { shortHash } from "../Policies/policyDisplay";
import ManagedAppSection from "../Policies/ManagedAppSection";
import MdmPlatformSection from "../Policies/MdmPlatformSection";
import { POLICY_KINDS, mamStats, platformStats, policyReach } from "../Policies/mdmPolicyModel";
import { mdmDeviceStatus, mdmPlatform } from "./mdmModel";
import { StatusChip } from "./mdmAtoms";

const POLICIES = {
  macos: { title: "macOS", heading: "macOS settings", noun: "macOS settings", icon: LaptopMacOutlinedIcon },
  ios: { title: "iPhone & iPad", heading: "iPhone & iPad settings", noun: "iPhone & iPad settings", icon: PhoneIphoneOutlinedIcon },
  app: { title: "Tracenium app", sub: "MAM · iOS & Android", heading: "Tracenium app (MAM)", noun: "app policy", icon: AppShortcutOutlinedIcon },
};

const MANAGED = new Set(["enrolled", "stale", "enrolling", "reenroll"]);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function PolicyCard({ kind, selected, stats, reach, unsaved, onSelect }) {
  const p = POLICIES[kind];
  const Icon = p.icon;
  return (
    <ButtonBase
      role="tab"
      id={`mdm-policy-${kind}`}
      aria-selected={selected}
      aria-controls="mdm-policy-editor"
      onClick={() => onSelect(kind)}
      sx={{
        // ButtonBase centra su contenido: en rejilla, las pistas también.
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr)",
        justifyContent: "stretch",
        alignItems: "start",
        alignContent: "start",
        justifyItems: "start",
        gap: 0.75,
        textAlign: "left",
        p: 1.5,
        borderRadius: 2.5,
        border: `1px solid ${selected ? BRAND.teal : BRAND.border}`,
        boxShadow: selected ? `inset 0 0 0 1px ${BRAND.teal}` : "none",
        bgcolor: selected ? BRAND.tealSoft : "background.paper",
        transition: "border-color 120ms ease, background-color 120ms ease",
        "&:hover": { borderColor: BRAND.teal },
        "&.Mui-focusVisible": { outline: `2px solid ${BRAND.teal}`, outlineOffset: 2 },
        minWidth: 0,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%", minWidth: 0 }}>
        <Icon sx={{ fontSize: ICON.xl, color: selected ? BRAND.tealText : BRAND.dark }} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark, lineHeight: 1.2 }}>{p.title}</Typography>
          {p.sub ? <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{p.sub}</Typography> : null}
        </Box>
        {unsaved ? (
          <Chip
            size="small"
            label={`${unsaved} unsaved`}
            aria-label={`${plural(unsaved, "unsaved change")} in ${p.title}`}
            sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 800, bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warningText }}
          />
        ) : null}
      </Box>
      <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>
        {stats.configured ? (
          <>
            <strong>{stats.configured}</strong> of {stats.total} set
          </>
        ) : (
          "Nothing set"
        )}
        {kind !== "app" && stats.notDelivered?.length ? (
          <Box component="span" sx={{ color: BRAND.alert.warningText, fontWeight: 700 }}>
            {` · ${stats.notDelivered.length} not sent`}
          </Box>
        ) : null}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
        <StatusChip status={{ tone: reach.tone, label: reach.label }} />
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", display: { xs: "none", sm: "block" } }}>{reach.detail}</Typography>
      </Box>
    </ButtonBase>
  );
}

function EditorIntro({ kind, pushDeliverable }) {
  if (kind === "macos") {
    return (
      <Typography sx={{ fontSize: TEXT.md, color: "text.secondary", maxWidth: 820 }}>
        Everything set here goes into the organization&apos;s configuration profile. Macs enrolled in Tracenium MDM install it
        on their next check-in{pushDeliverable ? "" : " (about every 4 hours)"}; for other Macs, download it. A setting
        left <strong>Not set</strong> stays out of the profile and the Mac keeps its own value.
      </Typography>
    );
  }
  if (kind === "ios") {
    // Un iPhone/iPad no se conecta por su cuenta (iOS 27, medido): sin Apple
    // push, nada de esto le llega.
    return (
      <Typography sx={{ fontSize: TEXT.md, color: "text.secondary", maxWidth: 820 }}>
        Restrictions go into the organization&apos;s iPhone &amp; iPad profile; the passcode and the minimum iOS version go
        as declarations, and each device reports whether its passcode complies. iPhones and iPads enrolled in Tracenium
        MDM get them {pushDeliverable ? "within seconds" : "once Tracenium can wake them with the Apple push certificate — they don't check in on their own"}.
        Settings marked <strong>Supervised only</strong> need a device from Apple Business Manager. A setting left{" "}
        <strong>Not set</strong> keeps the device&apos;s own value.
      </Typography>
    );
  }
  return (
    <Typography sx={{ fontSize: TEXT.md, color: "text.secondary", maxWidth: 820 }}>
      Enforced by the Tracenium app itself on iOS and Android, including personal devices; desktop agents ignore it. Devices
      pick up a change on the next policy push. A setting left <strong>Not set</strong> keeps the app&apos;s default.
    </Typography>
  );
}

export default function MdmPoliciesTab({
  edits,
  baseline,
  dirty,
  onEdit,
  onSave,
  onDiscard,
  savingKind = null,
  loading = false,
  loadError = null,
  onRetry,
  groupsFor,
  catalogLoading = false,
  mdm,
  appDeviceCount = 0,
  unsupervised = {},
  onPush,
  pushing = false,
  onDownloadProfile,
  envelope = {},
}) {
  const [kind, setKind] = React.useState(() => {
    const requested = getSearchParam("mdmPolicy", "");
    return POLICY_KINDS.includes(requested) ? requested : "macos";
  });
  // Sin limpiar al desmontar: volver a Policies desde otra pestaña tiene que
  // dejarte en la misma política, con lo que estuvieras editando.
  React.useEffect(() => {
    updateSearchParams({ mdmPolicy: kind === "macos" ? null : kind });
  }, [kind]);

  const macCount = React.useMemo(
    () => (mdm?.devices || []).filter((d) => mdmPlatform(d) === "macos" && MANAGED.has(mdmDeviceStatus(d).key)).length,
    [mdm?.devices]
  );
  const iosCount = React.useMemo(
    () => (mdm?.devices || []).filter((d) => mdmPlatform(d) === "ios" && MANAGED.has(mdmDeviceStatus(d).key)).length,
    [mdm?.devices]
  );

  const stats = React.useMemo(
    () => ({
      macos: platformStats(groupsFor("macos"), edits.macos, baseline?.macos),
      ios: platformStats(groupsFor("ios"), edits.ios, baseline?.ios),
      app: mamStats(edits.app, baseline?.app),
    }),
    [groupsFor, edits, baseline]
  );
  const unsavedOf = (k) => (dirty[k] ? Math.max(stats[k].changed.length, 1) : 0);

  const p = POLICIES[kind];
  const s = stats[kind];
  const unsaved = unsavedOf(kind);
  const issues = s.issues;
  const saving = savingKind === kind;
  const saveDisabled = Boolean(loadError) || loading || savingKind !== null || !dirty[kind] || issues.length > 0;

  let status;
  if (issues.length) {
    status = (
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.errorText, fontWeight: 700 }}>
        Fix {issues.length === 1 ? `“${issues[0].label}”` : plural(issues.length, "value")} before saving
      </Typography>
    );
  } else if (unsaved) {
    status = (
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.warningText, fontWeight: 700 }}>
        ● {plural(unsaved, "unsaved change")}
      </Typography>
    );
  } else {
    status = <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>No unsaved changes</Typography>;
  }

  return (
    <Box sx={{ display: "grid", gap: 2, minWidth: 0 }}>
      {loadError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={onRetry}>
              Retry
            </Button>
          }
        >
          Couldn&apos;t read the current policy ({loadError}). The editors show empty values, not the real configuration, so
          saving is disabled.
        </Alert>
      ) : null}

      <Box
        role="tablist"
        aria-label="Policies"
        // Tres columnas desde 600 px: apiladas, empujaban el editor media
        // pantalla hacia abajo con el panel del portal a 800 px.
        sx={{ display: "grid", gap: { xs: 1, sm: 1.5 }, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(3, minmax(0,1fr))" } }}
      >
        {POLICY_KINDS.map((k) => (
          <PolicyCard
            key={k}
            kind={k}
            selected={k === kind}
            stats={stats[k]}
            reach={policyReach(k, { macCount, iosCount, appCount: appDeviceCount })}
            unsaved={unsavedOf(k)}
            onSelect={setKind}
          />
        ))}
      </Box>

      <SectionPaper variant="panel" role="tabpanel" id="mdm-policy-editor" aria-labelledby={`mdm-policy-${kind}`} sx={{ pb: 0 }}>
        {/* Descargar y empujar no son guardar: van arriba, con la política, y
            la barra de abajo se queda con lo que guarda (en un móvil ocupaba
            tres líneas fijas). */}
        <Box sx={{ display: "grid", gap: 1, mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" }}>
            <Typography component="h2" sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark }}>
              {p.heading}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {/* El perfil sale de la política GUARDADA: el mismo que el MDM de
                  Tracenium entrega a sus Macs (ADR-0002). La descarga es para
                  los Macs SIN nuestro MDM. Identificador fijo: uno nuevo
                  reemplaza al anterior. */}
              {kind === "macos" ? (
                <Tooltip
                  arrow
                  title={
                    dirty.macos
                      ? "Save first: the profile is built from the saved macOS policy."
                      : "For Macs not enrolled in Tracenium MDM: upload it to your MDM, or open it on the Mac and approve it in System Settings › Privacy & Security › Profiles. A newer version replaces the old one."
                  }
                >
                  <span>
                    <Button
                      variant="outlined"
                      startIcon={<DownloadOutlinedIcon />}
                      disabled={dirty.macos || loading}
                      onClick={onDownloadProfile}
                      sx={{ textTransform: "none", fontWeight: 700, borderColor: BRAND.teal, color: BRAND.tealText }}
                    >
                      Download profile
                    </Button>
                  </span>
                </Tooltip>
              ) : null}
              {/* Aparte y con confirmación: empuja la política ENTERA del tenant
                  y borra los overrides por equipo (plan MDM/MAM, hallazgo 3). */}
              {kind === "app" ? (
                <Tooltip arrow title="Wakes every device to re-fetch the whole tenant policy and resets device-level overrides.">
                  <span>
                    <Button
                      variant="outlined"
                      startIcon={<SendOutlinedIcon />}
                      onClick={onPush}
                      disabled={pushing || loading}
                      sx={{ textTransform: "none", fontWeight: 700, borderColor: BRAND.teal, color: BRAND.tealText }}
                    >
                      {pushing ? "Pushing…" : "Push to all devices…"}
                    </Button>
                  </span>
                </Tooltip>
              ) : null}
            </Box>
          </Box>
          <EditorIntro kind={kind} pushDeliverable={Boolean(mdm?.status?.commands?.deliverable)} />
        </Box>

        {kind === "app" ? (
          <ManagedAppSection value={edits.app} loaded={baseline?.app} onChange={(v) => onEdit("app", v)} readOnly={loading} />
        ) : catalogLoading ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Loading settings…
          </Typography>
        ) : (
          <MdmPlatformSection
            key={kind}
            platform={kind}
            groups={groupsFor(kind)}
            block={edits[kind] || {}}
            loadedBlock={baseline?.[kind] || {}}
            onChangeBlock={(next) => onEdit(kind, next)}
            readOnly={loading}
            unsupervisedCount={unsupervised[kind] ?? null}
          />
        )}

        {/* La barra se queda abajo a la vista: con 45 ajustes de macOS, el
            botón de guardar quedaba a varias pantallas del cambio. */}
        <Box
          sx={{
            position: "sticky",
            bottom: 0,
            zIndex: 2,
            mt: 2,
            mx: { xs: -1.5, sm: -2 },
            px: { xs: 1.5, sm: 2 },
            py: 1.25,
            bgcolor: "background.paper",
            borderTop: `1px solid ${BRAND.border}`,
            borderBottomLeftRadius: "inherit",
            borderBottomRightRadius: "inherit",
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Button
            variant="contained"
            startIcon={<SaveOutlinedIcon />}
            onClick={() => onSave(kind)}
            disabled={saveDisabled}
            sx={{ textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
          >
            {saving ? "Saving…" : `Save ${p.noun}`}
          </Button>
          <Button
            onClick={() => onDiscard(kind)}
            disabled={!dirty[kind] || savingKind !== null}
            sx={{ textTransform: "none", fontWeight: 700, color: BRAND.dark }}
          >
            Discard
          </Button>
          {status}
        </Box>
      </SectionPaper>

      {/* Las tres políticas son dominios del MISMO documento del tenant (junto
          con la configuración del agente): la versión es la de ese documento. */}
      <Tooltip arrow placement="top-start" title="One tenant policy document holds these three policies and the agent settings; this is its current version.">
        <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", justifySelf: "start", fontVariantNumeric: "tabular-nums" }}>
          Tenant policy version {envelope.version ?? "—"} · {shortHash(envelope.hash)} · updated {formatDate(envelope.updatedAt)}
        </Typography>
      </Tooltip>
    </Box>
  );
}
