// src/components/DeviceManagement/MdmAppleSetupTab.jsx
//
// Apple setup: el certificado de push de APNs de la organización (28-sep-2026).
//
// El modelo de Jamf e Intune: Tracenium firma la solicitud con su certificado
// de proveedor MDM; el administrador la sube al portal de Apple con la Apple
// Account de SU empresa y trae de vuelta el `.pem`. Sin ese certificado no se
// puede despertar a un equipo para mandarle comandos.
//
// Mirar pide la capacidad `enrollment` (la de toda la API de MDM). Descargar
// la solicitud e instalar el `.pem` piden además ADMIN/OWNER: lo decide el
// servidor, y aquí sólo se deshabilita para no ofrecer un 403.

import * as React from "react";
import Grid from "@mui/material/Grid";
import { Alert, Box, Button, TextField, Typography } from "@mui/material";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";

import SectionPaper from "../common/SectionPaper";
import { useConfirm } from "../common/ConfirmDialog";
import { BRAND, TEXT } from "../../theme/brand";
import { formatDate } from "../../utils/format";
import { downloadTextFile } from "../../utils/browserState";
import {
  getMdmPushCertificate,
  installMdmPushCertificate,
  requestMdmPushCertificate,
} from "../../api/mdm";
import { APPLE_ACCOUNT_RE, looksLikePem, pushCertificateStatus, requestBlocker } from "./mdmModel";
import { Field, StatusChip } from "./mdmAtoms";

const APPLE_PORTAL_FALLBACK = "https://identity.apple.com/pushcert/";

// Una caducidad es un día, y a un año vista el año importa: «Oct 10, 2027».
const DAY = { year: "numeric", month: "short", day: "2-digit" };

const primaryButtonSx = {
  textTransform: "none",
  fontWeight: 800,
  bgcolor: BRAND.teal,
  "&:hover": { bgcolor: BRAND.tealHover },
};
const outlinedButtonSx = {
  textTransform: "none",
  fontWeight: 700,
  borderColor: BRAND.teal,
  color: BRAND.tealText,
};

function Step({ number, title, children }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
      <Box
        aria-hidden
        sx={{
          flex: "0 0 auto",
          width: 26,
          height: 26,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontSize: TEXT.sm,
          fontWeight: 800,
          bgcolor: BRAND.darkSoft,
          color: BRAND.dark,
        }}
      >
        {number}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1, display: "grid", gap: 1 }}>
        <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>{title}</Typography>
        {children}
      </Box>
    </Box>
  );
}

export default function MdmAppleSetupTab({ canConfigure, notify, onChanged }) {
  const confirm = useConfirm();
  const [setup, setSetup] = React.useState(null);
  const [loadError, setLoadError] = React.useState(null);
  const [downloading, setDownloading] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);
  const [file, setFile] = React.useState(null); // { name, text }
  const [appleAccount, setAppleAccount] = React.useState("");
  const [formError, setFormError] = React.useState(null);
  const fileInput = React.useRef(null);

  const load = React.useCallback(async ({ fresh = false } = {}) => {
    try {
      const data = await getMdmPushCertificate({ fresh });
      setSetup(data);
      setLoadError(null);
      // La cuenta con la que se creó: renovar con otra cambia el Topic.
      setAppleAccount((current) => current || data?.pushCertificate?.appleAccount || "");
    } catch (err) {
      setLoadError(err?.body?.message || err?.message || "Could not load the push certificate.");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const cert = setup?.pushCertificate ?? null;
  const configured = cert?.configured === true;
  const status = pushCertificateStatus(cert);
  const blocker = requestBlocker(setup?.requests);
  const portalUrl = setup?.portalUrl || APPLE_PORTAL_FALLBACK;
  const onOtherTopic = Number(setup?.devices?.onOtherTopic) || 0;

  async function downloadRequest() {
    setDownloading(true);
    try {
      const { filename, content } = await requestMdmPushCertificate();
      downloadTextFile(filename, content);
      notify?.("Request downloaded. Upload it to the Apple Push Certificates Portal.", "success");
      await load({ fresh: true });
    } catch (err) {
      notify?.(err?.body?.message || err?.message || "Could not create the request.", "error");
    } finally {
      setDownloading(false);
    }
  }

  async function pickFile(event) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    setFormError(null);
    if (picked.size > 16 * 1024) {
      setFile(null);
      setFormError("That file is too large to be a push certificate. Choose the .pem Apple gave you.");
      return;
    }
    const text = await picked.text();
    if (!looksLikePem(text)) {
      setFile(null);
      setFormError("That file isn't a PEM certificate. Choose the .pem Apple gave you.");
      return;
    }
    setFile({ name: picked.name, text });
  }

  async function install(confirmTopicChange = false) {
    setFormError(null);
    if (!file) {
      setFormError("Choose the .pem file you downloaded from Apple.");
      return;
    }
    if (!APPLE_ACCOUNT_RE.test(appleAccount.trim())) {
      setFormError("Enter the Apple Account (email) you signed in with at Apple.");
      return;
    }
    setInstalling(true);
    try {
      const result = await installMdmPushCertificate({
        certificate: file.text,
        appleAccount: appleAccount.trim(),
        ...(confirmTopicChange ? { confirmTopicChange: true } : {}),
      });
      setFile(null);
      notify?.(
        result?.topicChanged
          ? "Push certificate installed with a new topic. Enroll your devices again."
          : "Push certificate installed.",
        "success"
      );
      await load({ fresh: true });
      onChanged?.();
    } catch (err) {
      const body = err?.body || {};
      if (err?.status === 409 && body.error === "topic_changed") {
        setInstalling(false);
        const ok = await confirm({
          title: "Replace the push certificate with a different one?",
          body:
            "This certificate belongs to a different Apple Account than the current one" +
            (body.currentAppleAccount ? ` (${body.currentAppleAccount})` : "") +
            ", so Apple gave it a different topic.\n\n" +
            "Devices enrolled with the current certificate can't be reached with the new one: " +
            "every Mac, iPhone and iPad will have to enroll again.\n\n" +
            "If you meant to renew, cancel and renew with the original Apple Account instead.",
          confirmText: "Replace and re-enroll",
          danger: true,
        });
        if (ok) await install(true);
        return;
      }
      setFormError(body.message || err?.message || "Could not install the certificate.");
    } finally {
      setInstalling(false);
    }
  }

  if (loadError && !setup) {
    return (
      <Alert severity="error" sx={{ borderRadius: 3 }}>
        {loadError}
      </Alert>
    );
  }

  return (
    <Box>
      {cert?.state === "expired" ? (
        <Alert severity="error" sx={{ borderRadius: 3, mb: 2 }}>
          The push certificate expired on {formatDate(cert.notAfter, DAY)}. Renew it with the same Apple
          Account{cert.appleAccount ? ` (${cert.appleAccount})` : ""} to keep your devices.
        </Alert>
      ) : null}
      {cert?.state === "expiring" ? (
        <Alert severity="warning" sx={{ borderRadius: 3, mb: 2 }}>
          The push certificate expires on {formatDate(cert.notAfter, DAY)}. Renew it with the same Apple
          Account{cert.appleAccount ? ` (${cert.appleAccount})` : ""}: with another account every device
          has to enroll again.
        </Alert>
      ) : null}

      <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.5 }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark, mr: "auto" }}>
            Apple push certificate
          </Typography>
          {setup ? <StatusChip status={status} /> : null}
        </Box>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5, maxWidth: 760 }}>
          Apple only lets a server wake your organization&apos;s Macs, iPhones and iPads with a push
          certificate issued to your organization. Tracenium signs the request; you create the
          certificate at Apple with your company&apos;s Apple Account.
        </Typography>

        {setup === null ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>Loading…</Typography>
        ) : configured ? (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Field label="Topic" mono>{cert.topic}</Field>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Field label="Apple Account">{cert.appleAccount || "—"}</Field>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Field label="Expires">{formatDate(cert.notAfter, DAY)}</Field>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Field label="Installed">{formatDate(cert.uploadedAt)}</Field>
            </Grid>
          </Grid>
        ) : (
          <Typography variant="body2" sx={{ color: BRAND.dark }}>
            No push certificate yet. Devices can enroll and report, but Tracenium can&apos;t send them
            commands or policies.
          </Typography>
        )}

        {setup && onOtherTopic > 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.alert.warningText, mt: 1.5, fontWeight: 600 }}>
            {configured
              ? `${onOtherTopic} enrolled device${onOtherTopic === 1 ? " uses" : "s use"} a different topic and will need to enroll again.`
              : `${onOtherTopic} enrolled device${onOtherTopic === 1 ? "" : "s"} will need to enroll again once the certificate is installed.`}
          </Typography>
        ) : null}
      </SectionPaper>

      <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Typography sx={{ fontWeight: 800, color: BRAND.dark, mb: 0.5 }}>
          {configured ? "Renew the certificate" : "Create the certificate"}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2, maxWidth: 760 }}>
          {configured
            ? "Apple push certificates last one year. Renew before it expires, with the same Apple Account, and the topic stays the same: devices keep working."
            : "Three steps, about five minutes. Use a company-owned Apple Account, not a personal one: you'll need the same account every year to renew."}
        </Typography>
        {!canConfigure ? (
          <Alert severity="info" sx={{ borderRadius: 3, mb: 2 }}>
            Only tenant admins and owners can set up the push certificate.
          </Alert>
        ) : null}

        <Box sx={{ display: "grid", gap: 2.5 }}>
          <Step number={1} title="Download the request from Tracenium">
            <Box>
              <Button
                variant="contained"
                startIcon={<DownloadOutlinedIcon />}
                onClick={downloadRequest}
                disabled={!canConfigure || Boolean(blocker) || downloading || setup === null}
                sx={primaryButtonSx}
              >
                {downloading ? "Preparing…" : "Download request"}
              </Button>
            </Box>
            {blocker ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>{blocker}</Typography>
            ) : cert?.pendingRequestAt ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Downloaded {formatDate(cert.pendingRequestAt)}. Downloading again gives you the same
                request.
              </Typography>
            ) : null}
          </Step>

          <Step number={2} title="Create the certificate at Apple">
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {configured
                ? `Sign in with ${cert.appleAccount || "the Apple Account you used before"}, choose Renew next to the certificate, upload the request and download the new certificate.`
                : "Sign in with your company's Apple Account, choose Create a Certificate, accept the terms, upload the request and download the certificate (.pem)."}
            </Typography>
            <Box>
              <Button
                variant="outlined"
                endIcon={<OpenInNewOutlinedIcon />}
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={outlinedButtonSx}
              >
                Open Apple Push Certificates Portal
              </Button>
            </Box>
          </Step>

          <Step number={3} title="Install the certificate here">
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "flex-start" }}>
              <input
                ref={fileInput}
                type="file"
                accept=".pem,application/x-pem-file"
                hidden
                onChange={pickFile}
                data-testid="push-certificate-file"
              />
              <Button
                variant="outlined"
                startIcon={<UploadFileOutlinedIcon />}
                onClick={() => fileInput.current?.click()}
                disabled={!canConfigure || installing}
                sx={outlinedButtonSx}
              >
                {file ? "Choose another file" : "Choose .pem file"}
              </Button>
              <TextField
                size="small"
                label="Apple Account"
                type="email"
                value={appleAccount}
                onChange={(e) => setAppleAccount(e.target.value)}
                disabled={!canConfigure || installing}
                helperText="The account you signed in with at Apple."
                sx={{ minWidth: 260, flex: "1 1 260px", maxWidth: 380 }}
              />
            </Box>
            {file ? (
              <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600, overflowWrap: "anywhere" }}>
                {file.name}
              </Typography>
            ) : null}
            {formError ? (
              <Typography role="alert" variant="body2" sx={{ color: BRAND.alert.errorText, fontWeight: 600 }}>
                {formError}
              </Typography>
            ) : null}
            <Box>
              <Button
                variant="contained"
                onClick={() => install(false)}
                disabled={!canConfigure || installing || !file}
                sx={primaryButtonSx}
              >
                {installing ? "Installing…" : "Install certificate"}
              </Button>
            </Box>
          </Step>
        </Box>
      </SectionPaper>
    </Box>
  );
}
