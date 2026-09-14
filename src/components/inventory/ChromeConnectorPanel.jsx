// src/components/inventory/ChromeConnectorPanel.jsx
//
// Chrome Enterprise connector: the security events Chrome already produces
// (malware transfers, password reuse, unsafe sites, extension installs) sent
// from the customer's Google Cloud Pub/Sub topic to Tracenium, matched to
// devices by name.
//
// ⚠️ The push URL carries a secret token and is shown ONCE, right after it is
// created. The panel says so next to it, because a page that shows a URL
// once without warning is a support ticket tomorrow.
//
// ⚠️ "Receiving" is decided by what actually arrived (last message, counters,
// last error), never by the fact that a connector row exists.

import * as React from "react";
import { Alert, Box, Button, Chip, Paper, Skeleton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import { BRAND, ICON, TEXT, TEXT_MUTED } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import { deleteChromeConnector, getChromeConnector, putChromeConnector } from "../../api/inventoryDashboard";

const CHROME_PUBLISHER = "cloud-pub-sub-publisher@chrome-reporting.iam.gserviceaccount.com";

function statusOf(c) {
  if (!c) return { label: "Not configured", meta: severityMeta("none") };
  if (!c.lastMessageAt) return { label: "Waiting for the first event", meta: severityMeta("medium") };
  if (c.lastError && c.lastErrorAt && Date.parse(c.lastErrorAt) >= Date.parse(c.lastMessageAt)) {
    return { label: "Receiving, with errors", meta: severityMeta("high") };
  }
  return { label: "Receiving", meta: severityMeta("low") };
}

function SetupSteps({ endpointUrl, serviceAccount }) {
  return (
    <Box component="ol" sx={{ m: 0, pl: 2.5, "& li": { fontSize: TEXT.sm, color: BRAND.dark, mb: 0.5 } }}>
      <li>Enroll the browsers in Chrome Enterprise Core (Google Admin console).</li>
      <li>
        In your Google Cloud project, create a Pub/Sub topic and grant{" "}
        <Box component="span" sx={{ fontFamily: "monospace" }}>{CHROME_PUBLISHER}</Box> the Pub/Sub Publisher role on it.
      </li>
      <li>
        Create a <strong>push</strong> subscription on that topic to the endpoint below, with authentication on, using the service
        account <Box component="span" sx={{ fontFamily: "monospace" }}>{serviceAccount || "you entered"}</Box> and the default audience.
      </li>
      <li>In the Admin console, turn on security event reporting and add a Google Cloud Pub/Sub connector with the topic’s full path.</li>
      {endpointUrl ? null : <li>Endpoint: create it with the form above — it is shown once.</li>}
    </Box>
  );
}

export default function ChromeConnectorPanel({ notify, canManage = false }) {
  const [connector, setConnector] = React.useState(undefined);
  const [serviceAccount, setServiceAccount] = React.useState("");
  const [created, setCreated] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const notifyRef = React.useRef(notify);
  React.useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const load = React.useCallback(() => {
    return getChromeConnector()
      .then((res) => setConnector(res?.connector ?? null))
      .catch(() => setConnector(null));
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await putChromeConnector(serviceAccount.trim());
      setCreated({ endpointUrl: res?.endpointUrl, serviceAccount: res?.connector?.pushServiceAccount });
      setConnector(res?.connector ?? null);
      notifyRef.current?.("success", "Endpoint created. Copy it now — it is not shown again.");
    } catch (err) {
      notifyRef.current?.("error", err?.body?.message || err?.message || "Failed to create the endpoint");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteChromeConnector();
      setCreated(null);
      await load();
      notifyRef.current?.("success", "Connector removed. Deliveries to the old endpoint are now rejected.");
    } catch (err) {
      notifyRef.current?.("error", err?.body?.message || err?.message || "Failed to remove the connector");
    } finally {
      setBusy(false);
    }
  };

  const status = statusOf(connector);
  const correlated = connector && connector.eventsReceived > 0 ? Math.round((connector.eventsCorrelated / connector.eventsReceived) * 100) : null;

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}`, mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
        <HubOutlinedIcon sx={{ color: BRAND.teal, fontSize: ICON.lg }} />
        <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>Chrome Enterprise connector</Typography>
        {connector !== undefined ? (
          <Chip size="small" label={status.label} sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: status.meta.bg, color: status.meta.fg }} />
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
          Malware, password reuse, unsafe sites and extension installs reported by Chrome, matched to devices by name
        </Typography>
      </Box>

      {connector === undefined ? (
        <Skeleton variant="rounded" height={80} />
      ) : (
        <Stack spacing={1.25}>
          {connector ? (
            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
                Service account: <Box component="span" sx={{ fontFamily: "monospace" }}>{connector.pushServiceAccount}</Box>
              </Typography>
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
                Last event: {connector.lastMessageAt ? new Date(connector.lastMessageAt).toLocaleString() : "none yet"}
              </Typography>
              <Tooltip title="Events whose device name matched exactly one Tracenium device. Unmatched events are kept, without a device.">
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
                  {connector.eventsReceived} events · {correlated === null ? "—" : `${correlated}% matched to a device`}
                </Typography>
              </Tooltip>
            </Box>
          ) : null}

          {connector?.lastError ? (
            <Alert severity="warning" sx={{ fontSize: TEXT.sm }}>
              Last error{connector.lastErrorAt ? ` (${new Date(connector.lastErrorAt).toLocaleString()})` : ""}: {connector.lastError}
            </Alert>
          ) : null}

          {created?.endpointUrl ? (
            <Alert severity="info" sx={{ fontSize: TEXT.sm }}>
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, mb: 0.5 }}>Push endpoint — shown only now</Typography>
              <Box sx={{ fontFamily: "monospace", wordBreak: "break-all", fontSize: TEXT.xs, mb: 0.75 }}>{created.endpointUrl}</Box>
              <Button
                size="small"
                variant="outlined"
                onClick={() => navigator.clipboard?.writeText(created.endpointUrl).then(() => notifyRef.current?.("success", "Endpoint copied"))}
              >
                Copy endpoint
              </Button>
            </Alert>
          ) : null}

          {canManage ? (
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <TextField
                size="small"
                label="Push subscription service account"
                placeholder="name@project.iam.gserviceaccount.com"
                value={serviceAccount}
                onChange={(e) => setServiceAccount(e.target.value)}
                sx={{ minWidth: 360 }}
              />
              <Button variant="contained" onClick={save} disabled={busy || !serviceAccount.trim()}>
                {connector ? "Create a new endpoint" : "Create endpoint"}
              </Button>
              {connector ? (
                <Button color="error" onClick={remove} disabled={busy}>
                  Remove connector
                </Button>
              ) : null}
              {connector ? (
                <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, width: "100%" }}>
                  A new endpoint replaces the current one: update the Pub/Sub subscription right after.
                </Typography>
              ) : null}
            </Box>
          ) : (
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>Setting up the connector needs the Security Compliance capability.</Typography>
          )}

          {!connector || created ? <SetupSteps endpointUrl={created?.endpointUrl} serviceAccount={created?.serviceAccount || serviceAccount.trim()} /> : null}
        </Stack>
      )}
    </Paper>
  );
}
