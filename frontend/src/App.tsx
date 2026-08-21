import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { Link as RouterLink, Route, Routes, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import EventDetails from "./pages/EventDetails";
import EventsTable from "./pages/EventsTable";
import StoreHealth from "./pages/StoreHealth";

function NavButton({ to, label }: { to: string; label: string }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Button component={RouterLink} to={to} color="inherit" sx={{ opacity: active ? 1 : 0.75 }}>
      {label}
    </Button>
  );
}

export default function App() {
  return (
    <Box>
      <AppBar position="static" color="primary" elevation={0} enableColorOnDark>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            QuickMart Inventory Control
          </Typography>
          <NavButton to="/" label="Dashboard" />
          <NavButton to="/events" label="Events" />
          <NavButton to="/stores" label="Store health" />
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/events" element={<EventsTable />} />
          <Route path="/events/:eventId" element={<EventDetails />} />
          <Route path="/stores" element={<StoreHealth />} />
        </Routes>
      </Container>
    </Box>
  );
}
