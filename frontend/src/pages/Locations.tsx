import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  createAlias,
  createLocation,
  deleteAlias,
  deleteLocation,
  fetchLocations,
  LocationAlias,
  LocationData,
  LocationNode,
  transferLocationToUi,
  updateAlias,
  updateLocation,
} from "../api/locations";

function flatten(
  nodes: LocationNode[],
  depth = 0,
): Array<LocationNode & { depth: number }> {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...flatten(node.children, depth + 1),
  ]);
}

function findLocation(
  nodes: LocationNode[],
  id: number | null,
): LocationNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findLocation(node.children, id);
    if (found) return found;
  }
  return null;
}

function fallbackAliases(node: LocationNode): LocationAlias[] {
  return (
    node.alias_details ??
    node.aliases.map((alias, index) => ({
      id: -(index + 1),
      alias,
      managed_by_config: false,
    }))
  );
}

function LocationTree({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: LocationNode[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <ul className="location-tree">
      {nodes.map((node) => (
        <li key={node.id}>
          <div className="location-node">
            <button
              type="button"
              className={`location-select ${selectedId === node.id ? "selected" : ""}`}
              aria-pressed={selectedId === node.id}
              onClick={() => onSelect(node.id)}
            >
              <strong>{node.name}</strong>
              <span className="muted">{node.path}</span>
              {node.managed_by_config && (
                <span className="ownership-pill">Configuration-managed</span>
              )}
              {node.ownership === "unknown" && (
                <span className="ownership-pill">Ownership needs review</span>
              )}
              {node.aliases.length > 0 && (
                <span className="muted">
                  Aliases: {node.aliases.join(", ")}
                </span>
              )}
            </button>
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
          {node.children.length > 0 && (
            <LocationTree
              nodes={node.children}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function ReconciliationMessage({
  changed_records,
  unresolved_records,
  ambiguous_records,
}: {
  changed_records: number;
  unresolved_records: number;
  ambiguous_records: number;
}) {
  return (
    <p className="mutation-feedback" role="status">
      Saved. Reconciled {changed_records} inventory record
      {changed_records === 1 ? "" : "s"}. {unresolved_records} unresolved and{" "}
      {ambiguous_records} ambiguous.
    </p>
  );
}

export default function Locations() {
  const [data, setData] = useState<LocationData | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    changed_records: number;
    unresolved_records: number;
    ambiguous_records: number;
  } | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    parent_id: "",
    description: "",
  });
  const [editForm, setEditForm] = useState({
    name: "",
    parent_id: "",
    description: "",
  });
  const [newAlias, setNewAlias] = useState("");
  const [editingAlias, setEditingAlias] = useState<number | null>(null);
  const [editingAliasValue, setEditingAliasValue] = useState("");

  const locations = useMemo(() => flatten(data?.locations ?? []), [data]);
  const selected = findLocation(data?.locations ?? [], selectedId);
  const selectedLocked =
    selected?.ownership === "configuration" ||
    selected?.ownership === "unknown";
  const selectableParents = locations.filter(
    (location) =>
      location.id !== selectedId &&
      !location.path.startsWith(`${selected?.path} → `),
  );

  async function refresh(preferredId = selectedId) {
    const next = await fetchLocations();
    setData(next);
    const nextSelected = findLocation(next.locations, preferredId);
    setSelectedId(nextSelected?.id ?? next.locations[0]?.id ?? null);
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchLocations()
      .then((next) => {
        if (!mounted) return;
        setData(next);
        setSelectedId(next.locations[0]?.id ?? null);
      })
      .catch(
        () => mounted && setError("Locations are temporarily unavailable."),
      )
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    setEditForm({
      name: selected.name,
      parent_id: selected.parent_id === null ? "" : String(selected.parent_id),
      description: selected.description ?? "",
    });
  }, [selected]);

  async function runMutation(
    action: () => Promise<{ reconciliation?: typeof feedback } | void>,
  ) {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await action();
      if (result && "reconciliation" in result && result.reconciliation) {
        setFeedback(result.reconciliation);
      }
      const preferredId =
        result && "id" in result && typeof result.id === "number"
          ? result.id
          : selectedId;
      await refresh(preferredId);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Unable to save the change.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    if (!createForm.name.trim()) return;
    await runMutation(() =>
      createLocation({
        name: createForm.name,
        parent_id: createForm.parent_id ? Number(createForm.parent_id) : null,
        description: createForm.description || null,
      }).then((result) => {
        setCreateForm({ name: "", parent_id: "", description: "" });
        setSelectedId(result.id);
        return result;
      }),
    );
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!selected || selectedLocked) return;
    await runMutation(() =>
      updateLocation(selected.id, {
        name: editForm.name,
        parent_id: editForm.parent_id ? Number(editForm.parent_id) : null,
        description: editForm.description || null,
      }),
    );
  }

  async function transferOwnership() {
    if (
      !selected ||
      !selectedLocked ||
      !window.confirm(
        `Transfer “${selected.name}” and its descendants to UI management? Remove the private JSON configuration first.`,
      )
    )
      return;
    await runMutation(() => transferLocationToUi(selected.id));
  }

  async function submitAlias(event: FormEvent) {
    event.preventDefault();
    if (!selected || !newAlias.trim()) return;
    await runMutation(() =>
      createAlias(selected.id, newAlias).then((result) => {
        setNewAlias("");
        return result;
      }),
    );
  }

  async function saveAlias(alias: LocationAlias) {
    if (!selected || alias.managed_by_config || !editingAliasValue.trim())
      return;
    await runMutation(() =>
      updateAlias(selected.id, alias.id, editingAliasValue).then((result) => {
        setEditingAlias(null);
        return result;
      }),
    );
  }

  async function removeAlias(alias: LocationAlias) {
    if (
      !selected ||
      alias.managed_by_config ||
      !window.confirm(`Remove alias “${alias.alias}”?`)
    )
      return;
    await runMutation(() => deleteAlias(selected.id, alias.id));
  }

  async function removeLocation() {
    if (
      !selected ||
      selectedLocked ||
      !window.confirm(`Delete “${selected.name}”?`)
    )
      return;
    await runMutation(() => deleteLocation(selected.id));
  }

  return (
    <div className="locations-page">
      <div className="page-heading">
        <h2>Storage locations</h2>
        <p>
          Manage your hierarchy and aliases. Changes are reconciled against
          automatic inventory assignments.
        </p>
      </div>
      {error && (
        <section className="inventory-state error-state" role="alert">
          <strong>{error}</strong>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </section>
      )}
      {feedback && <ReconciliationMessage {...feedback} />}
      {loading && (
        <section className="inventory-state">Loading locations…</section>
      )}
      {data && (
        <>
          <section className="location-panel create-location-panel">
            <div className="section-heading">
              <h3>Create location</h3>
            </div>
            <form
              className="location-form"
              onSubmit={(event) => void submitCreate(event)}
            >
              <label>
                Name
                <input
                  required
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, name: event.target.value })
                  }
                />
              </label>
              <label>
                Parent
                <select
                  value={createForm.parent_id}
                  onChange={(event) =>
                    setCreateForm({
                      ...createForm,
                      parent_id: event.target.value,
                    })
                  }
                >
                  <option value="">Root location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {"　".repeat(location.depth)}
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Description
                <textarea
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm({
                      ...createForm,
                      description: event.target.value,
                    })
                  }
                />
              </label>
              <button
                className="primary-button"
                type="submit"
                disabled={saving}
              >
                Create location
              </button>
            </form>
          </section>
          <div className="location-workspace">
            <section className="location-panel">
              <div className="section-heading">
                <h3>Location hierarchy</h3>
                <span>{locations.length} locations</span>
              </div>
              {data.locations.length ? (
                <LocationTree
                  nodes={data.locations}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ) : (
                <p className="empty-state">
                  No storage locations yet. Create one above.
                </p>
              )}
              <div className="unresolved-summary">
                <strong>
                  {data.unresolved.record_count} unresolved or ambiguous records
                </strong>
                <span>{data.unresolved.total_units} units</span>
                <Link
                  className="button-link small-link"
                  to="/inventory?unresolved=true"
                >
                  View unresolved inventory
                </Link>
              </div>
            </section>
            <section
              className="location-panel location-detail-panel"
              aria-live="polite"
            >
              {selected ? (
                <>
                  <div className="section-heading">
                    <div>
                      <h3>{selected.name}</h3>
                      <span className="muted">{selected.path}</span>
                      <span className="muted">
                        {selected.record_count} records · {selected.total_units}{" "}
                        units
                      </span>
                    </div>
                    <Link
                      className="button-link small-link"
                      to={`/inventory?location_id=${selected.id}`}
                    >
                      View inventory
                    </Link>
                  </div>
                  {selectedLocked && (
                    <div className="ownership-note">
                      {selected.ownership === "unknown"
                        ? "This legacy location has unknown provenance and is locked until an operator explicitly classifies it."
                        : "This location is managed by private JSON configuration and is read-only in the web interface."}
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void transferOwnership()}
                        disabled={saving}
                      >
                        {selected.ownership === "unknown"
                          ? "Classify as UI-managed"
                          : "Transfer to UI management"}
                      </button>
                    </div>
                  )}
                  <form
                    className="location-form"
                    onSubmit={(event) => void submitEdit(event)}
                  >
                    <label>
                      Name
                      <input
                        required
                        disabled={selectedLocked || saving}
                        value={editForm.name}
                        onChange={(event) =>
                          setEditForm({ ...editForm, name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Parent
                      <select
                        disabled={selectedLocked || saving}
                        value={editForm.parent_id}
                        onChange={(event) =>
                          setEditForm({
                            ...editForm,
                            parent_id: event.target.value,
                          })
                        }
                      >
                        <option value="">Root location</option>
                        {selectableParents.map((location) => (
                          <option key={location.id} value={location.id}>
                            {"　".repeat(location.depth)}
                            {location.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Description
                      <textarea
                        disabled={selectedLocked || saving}
                        value={editForm.description}
                        onChange={(event) =>
                          setEditForm({
                            ...editForm,
                            description: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="form-actions">
                      <button
                        className="primary-button"
                        type="submit"
                        disabled={saving || selectedLocked}
                      >
                        Save location
                      </button>
                      <button
                        className="danger-button"
                        type="button"
                        disabled={saving || selectedLocked}
                        onClick={() => void removeLocation()}
                      >
                        Delete location
                      </button>
                    </div>
                  </form>
                  <div className="detail-section">
                    <h4>Aliases</h4>
                    <form
                      className="inline-form"
                      onSubmit={(event) => void submitAlias(event)}
                    >
                      <label className="sr-only" htmlFor="new-alias">
                        New alias
                      </label>
                      <input
                        id="new-alias"
                        placeholder="Add an alias"
                        value={newAlias}
                        onChange={(event) => setNewAlias(event.target.value)}
                      />
                      <button
                        className="secondary-button"
                        type="submit"
                        disabled={saving}
                      >
                        Add alias
                      </button>
                    </form>
                    <ul className="alias-list">
                      {fallbackAliases(selected).map((alias) => (
                        <li key={alias.id}>
                          <div>
                            {editingAlias === alias.id ? (
                              <input
                                value={editingAliasValue}
                                onChange={(event) =>
                                  setEditingAliasValue(event.target.value)
                                }
                                aria-label={`Edit ${alias.alias}`}
                              />
                            ) : (
                              <strong>{alias.alias}</strong>
                            )}{" "}
                            {alias.managed_by_config ? (
                              <span className="ownership-pill">
                                Configuration-managed
                              </span>
                            ) : (
                              <span className="muted">UI-managed</span>
                            )}
                          </div>
                          {!alias.managed_by_config && alias.id > 0 && (
                            <div className="alias-actions">
                              {editingAlias === alias.id ? (
                                <>
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    onClick={() => void saveAlias(alias)}
                                    disabled={saving}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    onClick={() => setEditingAlias(null)}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    onClick={() => {
                                      setEditingAlias(alias.id);
                                      setEditingAliasValue(alias.alias);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="danger-button"
                                    onClick={() => void removeAlias(alias)}
                                    disabled={saving}
                                  >
                                    Remove
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="detail-section">
                    <h4>
                      Resolution rules{" "}
                      <span className="muted">(read-only)</span>
                    </h4>
                    {selected.rules?.length ? (
                      <ul className="rule-list">
                        {selected.rules.map((rule) => (
                          <li key={rule.id}>
                            <strong>{rule.match_kind}</strong>{" "}
                            <code>{rule.pattern}</code>
                            <span>priority {rule.priority}</span>
                            {rule.managed_by_config && (
                              <span className="ownership-pill">
                                Configuration-managed
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">
                        No configured rules for this location.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="empty-state">
                  Select a location to view and edit its details.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
