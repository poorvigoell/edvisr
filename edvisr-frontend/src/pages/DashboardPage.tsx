import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatusMessages } from "../components/StatusMessages";
import { api } from "../lib/api";
import type { Classroom } from "../lib/api";

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
      const teacher = await api.getMe();
      const classes = await api.getClasses(teacher.id);

      if (classes.length === 0) {
        setClassOverviews([]);
        return;
      }

      const details = await Promise.all(
        classes.map(async (classInfo) => {
          const [students, dashboard, risk, assignments] = await Promise.all([
            api.getStudents(classInfo.id),
            api.getClassDashboard(classInfo.id),
            api.getRiskSignals(classInfo.id),
            api.getAssignments(classInfo.id),
          ]);
          const latestDue = assignments
            .map((assignment) => assignment.due_at ?? assignment.published_at ?? assignment.created_at)
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(-1) ?? null;

          return {
            classInfo,
            studentCount: students.length,
            atRiskCount: risk.signals.filter((item) => item.risk_level !== "low").length,
            classAverage: dashboard.average_score_pct,
            lastUpdatedLabel: relativeDateLabel(latestDue),
          } satisfies ClassOverview;
        })
      );
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
            {classOverviews.length === 0 && (
              <article className="class-card">
                <h3>No classes yet</h3>
                <p className="muted">Create or import class data to begin analysis.</p>
              </article>
            )}
          </div>
        </>
      )}
    </section>
  );
}
