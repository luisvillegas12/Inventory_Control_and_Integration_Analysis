import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { getStoreHealth, StoreHealth as StoreHealthData } from "../api/client";
import { EmptyState, ErrorState, LoadingState } from "../components/RequestStates";

const HEALTH_COLOR: Record<string, "success" | "warning" | "error" | "text.secondary"> = {
  HEALTHY: "success",
  STALE: "warning",
  AT_RISK: "error",
  NO_DATA: "text.secondary",
};

export default function StoreHealth() {
  const [merchantId, setMerchantId] = useState("quickmart");
  const [storeId, setStoreId] = useState("");
  const [health, setHealth] = useState<StoreHealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleLookup() {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    setHealth(null);
    getStoreHealth(merchantId, storeId)
      .then(setHealth)
      .catch((err) => setError(err.message ?? "Failed to load store health."))
      .finally(() => setLoading(false));
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h5">Store health</Typography>

      <Stack direction="row" spacing={2}>
        <TextField label="Merchant ID" size="small" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} />
        <TextField label="Store ID" size="small" value={storeId} onChange={(e) => setStoreId(e.target.value)} />
        <Button variant="contained" onClick={handleLookup} disabled={!storeId}>
          Look up
        </Button>
      </Stack>

      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && !health && <EmptyState message="Enter a store ID to check its health." />}

      {!loading && !error && health && (
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary">Health status</Typography>
                <Typography variant="h5" color={`${HEALTH_COLOR[health.healthStatus]}.main` as any}>
                  {health.healthStatus}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary">Last applied version</Typography>
                <Typography variant="h5">{health.lastAppliedVersion ?? "—"}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {health.lastAppliedAt ? new Date(health.lastAppliedAt).toLocaleString() : "no updates yet"}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary">Pending quarantine</Typography>
                <Typography variant="h5">{health.quarantineCount}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary">Total SKUs</Typography>
                <Typography variant="h5">{health.totalSkus}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary">In stock</Typography>
                <Typography variant="h5">{health.inStockCount}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="text.secondary">Out of stock</Typography>
                <Typography variant="h5">{health.outOfStockCount}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Stack>
  );
}
