import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { getInventoryEvents, InventoryEvent } from "../api/client";
import { ErrorState, LoadingState } from "../components/RequestStates";

const STATUS_LIST = ["APPLIED", "QUARANTINED", "APPROVED", "REJECTED"] as const;

export default function Dashboard() {
  const [events, setEvents] = useState<InventoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getInventoryEvents({ limit: "200" })
      .then(setEvents)
      .catch((err) => setError(err.message ?? "Failed to load dashboard data."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const counts = STATUS_LIST.reduce<Record<string, number>>((acc, status) => {
    acc[status] = events.filter((e) => e.status === status).length;
    return acc;
  }, {});

  const uniqueStores = new Set(events.map((e) => e.store_id)).size;

  return (
    <Stack spacing={3}>
      <Typography variant="h5">Summary dashboard</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={3}>
          <Card variant="outlined">
            <CardContent>
              <Typography color="text.secondary">Stores with events</Typography>
              <Typography variant="h4">{uniqueStores}</Typography>
            </CardContent>
          </Card>
        </Grid>
        {STATUS_LIST.map((status) => (
          <Grid item xs={12} sm={3} key={status}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary">{status}</Typography>
                <Typography variant="h4">{counts[status]}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}
