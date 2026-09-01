// src/components/Policies/FeaturesSection.jsx
//
// "Features" section of the PolicyForm, extracted from the Policies
// god-component. Holds the self-update toggle plus the Remote Control (RCP)
// capability gates (rcp.shell / rcp.file / rcp.screen / rcp.consent). The RCP
// sub-block only renders when a plugin implying the `remoteControl` module is
// enabled — that gate reads the plugin `catalog` (passed in as a prop, sourced
// from usePluginCatalog in the parent). Props-driven: reads form.features and
// writes the whole form back via onChange.

import * as React from "react";
import {
  Alert,
  Box,
  Chip,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography
} from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

// Una raíz que abre el disco entero: "/" en POSIX o "C:\\" en Windows.
// Devuelve la primera que encuentre, para poder nombrarla en el aviso.
function findWideOpenRoot(text) {
  if (typeof text !== "string") return null;
  for (const line of text.split("\n")) {
    const p = line.trim();
    if (!p) continue;
    if (p === "/" || /^[a-zA-Z]:[\\/]?$/.test(p)) return p;
  }
  return null;
}

export default function FeaturesSection({ form, onChange, readOnly = false, catalog = [] }) {
  const wideOpenRoot = findWideOpenRoot(form?.rcpFile?.roots);
  return (
      <Box
        sx={{
          mt: 2,
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
          Features
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={form?.features?.selfUpdate !== false}
                onChange={(e) =>
                  onChange({
                    ...form,
                    features: {
                      ...(form.features || {}),
                      selfUpdate: e.target.checked,
                    },
                  })
                }
                disabled={readOnly}
              />
            }
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Self-update
                </Typography>
                <Typography variant="caption" sx={{ color: BRAND.gray }}>
                  When off, the agent's update probe keeps running (to report
                  available versions) but the install path is suppressed. Use
                  to freeze a fleet on a specific agent version while
                  staging a rollout.
                </Typography>
              </Box>
            }
            sx={{ alignItems: "flex-start", mx: 0 }}
          />

          {/* Device Info flyout — support widget. Windows-only today:
              the flyout lives in the Windows AgentTray; macOS surfaces
              the same info via the menubar popover's Device Info tab,
              which is always available and not gated by this flag. */}
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={Boolean(form?.features?.deviceInfoWidget)}
                onChange={(e) =>
                  onChange({
                    ...form,
                    features: {
                      ...(form.features || {}),
                      deviceInfoWidget: e.target.checked,
                    },
                  })
                }
                disabled={readOnly}
              />
            }
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Device info widget{" "}
                  <Chip
                    label="agent 1.1.24+"
                    size="small"
                    sx={{
                      ml: 0.5,
                      height: 18,
                      fontSize: TEXT.xs,
                      bgcolor: BRAND.tealSoft,
                      color: BRAND.teal,
                      fontWeight: 700,
                    }}
                  />
                </Typography>
                <Typography variant="caption" sx={{ color: BRAND.gray }}>
                  Shows an always-on-top &quot;Device info&quot; tab at the
                  top-center of the screen on Windows endpoints. Users click it
                  to see their user, computer name, IP, serial and more — with
                  a Copy&nbsp;all button for support tickets. The same info is
                  always available in the tray status window (and the macOS
                  menubar) regardless of this setting.
                </Typography>
              </Box>
            }
            sx={{ alignItems: "flex-start", mx: 0, mt: 0.5 }}
          />

          {/* Endpoint positioning. Distinct from the MAM switch that governs
              phones: consenting to locate company handsets is not consenting
              to locate employees' laptops. */}
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={Boolean(form?.features?.locationTracking)}
                onChange={(e) =>
                  onChange({
                    ...form,
                    features: {
                      ...(form.features || {}),
                      locationTracking: e.target.checked,
                    },
                  })
                }
                disabled={readOnly}
              />
            }
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Location tracking{" "}
                  <Chip
                    label="agent 1.1.28+"
                    size="small"
                    sx={{
                      ml: 0.5,
                      height: 18,
                      fontSize: TEXT.xs,
                      bgcolor: BRAND.tealSoft,
                      color: BRAND.teal,
                      fontWeight: 700,
                    }}
                  />
                </Typography>
                <Typography variant="caption" sx={{ color: BRAND.gray }}>
                  Asks Windows for the endpoint&apos;s position and shows it on
                  the device map. Requires location services to be enabled on
                  the endpoint; macOS and Linux report nothing for now. Turning
                  this off erases the coordinates already stored. Coordinates
                  are personal data — check your local obligations before
                  enabling it.
                </Typography>
              </Box>
            }
            sx={{ alignItems: "flex-start", mx: 0, mt: 0.5 }}
          />
        </Box>

        {/* ── Remote Control (RCP) sub-section ────────────────────────
            Three capabilities behind their own gates so an operator can
            roll them out gradually (e.g. shell first, screen later).
            Hidden entirely unless the RCP plugin is enabled in Plugin
            Control — same gating pattern as the compliance / patch
            schedule sections above (compliance ← scp, patch ← pmp,
            remoteControl ← rcp). Requires agent 1.1.19+; older agents
            ignore the policy flags silently. */}
        {(() => {
          const rcpActive = catalog.some(
            (p) => p.impliesModule === "remoteControl" && form.plugins[p.key]
          );
          if (!rcpActive) return null;
          return (
            <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${BRAND.border}` }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <Typography
                  variant="overline"
                  sx={{ color: BRAND.dark, fontWeight: 800, letterSpacing: 1.2 }}
                >
                  Remote Control (RCP)
                </Typography>
            <Chip
              label="agent 1.1.19+"
              size="small"
              sx={{
                height: 18,
                fontSize: TEXT.xs,
                bgcolor: BRAND.tealSoft,
                color: BRAND.teal,
                fontWeight: 700,
              }}
            />
          </Stack>
          <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 1 }}>
            Capability gates for the Remote Control Plugin. Each toggle controls
            whether agents advertise the matching <code>rcp.*</code> capability
            in their next Hello. Sessions are admin_master-only and tracked
            under <strong>Remote Control</strong> in the sidebar.
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {/* rcp.shell — M1 */}
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={Boolean(form?.features?.remoteShell)}
                  onChange={(e) =>
                    onChange({
                      ...form,
                      features: {
                        ...(form.features || {}),
                        remoteShell: e.target.checked,
                      },
                    })
                  }
                  disabled={readOnly}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Remote shell <Typography component="span" variant="caption" sx={{ color: BRAND.gray, ml: 0.5 }}>(rcp.shell)</Typography>
                  </Typography>
                  <Typography variant="caption" sx={{ color: BRAND.gray }}>
                    Interactive shell sessions over WebRTC (PTY + xterm.js).
                    Transcripts are recorded for audit replay.
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start", mx: 0 }}
            />

            {/* rcp.file — M2.S1 */}
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={Boolean(form?.features?.remoteFile)}
                  onChange={(e) =>
                    onChange({
                      ...form,
                      features: {
                        ...(form.features || {}),
                        remoteFile: e.target.checked,
                      },
                    })
                  }
                  disabled={readOnly}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Remote file transfer <Typography component="span" variant="caption" sx={{ color: BRAND.gray, ml: 0.5 }}>(rcp.file)</Typography>
                  </Typography>
                  <Typography variant="caption" sx={{ color: BRAND.gray }}>
                    File browser + bi-directional transfers over P2P DataChannel.
                    Every transfer is audited (started → completed/failed/cancelled).
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start", mx: 0, mt: 0.5 }}
            />

            {/* rcp.screen — M3.S1 */}
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={Boolean(form?.features?.remoteScreen)}
                  onChange={(e) =>
                    onChange({
                      ...form,
                      features: {
                        ...(form.features || {}),
                        remoteScreen: e.target.checked,
                      },
                    })
                  }
                  disabled={readOnly}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Remote screen share <Typography component="span" variant="caption" sx={{ color: BRAND.gray, ml: 0.5 }}>(rcp.screen)</Typography>
                  </Typography>
                  <Typography variant="caption" sx={{ color: BRAND.gray }}>
                    Live screen viewer with optional mouse + keyboard control.
                    JPEG frames over WebRTC; input forwarded via privileged
                    SendInput on the device.
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start", mx: 0, mt: 0.5 }}
            />

            {/* User-attended approval — gates ALL rcp.* sessions on
                end-user consent at the endpoint.

                YA FUNCIONA, con la condición de abajo. El aviso nativo existe
                en las tres plataformas (bandeja .NET en Windows, app de estado
                en macOS, helper X11 en Linux) y el agente anuncia rcp.consent
                cuando puede preguntar.

                ⚠️ El gate sigue siendo REAL, solo que ahora es por DISPOSITIVO
                y no global: el backend falla cerrado ante un agente que no
                sabe preguntar, así que en una flota mixta los equipos con
                agente antiguo verán sus sesiones RECHAZADAS, no sin aviso.
                Por eso el interruptor se puede encender pero lo acompaña una
                advertencia mientras está ON — el riesgo no desaparece hasta
                que toda la flota esté al día, y quien lo enciende tiene que
                saberlo.

                Requiere agente ≥ el build que registra el prompter; los
                anteriores no anuncian rcp.consent. */}
            {(() => {
              const consentOn = Boolean(form?.features?.remoteRequireConsent);
              return (
                <Box sx={{ mt: 0.5 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={consentOn}
                        onChange={(e) =>
                          onChange({
                            ...form,
                            features: {
                              ...(form.features || {}),
                              remoteRequireConsent: e.target.checked,
                            },
                          })
                        }
                        disabled={readOnly}
                      />
                    }
                    label={
                      <Box>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, color: consentOn ? BRAND.dark : BRAND.gray }}
                        >
                          Require user consent{" "}
                          <Typography component="span" variant="caption" sx={{ color: BRAND.gray, ml: 0.5 }}>
                            (rcp.consent)
                          </Typography>
                        </Typography>
                        <Typography variant="caption" sx={{ color: BRAND.gray }}>
                          Prompts the logged-in user to approve before a remote session
                          opens, and again before an operator can control the device.
                          Requires an agent build that can show the prompt: on devices
                          with an older agent, sessions are refused instead.
                        </Typography>
                      </Box>
                    }
                    sx={{ alignItems: "flex-start", mx: 0 }}
                  />

                  {consentOn && (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        mt: 1,
                        ml: 0.5,
                        p: 1,
                        borderRadius: 1,
                        bgcolor: ROLE.criticalSoft,
                        border: `1px solid ${ROLE.critical}33`,
                      }}
                    >
                      <Typography variant="caption" sx={{ color: ROLE.critical, fontWeight: 600 }}>
                        Devices whose agent cannot show the prompt will have every
                        remote session REFUSED — not opened without asking. Check that
                        the agent is up to date across the devices this policy applies
                        to before relying on this. Switching it off restores access
                        immediately.
                      </Typography>
                    </Stack>
                  )}
                </Box>
              );
            })()}

            {/* ── Grabación de sesiones de pantalla (ADR-0012) ────────
                Gateado igual que el consentimiento, y por un motivo
                DISTINTO que conviene no confundir.

                Encender el consentimiento sobre la flota actual BLOQUEA
                todas las sesiones (el backend falla cerrado si el agente
                no sabe preguntar). Encender la grabación no rompe nada:
                los agentes que no conocen la bandera simplemente la
                ignoran. El daño es otro y es peor de detectar — el
                interruptor diría "grabando" y no se grabaría nada, así
                que un administrador creería tener vídeo de sesiones que
                nunca existió. Una función de auditoría que miente sobre
                sí misma es peor que no tenerla.

                Operable para APAGAR aunque esté gateado, por la misma
                razón que el de consentimiento: nunca se puede dejar a un
                tenant sin forma de revertir. */}
            {(() => {
              const recordOn = Boolean(form?.features?.remoteRecordScreen);
              return (
                <Box sx={{ mt: 1.5 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={recordOn}
                        onChange={(e) =>
                          onChange({
                            ...form,
                            features: {
                              ...(form.features || {}),
                              remoteRecordScreen: e.target.checked,
                            },
                          })
                        }
                        disabled={readOnly || !recordOn}
                      />
                    }
                    label={
                      <Box>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, color: recordOn ? BRAND.dark : BRAND.gray }}
                        >
                          Record screen sessions{" "}
                          <Chip
                            size="small"
                            label="Not available yet"
                            sx={{
                              ml: 1,
                              height: 18,
                              fontSize: TEXT.xs,
                              fontWeight: 700,
                              bgcolor: BRAND.surfaceMuted,
                              color: BRAND.gray,
                            }}
                          />
                        </Typography>
                        <Typography variant="caption" sx={{ color: BRAND.gray }}>
                          Would record screen-sharing sessions for audit: encrypted on
                          the endpoint, uploaded after the session, kept 3 months. No
                          agent build records yet, so turning this on would show
                          &quot;recording&quot; without producing any recording. Applies
                          only to screen sharing — the shell already keeps a transcript.
                        </Typography>
                      </Box>
                    }
                    sx={{ alignItems: "flex-start", mx: 0 }}
                  />

                  {recordOn && (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        mt: 1,
                        ml: 0.5,
                        p: 1,
                        borderRadius: 1,
                        bgcolor: ROLE.criticalSoft,
                        border: `1px solid ${ROLE.critical}33`,
                      }}
                    >
                      <Typography variant="caption" sx={{ color: ROLE.critical, fontWeight: 600 }}>
                        This is on, but no deployed agent can record — sessions are NOT
                        being recorded despite what this switch says. Switch it off until
                        an agent build with recording support is rolled out.
                      </Typography>
                    </Stack>
                  )}
                </Box>
              );
            })()}

            {/* ── rcp.file confinement ────────────────────────────────
                Only meaningful while file transfer is on. The agent
                enforces a secure default set of roots plus a
                non-negotiable deny list (its own credential directory,
                registry hives, /etc secrets) whether or not anything is
                entered here — these fields NARROW that, they can't widen
                it past the built-in denies. */}
            {form?.features?.remoteFile ? (
              <Box sx={{ mt: 1.5, pl: 0.5, borderLeft: `2px solid ${BRAND.border}`, ml: 0.5 }}>
                <Box sx={{ pl: 1.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
                    File access confinement
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: BRAND.gray, display: "block", mb: 1.25 }}
                  >
                    Remote file sessions run with full system privileges on the
                    endpoint. Leave these blank to use the agent&apos;s defaults
                    (user profiles, temp and app-data directories). One absolute
                    path per line.
                  </Typography>

                  <TextField
                    label="Allowed roots"
                    placeholder={"/home\nC:\\Users"}
                    multiline
                    minRows={2}
                    maxRows={6}
                    fullWidth
                    size="small"
                    disabled={readOnly}
                    value={form?.rcpFile?.roots ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...form,
                        rcpFile: { ...(form.rcpFile || {}), roots: e.target.value },
                      })
                    }
                    helperText="Replaces the defaults entirely — it is not added to them."
                    sx={{ mb: 1.5 }}
                  />

                  <TextField
                    label="Additionally blocked paths"
                    placeholder={"/srv/share/secrets"}
                    multiline
                    minRows={2}
                    maxRows={6}
                    fullWidth
                    size="small"
                    disabled={readOnly}
                    value={form?.rcpFile?.denyPaths ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...form,
                        rcpFile: { ...(form.rcpFile || {}), denyPaths: e.target.value },
                      })
                    }
                    helperText="Merged with the agent's built-in blocks. Blocking always beats allowing."
                    sx={{ mb: 1.5 }}
                  />

                  <TextField
                    label="Additionally blocked file types"
                    placeholder={".pem\n.pfx"}
                    multiline
                    minRows={2}
                    maxRows={4}
                    fullWidth
                    size="small"
                    disabled={readOnly}
                    value={form?.rcpFile?.denyExtensions ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...form,
                        rcpFile: {
                          ...(form.rcpFile || {}),
                          denyExtensions: e.target.value,
                        },
                      })
                    }
                    helperText="One per line. The leading dot is added if you leave it out."
                  />

                  {/* Poner la raíz del disco como root no está prohibido — un
                      admin puede necesitarlo — pero es un salto de alcance que
                      merece decirse en voz alta, porque desde el formulario no
                      se ve lo que deja de estar fuera. La denylist sigue
                      aplicando; todo lo demás pasa a ser alcanzable. */}
                  {wideOpenRoot ? (
                    <Alert severity="warning" sx={{ mt: 1.5 }}>
                      A filesystem root ({wideOpenRoot}) makes the whole disk
                      reachable except the blocked paths. The agent&apos;s
                      built-in blocks still apply, but everything else is in
                      scope for remote file sessions.
                    </Alert>
                  ) : null}
                </Box>
              </Box>
            ) : null}
          </Box>
            </Box>
          );
        })()}
      </Box>
  );
}
