// src/components/software-delivery/packageOrigin.js
//
// How a catalog package got in — which is the same question as how much the
// control plane actually knows about it.
//
// TWO DOORS, VERY DIFFERENT GUARANTEES
//
// A package that came through intake was uploaded to us and put through the
// analysis pipeline: format detection, metadata extraction, Authenticode /
// PKCS#7 signature and certificate-chain verification, reputation, and the
// generated install config (silent args + detection rule derived from the real
// binary). The artifact then lives in a blob we control.
//
// A package created from a URL is validated for SHAPE only — platform in the
// enum, arch in the enum, sha256 is 64 hex characters. Nobody checks the file
// is signed, that the hash matches whatever the URL serves, or that the install
// arguments work. An operator typed them.
//
// Both are legitimate: the upload path has a size ceiling and there are real
// cases for a vendor artifact already sitting on a trusted host. What is NOT
// legitimate is that the two are indistinguishable once they are in the table —
// so a row can say "we verified this" when nobody did.
//
// THE SIGNAL
//
// Approving an intake stores `blob:<name>` as the download path rather than a
// URL, because the blob is private and the backend mints a fresh signed URL
// from that string on every dispatch. So the prefix IS the provenance: it can
// only have been written by the approve path.
//
// This lived as a private `isManagedBlobRef` inside PackageDialog, where it
// answered a narrower question ("may this field skip the https check?"). Same
// test, and it is now named for what it means rather than where it was needed.

/**
 * Was this artifact uploaded to us and analysed, rather than pointed at?
 *
 * Accepts either a package object or a bare download path, because the two
 * callers naturally hold different things: the grid has a row, the dialog has a
 * field value.
 */
export function isVerifiedPackage(pkgOrPath) {
  const path =
    typeof pkgOrPath === "string" ? pkgOrPath : pkgOrPath?.downloadPath;
  return /^blob:/i.test(String(path ?? "").trim());
}

/**
 * Short provenance label for a catalog row.
 *
 * Deliberately says what was DONE, not how good it is: "Analyzed" is a fact
 * about the pipeline having run. "Unverified" is likewise a statement about
 * what we checked, not a judgement of the file — plenty of unverified packages
 * are perfectly fine, and the operator is the one who decided to trust them.
 */
export function originLabel(pkg) {
  return isVerifiedPackage(pkg) ? "Analyzed" : "Unverified";
}
