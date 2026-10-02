// src/components/Compliance/AddToBaselineButton.jsx
//
// ADR-0037 — «Add to baseline» desde donde se mira un check: la fila del
// Catálogo y el hallazgo en la ficha de un equipo. Es el atajo de «Add checks»
// del baseline: «este equipo falla X; que X sea parte del estándar».
//
// Un menú con los baselines del tenant. Uno de otra plataforma sale apagado y
// dice por qué (el backend lo rechazaría); el resto añade el check con origen
// «manual». Si ya estaba, lo dice en vez de fingir que lo añadió.

import * as React from "react";
import { Button, CircularProgress, ListItemText, Menu, MenuItem, Tooltip } from "@mui/material";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import BrandSnackbar from "../common/BrandSnackbar";
import { addBaselineEntries, listBaselines } from "../../api/compliance";
import { scopeLabel } from "./BaselinesPanel";

const PLATFORMS = new Set(["windows", "macos", "linux", "cross"]);
const PLATFORM_LABEL = { windows: "Windows", macos: "macOS", linux: "Linux" };

/** La plataforma del check: la que se pasa o, si no, el prefijo del id («windows.registry…»). */
export function checkPlatformOf(checkId, platform = null) {
  if (platform) return String(platform).toLowerCase();
  const head = String(checkId || "").split(".")[0].toLowerCase();
  return PLATFORMS.has(head) ? head : null;
}

/** ¿Lo aceptaría este baseline? Uno de plataforma sólo admite la suya y los multiplataforma. */
export function baselineAccepts(baseline, checkPlatform) {
  if (baseline?.scopeKind !== "platform" || !checkPlatform || checkPlatform === "cross") return true;
  return checkPlatform === baseline.platform;
}

export default function AddToBaselineButton({ checkId, checkPlatform = null, onToast = null, size = "small" }) {
  const [anchor, setAnchor] = React.useState(null);
  const [baselines, setBaselines] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [snack, setSnack] = React.useState(null);
  const platform = checkPlatformOf(checkId, checkPlatform);

  // Sin `onToast` del anfitrión (el Catálogo no tiene), su propio aviso.
  const say = (severity, message) => (onToast ? onToast({ severity, message }) : setSnack({ severity, message }));

  const open = async (e) => {
    e.stopPropagation();
    setAnchor(e.currentTarget);
    setBaselines(null);
    try {
      const res = await listBaselines();
      setBaselines(Array.isArray(res?.baselines) ? res.baselines : []);
    } catch (err) {
      setAnchor(null);
      say("error", err?.body?.message || err?.message || "Could not load the baselines.");
    }
  };

  const add = async (b) => {
    setAnchor(null);
    setBusy(true);
    try {
      const res = await addBaselineEntries(b.id, [checkId], "manual");
      if (res?.added?.length) say("success", `Added to «${b.name}».`);
      else if (res?.alreadyIn?.length) say("info", `Already in «${b.name}».`);
      else say("warning", `«${b.name}» does not take this check (other platform, or not in the catalog).`);
    } catch (err) {
      say("error", err?.body?.message || err?.message || "Could not add the check.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size={size}
        variant="text"
        startIcon={busy ? <CircularProgress size={14} /> : <RuleOutlinedIcon />}
        disabled={busy}
        onClick={open}
        aria-haspopup="menu"
        sx={{ textTransform: "none", color: BRAND.teal }}
      >
        Add to baseline
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} onClick={(e) => e.stopPropagation()}>
        {baselines === null ? (
          <MenuItem disabled>
            <CircularProgress size={14} sx={{ mr: 1 }} /> Loading…
          </MenuItem>
        ) : baselines.length === 0 ? (
          <MenuItem disabled sx={{ whiteSpace: "normal", maxWidth: 320, fontSize: TEXT.sm }}>
            No baselines yet. Create one in Security Compliance → Baselines.
          </MenuItem>
        ) : (
          baselines.map((b) => {
            const ok = baselineAccepts(b, platform);
            const item = (
              <MenuItem key={b.id} disabled={!ok} onClick={() => add(b)}>
                <ListItemText
                  primary={b.name}
                  secondary={ok ? scopeLabel(b) : `${PLATFORM_LABEL[b.platform] ?? b.platform} only`}
                  primaryTypographyProps={{ fontSize: TEXT.sm, fontWeight: 600 }}
                  secondaryTypographyProps={{ fontSize: TEXT.xs }}
                />
              </MenuItem>
            );
            return ok ? item : (
              <Tooltip key={b.id} title="This baseline covers another platform, so it cannot take this check." placement="left">
                <span>{item}</span>
              </Tooltip>
            );
          })
        )}
      </Menu>
      <BrandSnackbar open={Boolean(snack)} severity={snack?.severity} message={snack?.message} onClose={() => setSnack(null)} />
    </>
  );
}
