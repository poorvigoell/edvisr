import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatusMessages } from "../components/StatusMessages";
import { api } from "../lib/api";
import type { Classroom, QuizDocument } from "../lib/api";
import { loadTeacherAndClasses } from "../lib/context";

export function SavedQuizzesPage() {
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [docs, setDocs] = useState<QuizDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const { classes: classList } = await loadTeacherAndClasses();
        setClasses(classList);
        setSelectedClassId(classList[0]?.id ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load classes.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedClassId) return;
    const loadDocs = async () => {
      try {
        setLoading(true);
        const data = await api.getQuizDocs(selectedClassId);
        setDocs(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load saved quizzes.");
      } finally {
        setLoading(false);
      }
    };
    loadDocs();
  }, [selectedClassId]);

  const onDelete = async (docId: number) => {
    try {
      setError(null);
      await api.deleteQuizDoc(docId);
      setDocs((prev) => prev.filter((doc) => doc.id !== docId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete quiz.");
    }
  };

  return (
    <section className="stack">
      <PageHeader
        title="Saved Quizzes"
        subtitle="Review and manage generated quizzes."
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
      <StatusMessages loading={loading} loadingText="Loading saved quizzes..." error={error} />

      {!loading && !error && (
        <article className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Class</th>
                <th>Difficulty</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.topic}</td>
                  <td>{classes.find((item) => item.id === doc.class_id)?.name ?? "-"}</td>
                  <td>{doc.difficulty}</td>
                  <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="row">
                      <Link className="btn" to={`/quiz/docs/${doc.id}`}>
                        View
                      </Link>
                      <button className="btn" type="button" onClick={() => onDelete(doc.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No saved quizzes for this class.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </article>
      )}
    </section>
  );
}
