import { lazy, Suspense, useEffect, useState } from "react";
import {
  matchPath,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { fetchCurrentUser, logout, CurrentUser } from "./api/auth";
import { checkBackend } from "./api/health";
import Imports from "./pages/Imports";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Locations from "./pages/Locations";
import Milestones from "./pages/Milestones";
import MilestoneDetail from "./pages/MilestoneDetail";
const Analytics = lazy(() => import("./pages/Analytics"));
const ExplorerLayout = lazy(() => import("./pages/ExplorerLayout"));
const ExplorerBeers = lazy(() => import("./pages/ExplorerBeers"));
const ExplorerUpcoming = lazy(() =>
  import("./pages/ExplorerLayout").then((module) => ({
    default: module.ExplorerUpcoming,
  })),
);
import Login from "./pages/Login";
import { Button, StatusBadge } from "./components/ui";

const links = [
  ["/", "Dashboard"],
  ["/inventory", "Inventory"],
  ["/locations", "Locations"],
  ["/milestones", "Milestones"],
  ["/analytics", "Analytics"],
  ["/explore/beers", "Explorer"],
  ["/imports", "Imports"],
];

// Keep dark theme activation tied to complete, migrated route surfaces.
// Analytics includes its URL-selected Overview and Drinking Trends panels;
// unfinished Explorer catalogues and the wildcard placeholder remain light.
const themeAwareRoutes = [
  "/",
  "/inventory",
  "/locations",
  "/imports",
  "/milestones",
  "/milestones/:id",
  "/analytics",
  "/explore/beers",
];

function Placeholder({ title }: { title: string }) {
  return (
    <section className="placeholder-panel">
      <h2>{title}</h2>
      <p>This M1 foundation placeholder is not implemented yet.</p>
    </section>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const themeAware = themeAwareRoutes.some(
    (path) => matchPath(path, location.pathname) !== null,
  );
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authState, setAuthState] = useState<
    "loading" | "authenticated" | "anonymous" | "error"
  >("loading");
  const [status, setStatus] = useState<"loading" | "connected" | "offline">(
    "loading",
  );
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);
  useEffect(() => {
    let mounted = true;
    fetchCurrentUser()
      .then((currentUser) => {
        if (!mounted) return;
        setUser(currentUser);
        setAuthState(currentUser ? "authenticated" : "anonymous");
      })
      .catch(() => mounted && setAuthState("error"));
    const expired = () => {
      if (mounted) {
        setUser(null);
        setAuthState("anonymous");
      }
    };
    window.addEventListener("hopstats:session-expired", expired);
    return () => {
      mounted = false;
      window.removeEventListener("hopstats:session-expired", expired);
    };
  }, []);
  useEffect(() => {
    if (authState !== "authenticated") return;
    checkBackend()
      .then((ok) => setStatus(ok ? "connected" : "offline"))
      .catch(() => setStatus("offline"));
  }, [authState]);

  if (authState === "loading") {
    return (
      <main className="auth-loading theme-aware" aria-busy="true">
        Checking session…
      </main>
    );
  }
  if (authState === "error") {
    return (
      <main className="auth-loading theme-aware">
        <p>Unable to establish a session. Refresh to try again.</p>
      </main>
    );
  }
  if (authState === "anonymous") {
    return (
      <Login
        onLogin={() => {
          void fetchCurrentUser().then((currentUser) => {
            setUser(currentUser);
            setAuthState(currentUser ? "authenticated" : "anonymous");
          });
        }}
      />
    );
  }

  async function signOut() {
    setLogoutLoading(true);
    setLogoutError(null);
    try {
      await logout();
      setUser(null);
      setAuthState("anonymous");
      navigate("/");
    } catch {
      setLogoutError("Unable to sign out. Please try again.");
    } finally {
      setLogoutLoading(false);
    }
  }

  return (
    <div className={`app${themeAware ? " theme-aware" : ""}`}>
      <header className="app-header theme-aware">
        <div className="brand">🍺 HopStats</div>
        <Button
          type="button"
          className="mobile-menu-toggle"
          aria-expanded={mobileMenuOpen}
          aria-controls="main-navigation"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span className="visually-hidden">Main menu</span>
          <span aria-hidden="true">{mobileMenuOpen ? "×" : "☰"}</span>
        </Button>
        <nav
          id="main-navigation"
          className={mobileMenuOpen ? "is-open" : ""}
          aria-label="Main navigation"
        >
          {links.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setMobileMenuOpen(false)}
            >
              {label}
            </NavLink>
          ))}
          <Button
            type="button"
            className="logout-button"
            variant="ghost"
            onClick={() => {
              setMobileMenuOpen(false);
              void signOut();
            }}
            disabled={logoutLoading}
          >
            {logoutLoading
              ? "Signing out…"
              : `Sign out${user ? ` (${user.username})` : ""}`}
          </Button>
        </nav>
      </header>
      <main className="app-main">
        {logoutError && (
          <p className="logout-error" role="alert">
            {logoutError}
          </p>
        )}
        <StatusBadge
          className="app-status theme-aware"
          variant={
            status === "connected"
              ? "success"
              : status === "offline"
                ? "error"
                : "neutral"
          }
          role="status"
        >
          Backend:{" "}
          {status === "loading"
            ? "checking…"
            : status === "connected"
              ? "connected"
              : "unavailable"}
        </StatusBadge>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/milestones" element={<Milestones />} />
          <Route path="/milestones/:id" element={<MilestoneDetail />} />
          <Route
            path="/analytics"
            element={
              <Suspense fallback={<p role="status">Loading analytics…</p>}>
                <Analytics />
              </Suspense>
            }
          />
          <Route
            path="/explore"
            element={
              <Suspense fallback={<p role="status">Loading Explorer…</p>}>
                <ExplorerLayout />
              </Suspense>
            }
          >
            <Route index element={<Navigate to="beers" replace />} />
            <Route path="beers" element={<ExplorerBeers />} />
            <Route
              path="breweries"
              element={<ExplorerUpcoming title="Breweries" />}
            />
            <Route
              path="styles"
              element={<ExplorerUpcoming title="Styles" />}
            />
          </Route>
          <Route path="/imports" element={<Imports />} />
          <Route path="*" element={<Placeholder title="Page not found" />} />
        </Routes>
      </main>
    </div>
  );
}
