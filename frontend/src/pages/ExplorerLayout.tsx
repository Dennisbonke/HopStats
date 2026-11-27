import "./Explorer.css";
import { NavLink, Outlet, useLocation } from "react-router-dom";

export function ExplorerUpcoming({ title }: { title: string }) {
  return (
    <section
      className="explorer-upcoming"
      aria-labelledby="explorer-upcoming-title"
    >
      <h3 id="explorer-upcoming-title">{title} catalogue coming later</h3>
      <p>This Explorer catalogue is planned for a later HopStats milestone.</p>
    </section>
  );
}

export default function ExplorerLayout() {
  const location = useLocation();
  return (
    <div className="explorer-page">
      <div className="page-heading">
        <h2>Explorer</h2>
        <p>Browse beers and breweries from your personal check-in history.</p>
      </div>
      <nav className="explorer-tabs" aria-label="Explorer sections">
        <NavLink
          to="/explore/beers"
          aria-current={
            location.pathname.startsWith("/explore/beers") ? "page" : undefined
          }
        >
          Beers
        </NavLink>
        <NavLink to="/explore/breweries">Breweries</NavLink>
        <span className="explorer-tab-unavailable" aria-disabled="true">
          Styles <span className="upcoming-label">Upcoming</span>
        </span>
      </nav>
      <Outlet />
    </div>
  );
}
