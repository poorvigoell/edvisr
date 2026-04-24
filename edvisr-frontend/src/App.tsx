import type { ReactElement } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { getAuthToken } from "./lib/api";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ClassesPage } from "./pages/ClassesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HomePage } from "./pages/HomePage";
import { QuizDocPage } from "./pages/QuizDocPage";
import { QuizPage } from "./pages/QuizPage";
import { SchedulePage } from "./pages/SchedulePage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignInPage } from "./pages/SignInPage";
import { SignUpPage } from "./pages/SignUpPage";
import { SetupPage } from "./pages/SetupPage";
import { StudentProfilePage } from "./pages/StudentProfilePage";

import { TeacherProvider } from "./contexts/TeacherContext";

function RequireAuth({ children }: { children: ReactElement }) {
  const location = useLocation();

  if (!getAuthToken()) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route
          element={
            <RequireAuth>
              <TeacherProvider>
                <AppLayout />
              </TeacherProvider>
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/insights" element={<AnalyticsPage />} />
          <Route path="/students/:studentId" element={<StudentProfilePage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/quiz/generate" element={<Navigate to="/quiz" replace />} />
          <Route path="/quiz/saved" element={<Navigate to="/quiz?view=saved" replace />} />
          <Route path="/quiz/docs/:docId" element={<QuizDocPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
