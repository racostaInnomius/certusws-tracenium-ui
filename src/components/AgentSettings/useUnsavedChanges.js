// src/components/AgentSettings/useUnsavedChanges.js
//
// The browser-level half of "nothing is lost in silence": while the form
// has unsaved changes, closing the tab or reloading asks first. The
// in-app half (pausing auto-refresh, the nav badges) lives in the page,
// because it needs the diff, not just the flag.

import * as React from "react";

export function useUnsavedChanges(isDirty) {
  React.useEffect(() => {
    if (!isDirty || typeof window === "undefined") return undefined;
    const handler = (event) => {
      event.preventDefault();
      // Chrome requires returnValue to be set for the prompt to appear.
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}

export default useUnsavedChanges;
