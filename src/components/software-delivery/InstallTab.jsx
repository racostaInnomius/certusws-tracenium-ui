// src/components/software-delivery/InstallTab.jsx
//
// Instalar: elegir QUÉ y después A QUIÉN.
//
// ── Por qué es una pestaña y no un botón del catálogo (24-sep) ───────────
//
// El catálogo mezclaba el sustantivo con el verbo: era a la vez «lo que tengo
// publicado» y «despliégalo». Separarlos deja cuatro superficies que se
// explican solas —biblioteca · acción · resultado · configuración— y, sobre
// todo, deja **Install y Uninstall simétricos**: los dos empiezan por qué y
// siguen por a quién. Hasta ahora desinstalar tenía pestaña propia e instalar
// era un icono de cohete en una fila.
//
// ⚠️ NO HAY UN SEGUNDO ASISTENTE. Esta pestaña sólo resuelve la primera
// pregunta —qué paquete— y abre el MISMO `DeployWizardDialog` de siempre, con
// sus anillos, su ventana de mantenimiento y su revisión. Un camino paralelo
// que se las saltara sería un despliegue de segunda clase.
//
// ⚠️ Y EL CATÁLOGO CONSERVA UNA ENTRADA. Su fila tiene un «Install…» que abre
// esta pestaña con el paquete ya elegido: quien está mirando «Chrome 154
// publicado» no tiene que volver a buscarlo. Una pantalla de acción, dos
// puertas — que es lo contrario de dos pantallas que hacen lo mismo.

import * as React from "react";
import { Box, Chip, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";

import SectionPaper from "../common/SectionPaper";
import DeployWizardDialog from "./DeployWizardDialog";
import { BRAND, TEXT } from "../../theme/brand";
import { deployPackage, listPackages } from "../../api/softwareDelivery";
import { listFrom } from "../../api/shape";

const PLATFORM_NAMES = { windows: "Windows", macos: "macOS", linux: "Linux" };

/**
 * Lo que se puede instalar HOY, filtrado por lo que el operador teclea.
 *
 * ⚠️ SÓLO LO ACTIVO. Un paquete retirado sigue en el catálogo a propósito
 * —para leer su historia— pero ofrecerlo aquí sería ofrecer algo que el
 * servidor rechaza al desplegar, con el error a tres pasos de distancia.
 */
export function installablePackages(packages, query) {
  const q = String(query || "").trim().toLowerCase();
  return (Array.isArray(packages) ? packages : [])
    .filter((p) => p?.isActive)
    .filter((p) => {
      if (!q) return true;
      const hay = `${p.name} ${p.version} ${p.platform} ${p.arch} ${p.format}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.platform).localeCompare(String(b.platform)));
}

function PackageRow({ pkg, onPick, disabled }) {
  const label = `${pkg.name} ${pkg.version}`;
  return (
    <Box
      onClick={disabled ? undefined : onPick}
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? undefined : 0}
      aria-label={`Install ${label}`}
      onKeyDown={
        disabled
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick();
              }
            }
      }
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 2fr) auto auto" },
        gap: 1.5,
        alignItems: "center",
        py: 0.9,
        px: 1,
        borderRadius: 1,
        borderBottom: `1px solid ${BRAND.border}`,
        cursor: disabled ? "default" : "pointer",
        "&:last-of-type": { borderBottom: 0 },
        "&:hover": disabled ? undefined : { bgcolor: BRAND.rowHover },
        "&:focus-visible": { outline: `2px solid ${BRAND.teal}`, outlineOffset: -2 },
      }}
    >
      <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }} noWrap>
        {pkg.name}{" "}
        <Box component="span" sx={{ fontWeight: 400, color: BRAND.gray }}>
          {pkg.version}
        </Box>
      </Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }} noWrap>
        {PLATFORM_NAMES[pkg.platform] ?? pkg.platform} · {pkg.arch}
      </Typography>
      <Chip
        size="small"
        label={String(pkg.format || "").toUpperCase()}
        sx={{ height: 20, fontSize: TEXT.xs, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
      />
    </Box>
  );
}

export default function InstallTab({
  canManage,
  notify,
  onDeployFire,
  /** Un paquete elegido desde el catálogo: abre el asistente directamente. */
  preselectPackageId,
  onConsumedPreselect,
  refreshNonce = 0,
}) {
  const [packages, setPackages] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [pkg, setPkg] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPackages()
      .then((res) => {
        if (!cancelled) setPackages(listFrom(res, { context: "softwareDelivery.install" }));
      })
      .catch((err) => {
        if (cancelled) return;
        notify?.("error", err?.body?.message || err?.message || "Failed to load the catalog");
        setPackages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [notify, refreshNonce]);

  // El paquete que llega del catálogo. Se consume UNA vez: volver a esta
  // pestaña más tarde no debe reabrir el asistente solo.
  React.useEffect(() => {
    if (preselectPackageId == null || packages.length === 0) return;
    const found = packages.find((p) => String(p.id) === String(preselectPackageId));
    if (found) setPkg(found);
    else notify?.("error", "That package is no longer deployable.");
    onConsumedPreselect?.();
  }, [preselectPackageId, packages, notify, onConsumedPreselect]);

  const rows = React.useMemo(() => installablePackages(packages, query), [packages, query]);

  const fire = async (body) => {
    if (!pkg) return;
    const res = await deployPackage(pkg.id, body);
    notify?.(
      "success",
      `Deployment #${res?.deployment?.id} created — ${res?.deployment?.counts?.pending ?? 0} job(s) queued`
    );
    setPkg(null);
    onDeployFire?.(res?.deployment?.id);
  };

  return (
    <SectionPaper variant="card" sx={{ p: 2 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", mb: 1.5 }}
      >
        <Box>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>
            Install software
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
            Pick what to install; the next step chooses which devices.
          </Typography>
        </Box>
        <TextField
          size="small"
          placeholder="Search the catalog…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: { sm: 260 } }}
        />
      </Stack>

      {!canManage ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1 }}>
          You do not have permission to deploy software in this tenant. The catalog is shown
          read-only.
        </Typography>
      ) : null}

      {loading ? (
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray }}>Loading…</Typography>
      ) : rows.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray }}>
          {/* Un catálogo sin nada desplegable y una búsqueda sin resultados son
              dos situaciones distintas, y la salida de cada una también. */}
          {query
            ? "No deployable package matches that search."
            : "No deployable packages in the catalog yet. Publish one from the Catalog tab."}
        </Typography>
      ) : (
        rows.map((p) => (
          <PackageRow key={p.id} pkg={p} disabled={!canManage} onPick={() => setPkg(p)} />
        ))
      )}

      <DeployWizardDialog
        open={Boolean(pkg)}
        pkg={pkg}
        onClose={() => setPkg(null)}
        onConfirm={fire}
        notify={notify}
      />
    </SectionPaper>
  );
}
