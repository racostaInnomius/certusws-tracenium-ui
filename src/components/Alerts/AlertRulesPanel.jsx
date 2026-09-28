// src/components/Alerts/AlertRulesPanel.jsx
//
// The "Rules" tab of Alerts: the rule catalog grouped by the plugin each
// source belongs to, so an operator can tell what a rule is about and
// switch on the ones that matter.
//
// A group whose plugin is not AVAILABLE to the tenant (not in the plan, or
// turned off in Agent Settings) is locked: its rules cannot be switched on,
// and a rule that was already on shows as "Paused" — the backend does not
// evaluate it, and keeps it for when the plugin comes back. Switching OFF is
// always allowed. The backend enforces the same (402 / 403 PLUGIN_DISABLED);
// this screen says why before anyone clicks.
//
// Replaces the body of the old "Manage rules" drawer.

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PauseCircleOutlineOutlinedIcon from "@mui/icons-material/PauseCircleOutlineOutlined";
import { BRAND, ICON, TEXT } from "../../theme/brand";
import { SOURCE_LABEL } from "./alertSources";
import RuleNotifyEditor, { NotifyBadge } from "./RuleNotifyEditor";
import RuleCriteriaEditor from "./RuleCriteriaEditor";
import { describeCriteria } from "./criteriaFields";
import { groupRules, describeUnavailable } from "./ruleGroups";
import NewRuleDialog from "./NewRuleDialog";

function PausedChip() {
  return (
    <Tooltip
      title="Its plugin is not available to this tenant, so this rule is not evaluated and sends nothing. It is kept as it is and resumes if the plugin comes back."
      arrow
    >
      <Chip
        size="small"
        icon={<PauseCircleOutlineOutlinedIcon sx={{ fontSize: ICON.sm }} />}
        label="Paused — plugin not available"
        sx={{ bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warningText, fontWeight: 700, fontSize: TEXT.xs }}
      />
    </Tooltip>
  );
}

/**
 * La fila de acciones de una regla: a quién avisa, CUÁNDO avisa y si está
 * pausada. El criterio se editaba sólo por API; la tarjeta lo describía y no
 * ofrecía dónde cambiarlo.
 */
function RuleControls({ rule, openPanel, onOpen, profileNames }) {
  const criteria = describeCriteria(rule.source, rule.criteria);
  return (
    <Box sx={{ mt: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
        <NotifyBadge notify={rule.notify} profileNames={profileNames} />
        <Button
          size="small"
          onClick={() => onOpen("notify")}
          sx={{ textTransform: "none", fontSize: TEXT.sm, color: BRAND.tealText, minWidth: 0 }}
        >
          {openPanel === "notify" ? "Hide" : "Email…"}
        </Button>
        <Button
          size="small"
          onClick={() => onOpen("criteria")}
          sx={{ textTransform: "none", fontSize: TEXT.sm, color: BRAND.tealText, minWidth: 0 }}
        >
          {openPanel === "criteria" ? "Hide" : "Criteria…"}
        </Button>
        {rule.paused ? <PausedChip /> : null}
      </Stack>
      {criteria ? (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{criteria}</Typography>
      ) : null}
    </Box>
  );
}

export default function AlertRulesPanel({
  templates,
  rules,
  availability,
  catalog,
  loading,
  onToggle,
  onEnableTemplate,
  onDeleteRule,
  onSaveNotify,
  onSaveCriteria,
  onCreateRule,
  onNavigate,
  renderSeverity,
  profileNames = null,
  editorProps = {},
}) {
  // Un panel abierto a la vez (entrega o criterio): son bloques a todo ancho.
  // `{ id, panel }` — `panel` es "notify" | "criteria".
  const [open, setOpen] = React.useState(null);
  const panelOf = (id) => (open?.id === id ? open.panel : null);
  const openPanel = (id, panel) =>
    setOpen((cur) => (cur?.id === id && cur.panel === panel ? null : { id, panel }));
  const groups = React.useMemo(
    () => groupRules({ templates, rules, catalog, availability }),
    [templates, rules, catalog, availability]
  );
  // Locked groups start folded: they are reference, not something to act on.
  const [folded, setFolded] = React.useState({});
  const [creating, setCreating] = React.useState(false);
  // Fuente → plugin, de lo que ya trajo el backend: el diálogo lo necesita
  // para no ofrecer una fuente de un plugin que la API va a rechazar.
  const sourcePlugin = React.useMemo(() => {
    const map = {};
    for (const row of [...templates, ...rules]) {
      if (row?.source && row.plugin !== undefined) map[row.source] = row.plugin;
    }
    return map;
  }, [templates, rules]);
  const isFolded = (g) => folded[g.key] ?? !g.available;
  const toggleFold = (g) => setFolded((f) => ({ ...f, [g.key]: !isFolded(g) }));

  if (loading && templates.length === 0) {
    return (
      <Stack alignItems="center" sx={{ py: 4 }}>
        <CircularProgress size={20} sx={{ color: BRAND.teal }} />
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, flex: 1 }}>
          Rules are grouped by the plugin that produces the data. Switch on the ones you want; each rule decides who is
          emailed in <strong>Email…</strong>. Need a second rule of the same kind — a longer threshold for a different
          audience — add your own.
        </Typography>
        {onCreateRule ? (
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddOutlinedIcon />}
            onClick={() => setCreating(true)}
            sx={{ textTransform: "none", whiteSpace: "nowrap", borderColor: BRAND.border, color: BRAND.dark }}
          >
            New rule
          </Button>
        ) : null}
      </Stack>

      {groups.map((g) => {
        const lockedText = g.available ? "" : describeUnavailable(g);
        const fold = isFolded(g);
        return (
          <Box key={g.key} component="section" aria-label={`${g.title} alert rules`}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ py: 0.75, borderBottom: `1px solid ${BRAND.border}`, flexWrap: "wrap", rowGap: 0.5 }}
            >
              <IconButton
                size="small"
                onClick={() => toggleFold(g)}
                aria-label={`${fold ? "Expand" : "Collapse"} ${g.title}`}
                aria-expanded={!fold}
              >
                <ExpandMoreOutlinedIcon
                  fontSize="small"
                  sx={{ transform: fold ? "rotate(-90deg)" : "none", transition: "transform 120ms" }}
                />
              </IconButton>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: BRAND.dark }}>
                {g.title}
              </Typography>
              {g.label ? (
                <Chip size="small" label={g.label} sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.tealText, fontWeight: 700 }} />
              ) : null}
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                {g.enabled} of {g.total} on
                {g.paused ? ` · ${g.paused} paused` : ""}
              </Typography>
              <Box sx={{ flex: 1 }} />
              {!g.available ? (
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Chip
                    size="small"
                    icon={<LockOutlinedIcon sx={{ fontSize: ICON.sm }} />}
                    label={lockedText}
                    sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.gray, fontWeight: 700, fontSize: TEXT.xs }}
                  />
                  {g.reason === "disabled" && onNavigate ? (
                    <Button
                      size="small"
                      onClick={() => onNavigate("agent-settings")}
                      sx={{ textTransform: "none", fontSize: TEXT.sm, color: BRAND.tealText }}
                    >
                      Open Agent Settings
                    </Button>
                  ) : null}
                </Stack>
              ) : null}
            </Stack>

            <Collapse in={!fold} unmountOnExit>
              <Stack spacing={1.25} sx={{ pt: 1.25 }}>
                {g.items.map(({ template: t, primary }) => {
                  const enabled = Boolean(primary?.enabled);
                  // Off → on needs the plugin; on → off never does.
                  const canSwitch = enabled || g.available;
                  return (
                    <Paper
                      key={t.templateId}
                      elevation={0}
                      sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}`, opacity: t.deprecated ? 0.5 : 1 }}
                    >
                      <Stack direction="row" alignItems="flex-start" spacing={1.25}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap" }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BRAND.dark }}>
                              {t.name}
                            </Typography>
                            {renderSeverity?.(primary?.severity || t.defaultSeverity)}
                            <Chip
                              size="small"
                              label={SOURCE_LABEL[t.source] || t.source}
                              sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.tealText }}
                            />
                          </Stack>
                          <Typography variant="body2" sx={{ color: BRAND.gray, fontSize: TEXT.md }}>
                            {t.description}
                          </Typography>
                          {/* Delivery config only exists once the template has a tenant rule. */}
                          {primary ? (
                            <RuleControls
                              rule={primary}
                              openPanel={panelOf(primary.id)}
                              onOpen={(panel) => openPanel(primary.id, panel)}
                              profileNames={profileNames}
                            />
                          ) : (
                            // Sin regla no hay a qué colgar la entrega. Decirlo
                            // es mejor que una fila que aparece de la nada al
                            // encender el interruptor.
                            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 1 }}>
                              Switch it on to choose who is emailed and when it fires.
                            </Typography>
                          )}
                        </Box>
                        <Tooltip
                          title={
                            !canSwitch ? lockedText : primary ? (enabled ? "Disable" : "Enable") : "Enable for this tenant"
                          }
                        >
                          <span>
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={enabled}
                                  disabled={!canSwitch}
                                  onChange={(e) => {
                                    if (primary) onToggle(primary, e.target.checked);
                                    else if (e.target.checked) onEnableTemplate(t);
                                  }}
                                  // MUI 7: el aria-label del input va por slotProps. Sin él,
                                  // cada interruptor suena igual en un lector de pantalla.
                                  slotProps={{ input: { "aria-label": t.name } }}
                                />
                              }
                              label=""
                              sx={{ m: 0 }}
                            />
                          </span>
                        </Tooltip>
                      </Stack>

                      {primary && panelOf(primary.id) === "notify" ? (
                        <RuleNotifyEditor rule={primary} onSave={(n) => onSaveNotify(primary, n)} {...editorProps} />
                      ) : null}
                      {primary && panelOf(primary.id) === "criteria" ? (
                        <RuleCriteriaEditor rule={primary} onSave={(c) => onSaveCriteria(primary, c)} />
                      ) : null}
                    </Paper>
                  );
                })}

                {g.custom.map((r) => (
                  <Paper key={r.id} elevation={0} sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}` }}>
                    <Stack direction="row" alignItems="flex-start" spacing={1.25}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: "wrap" }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BRAND.dark }}>
                            {r.name}
                          </Typography>
                          {renderSeverity?.(r.severity)}
                          <Chip
                            size="small"
                            label={SOURCE_LABEL[r.source] || r.source}
                            sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.tealText }}
                          />
                          <Chip
                            size="small"
                            label={r.templateId ? "Extra instance" : "Custom"}
                            sx={{ bgcolor: BRAND.surfaceMuted, color: BRAND.gray }}
                          />
                        </Stack>
                        <RuleControls
                          rule={r}
                          openPanel={panelOf(r.id)}
                          onOpen={(panel) => openPanel(r.id, panel)}
                          profileNames={profileNames}
                        />
                      </Box>
                      <Tooltip title={!(r.enabled || g.available) ? lockedText : r.enabled ? "Disable" : "Enable"}>
                        <span>
                          <Switch
                            checked={r.enabled}
                            disabled={!(r.enabled || g.available)}
                            onChange={(e) => onToggle(r, e.target.checked)}
                            slotProps={{ input: { "aria-label": r.name } }}
                          />
                        </span>
                      </Tooltip>
                      <Tooltip title="Delete custom rule">
                        <IconButton aria-label={`Delete ${r.name}`} size="small" onClick={() => onDeleteRule(r)}>
                          <CloseOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                    {panelOf(r.id) === "notify" ? (
                      <RuleNotifyEditor rule={r} onSave={(n) => onSaveNotify(r, n)} {...editorProps} />
                    ) : null}
                    {panelOf(r.id) === "criteria" ? (
                      <RuleCriteriaEditor rule={r} onSave={(c) => onSaveCriteria(r, c)} />
                    ) : null}
                  </Paper>
                ))}
              </Stack>
            </Collapse>
          </Box>
        );
      })}

      {onCreateRule ? (
        <NewRuleDialog
          open={creating}
          onClose={() => setCreating(false)}
          onCreate={async (body) => {
            const created = await onCreateRule(body);
            if (created !== false) setCreating(false);
          }}
          sourcePlugin={sourcePlugin}
          availability={availability}
        />
      ) : null}
    </Stack>
  );
}
