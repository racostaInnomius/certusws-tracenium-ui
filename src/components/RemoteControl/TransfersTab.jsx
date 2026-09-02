// src/components/RemoteControl/TransfersTab.jsx
//
// The tenant-wide file transfer audit log, paged.
//
// It used to sit at the bottom of the page loading 200 rows on every visit
// whether or not anyone scrolled to it — and stopping there, so an audit
// trail longer than 200 transfers was quietly incomplete.

import * as React from "react";
import { Box } from "@mui/material";
import FileTransfersAuditTable from "./FileTransfersAuditTable";
import HistoryPager from "./HistoryPager";
import { useFileTransfers } from "./useRemoteControlData";

export default function TransfersTab({ refreshNonce = 0 }) {
  const [page, setPage] = React.useState(1);
  const pageSize = 25;

  const { transfers, total, loading, refetch } = useFileTransfers({ page, pageSize });

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
      <HistoryPager
        page={page}
        pageSize={pageSize}
        total={total}
        loading={loading}
        noun="transfer"
        onPage={setPage}
      />
    </Box>
  );
}
