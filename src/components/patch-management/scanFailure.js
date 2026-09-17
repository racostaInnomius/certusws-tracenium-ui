// src/components/patch-management/scanFailure.js
//
// Why a patch scan failed, in words an operator can act on. PURE — no React.
//
// ⚠️ WHY (T111, 17-sep): MSIG-FILESHARE showed a red «Error» chip whose only
// explanation, behind a hover nobody knew was there, was
// «Windows Update scan exceeded 150s. stderr_tail: #< CLIXML». Nothing said
// what failed, whether it would clear on its own, or what to do.
// Worse, a failed scan arrives with ZERO items and the backend replaces the
// device's pending list with it, so the same row read «Missing 0» and the
// drawer said «This device is up to date» — for a scan that never finished.
//
// The notes come from the agent / PrivSvc verbatim, so matching is by the
// stable part of each message. Anything unrecognised is still shown, cleaned
// of transport noise, rather than hidden.

/** PowerShell's CLIXML progress stream and similar noise add nothing for a human. */
function cleanNote(note) {
  return String(note ?? "")
    .replace(/\s*stderr_tail:\s*#<\s*CLIXML\s*/gi, " ")
    .replace(/\s*stderr_tail:\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `{ title, cause, action }` for a scan note, or null when there is no note.
 * `title` is short (chip/heading); `cause` and `action` are full sentences.
 */
export function explainScanFailure(note) {
  const raw = cleanNote(note);
  if (!raw) return null;

  let m = /Windows Update scan exceeded (\d+)\s*s/i.exec(raw);
  if (m) {
    return {
      title: "Windows Update scan timed out",
      cause: `Windows Update did not answer within ${m[1]} seconds. This is common in the first minutes after a restart, or when the update server (WSUS) is slow.`,
      action: "It usually clears on the next scan — use Run scan now in a few minutes. If it keeps failing, check the Windows Update service and the device's connection to its update server.",
    };
  }

  m = /PrivSvc timeout: patch\.scan did not answer.*behind ([\w., ]+)\)/i.exec(raw);
  if (m) {
    return {
      title: "Scan waited behind another check",
      cause: `The agent was busy running ${m[1].trim()} and the patch scan ran out of time waiting its turn.`,
      action: "Nothing is wrong with Windows Update. Use Run scan now in a few minutes.",
    };
  }

  if (/PrivSvc timeout/i.test(raw)) {
    return {
      title: "Agent did not answer in time",
      cause: "The agent's privileged service did not return the scan result in time.",
      action: "Use Run scan now. If it keeps failing, restart the Tracenium services on the device.",
    };
  }

  if (/PrivSvc connection closed|pipe\\?\.?\\?tracenium\.privsvc|ENOENT.*privsvc/i.test(raw)) {
    return {
      title: "Agent privileged service unavailable",
      cause: "The agent could not reach its privileged service, which runs the scan.",
      action: "Restart the Tracenium services on the device, then use Run scan now.",
    };
  }

  m = /last synced (\d+) days ago/i.exec(raw);
  if (m) {
    return {
      title: "Update catalogue out of date",
      cause: `Windows Update last synced ${m[1]} days ago, so a count of 0 is not evidence the device is patched.`,
      action: "Check that the device can reach its update server (WSUS or Microsoft Update) and that Windows Update sync is not disabled.",
    };
  }

  if (/no record of a successful sync/i.test(raw)) {
    return {
      title: "Update catalogue never synced",
      cause: "Windows Update has never completed a sync on this device, so a count of 0 is not evidence it is patched.",
      action: "Check that the device can reach its update server (WSUS or Microsoft Update) and run a Windows Update check once.",
    };
  }

  if (/softwareupdate/i.test(raw)) {
    return {
      title: "macOS software update check failed",
      cause: raw,
      action: "Use Run scan now. If it keeps failing, run `softwareupdate --list` on the Mac to see the error.",
    };
  }

  return { title: "Scan failed", cause: raw, action: "Use Run scan now. If it keeps failing, check the agent logs on the device." };
}
