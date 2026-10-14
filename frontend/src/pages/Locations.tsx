import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchLocations, LocationData, LocationNode } from "../api/locations";

function LocationTree({ nodes }: { nodes: LocationNode[] }) {
  return (
    <ul className="location-tree">
      {nodes.map((node) => (
        <li key={node.id}>
          <div className="location-node">
            <div>
              <strong>{node.name}</strong>
              <span className="muted">{node.path}</span>
              {node.aliases.length > 0 && (
                <span className="muted">
                  Aliases: {node.aliases.join(", ")}
                </span>
              )}
            </div>
            <div className="location-counts">
              <span>{node.record_count} records</span>
              <span>{node.total_units} units</span>
              <Link
                className="button-link small-link"
                to={`/inventory?location_id=${node.id}`}
              >
                View inventory
              </Link>
            </div>
          </div>
          {node.children.length > 0 && <LocationTree nodes={node.children} />}
        </li>
      ))}
    </ul>
  );
}

export default function Locations() {
  const [data, setData] = useState<LocationData | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetchLocations()
      .then(setData)
      .catch(() => setError(true));
  }, []);
  return (
    <div className="locations-page">
      <div className="page-heading">
        <h2>Storage locations</h2>
        <p>
          Parent counts include all descendant locations. The explorer is
          read-only.
        </p>
      </div>
      {!data && !error && (
        <section className="inventory-state">Loading locations…</section>
      )}
      {error && (
        <section className="inventory-state error-state">
          <strong>Locations are temporarily unavailable.</strong>
          <p>Check the backend connection and try again.</p>
        </section>
      )}
      {data && (
        <>
          <section className="location-panel">
            <div className="section-heading">
              <h3>Configured hierarchy</h3>
              <span>{data.locations.length} top-level locations</span>
            </div>
            {data.locations.length ? (
              <LocationTree nodes={data.locations} />
            ) : (
              <p className="empty-state">
                No storage locations are configured yet.
              </p>
            )}
          </section>
          <section className="location-panel unresolved-panel">
            <div>
              <h3>Unresolved or ambiguous</h3>
              <p>
                These records remain visible without a guessed canonical
                location.
              </p>
            </div>
            <div className="location-counts">
              <strong>{data.unresolved.record_count} records</strong>
              <span>{data.unresolved.total_units} units</span>
              <Link
                className="button-link small-link"
                to="/inventory?unresolved=true"
              >
                View unresolved inventory
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
