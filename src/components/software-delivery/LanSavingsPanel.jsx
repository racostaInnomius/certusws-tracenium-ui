// src/components/software-delivery/LanSavingsPanel.jsx
//
// Cuánto se sirvió desde la LAN en vez de internet.
//
// EL PROBLEMA QUE RESUELVE (fase 5)
//
// El panel anterior, "Download sources", leía SÓLO los resultados de
// instalación de software de terceros y sacaba conclusiones sobre los
// distribution points. Medido en tenant 111 sobre 30 días:
//
//   software de terceros    9 eventos   (5 dp, 4 sin registrar)
//   updates de agente     397 eventos   (304 dp, 93 origin → 77% por DP)
//
// Con esos 9 eventos el encabezado llegó a decir "0% served from the LAN"
// mientras el DP servía casi cuatrocientas descargas. Para un cliente con
// ancho de banda reducido ése es EL argumento del producto, y la página lo
// estaba enterrando bajo la población peor instrumentada de las dos.
//
// ⚠️ LAS DOS POBLACIONES VAN SEPARADAS Y ETIQUETADAS.
//
// Sumarlas daría una cifra más bonita y menos cierta: una está bien
// instrumentada y la otra casi no tiene eventos, y un 89% que en realidad es
// "8 de 9 sin registrar" es peor que no decir nada. Cada fila dice su propio
// denominador.
//
// ⚠️ "Sin registrar" NO es un origen de descarga.
//
// Es un hueco de instrumentación nuestro. Antes competía en la misma barra que
// dp/cdn/origin, así que un tenant sin telemetría parecía un tenant que no usa
// el DP. Ahora se dice aparte, como lo que es.

import * as React from "react";
import { Box, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";

import SectionPaper from "../common/SectionPaper";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

/** Reparto de UNA población entre LAN e internet, con su hueco declarado. */
export function lanSplit(stats) {
  const dp = Number(stats?.dp ?? 0);
  const cdn = Number(stats?.cdn ?? 0);
  const origin = Number(stats?.origin ?? 0);
  const unknown = Number(stats?.unknown ?? 0);
  // ⚠️ El porcentaje se calcula sobre lo REGISTRADO, no sobre el total. Con la
  // mitad sin telemetría, dividir por el total inventa un suelo que castiga al
  // DP por un fallo nuestro de medición.
  const recorded = dp + cdn + origin;
  return {
    dp,
    internet: cdn + origin,
    unknown,
    recorded,
    total: recorded + unknown,
    share: recorded > 0 ? Math.round((dp / recorded) * 100) : null,
  };
}

function Row({ label, stats, hint }) {
  const s = lanSplit(stats);
  if (!s.total) return null;

  return (
    <Box sx={{ mt: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", mb: 0.5 }}>
        <Tooltip title={hint}>
          <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
            {label}
          </Typography>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark }}>
          {s.share == null ? "—" : `${s.share}%`}
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>from the LAN</Typography>
      </Stack>

      <LinearProgress
        variant="determinate"
        value={s.share ?? 0}
        aria-label={`${label}: ${s.share ?? 0}% from the LAN`}
        sx={{
          height: 8,
          borderRadius: 4,
          bgcolor: BRAND.darkSoft,
          "& .MuiLinearProgress-bar": { bgcolor: ROLE.positive, borderRadius: 4 },
        }}
      />

      <Stack direction="row" spacing={1.5} sx={{ mt: 0.5, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
          {s.dp} from a distribution point · {s.internet} from the internet
        </Typography>
        {s.unknown ? (
          // El hueco se declara, no se disimula: sin esto, un tenant a medio
          // instrumentar parece un tenant que no usa el DP.
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontStyle: "italic" }}>
            {s.unknown} not recorded
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}

export default function LanSavingsPanel({ agentStats, softwareStats, hasDistributionPoints }) {
  const agent = lanSplit(agentStats);
  const software = lanSplit(softwareStats);
  const anyData = agent.total > 0 || software.total > 0;

  // ⚠️ EL DATO MANDA SOBRE LA CONFIGURACIÓN.
  //
  // La primera versión enseñaba el mensaje de "no hay DPs" en cuanto la lista
  // de DPs venía vacía — y escondía tráfico por LAN ya medido. Si hay
  // descargas servidas por un DP, evidentemente hubo un DP sirviéndolas: la
  // lista puede estar vacía porque se retiró después, o porque esa llamada
  // falló y degradó a []. Lo cazó un test que sembraba dp:90 sin DPs.
  const anyLanTraffic = agent.dp + software.dp > 0;
  const showSetupPitch = !hasDistributionPoints && !anyLanTraffic;

  return (
    <SectionPaper variant="card" sx={{ p: 2 }}>
      <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>
        Served from the LAN
      </Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
        Downloads a distribution point served instead of the internet
      </Typography>

      {showSetupPitch ? (
        // ⚠️ Sin DPs configurados el 0% no es un resultado, es una función que
        // no se ha activado. Enseñarlo como métrica leía como "los DPs no
        // sirven", que es lo contrario de lo que pasa.
        <Box sx={{ mt: 2, p: 2, borderRadius: 1, bgcolor: BRAND.darkSoft }}>
          <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
            No distribution points yet
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: 0.5 }}>
            Every endpoint downloads from the internet. On a site with limited
            bandwidth, a distribution point turns one download per site into one
            download per fleet.
          </Typography>
        </Box>
      ) : !anyData ? (
        <Box sx={{ mt: 2, color: BRAND.gray, fontSize: TEXT.md }}>
          No downloads recorded in this window
        </Box>
      ) : (
        <>
          {/* Los updates de agente van PRIMERO: son la población con volumen
              real y la que hoy demuestra el ahorro. */}
          <Row
            label="Agent updates"
            stats={agentStats}
            hint="Endpoints that got their own agent build from a distribution point instead of the internet."
          />
          <Row
            label="Software installs"
            stats={softwareStats}
            hint="Third-party packages deployed from the catalog."
          />
        </>
      )}
    </SectionPaper>
  );
}
