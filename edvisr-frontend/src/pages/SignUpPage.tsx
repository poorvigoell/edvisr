import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, getAuthToken, setAuthToken } from "../lib/api";

export function SignUpPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (getAuthToken()) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fullName.trim() || !email.trim() || !password.trim()) return;
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const auth = await api.signUp({
        full_name: fullName.trim(),
        email: email.trim(),
        password: password.trim(),
      });
      setAuthToken(auth.access_token);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="home">
      <article className="home-card">
        <div className="stack-sm">
          <h2>Create Account</h2>
          <p className="muted">Create a teacher account to access EdVisr.</p>
        </div>

        <form className="stack-sm" onSubmit={onSubmit}>
          <input
            className="input"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Full name"
            required
          />
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teacher@school.edu"
            required
          />
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            minLength={6}
            required
          />
          <input
            className="input"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm password"
            minLength={6}
            required
          />
          <button className="btn btn-primary" disabled={loading}>
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        {error && <p className="text-danger">{error}</p>}

        <p className="muted">
          Already have an account? <Link to="/sign-in">Sign in</Link>
        </p>
      </article>
    </section>
  );
}
