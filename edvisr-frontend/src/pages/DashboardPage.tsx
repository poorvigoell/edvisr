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
      <section className="stack" style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <article className="card" style={{ maxWidth: '600px', width: '100%', padding: '3rem', textAlign: 'center', boxShadow: '0 20px 50px -10px rgba(0,0,0,0.5)' }}>
          <div className="stack">
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👋</div>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Welcome to EdVisr!</h1>
            <p className="muted" style={{ fontSize: '1.1rem', marginBottom: '2.5rem' }}>
              We're excited to help you gain deeper insights into your students' performance. 
              Let's set up your first class to get started.
            </p>
            
            <form className="stack-sm" onSubmit={handleCsvImport} style={{ textAlign: 'left', background: 'rgba(255,255,255,0.03)', padding: '2rem', borderRadius: '15px' }}>
              <h3 style={{ marginBottom: '1rem' }}>Step 1: Import Class Data</h3>
              <p className="muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Upload a CSV file with your student scores. EdVisr will automatically 
                create students and identify risk patterns for you.
              </p>
              
              <div className="stack-sm">
                <label className="muted" style={{ fontSize: '0.8rem' }}>Class Name (e.g. NCERT Class 10A)</label>
                <input
                  className="input"
                  type="text"
                  value={csvClassName}
                  onChange={(event) => setCsvClassName(event.target.value)}
                  placeholder="Class name"
                  required
                />
              </div>

              <div className="stack-sm">
                <label className="muted" style={{ fontSize: '0.8rem' }}>Subject (e.g. Science)</label>
                <input
                  className="input"
                  type="text"
                  value={csvSubject}
                  onChange={(event) => setCsvSubject(event.target.value)}
                  placeholder="Subject"
                  required
                />
              </div>

              <div className="stack-sm" style={{ marginTop: '1rem' }}>
                <input
                  ref={csvInputRef}
                  className="input"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvChange}
                  style={{ padding: '1rem', border: '2px dashed #2f2f44' }}
                />
              </div>

              {csvError && <p className="text-danger" style={{ marginTop: '1rem' }}>{csvError}</p>}
              {csvSuccess && <p className="text-ok" style={{ marginTop: '1rem' }}>{csvSuccess}</p>}

              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={csvImporting} 
                style={{ width: '100%', padding: '1rem', marginTop: '1.5rem', fontSize: '1.1rem' }}
              >
                {csvImporting ? "Processing..." : "Create My First Class ✨"}
              </button>
            </form>
            <p className="muted" style={{ marginTop: '1.5rem', fontSize: '0.8rem' }}>
              Need help? Download our <a href="#" style={{ color: '#4f46e5' }}>sample CSV template</a> to see the required format.
            </p>
          </div>
        </article>
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
