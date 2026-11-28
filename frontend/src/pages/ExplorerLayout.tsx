import "./Explorer.css";
import { NavLink, Outlet, useLocation } from "react-router-dom";

export default function ExplorerLayout() {
  const location = useLocation();
  return (
    <div className="explorer-page">
      <div className="page-heading">
        <h2>Explorer</h2>
        <p>
          Browse beers, breweries and styles from your personal check-in
          history.
        </p>
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
        <NavLink to="/explore/styles">Styles</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
