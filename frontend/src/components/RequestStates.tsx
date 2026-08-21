import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export function LoadingState() {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ py: 6 }} spacing={2}>
      <CircularProgress size={28} />
      <Typography color="text.secondary">Loading…</Typography>
    </Stack>
  );
}

export function EmptyState({ message = "Nothing to show yet." }: { message?: string }) {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ py: 6 }}>
      <Typography color="text.secondary">{message}</Typography>
    </Stack>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ py: 6 }}>
      <Typography color="error.main">{message}</Typography>
    </Stack>
  );
}
