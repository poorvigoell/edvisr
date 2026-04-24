export type Teacher = {
  id: number;
  email: string;
  full_name: string;
};

export type SignInPayload = {
  email: string;
  password: string;
};

export type SignUpPayload = {
  email: string;
  full_name: string;
  password: string;
};

export type AuthTokenResponse = {
  access_token: string;
  token_type: "bearer";
  teacher: Teacher;
};

export type Classroom = {
  id: number;
  teacher_id: number;
  name: string;
  subject: string;
  term: string | null;
};

export type Assignment = {
  id: number;
  class_id: number;
  title: string;
  external_id: string | null;
  max_score: number;
  due_at: string | null;
  published_at: string | null;
  created_at: string;
};

export type ScoreBand = {
  label: string;
  count: number;
};

export type TrendPoint = {
  assignment_id: number;
  assignment_title: string;
  average_score_pct: number;
  submission_rate: number;
  due_at: string | null;
};

export type ClassDashboard = {
  class_id: number;
  class_name: string;
  subject: string;
  total_students: number;
  total_assignments: number;
  average_score_pct: number;
  submission_rate_pct: number;
  at_risk_students: number;
  score_distribution: ScoreBand[];
  trend: TrendPoint[];
};

export type StudentRiskSignal = {
  student_id: number;
  student_name: string;
  class_id: number;
  risk_level: "low" | "medium" | "high";
  risk_score: number;
  risk_type: string;
  reason: string;
  average_score_pct: number | null;
  missing_submission_rate: number;
  signals: string[];
  weak_concepts: string[];
  suggested_intervention: string;
};

export type RiskSignalsResponse = {
  class_id: number;
  total_students: number;
  flagged_students: number;
  signals: StudentRiskSignal[];
};

export type ConceptInsight = {
  concept: string;
  attempts: number;
  accuracy_pct: number;
  average_score_pct: number;
  weak_concept: boolean;
  weakness_level: "high" | "medium" | "low";
  common_error_tags: string[];
};

export type ConceptInsightsResponse = {
  class_id: number;
  concepts: ConceptInsight[];
};

export type Student = {
  id: number;
  class_id: number;
  full_name: string;
  roll_number: string | null;
  email: string | null;
};

export type Submission = {
  id: number;
  assignment_id: number;
  student_id: number;
  status: "submitted" | "late" | "missing" | string;
  submitted_at: string | null;
  raw_score: number | null;
  max_score: number | null;
  rubric_json: Record<string, unknown> | null;
  question_responses_json: Record<string, unknown>[] | null;
  created_at: string;
};

export type ScoreRowPayload = {
  student_name: string;
  roll_number?: string;
  email?: string;
  score?: number;
  status?: "submitted" | "late" | "missing";
  max_score?: number;
};

export type TestScoresPayload = {
  title: string;
  max_score: number;
  due_at?: string;
  published_at?: string;
  scores: ScoreRowPayload[];
};

export type SimpleScoresIngestionPayload = {
  class_id?: number;
  class_name?: string;
  subject?: string;
  term?: string;
  tests: TestScoresPayload[];
};

export type SimpleScoresIngestionSummary = {
  class_id: number;
  students_created: number;
  assignments_created: number;
  submissions_created_or_updated: number;
  missing_submissions_marked: number;
};

export type StudentProgressPoint = {
  assignment_id: number;
  assignment_title: string;
  due_at: string | null;
  status: string;
  score_pct: number | null;
};

export type StudentProfile = {
  student_id: number;
  class_id: number;
  student_name: string;
  average_score_pct: number | null;
  class_average_delta_pct: number | null;
  submission_rate_pct: number;
  consistency_std: number | null;
  trend: "improving" | "declining" | "stable" | "insufficient_data";
  active_notes: number;
  progress: StudentProgressPoint[];
};

export type TeacherNote = {
  id: number;
  teacher_id: number;
  student_id: number;
  note_text: string;
  intervention_action: string | null;
  follow_up_date: string | null;
  is_resolved: boolean;
  created_at: string;
};

export type QuizGenerationResponse = {
  content: string;
};

export type WhatIfQuestionResponse = {
  question: string;
};

export type QuizDocument = {
  id: number;
  class_id: number | null;
  title: string;
  grade: string;
  topic: string;
  difficulty: string;
  content: string;
  created_at: string;
};

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";
const TOKEN_STORAGE_KEY = "edvisr_access_token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    return;
  }
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers ?? {});
  const hasFormDataBody =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  if (!headers.has("Content-Type") && !hasFormDataBody) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    setAuthToken(null);
    if (typeof window !== "undefined" && window.location.pathname !== "/sign-in") {
      window.location.assign("/sign-in");
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  signUp: (payload: SignUpPayload) =>
    request<AuthTokenResponse>("/auth/sign-up", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  signIn: (payload: SignInPayload) =>
    request<AuthTokenResponse>("/auth/sign-in", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getMe: () => request<Teacher>("/auth/me"),
  getTeachers: () => request<Teacher[]>("/teachers"),
  getClasses: (teacherId: number) =>
    request<Classroom[]>(`/classes?teacher_id=${teacherId}`),
  getStudents: (classId: number) =>
    request<Student[]>(`/students?class_id=${classId}`),
  getAssignments: (classId: number) =>
    request<Assignment[]>(`/assignments?class_id=${classId}`),
  ingestScores: (payload: SimpleScoresIngestionPayload) =>
    request<SimpleScoresIngestionSummary>("/ingestion/scores", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  ingestScoresCsv: (
    file: File,
    options?: { class_name?: string; subject?: string; term?: string }
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    if (options?.class_name) formData.append("class_name", options.class_name);
    if (options?.subject) formData.append("subject", options.subject);
    if (options?.term) formData.append("term", options.term);
    return request<SimpleScoresIngestionSummary>("/ingestion/scores/csv", {
      method: "POST",
      body: formData,
    });
  },
  createAssignment: (payload: {
    class_id: number;
    title: string;
    max_score?: number;
    due_at?: string;
    published_at?: string;
    external_id?: string;
  }) =>
    request<Assignment>("/assignments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getSubmissionsByAssignment: (assignmentId: number) =>
    request<Submission[]>(`/submissions?assignment_id=${assignmentId}`),
  upsertSubmission: (payload: {
    assignment_id: number;
    student_id: number;
    status: "submitted" | "late" | "missing";
    raw_score?: number;
    max_score?: number;
    submitted_at?: string;
  }) =>
    request<Submission>("/submissions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  generateQuizQuestions: (payload: {
    grade: string;
    topic: string;
    difficulty: string;
  }) =>
    request<QuizGenerationResponse>("/quiz/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  generateWhatIfQuestion: (payload: { topic: string }) =>
    request<WhatIfQuestionResponse>("/what-if/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  saveQuizDoc: (payload: {
    class_id?: number;
    title: string;
    grade: string;
    topic: string;
    difficulty: string;
    content: string;
  }) =>
    request<QuizDocument>("/quiz/docs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getQuizDocs: (classId?: number) =>
    request<QuizDocument[]>(
      classId ? `/quiz/docs?class_id=${classId}` : "/quiz/docs"
    ),
  getQuizDoc: (docId: number) => request<QuizDocument>(`/quiz/docs/${docId}`),
  deleteQuizDoc: (docId: number) =>
    request<void>(`/quiz/docs/${docId}`, {
      method: "DELETE",
    }),
  getClassDashboard: (classId: number) =>
    request<ClassDashboard>(`/analytics/classes/${classId}/dashboard`),
  getRiskSignals: (classId: number) =>
    request<RiskSignalsResponse>(`/analytics/classes/${classId}/risk-signals`),
  getConceptInsights: (classId: number) =>
    request<ConceptInsightsResponse>(
      `/analytics/classes/${classId}/concept-insights`
    ),
  getStudentProfile: (studentId: number) =>
    request<StudentProfile>(`/analytics/students/${studentId}/profile`),
  getStudentNotes: (studentId: number) =>
    request<TeacherNote[]>(`/students/${studentId}/notes`),
  createNote: (payload: {
    teacher_id: number;
    student_id: number;
    note_text: string;
    intervention_action?: string;
    follow_up_date?: string;
    is_resolved?: boolean;
  }) =>
    request<TeacherNote>("/notes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
