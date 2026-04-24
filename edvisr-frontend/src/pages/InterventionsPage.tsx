import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { PageHeader } from "../components/PageHeader";
import { StatusMessages } from "../components/StatusMessages";
import { api } from "../lib/api";
import type {
  Student,
  StudentProfile,
  TeacherNote,
} from "../lib/api";
import { useTeacher } from "../contexts/TeacherContext";

export function InterventionsPage() {
  const { teacher, classes, selectedClassId, setSelectedClassId } = useTeacher();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [notes, setNotes] = useState<TeacherNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [interventionAction, setInterventionAction] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStudent = useMemo(
    () => students.find((item) => item.id === selectedStudentId) ?? null,
    [students, selectedStudentId]
  );

  useEffect(() => {
    if (!selectedClassId) return;
    const loadStudents = async () => {
      try {
        setLoading(true);
        const classStudents = await api.getStudents(selectedClassId);
        setStudents(classStudents);
        setSelectedStudentId(classStudents[0]?.id ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load students.");
      } finally {
        setLoading(false);
      }
    };
    loadStudents();
  }, [selectedClassId]);

  useEffect(() => {
    if (!selectedStudentId) return;
    const loadStudentContext = async () => {
      try {
        setLoading(true);
        const [profileData, notesData] = await Promise.all([
          api.getStudentProfile(selectedStudentId),
          api.getStudentNotes(selectedStudentId),
        ]);
        setProfile(profileData);
        setNotes(notesData);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load student profile."
        );
      } finally {
        setLoading(false);
      }
    };
    loadStudentContext();
  }, [selectedStudentId]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!teacher || !selectedStudentId || !noteText.trim()) return;

    try {
      setSaving(true);
      await api.createNote({
        teacher_id: teacher.id,
        student_id: selectedStudentId,
        note_text: noteText.trim(),
        intervention_action: interventionAction || undefined,
        follow_up_date: followUpDate || undefined,
      });
      const [updatedNotes, updatedProfile] = await Promise.all([
        api.getStudentNotes(selectedStudentId),
        api.getStudentProfile(selectedStudentId),
      ]);
      setNotes(updatedNotes);
      setProfile(updatedProfile);
      setNoteText("");
      setInterventionAction("");
      setFollowUpDate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <PageHeader
        title="Interventions"
        subtitle="Private teacher notes and follow-up actions"
        actions={(
          <div className="row">
            {classes.length > 0 && (
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
            )}
            {students.length > 0 && (
              <select
                className="select"
                value={selectedStudentId ?? ""}
                onChange={(event) =>
                  setSelectedStudentId(Number(event.target.value))
                }
              >
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.full_name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      />
      <StatusMessages loading={loading} loadingText="Loading interventions..." error={error} />

      {!loading && profile && selectedStudent && (
        <div className="grid-2">
          <div className="stack">
            <article className="card">
              <h3>Student Snapshot</h3>
              <p className="muted">Name: {selectedStudent.full_name}</p>
              <p className="muted">
                Average Score:{" "}
                {profile.average_score_pct === null
                  ? "N/A"
                  : `${profile.average_score_pct}%`}
              </p>
              <p className="muted">Submission Rate: {profile.submission_rate_pct}%</p>
              <p className="muted">Trend: {profile.trend}</p>
              <p className="muted">Open Notes: {profile.active_notes}</p>
            </article>

            <article className="card">
              <h3>Progress History</h3>
              <div className="stack-sm">
                {profile.progress.map((item) => (
                  <div key={item.assignment_id} className="subcard">
                    <strong>{item.assignment_title}</strong>
                    <p className="muted">
                      Status: {item.status} | Score:{" "}
                      {item.score_pct === null ? "N/A" : `${item.score_pct}%`}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="stack">
            <article className="card">
              <h3>Add Note</h3>
              <form className="stack-sm" onSubmit={onSubmit}>
                <textarea
                  className="input textarea"
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="Observed issue"
                  required
                />
                <input
                  className="input"
                  value={interventionAction}
                  onChange={(event) => setInterventionAction(event.target.value)}
                  placeholder="Intervention action"
                />
                <input
                  className="input"
                  type="date"
                  value={followUpDate}
                  onChange={(event) => setFollowUpDate(event.target.value)}
                />
                <button className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving..." : "Save Note"}
                </button>
              </form>
            </article>

            <article className="card">
              <h3>Teacher Notes</h3>
              <div className="stack-sm">
                {notes.map((note) => (
                  <div key={note.id} className="subcard">
                    <p>{note.note_text}</p>
                    {note.intervention_action && (
                      <p className="muted">Action: {note.intervention_action}</p>
                    )}
                    <p className="muted">
                      Follow-up: {note.follow_up_date ?? "Not set"} | Status:{" "}
                      {note.is_resolved ? "Resolved" : "Open"}
                    </p>
                  </div>
                ))}
                {notes.length === 0 && (
                  <p className="muted">No notes added for this student yet.</p>
                )}
              </div>
            </article>
          </div>
        </div>
      )}
    </section>
  );
}
