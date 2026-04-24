import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { PageHeader } from "../components/PageHeader";
import { StatusMessages } from "../components/StatusMessages";
import { api } from "../lib/api";
import type { Classroom, ScoreRowPayload } from "../lib/api";

function parseScoresInput(raw: string): ScoreRowPayload[] {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("Add at least one student score row.");
  }

  return lines.map((line, index) => {
    const parts = line.split(",").map((part) => part.trim());
    if (parts.length < 2) {
      throw new Error(`Row ${index + 1}: expected at least "name,score".`);
    }

    const student_name = parts[0];
    let roll_number: string | undefined;
    let email: string | undefined;
    let scoreToken = "";

    if (parts.length === 2) {
      scoreToken = parts[1];
    } else if (parts.length === 3) {
      scoreToken = parts[2];
      if (parts[1].includes("@")) {
        email = parts[1];
      } else {
        roll_number = parts[1];
      }
    } else {
      roll_number = parts[1] || undefined;
      email = parts[2] || undefined;
      scoreToken = parts[3];
    }

    const token = scoreToken.toLowerCase();
    if (!scoreToken || token === "missing" || token === "na" || token === "absent") {
      return {
        student_name,
        roll_number,
        email,
        status: "missing",
      };
    }

    const numericScore = Number(scoreToken);
    if (!Number.isFinite(numericScore) || numericScore < 0) {
      throw new Error(`Row ${index + 1}: score must be a valid non-negative number.`);
    }

    return {
      student_name,
      roll_number,
      email,
      score: numericScore,
      status: "submitted",
    };
  });
}

export function SetupPage() {
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [newClassName, setNewClassName] = useState("");
  const [newClassSubject, setNewClassSubject] = useState("");
  const [newClassTerm, setNewClassTerm] = useState("");
  const [testTitle, setTestTitle] = useState("");
  const [testMaxScore, setTestMaxScore] = useState("100");
  const [testDueDate, setTestDueDate] = useState("");
  const [scoresInput, setScoresInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadClasses = async () => {
    try {
      const teacher = await api.getMe();
      const classList = await api.getClasses(teacher.id);
      setClasses(classList);
      if (!selectedClassId && classList.length > 0) {
        setSelectedClassId(String(classList[0].id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load classes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const parsedRows = parseScoresInput(scoresInput);
      const maxScore = Number(testMaxScore);
      if (!Number.isFinite(maxScore) || maxScore <= 0) {
        throw new Error("Test max score must be greater than 0.");
      }

      const payload =
        selectedClassId && selectedClassId !== "new"
          ? {
              class_id: Number(selectedClassId),
              tests: [
                {
                  title: testTitle.trim(),
                  max_score: maxScore,
                  due_at: testDueDate
                    ? new Date(`${testDueDate}T00:00:00`).toISOString()
                    : undefined,
                  published_at: new Date().toISOString(),
                  scores: parsedRows,
                },
              ],
            }
          : {
              class_name: newClassName.trim(),
              subject: newClassSubject.trim(),
              term: newClassTerm.trim() || undefined,
              tests: [
                {
                  title: testTitle.trim(),
                  max_score: maxScore,
                  due_at: testDueDate
                    ? new Date(`${testDueDate}T00:00:00`).toISOString()
                    : undefined,
                  published_at: new Date().toISOString(),
                  scores: parsedRows,
                },
              ],
            };

      const result = await api.ingestScores(payload);
      setSuccess(
        `Imported. Students created: ${result.students_created}, tests created: ${result.assignments_created}, submissions updated: ${result.submissions_created_or_updated}.`
      );
      setScoresInput("");
      await loadClasses();
      setSelectedClassId(String(result.class_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import scores.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <PageHeader
        title="Setup Data"
        subtitle="Enter class tests and student scores. EdVisr computes weak students, class averages, and analytics automatically."
      />
      <StatusMessages
        loading={loading}
        loadingText="Loading setup data..."
        error={error}
        success={success}
      />

      {!loading && (
        <article className="card">
          <form className="stack-sm" onSubmit={onSubmit}>
            <label className="muted">Target Class</label>
            <select
              className="select"
              value={selectedClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
            >
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.subject})
                </option>
              ))}
              <option value="new">Create new class</option>
            </select>

            {selectedClassId === "new" && (
              <>
                <input
                  className="input"
                  value={newClassName}
                  onChange={(event) => setNewClassName(event.target.value)}
                  placeholder="Class name"
                  required
                />
                <input
                  className="input"
                  value={newClassSubject}
                  onChange={(event) => setNewClassSubject(event.target.value)}
                  placeholder="Subject"
                  required
                />
                <input
                  className="input"
                  value={newClassTerm}
                  onChange={(event) => setNewClassTerm(event.target.value)}
                  placeholder="Term (optional)"
                />
              </>
            )}

            <input
              className="input"
              value={testTitle}
              onChange={(event) => setTestTitle(event.target.value)}
              placeholder="Test title (e.g. Unit Test 1)"
              required
            />
            <div className="row">
              <input
                className="input"
                type="number"
                min="1"
                step="0.1"
                value={testMaxScore}
                onChange={(event) => setTestMaxScore(event.target.value)}
                placeholder="Max score"
                required
              />
              <input
                className="input"
                type="date"
                value={testDueDate}
                onChange={(event) => setTestDueDate(event.target.value)}
              />
            </div>

            <textarea
              className="input textarea"
              value={scoresInput}
              onChange={(event) => setScoresInput(event.target.value)}
              placeholder={
                "One line per student:\nName,Score\nName,Roll,Score\nName,Email,Score\nName,Roll,Email,Score\nUse missing/absent instead of score for missing submission."
              }
              required
            />

            <button className="btn btn-primary" disabled={saving}>
              {saving ? "Importing..." : "Import Scores"}
            </button>
          </form>
        </article>
      )}
    </section>
  );
}
