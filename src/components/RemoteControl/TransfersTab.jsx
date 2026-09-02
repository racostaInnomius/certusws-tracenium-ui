// src/components/RemoteControl/TransfersTab.jsx
//
// The tenant-wide file transfer audit log, in its own tab.
//
// It used to sit at the bottom of the page, below the session history,
// loaded on every visit whether or not anyone scrolled to it — 200 rows
// fetched to render a table most operators never reached.

import * as React from "react";
import { Box } from "@mui/material";
import FileTransfersAuditTable from "./FileTransfersAuditTable";
import { useFileTransfers } from "./useRemoteControlData";

export default function TransfersTab({ refreshNonce = 0 }) {
  const { transfers, total, loading, refetch } = useFileTransfers(200);

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
      <FileTransfersAuditTable transfers={transfers} total={total} loading={loading} />
    </Box>
  );
}
