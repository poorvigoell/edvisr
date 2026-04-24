import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatusMessages } from "../components/StatusMessages";
import { api } from "../lib/api";
import type { Teacher } from "../lib/api";

export function SettingsPage() {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const currentTeacher = await api.getMe();
        setTeacher(currentTeacher);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load settings.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <section className="stack">
      <PageHeader
        title="Settings"
        subtitle="Teacher account and analytics defaults."
      />
      <StatusMessages loading={loading} loadingText="Loading settings..." error={error} />

      {!loading && !error && teacher && (
        <div className="grid-2">
          <article className="card">
            <h3>Account</h3>
            <p><strong>Name:</strong> {teacher.full_name}</p>
            <p><strong>Email:</strong> {teacher.email}</p>
          </article>

          <article className="card">
            <h3>Risk Rules</h3>
            <p className="muted">Avg &lt; 50%</p>
            <p className="muted">Last 3 assignments decreasing</p>
            <p className="muted">Missed submissions ≥ 3</p>
            <p className="muted">Concept avg &lt; 60% marks weak concept</p>
            <div className="row">
              <Link className="btn" to="/setup">Manual Data Setup</Link>
              <Link className="btn" to="/schedule">Manual Schedule</Link>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
