import { FormEvent, useState } from "react";
import { ApiError } from "../api/client";
import { login } from "../api/auth";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username, password);
      setPassword("");
      onLogin();
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 429) {
        setError("Too many attempts. Please wait a few minutes and try again.");
      } else if (reason instanceof ApiError && reason.status === 401) {
        setError("The username or password is incorrect.");
      } else {
        setError("Unable to sign in right now. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand login-brand">🍺 HopStats</div>
        <h1 id="login-title">Sign in</h1>
        <p className="muted">Sign in to view your beer data.</p>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
