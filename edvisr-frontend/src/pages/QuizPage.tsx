import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatusMessages } from "../components/StatusMessages";
import { api } from "../lib/api";
import type { QuizDocument } from "../lib/api";
import { useTeacher } from "../contexts/TeacherContext";

type McqQuestion = {
  question: string;
  options: string[];
  correct: string | null;
};

function parseQuizContent(raw: string): { mcqs: McqQuestion[]; theory: string[] } {
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  const mcqs: McqQuestion[] = [];
  const theory: string[] = [];

  let current: McqQuestion | null = null;
  for (const line of lines) {
    if (/^q?\d+[\).:-]/i.test(line)) {
      if (current) mcqs.push(current);
      current = { question: line.replace(/^q?\d+[\).:-]\s*/i, ""), options: [], correct: null };
      continue;
    }
    if (/^[A-D][\).:-]\s*/.test(line)) {
      current?.options.push(line);
      continue;
    }
    if (/^correct/i.test(line)) {
      if (current) current.correct = line.replace(/^correct[:\s-]*/i, "");
      continue;
    }
    if (current && current.options.length > 0) {
      mcqs.push(current);
      current = null;
    }
    theory.push(line);
  }
  if (current) mcqs.push(current);
  return { mcqs, theory };
}

export function QuizPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { classes } = useTeacher();
  const [savedClassId, setSavedClassId] = useState<number | null>(null);
  const [docs, setDocs] = useState<QuizDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [quizGrade, setQuizGrade] = useState("10");
  const [quizTopic, setQuizTopic] = useState("");
  const [quizDifficulty, setQuizDifficulty] = useState("medium");
  const [whatIfTopic, setWhatIfTopic] = useState("");
  const [generatedQuiz, setGeneratedQuiz] = useState("");
  const [whatIfQuestion, setWhatIfQuestion] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [generatingWhatIf, setGeneratingWhatIf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const showSaved = searchParams.get("view") === "saved";

  useEffect(() => {
    if (classes.length > 0 && savedClassId === null) {
      setSavedClassId(classes[0].id);
    }
  }, [classes, savedClassId]);

  const parsed = useMemo(() => parseQuizContent(generatedQuiz), [generatedQuiz]);

  useEffect(() => {
    if (!showSaved) return;

    const loadSavedDocs = async () => {
      try {
        setDocsLoading(true);
        setDocsError(null);
        const data = await api.getQuizDocs(savedClassId ?? undefined);
        setDocs(data);
      } catch (err) {
        setDocsError(err instanceof Error ? err.message : "Failed to load saved quizzes.");
      } finally {
        setDocsLoading(false);
      }
    };

    loadSavedDocs();
  }, [showSaved, savedClassId]);

  useEffect(() => {
    const topic = searchParams.get("topic");
    if (topic && !generatedQuiz && !generatingQuiz) {
      setQuizTopic(topic);
      const autoGenerate = async () => {
        try {
          setGeneratingQuiz(true);
          setError(null);
          const quiz = await api.generateQuizQuestions({
            grade: quizGrade,
            topic: topic,
            difficulty: quizDifficulty,
          });
          setGeneratedQuiz(quiz.content);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to auto-generate remedial quiz.");
        } finally {
          setGeneratingQuiz(false);
        }
      };
      autoGenerate();
    }
  }, [searchParams, quizGrade, quizDifficulty, generatedQuiz, generatingQuiz]);

  const setSavedVisibility = (open: boolean) => {
    const params = new URLSearchParams(searchParams);
    if (open) {
      params.set("view", "saved");
    } else {
      params.delete("view");
    }
    setSearchParams(params, { replace: true });
  };

  const onGenerateQuiz = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!quizTopic.trim()) return;
    try {
      setGeneratingQuiz(true);
      setError(null);
      setSuccess(null);
      const quiz = await api.generateQuizQuestions({
        grade: quizGrade.trim(),
        topic: quizTopic.trim(),
        difficulty: quizDifficulty,
      });
      setGeneratedQuiz(quiz.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate quiz.");
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const onGenerateWhatIf = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!whatIfTopic.trim()) return;
    try {
      setGeneratingWhatIf(true);
      setError(null);
      setSuccess(null);
      const whatIf = await api.generateWhatIfQuestion({ topic: whatIfTopic.trim() });
      setWhatIfQuestion(whatIf.question);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate what-if question.");
    } finally {
      setGeneratingWhatIf(false);
    }
  };

  const onSave = async () => {
    if (!generatedQuiz.trim()) return;
    try {
      setSaving(true);
      setError(null);
      await api.saveQuizDoc({
        title: `${quizTopic.trim() || "Generated"} Quiz (${quizDifficulty})`,
        grade: quizGrade.trim(),
        topic: quizTopic.trim() || "General",
        difficulty: quizDifficulty,
        content: generatedQuiz,
      });
      setSuccess("Quiz saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save quiz.");
    } finally {
      setSaving(false);
    }
  };

  const onDeleteSaved = async (docId: number) => {
    try {
      setDocsError(null);
      await api.deleteQuizDoc(docId);
      setDocs((prev) => prev.filter((item) => item.id !== docId));
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "Failed to delete quiz.");
    }
  };

  return (
    <section className="stack">
      <PageHeader
        title="Quiz Workspace"
        subtitle="Generate quiz and what-if questions separately, and manage saved quizzes in one place."
        actions={(
          <button
            type="button"
            className="btn"
            onClick={() => setSavedVisibility(!showSaved)}
          >
            {showSaved ? "Hide Saved Quizzes" : "Saved Quizzes"}
          </button>
        )}
      />
      <div className="grid-2">
        <article className="card">
          <form className="stack-sm" onSubmit={onGenerateQuiz}>
            <h3>Quiz Questions</h3>
            <input
              className="input"
              value={quizTopic}
              onChange={(event) => setQuizTopic(event.target.value)}
              placeholder="Topic"
              required
            />
            <input
              className="input"
              value={quizGrade}
              onChange={(event) => setQuizGrade(event.target.value)}
              placeholder="Grade"
              required
            />
            <select
              className="select"
              value={quizDifficulty}
              onChange={(event) => setQuizDifficulty(event.target.value)}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <button className="btn btn-primary quiz-generate-btn" disabled={generatingQuiz}>
              {generatingQuiz ? "Generating..." : "Generate Quiz Questions"}
            </button>
          </form>
        </article>

        <article className="card highlight-card">
          <form className="stack-sm" onSubmit={onGenerateWhatIf}>
            <h3>What-If Question</h3>
            <input
              className="input"
              value={whatIfTopic}
              onChange={(event) => setWhatIfTopic(event.target.value)}
              placeholder="Topic"
              required
            />
            <button className="btn btn-primary quiz-generate-btn" disabled={generatingWhatIf}>
              {generatingWhatIf ? "Generating..." : "Generate What-If Question"}
            </button>
          </form>
        </article>
      </div>

      <StatusMessages error={error} success={success} />

      {generatedQuiz && (
        <div className="stack">
          <article className="card">
            <div className="row row-space">
              <h3>Quiz Questions</h3>
              <div className="row">
                <button className="btn" type="button" onClick={() => setIsEditing((prev) => !prev)}>
                  {isEditing ? "Preview" : "Edit"}
                </button>
                <button className="btn" type="button" onClick={() => onGenerateQuiz()}>
                  Regenerate
                </button>
                <button className="btn btn-primary" type="button" onClick={onSave} disabled={saving}>
                  {saving ? "Saving..." : "Save Quiz"}
                </button>
              </div>
            </div>

            {isEditing ? (
              <textarea
                className="input textarea"
                value={generatedQuiz}
                onChange={(event) => setGeneratedQuiz(event.target.value)}
              />
            ) : (
              <div className="stack-sm">
                {parsed.mcqs.length > 0 && (
                  <>
                    {parsed.mcqs.map((mcq, index) => (
                      <div key={`${mcq.question}-${index}`} className="subcard">
                        <strong>Q{index + 1}. {mcq.question}</strong>
                        {mcq.options.map((option) => (
                          <p key={option} className="muted">{option}</p>
                        ))}
                        {mcq.correct && <p><strong>Correct:</strong> {mcq.correct}</p>}
                      </div>
                    ))}
                  </>
                )}
                {parsed.theory.length > 0 ? (
                  <div className="subcard">
                    <strong>Theory Questions</strong>
                    {parsed.theory.map((line, idx) => (
                      <p key={`${line}-${idx}`}>{line}</p>
                    ))}
                  </div>
                ) : null}
                {parsed.mcqs.length === 0 && parsed.theory.length === 0 ? (
                  <pre className="generated-content">{generatedQuiz}</pre>
                ) : null}
              </div>
            )}
          </article>
        </div>
      )}

      {whatIfQuestion && (
        <article className="card highlight-card">
          <h3>What-If Question</h3>
          <p>{whatIfQuestion}</p>
          <div className="row">
            <button className="btn" type="button" onClick={() => onGenerateWhatIf()}>
              Regenerate What-If
            </button>
          </div>
        </article>
      )}

      {showSaved && (
        <article className="card">
          <div className="row row-space">
            <h3>Saved Quizzes</h3>
            {classes.length > 0 && (
              <select
                className="select"
                value={savedClassId ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setSavedClassId(value ? Number(value) : null);
                }}
              >
                <option value="">All Classes</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {docsLoading && <p className="muted">Loading saved quizzes...</p>}
          {docsError && <p className="text-danger">{docsError}</p>}

          {!docsLoading && !docsError && (
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
                        <button className="btn" type="button" onClick={() => onDeleteSaved(doc.id)}>
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
          )}
        </article>
      )}
    </section>
  );
}
