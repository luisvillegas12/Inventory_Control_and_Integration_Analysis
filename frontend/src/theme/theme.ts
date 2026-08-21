import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1976D2" },
    warning: { main: "#ed6c02" },
    error: { main: "#c62828" },
    success: { main: "#2e7d32" },
  },
  shape: {
    borderRadius: 12,
  },
});
