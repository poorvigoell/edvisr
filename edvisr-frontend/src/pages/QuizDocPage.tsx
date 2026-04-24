import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatusMessages } from "../components/StatusMessages";
import { api } from "../lib/api";
import type { QuizDocument } from "../lib/api";

export function QuizDocPage() {
  const { docId } = useParams();
  const [doc, setDoc] = useState<QuizDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = Number(docId);
    if (!Number.isFinite(id) || id <= 0) {
      setError("Invalid document id.");
      setLoading(false);
      return;
    }

    const loadDoc = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getQuizDoc(id);
        setDoc(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load document.");
      } finally {
        setLoading(false);
      }
    };
    loadDoc();
  }, [docId]);

  return (
    <section>
      <PageHeader
        title="Quiz Document"
        subtitle="Saved AI-generated quiz set"
        actions={(
          <Link className="btn" to="/quiz?view=saved">
            Back To Saved Quizzes
          </Link>
        )}
      />
      <StatusMessages loading={loading} loadingText="Loading document..." error={error} />

      {!loading && !error && doc && (
        <article className="card">
          <h3>{doc.title}</h3>
          <p className="muted">
            Grade {doc.grade} | {doc.topic} | {doc.difficulty}
          </p>
          <p className="muted">
            Saved on {new Date(doc.created_at).toLocaleString()}
          </p>
          <pre className="generated-content">{doc.content}</pre>
        </article>
      )}
    </section>
  );
}
