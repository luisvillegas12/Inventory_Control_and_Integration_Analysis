import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { approveEvent, getInventoryEvent, InventoryEvent, rejectEvent } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState } from "../components/RequestStates";

export default function EventDetails() {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<InventoryEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reviewer, setReviewer] = useState("");
  const [comment, setComment] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    getInventoryEvent(eventId)
      .then(setEvent)
      .catch((err) => setError(err.message ?? "Failed to load event."))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApproveConfirmed() {
    if (!eventId) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await approveEvent(eventId, reviewer || "unknown-reviewer", comment);
      setConfirmOpen(false);
      load(); // re-fetch in place — no full page reload
    } catch (err: any) {
      setActionError(err.message ?? "Failed to approve event.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!eventId) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await rejectEvent(eventId, reviewer || "unknown-reviewer", comment);
      load();
    } catch (err: any) {
      setActionError(err.message ?? "Failed to reject event.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!event) return <ErrorState message="Event not found." />;

  const isQuarantined = event.status === "QUARANTINED";
  const itemCount = event.items?.length ?? 0;

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography variant="h5">Event {event.event_id}</Typography>
        <StatusBadge status={event.status} />
      </Stack>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography>Store: {event.store_id}</Typography>
          <Typography>Merchant: {event.merchant_id}</Typography>
          <Typography>Version: {event.version}</Typography>
          <Typography>Sent at: {new Date(event.sent_at).toLocaleString()}</Typography>
          <Typography>Received at: {new Date(event.received_at).toLocaleString()}</Typography>
          {event.reason_code && <Typography color="warning.main">Reason: {event.reason_code}</Typography>}
          {event.reviewer && (
            <Typography color="text.secondary">
              Reviewed by {event.reviewer}
              {event.reviewer_comment ? ` — "${event.reviewer_comment}"` : ""}
            </Typography>
          )}
        </Stack>
      </Paper>

      <Divider />

      <Typography variant="h6">Items ({itemCount})</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>SKU</TableCell>
            <TableCell>Stock</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {event.items?.map((item) => (
            <TableRow key={item.sku}>
              <TableCell>{item.sku}</TableCell>
              <TableCell>{item.stock}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {isQuarantined && (
        <Paper variant="outlined" sx={{ p: 2, borderColor: "warning.main" }}>
          <Stack spacing={2}>
            <Typography variant="h6" color="warning.main">
              Quarantine review required
            </Typography>
            <Typography color="text.secondary">
              This event was flagged as a possible mass stock wipe and was not applied to live
              inventory. Review the items above before approving.
            </Typography>

            <TextField
              label="Reviewer name"
              size="small"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              required
            />
            <TextField
              label="Comment (optional)"
              size="small"
              multiline
              minRows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />

            {actionError && <Alert severity="error">{actionError}</Alert>}

            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                color="warning"
                disabled={!reviewer || submitting}
                onClick={() => setConfirmOpen(true)}
              >
                Approve
              </Button>
              <Button variant="outlined" color="error" disabled={!reviewer || submitting} onClick={handleReject}>
                Reject
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      {/* Required confirmation step before an approve actually applies inventory */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Confirm approval</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will apply {itemCount} SKU update{itemCount === 1 ? "" : "s"} to store {event.store_id}
            , overwriting current stock values. This action cannot be undone from this screen.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="contained" color="warning" onClick={handleApproveConfirmed} disabled={submitting}>
            Confirm apply
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
