import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatusMessages } from "../components/StatusMessages";
import { api } from "../lib/api";
import type { Classroom } from "../lib/api";
import { useTeacher } from "../contexts/TeacherContext";

type ClassOverview = {
  classInfo: Classroom;
  studentCount: number;
  atRiskCount: number;
  classAverage: number;
  lastUpdatedLabel: string;
};

function relativeDateLabel(rawIso: string | null): string {
  if (!rawIso) return "No recent updates";
  const date = new Date(rawIso);
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Updated today";
  if (diffDays === 1) return "Updated 1 day ago";
  return `Updated ${diffDays} days ago`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { refreshContext } = useTeacher();
  const [classOverviews, setClassOverviews] = useState<ClassOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvClassName, setCsvClassName] = useState("");
  const [csvSubject, setCsvSubject] = useState("");
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvSuccess, setCsvSuccess] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const overviews = await api.getDashboardOverview();

      if (overviews.length === 0) {
        setClassOverviews([]);
        return;
      }

      const details = overviews.map((dashboard) => {
        const latestDue = dashboard.trend
          .map((t) => t.due_at)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;

        return {
          classInfo: {
            id: dashboard.class_id,
            teacher_id: 0,
            name: dashboard.class_name,
            subject: dashboard.subject,
            term: null
          },
          studentCount: dashboard.total_students,
          atRiskCount: dashboard.flagged_students ?? dashboard.at_risk_students ?? 0,
          classAverage: dashboard.average_score_pct,
          lastUpdatedLabel: relativeDateLabel(latestDue),
        } satisfies ClassOverview;
      });

      setClassOverviews(details);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleCsvChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setCsvError(null);
    setCsvSuccess(null);

    if (!selected) {
      setCsvFile(null);
      return;
    }

    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setCsvFile(null);
      setCsvError("Only .csv files are supported.");
      event.target.value = "";
      return;
    }

    setCsvFile(selected);
  };

  const handleCsvImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!csvFile) {
      setCsvError("Choose a CSV file to import.");
      return;
    }

    try {
      setCsvImporting(true);
      setCsvError(null);
      setCsvSuccess(null);

      const summary = await api.ingestScoresCsv(csvFile, {
        class_name: csvClassName.trim() || undefined,
        subject: csvSubject.trim() || undefined,
      });
      setCsvSuccess(
        `Imported class data. Students created: ${summary.students_created}, tests created: ${summary.assignments_created}, submissions updated: ${summary.submissions_created_or_updated}.`
      );
      setCsvFile(null);
      if (csvInputRef.current) {
        csvInputRef.current.value = "";
      }
      await refreshContext();
      await loadDashboard();
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Failed to import CSV.");
    } finally {
      setCsvImporting(false);
    }
  };

  const totals = useMemo(() => {
    const totalClasses = classOverviews.length;
    const totalStudents = classOverviews.reduce((sum, item) => sum + item.studentCount, 0);
    const atRiskStudents = classOverviews.reduce((sum, item) => sum + item.atRiskCount, 0);
    const overallAverage =
      totalClasses > 0
        ? (
          classOverviews.reduce((sum, item) => sum + item.classAverage, 0) /
          totalClasses
        ).toFixed(1)
        : "0.0";

    return {
      totalClasses,
      totalStudents,
      atRiskStudents,
      overallAverage,
    };
  }, [classOverviews]);

  if (!loading && !error && classOverviews.length === 0) {
    return (
      <section className="stack" style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ maxWidth: '800px', width: '100%', textAlign: 'center' }}>
          <div className="stack" style={{ gap: '3rem' }}>
            <div className="stack-sm">
              <div style={{
                fontSize: '4rem',
                marginBottom: '1rem',
                animation: 'fade-in 1s ease-out'
              }}></div>
              <h1 style={{
                fontSize: '3.5rem',
                fontWeight: 800,
                letterSpacing: '-0.03em',
                background: 'linear-gradient(135deg, #fff, #c4b5fd)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                marginBottom: '1rem'
              }}>
                Welcome to EdVisr!
              </h1>
              <p className="muted" style={{ fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6 }}>
                The intelligent workspace for modern educators.
                Let's get your first class synced and start analyzing student performance.
              </p>
            </div>

            <div className="card" style={{
              textAlign: 'left',
              padding: '3rem',
              border: '1px solid var(--border)',
              background: 'rgba(21, 21, 34, 0.4)',
              backdropFilter: 'blur(10px)',
              borderRadius: '24px',
              boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.45)'
            }}>
              <form className="stack" onSubmit={handleCsvImport}>
                <div className="row row-space" style={{ alignItems: 'flex-start' }}>
                  <div className="stack-sm">
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Quick Setup</h2>
                    <p className="muted" style={{ fontSize: '0.9rem' }}>Upload your latest test scores to begin.</p>
                  </div>
                  <div className="risk-tag risk-tag-other" style={{ padding: '6px 12px' }}>STEP 1/1</div>
                </div>

                <div className="grid-2" style={{ marginTop: '1rem' }}>
                  <div className="stack-sm">
                    <label className="muted" style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em' }}>CLASS NAME</label>
                    <input
                      className="input"
                      type="text"
                      value={csvClassName}
                      onChange={(event) => setCsvClassName(event.target.value)}
                      placeholder="e.g. 10th Grade Biology"
                      required
                      style={{ padding: '12px 16px', fontSize: '1rem' }}
                    />
                  </div>
                  <div className="stack-sm">
                    <label className="muted" style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em' }}>SUBJECT</label>
                    <input
                      className="input"
                      type="text"
                      value={csvSubject}
                      onChange={(event) => setCsvSubject(event.target.value)}
                      placeholder="e.g. Science"
                      required
                      style={{ padding: '12px 16px', fontSize: '1rem' }}
                    />
                  </div>
                </div>

                <div className="stack-sm" style={{ marginTop: '1rem' }}>
                  <label className="muted" style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em' }}>UPLOAD SCORES (CSV)</label>
                  <div
                    className="input"
                    style={{
                      padding: '2rem',
                      border: '2px dashed var(--border)',
                      textAlign: 'center',
                      cursor: 'pointer',
                      position: 'relative'
                    }}
                    onClick={() => csvInputRef.current?.click()}
                  >
                    <input
                      ref={csvInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleCsvChange}
                      style={{ display: 'none' }}
                    />
                    {csvFile ? (
                      <div className="text-ok">✅ {csvFile.name}</div>
                    ) : (
                      <div className="muted">Click to select or drag your CSV file here</div>
                    )}
                  </div>
                </div>

                {csvError && <p className="text-danger" style={{ textAlign: 'center' }}>{csvError}</p>}
                {csvSuccess && <p className="text-ok" style={{ textAlign: 'center' }}>{csvSuccess}</p>}

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={csvImporting}
                  style={{
                    padding: '16px',
                    fontSize: '1.1rem',
                    borderRadius: '12px',
                    marginTop: '1rem'
                  }}
                >
                  {csvImporting ? "Processing Data..." : "Launch Dashboard ✨"}
                </button>
              </form>
            </div>

            <div className="row" style={{ justifyContent: 'center', gap: '2rem' }}>
              <p className="muted" style={{ fontSize: '0.9rem' }}>
                Don't have a CSV? <a href="#" style={{ color: 'var(--primary)', fontWeight: 600 }}>Download Template</a>
              </p>
              <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
              <p className="muted" style={{ fontSize: '0.9rem' }}>
                Need help? <a href="#" style={{ color: 'var(--primary)', fontWeight: 600 }}>View Tutorial</a>
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="stack">
      <PageHeader
        title="Dashboard"
        subtitle="Teacher overview across all classes."
      />
      <article className="card">
        <form className="stack-sm" onSubmit={handleCsvImport}>
          <h3>Import Class (CSV)</h3>
          <p className="muted">
            Upload a CSV file only. You can optionally enter class name and subject here to use during import.
            Required CSV columns: test_title, student_name, and score or status.
          </p>
          <input
            className="input"
            type="text"
            value={csvClassName}
            onChange={(event) => setCsvClassName(event.target.value)}
            placeholder="Class name (optional override)"
          />
          <input
            className="input"
            type="text"
            value={csvSubject}
            onChange={(event) => setCsvSubject(event.target.value)}
            placeholder="Subject (optional override)"
          />
          <input
            ref={csvInputRef}
            className="input"
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsvChange}
          />
          {csvFile && <p className="muted">Selected file: {csvFile.name}</p>}
          {csvError && <p className="text-danger">{csvError}</p>}
          {csvSuccess && <p className="text-ok">{csvSuccess}</p>}
          <button type="submit" className="btn btn-primary" disabled={csvImporting || loading}>
            {csvImporting ? "Importing..." : "Import Class CSV"}
          </button>
        </form>
      </article>

      <StatusMessages loading={loading} loadingText="Loading dashboard..." error={error} />

      {!loading && !error && (
        <>
          <div className="metric-grid">
            <article className="metric-card">
              <p className="muted">Total Classes</p>
              <h3>{totals.totalClasses}</h3>
            </article>
            <article className="metric-card">
              <p className="muted">Total Students</p>
              <h3>{totals.totalStudents}</h3>
            </article>
            <article className="metric-card">
              <p className="muted">Students At Risk</p>
              <h3 className="text-danger">{totals.atRiskStudents}</h3>
            </article>
            <article className="metric-card">
              <p className="muted">Overall Class Average</p>
              <h3>{totals.overallAverage}%</h3>
            </article>
          </div>

          <div className="class-grid">
            {classOverviews.map((item) => (
              <article key={item.classInfo.id} className="class-card">
                <h3>{item.classInfo.name}</h3>
                <p className="muted">Students: {item.studentCount}</p>
                <p className="muted">At Risk: {item.atRiskCount}</p>
                <p className="muted">{item.lastUpdatedLabel}</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate(`/insights?classId=${item.classInfo.id}`)}
                >
                  View Insights
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
