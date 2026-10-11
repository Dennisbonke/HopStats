import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { checkBackend } from "./api/health";

const links = [
  ["/", "Dashboard"],
  ["/inventory", "Inventory"],
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
  const [status, setStatus] = useState<"loading" | "connected" | "offline">(
    "loading",
  );
  useEffect(() => {
    checkBackend()
      .then((ok) => setStatus(ok ? "connected" : "offline"))
      .catch(() => setStatus("offline"));
  }, []);
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
        </nav>
      </header>
      <main>
        <div className={`status ${status}`}>
          Backend:{" "}
          {status === "loading"
            ? "checking…"
            : status === "connected"
              ? "connected"
              : "unavailable"}
        </div>
        <Routes>
          <Route path="/" element={<Placeholder title="Dashboard" />} />
          <Route
            path="/inventory"
            element={<Placeholder title="Inventory" />}
          />
          <Route path="/imports" element={<Placeholder title="Imports" />} />
          <Route path="*" element={<Placeholder title="Page not found" />} />
        </Routes>
      </main>
    </div>
  );
}
