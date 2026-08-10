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
  Box,
  Chip,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography
} from "@mui/material";
import { BRAND, ROLE } from "../../theme/brand";

export default function FeaturesSection({ form, onChange, readOnly = false, catalog = [] }) {
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
                      fontSize: 10,
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
                    label="agent 1.1.30+"
                    size="small"
                    sx={{
                      ml: 0.5,
                      height: 18,
                      fontSize: 10,
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
                fontSize: 10,
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

                ⚠️ NOT FUNCTIONAL YET. The backend gate, the policy flag and
                the agent-side plumbing all exist, but no agent build
                registers a real ConsentPrompter (see
                agent-w/src/plugins/rcp/consent-prompt.ts — the default fails
                closed by design). So no agent advertises `rcp.consent`, and
                the backend refuses every consent-required session with 409.
                Turning this on today does not add a prompt; it stops remote
                control working entirely.

                We show it disabled-but-visible rather than hiding it,
                because hiding solves nothing for a tenant that already has
                the flag set in policy — the value persists and keeps
                blocking sessions with no way to see why. For that same
                reason the switch stays operable while it is ON: an operator
                must always be able to turn it back off. */}
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
                        // Can be switched OFF, never ON, until an agent can prompt.
                        disabled={readOnly || !consentOn}
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
                          <Chip
                            size="small"
                            label="Not available yet"
                            sx={{
                              ml: 1,
                              height: 18,
                              fontSize: 10,
                              fontWeight: 700,
                              bgcolor: BRAND.surfaceMuted,
                              color: BRAND.gray,
                            }}
                          />
                        </Typography>
                        <Typography variant="caption" sx={{ color: BRAND.gray }}>
                          Would prompt the logged-in user to approve before any remote
                          session opens. No agent build can show that prompt yet, so
                          the setting can&apos;t be enabled — with it on, every remote
                          session is refused rather than prompted.
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
                        Remote control is currently blocked for the devices this policy
                        applies to. Every session is being refused because no agent can
                        obtain the user&apos;s approval. Switch this off to restore access.
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
                  />
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
