import { NavLink, Outlet } from "react-router-dom";

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
  return (
    <div className="explorer-page">
      <div className="page-heading">
        <h2>Explorer</h2>
        <p>Browse beers from your personal check-in history.</p>
      </div>
      <nav className="explorer-tabs" aria-label="Explorer sections">
        <NavLink to="/explore/beers">Beers</NavLink>
        <NavLink to="/explore/breweries">
          Breweries <span>Upcoming</span>
        </NavLink>
        <NavLink to="/explore/styles">
          Styles <span>Upcoming</span>
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
