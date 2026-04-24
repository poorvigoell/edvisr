import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, getAuthToken, setAuthToken } from "../lib/api";

type RedirectState = {
  from?: {
    pathname?: string;
  };
};

export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo =
    (location.state as RedirectState | null)?.from?.pathname ?? "/dashboard";

  if (getAuthToken()) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) return;

    try {
      setLoading(true);
      setError(null);
      const auth = await api.signIn({
        email: email.trim(),
        password: password.trim(),
      });
      setAuthToken(auth.access_token);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="home">
      <article className="home-card">
        <div className="stack-sm">
          <h2>Sign In</h2>
          <p className="muted">Use your teacher email and password.</p>
        </div>

        <form className="stack-sm" onSubmit={onSubmit}>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teacher@edvisr.demo"
            required
          />
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            required
          />
          <button className="btn btn-primary" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {error && <p className="text-danger">{error}</p>}

        <p className="muted">
          New here? <Link to="/sign-up">Create an account</Link>
        </p>
        <p className="muted">Secure teacher login with JWT session.</p>
      </article>
    </section>
  );
}
