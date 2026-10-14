import { useEffect, useState } from "react";
import {
  fetchImportHistory,
  ImportApiError,
  ImportSummary,
  uploadImport,
} from "../api/imports";

type UploadState = {
  file: File | null;
  loading: boolean;
  result: ImportSummary | null;
  error: string | null;
};

const initialState: UploadState = {
  file: null,
  loading: false,
  result: null,
  error: null,
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function Summary({ result }: { result: ImportSummary }) {
  return (
    <div className={`import-result ${result.status}`} role="status">
      <strong>
        {result.status === "completed" ? "Import complete" : "Import rejected"}
      </strong>
      <span>
        Inserted {result.inserted_count} · Updated {result.updated_count} ·
        Unchanged {result.unchanged_count}
        {result.removed_count ? ` · Removed ${result.removed_count}` : ""}
        {result.rejected_count ? ` · Rejected ${result.rejected_count}` : ""}
      </span>
      {result.error_summary && <p>{result.error_summary}</p>}
      {result.errors.length > 0 && (
        <ul className="validation-errors">
          {result.errors.map((error, index) => (
            <li key={`${error.row_number}-${error.field}-${index}`}>
              Row {error.row_number}
              {error.field ? `, ${error.field}` : ""}: {error.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadSection({
  kind,
  title,
  description,
  state,
  setState,
  onImported,
  confirmReplacement = false,
  setConfirmReplacement,
  sourceExportedAt = "",
  setSourceExportedAt,
  riskAcknowledged = false,
  setRiskAcknowledged,
}: {
  kind: "checkins" | "inventory";
  title: string;
  description: string;
  state: UploadState;
  setState: (state: UploadState) => void;
  onImported: (result: ImportSummary) => void;
  confirmReplacement?: boolean;
  setConfirmReplacement?: (confirmed: boolean) => void;
  sourceExportedAt?: string;
  setSourceExportedAt?: (value: string) => void;
  riskAcknowledged?: boolean;
  setRiskAcknowledged?: (acknowledged: boolean) => void;
}) {
  async function submit() {
    if (!state.file || (kind === "inventory" && !confirmReplacement)) return;
    setState({ ...state, loading: true, error: null });
    try {
      const result = await uploadImport(
        kind,
        state.file,
        confirmReplacement,
        sourceExportedAt,
        state.result?.error_code === "older_snapshot" && riskAcknowledged,
        state.result?.error_code === "undated_snapshot" && riskAcknowledged,
      );
      setState({ ...state, loading: false, result, error: null });
      onImported(result);
    } catch (error) {
      const message =
        error instanceof ImportApiError
          ? null
          : "Network error while uploading the file";
      const result = error instanceof ImportApiError ? error.summary : null;
      setState({ ...state, loading: false, result, error: message });
    }
  }

  return (
    <section className="import-card">
      <h3>{title}</h3>
      <p>{description}</p>
      <p className="format-note">
        Supported format: UTF-8 CSV with the native Untappd column headers.
      </p>
      <label className="file-picker">
        Choose CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) =>
            setState({
              ...state,
              file: event.target.files?.[0] ?? null,
              error: null,
              result: null,
            })
          }
        />
      </label>
      {state.file && (
        <span className="selected-file">Selected: {state.file.name}</span>
      )}
      {kind === "inventory" && setConfirmReplacement && (
        <>
          <label className="confirmation">
            <input
              type="checkbox"
              checked={confirmReplacement}
              onChange={(event) => setConfirmReplacement(event.target.checked)}
            />
            I understand this replaces the complete Untappd stash snapshot.
          </label>
          {setSourceExportedAt && (
            <label className="date-input">
              Trusted export date (optional)
              <input
                type="datetime-local"
                value={sourceExportedAt}
                onChange={(event) => setSourceExportedAt(event.target.value)}
              />
            </label>
          )}
          {state.result?.error_code === "undated_snapshot" &&
            setRiskAcknowledged && (
              <label className="confirmation warning-confirmation">
                <input
                  type="checkbox"
                  checked={riskAcknowledged}
                  onChange={(event) =>
                    setRiskAcknowledged(event.target.checked)
                  }
                />
                This export has no trusted date. I understand it may replace the
                current snapshot.
              </label>
            )}
          {state.result?.error_code === "older_snapshot" &&
            setRiskAcknowledged && (
              <label className="confirmation warning-confirmation">
                <input
                  type="checkbox"
                  checked={riskAcknowledged}
                  onChange={(event) =>
                    setRiskAcknowledged(event.target.checked)
                  }
                />
                I understand this export is older and may replace newer
                inventory.
              </label>
            )}
        </>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={
          !state.file ||
          state.loading ||
          (kind === "inventory" &&
            (!confirmReplacement ||
              ((state.result?.error_code === "undated_snapshot" ||
                state.result?.error_code === "older_snapshot") &&
                !riskAcknowledged)))
        }
      >
        {state.loading ? "Uploading…" : "Upload CSV"}
      </button>
      {state.error && <p className="network-error">{state.error}</p>}
      {state.result && <Summary result={state.result} />}
    </section>
  );
}

export default function Imports() {
  const [checkins, setCheckins] = useState<UploadState>(initialState);
  const [inventory, setInventory] = useState<UploadState>(initialState);
  const [confirmReplacement, setConfirmReplacement] = useState(false);
  const [sourceExportedAt, setSourceExportedAt] = useState("");
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [history, setHistory] = useState<ImportSummary[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  async function refreshHistory() {
    try {
      setHistory(await fetchImportHistory());
      setHistoryError(null);
    } catch {
      setHistoryError("Import history is temporarily unavailable.");
    }
  }

  useEffect(() => {
    void refreshHistory();
  }, []);

  return (
    <div className="imports-page">
      <div className="page-heading">
        <h2>Imports</h2>
        <p>Load your Untappd exports without retaining the uploaded files.</p>
      </div>
      <div className="import-grid">
        <UploadSection
          kind="checkins"
          title="Untappd check-in CSV"
          description="Adds to your check-in history. Records missing from a later export are preserved."
          state={checkins}
          setState={setCheckins}
          onImported={refreshHistory}
        />
        <UploadSection
          kind="inventory"
          title="Untappd stash CSV"
          description="A valid upload is an authoritative full snapshot and removes absent stash records."
          state={inventory}
          setState={setInventory}
          confirmReplacement={confirmReplacement}
          setConfirmReplacement={setConfirmReplacement}
          sourceExportedAt={sourceExportedAt}
          setSourceExportedAt={setSourceExportedAt}
          riskAcknowledged={riskAcknowledged}
          setRiskAcknowledged={setRiskAcknowledged}
          onImported={refreshHistory}
        />
      </div>
      <section className="history-card">
        <div className="section-heading">
          <h3>Import history</h3>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void refreshHistory()}
          >
            Refresh
          </button>
        </div>
        {historyError && <p className="network-error">{historyError}</p>}
        {!historyError && history.length === 0 ? (
          <p className="empty-state">
            No imports yet. Choose an export above to get started.
          </p>
        ) : (
          <div className="history-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Filename</th>
                  <th>Status</th>
                  <th>Inserted</th>
                  <th>Updated</th>
                  <th>Unchanged</th>
                  <th>Removed</th>
                  <th>Rejected</th>
                </tr>
              </thead>
              <tbody>
                {history.map((run) => (
                  <tr key={run.id}>
                    <td>{formatDate(run.completed_at ?? run.started_at)}</td>
                    <td>
                      {run.source_type === "inventory" ? "Stash" : "Check-ins"}
                    </td>
                    <td>{run.filename}</td>
                    <td>
                      <span className={`status-pill ${run.status}`}>
                        {run.status}
                      </span>
                    </td>
                    <td>{run.inserted_count}</td>
                    <td>{run.updated_count}</td>
                    <td>{run.unchanged_count}</td>
                    <td>{run.removed_count}</td>
                    <td>{run.rejected_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
