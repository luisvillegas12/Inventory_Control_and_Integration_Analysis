import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getInventoryEvents, InventoryEvent } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "../components/RequestStates";

const STATUS_OPTIONS = ["", "RECEIVED", "VALIDATED", "APPLIED", "QUARANTINED", "APPROVED", "REJECTED"];

export default function EventsTable() {
  const [events, setEvents] = useState<InventoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeId, setStoreId] = useState("");
  const [status, setStatus] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const filters: Record<string, string> = {};
    if (storeId) filters.storeId = storeId;
    if (status) filters.status = status;

    getInventoryEvents(filters)
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Failed to load events.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [storeId, status]);

  return (
    <Stack spacing={3}>
      <Typography variant="h5">Inventory events</Typography>

      <Stack direction="row" spacing={2}>
        <TextField
          label="Filter by store ID"
          size="small"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        />
        <TextField
          select
          label="Status"
          size="small"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 180 }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <MenuItem key={opt} value={opt}>
              {opt || "All statuses"}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && events.length === 0 && <EmptyState message="No events match these filters." />}

      {!loading && !error && events.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Store</TableCell>
                <TableCell>Event ID</TableCell>
                <TableCell>Version</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Received</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.map((event) => (
                <TableRow
                  key={event.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => navigate(`/events/${event.id}`)}
                >
                  <TableCell>{event.store_id}</TableCell>
                  <TableCell>{event.event_id}</TableCell>
                  <TableCell>{event.version}</TableCell>
                  <TableCell>
                    <StatusBadge status={event.status} />
                  </TableCell>
                  <TableCell>{event.reason_code ?? "—"}</TableCell>
                  <TableCell>{new Date(event.received_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
