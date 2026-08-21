import Chip from "@mui/material/Chip";

const COLOR_BY_STATUS: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  RECEIVED: "default",
  VALIDATED: "info",
  APPLIED: "success",
  QUARANTINED: "warning",
  APPROVED: "success",
  REJECTED: "error",
};

export function StatusBadge({ status }: { status: string }) {
  return <Chip label={status} color={COLOR_BY_STATUS[status] ?? "default"} size="small" />;
}
