// src/components/RemoteControl/SessionsTab.jsx
//
// Session history, in its own tab.
//
// ⚠️ The endpoint accepts `limit` (max 200) and `deviceId`, and nothing else.
// There is no offset, no status filter, no date range — so past the newest
// 200 sessions the history stops existing for this page. Phase 4 adds
// pagination and filters; until then SessionHistoryTable renders `total`
// next to the rows so the gap is stated rather than hidden.

import * as React from "react";
import { Box } from "@mui/material";
import SessionHistoryTable from "./SessionHistoryTable";
import { useRemoteSessions } from "./useRemoteControlData";

export default function SessionsTab({ onReplay, refreshNonce = 0 }) {
  const { sessions, total, loading, refetch } = useRemoteSessions(50);

  // The panel unmounts when another tab is active, so this only fires while
  // Sessions is on screen. Everything else is covered by the page
  // invalidating the cache key — the next mount then reloads.
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    refetch();
  }, [refreshNonce, refetch]);

  return (
    <Box>
      <SessionHistoryTable
        sessions={sessions}
        total={total}
        loading={loading}
        onReplay={onReplay}
      />
    </Box>
  );
}
