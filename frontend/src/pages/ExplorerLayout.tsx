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
    <div className="theme-aware explorer-page">
      <div className="page-heading">
        <h2>Explorer</h2>
        <p>Browse beers from your personal check-in history.</p>
      </div>
      <nav className="explorer-tabs" aria-label="Explorer sections">
        <NavLink
          to="/explore/beers"
          end
          aria-current={
            location.pathname === "/explore/beers" ? "page" : undefined
          }
        >
          Beers
        </NavLink>
        <span className="explorer-tab-unavailable" aria-disabled="true">
          Breweries <span className="upcoming-label">Upcoming</span>
        </span>
        <span className="explorer-tab-unavailable" aria-disabled="true">
          Styles <span className="upcoming-label">Upcoming</span>
        </span>
      </nav>
      <Outlet />
    </div>
  );
}
