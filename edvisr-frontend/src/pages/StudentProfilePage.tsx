import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatusMessages } from "../components/StatusMessages";
import { api } from "../lib/api";
import type { StudentProfile, TeacherNote } from "../lib/api";
import { useTeacher } from "../contexts/TeacherContext";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

function riskLabel(profile: StudentProfile): "low" | "medium" | "high" {
  const avg = profile.average_score_pct ?? 0;
  const lowSubmissions = profile.submission_rate_pct < 70;
  const declining = profile.trend === "declining";
  if (avg < 50 || (declining && lowSubmissions)) return "high";
  if (avg < 60 || declining || lowSubmissions) return "medium";
  return "low";
}

export function StudentProfilePage() {
  const { studentId } = useParams();
  const [searchParams] = useSearchParams();
  const { teacher } = useTeacher();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [notes, setNotes] = useState<TeacherNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [interventionTaken, setInterventionTaken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classIdFromQuery = searchParams.get("classId");

  const studentIdNumber = Number(studentId);
  const profileRisk = profile ? riskLabel(profile) : "low";

  const summaryText = useMemo(() => {
    if (!profile) return "";
    const avgText =
      profile.average_score_pct === null ? "no graded average yet" : `an average of ${profile.average_score_pct}%`;
    const trendText =
      profile.trend === "declining"
        ? "Performance has declined across recent assignments."
        : profile.trend === "improving"
          ? "Performance is improving across recent assignments."
          : "Performance trend is currently stable.";
    return `${trendText} Student has ${avgText}. Focus on concept-specific gaps highlighted in class insights.`;
  }, [profile]);

  useEffect(() => {
    if (!Number.isFinite(studentIdNumber) || studentIdNumber <= 0) {
      setError("Invalid student id.");
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const [profileData, notesData] = await Promise.all([
          api.getStudentProfile(studentIdNumber),
          api.getStudentNotes(studentIdNumber),
        ]);
        setProfile(profileData);
        setNotes(notesData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load student profile.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [studentIdNumber]);

  const onAddNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!teacher || !profile || !noteText.trim()) return;

    try {
      setSaving(true);
      setError(null);
      const notePrefix = interventionTaken ? "[Intervention Taken] " : "";
      await api.createNote({
        teacher_id: teacher.id,
        student_id: profile.student_id,
        note_text: `${notePrefix}${noteText.trim()}`,
      });
      const updatedNotes = await api.getStudentNotes(profile.student_id);
      setNotes(updatedNotes);
      setNoteText("");
      setInterventionTaken(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note.");
    } finally {
      setSaving(false);
    }
  };

  const [recommendations, setRecommendations] = useState<string | null>(null);
  const [loadingRecs, setLoadingRecs] = useState(false);

  const getRecommendations = async () => {
    if (!studentIdNumber) return;
    try {
      setLoadingRecs(true);
      setError(null);
      const data = await api.getStudentRecommendations(studentIdNumber);
      setRecommendations(data.recommendations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get AI recommendations.");
    } finally {
      setLoadingRecs(false);
    }
  };

  return (
    <section className="stack">
      <PageHeader
        title="Student Profile"
        subtitle="Detailed student performance and interventions."
        actions={(
          <Link className="btn" to={classIdFromQuery ? `/insights?classId=${classIdFromQuery}` : "/insights"}>
            Back To Insights
          </Link>
        )}
      />
      <StatusMessages loading={loading} loadingText="Loading student profile..." error={error} />

      {!loading && !error && profile && (
        <>
          <article className="card">
            <h3>{profile.student_name}</h3>
            <p className="muted">
              Overall Avg: {profile.average_score_pct === null ? "N/A" : `${profile.average_score_pct}%`}
            </p>
            <p className={profileRisk === "high" ? "text-danger" : profileRisk === "medium" ? "text-warn" : "text-ok"}>
              Risk Status: {profileRisk.toUpperCase()}
            </p>
          </article>

          <div className="grid-2">
            <article className="card">
              <h3>Performance Trend</h3>
              <div className="line-chart" style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={profile.progress.map((item, i) => ({
                    name: item.assignment_title || `A${i+1}`,
                    score: item.score_pct ?? 0
                  }))}>
                    <XAxis dataKey="name" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#151522', borderColor: '#2f2f44', borderRadius: '10px', color: '#f8f8fb' }}
                      itemStyle={{ color: '#cdd0f5' }}
                    />
                    <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="card">
              <h3>Analytics Summary</h3>
              <p>{summaryText}</p>
              <div className="stack-sm" style={{ marginTop: '1rem' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={getRecommendations}
                  disabled={loadingRecs}
                >
                  {loadingRecs ? "Thinking..." : "✨ Ask AI for Strategies"}
                </button>
                {recommendations && (
                  <div className="subcard" style={{ whiteSpace: 'pre-wrap', borderLeft: '4px solid #4f46e5' }}>
                    <strong>AI Recommendations:</strong>
                    <p style={{ fontSize: '0.9rem', color: '#cdd0f5', marginTop: '0.5rem' }}>{recommendations}</p>
                  </div>
                )}
              </div>
            </article>
          </div>

          <div className="grid-2">
            <article className="card">
              <h3>Add Teacher Note</h3>
              <form className="stack-sm" onSubmit={onAddNote}>
                <textarea
                  className="input textarea"
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="Observation or intervention details"
                  required
                />
                <label className="row">
                  <input
                    type="checkbox"
                    checked={interventionTaken}
                    onChange={(event) => setInterventionTaken(event.target.checked)}
                  />
                  <span>Intervention Taken</span>
                </label>
                <button className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving..." : "Save Note"}
                </button>
              </form>
            </article>

            <article className="card">
              <h3>Notes Timeline</h3>
              <div className="stack-sm">
                {notes.map((note) => (
                  <div key={note.id} className="subcard">
                    <p>{note.note_text}</p>
                    <p className="muted">{new Date(note.created_at).toLocaleString()}</p>
                  </div>
                ))}
                {notes.length === 0 && (
                  <p className="muted">No notes yet for this student.</p>
                )}
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
