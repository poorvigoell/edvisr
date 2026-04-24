import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { PageHeader } from "../components/PageHeader";
import { StatusMessages } from "../components/StatusMessages";
import { api } from "../lib/api";
import type { ClassDashboard } from "../lib/api";
import { useTeacher } from "../contexts/TeacherContext";

export function SchedulePage() {
  const { classes, selectedClassId, setSelectedClassId } = useTeacher();
  const [dashboard, setDashboard] = useState<ClassDashboard | null>(null);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentMaxScore, setAssignmentMaxScore] = useState("100");
  const [assignmentDueDate, setAssignmentDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadDashboard = async (classId: number) => {
    setLoading(true);
    try {
      const data = await api.getClassDashboard(classId);
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedClassId) return;
    loadDashboard(selectedClassId);
  }, [selectedClassId]);

  const onAddScheduleItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClassId || !assignmentTitle.trim()) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const maxScore = Number(assignmentMaxScore);
      if (!Number.isFinite(maxScore) || maxScore <= 0) {
        throw new Error("Max score must be greater than 0.");
      }

      await api.createAssignment({
        class_id: selectedClassId,
        title: assignmentTitle.trim(),
        max_score: maxScore,
        due_at: assignmentDueDate
          ? new Date(`${assignmentDueDate}T00:00:00`).toISOString()
          : undefined,
        published_at: new Date().toISOString(),
      });
      setSuccess("Schedule item added.");
      setAssignmentTitle("");
      await loadDashboard(selectedClassId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add schedule item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <PageHeader
        title="Schedule"
        subtitle="Upcoming assignment due dates from class activity timeline"
        actions={classes.length > 0 ? (
          <select
            className="select"
            value={selectedClassId ?? ""}
            onChange={(event) => setSelectedClassId(Number(event.target.value))}
          >
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        ) : null}
      />
      <StatusMessages
        loading={loading}
        loadingText="Loading schedule..."
        error={error}
        success={success}
      />

      {!loading && !error && dashboard && (
        <div className="grid-2">
          <article className="card">
            <h3>Add Schedule Item</h3>
            <form className="stack-sm" onSubmit={onAddScheduleItem}>
              <input
                className="input"
                value={assignmentTitle}
                onChange={(event) => setAssignmentTitle(event.target.value)}
                placeholder="Test or assignment title"
                required
              />
              <div className="row">
                <input
                  className="input"
                  type="number"
                  min="1"
                  step="0.1"
                  value={assignmentMaxScore}
                  onChange={(event) => setAssignmentMaxScore(event.target.value)}
                  placeholder="Max score"
                  required
                />
                <input
                  className="input"
                  type="date"
                  value={assignmentDueDate}
                  onChange={(event) => setAssignmentDueDate(event.target.value)}
                />
              </div>
              <button className="btn btn-primary" disabled={saving}>
                {saving ? "Adding..." : "Add To Schedule"}
              </button>
            </form>
          </article>

          <article className="card">
            <h3>Assignments Timeline</h3>
            <div className="stack-sm">
              {dashboard.trend.map((item) => (
                <div key={item.assignment_id} className="subcard">
                  <strong>{item.assignment_title}</strong>
                  <p className="muted">
                    Due:{" "}
                    {item.due_at
                      ? new Date(item.due_at).toLocaleDateString()
                      : "Not set"}{" "}
                    | Avg score: {item.average_score_pct}% | Submission:{" "}
                    {item.submission_rate}%
                  </p>
                </div>
              ))}
              {dashboard.trend.length === 0 && (
                <p className="muted">No schedule items yet for this class.</p>
              )}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
