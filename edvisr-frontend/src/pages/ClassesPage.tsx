import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatusMessages } from "../components/StatusMessages";
import type { Student } from "../lib/api";
import { api } from "../lib/api";
import { useTeacher } from "../contexts/TeacherContext";

export function ClassesPage() {
  const navigate = useNavigate();
  const { classes, selectedClassId, setSelectedClassId } = useTeacher();
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const loading = false;
  const error = null;

  useEffect(() => {
    if (!selectedClassId) {
      setStudents([]);
      setStudentsError(null);
      return;
    }

    const loadStudents = async () => {
      try {
        setStudentsLoading(true);
        setStudentsError(null);
        const classStudents = await api.getStudents(selectedClassId);
        setStudents(classStudents);
      } catch (err) {
        setStudentsError(err instanceof Error ? err.message : "Failed to load students for selected class.");
      } finally {
        setStudentsLoading(false);
      }
    };

    loadStudents();
  }, [selectedClassId]);

  const selectedClass = useMemo(
    () => classes.find((item) => item.id === selectedClassId) ?? null,
    [classes, selectedClassId]
  );

  return (
    <section className="stack">
      <PageHeader
        title="Classes"
        subtitle="Select a class and open student profiles."
      />
      <StatusMessages loading={loading} loadingText="Loading classes..." error={error} />

      {!loading && !error && (
        <>
          {classes.length > 0 && (
            <article className="card">
              <h3>Class Students</h3>
              <p className="muted">Select a class to view all students. Click a student to open profile.</p>
              <div className="class-students-toolbar">
                <label htmlFor="class-student-select" className="muted">Class</label>
                <select
                  id="class-student-select"
                  className="select"
                  value={selectedClassId ?? ""}
                  onChange={(event) => setSelectedClassId(Number(event.target.value))}
                >
                  {classes.map((classInfo) => (
                    <option key={classInfo.id} value={classInfo.id}>
                      {classInfo.name} ({classInfo.subject})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!selectedClassId}
                  onClick={() => selectedClassId && navigate(`/insights?classId=${selectedClassId}`)}
                >
                  View Insights
                </button>
              </div>

              {selectedClass && (
                <p className="muted">
                  Showing students for <strong>{selectedClass.name}</strong>.
                </p>
              )}

              {studentsLoading && <p className="muted">Loading students...</p>}
              {studentsError && <p className="text-danger">{studentsError}</p>}

              {!studentsLoading && !studentsError && (
                <div className="stack-sm">
                  {students.map((student) => (
                    <button
                      key={student.id}
                      type="button"
                      className="student-link-btn"
                      onClick={() => navigate(`/students/${student.id}?classId=${selectedClassId}`)}
                    >
                      {student.full_name}
                    </button>
                  ))}
                  {students.length === 0 && (
                    <p className="muted">No students found in this class.</p>
                  )}
                </div>
              )}
            </article>
          )}

          {classes.length === 0 && (
            <article className="class-card">
              <h3>No classes yet</h3>
              <p className="muted">Add classes from setup to begin.</p>
            </article>
          )}
        </>
      )}
    </section>
  );
}
