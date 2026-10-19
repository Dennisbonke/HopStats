import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { fetchCurrentUser, logout, CurrentUser } from "./api/auth";
import { checkBackend } from "./api/health";
import Imports from "./pages/Imports";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Locations from "./pages/Locations";
import Milestones from "./pages/Milestones";
import MilestoneDetail from "./pages/MilestoneDetail";
const Analytics = lazy(() => import("./pages/Analytics"));
import Login from "./pages/Login";

const links = [
  ["/", "Dashboard"],
  ["/inventory", "Inventory"],
  ["/locations", "Locations"],
  ["/milestones", "Milestones"],
  ["/analytics", "Analytics"],
  ["/imports", "Imports"],
];

function Placeholder({ title }: { title: string }) {
  return (
    <section>
      <h2>{title}</h2>
      <p>This M1 foundation placeholder is not implemented yet.</p>
    </section>
  );
}

export default function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authState, setAuthState] = useState<
    "loading" | "authenticated" | "anonymous" | "error"
  >("loading");
  const [status, setStatus] = useState<"loading" | "connected" | "offline">(
    "loading",
  );
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutLoading, setLogoutLoading] = useState(false);
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
      <main className="auth-loading" aria-busy="true">
        Checking session…
      </main>
    );
  }
  if (authState === "error") {
    return (
      <main className="auth-loading">
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
    <div className="app">
      <header>
        <div className="brand">🍺 HopStats</div>
        <nav>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {label}
            </NavLink>
          ))}
          <button
            type="button"
            className="logout-button"
            onClick={() => void signOut()}
            disabled={logoutLoading}
          >
            {logoutLoading
              ? "Signing out…"
              : `Sign out${user ? ` (${user.username})` : ""}`}
          </button>
        </nav>
      </header>
      <main>
        {logoutError && (
          <p className="logout-error" role="alert">
            {logoutError}
          </p>
        )}
        <div className={`status ${status}`}>
          Backend:{" "}
          {status === "loading"
            ? "checking…"
            : status === "connected"
              ? "connected"
              : "unavailable"}
        </div>
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
          <Route path="/imports" element={<Imports />} />
          <Route path="*" element={<Placeholder title="Page not found" />} />
        </Routes>
      </main>
    </div>
  );
}
