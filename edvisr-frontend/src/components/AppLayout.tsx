import { useEffect, useRef } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { setAuthToken } from "../lib/api";
import { useTeacher } from "../contexts/TeacherContext";

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/classes", label: "Classes" },
  { to: "/insights", label: "Insights" },
  { to: "/quiz", label: "Generate Quiz" },
  { to: "/settings", label: "Settings" },
];

export function AppLayout() {
  const navigate = useNavigate();
  const { teacher, alertsCount, logout } = useTeacher();
  const inactivityTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearInactivityTimer = () => {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };

    const triggerAutoLogout = () => {
      setAuthToken(null);
      navigate("/", { replace: true });
    };

    const resetInactivityTimer = () => {
      clearInactivityTimer();
      inactivityTimerRef.current = window.setTimeout(triggerAutoLogout, INACTIVITY_TIMEOUT_MS);
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    const onActivity = () => {
      resetInactivityTimer();
    };

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    resetInactivityTimer();

    return () => {
      clearInactivityTimer();
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, onActivity);
      }
    };
  }, [navigate]);

  const onSignOut = () => {
    logout();
    setAuthToken(null);
    navigate("/sign-in", { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <h1 className="brand">EdVisr</h1>
          <p className="muted">Teacher Workspace</p>
        </div>
        <nav className="nav-list">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `nav-link ${isActive ? "nav-link-active" : ""}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-item">
            <span className="muted">Teacher</span>
            <strong>{teacher?.full_name || "Teacher"}</strong>
          </div>
          <div className="topbar-item">
            <span className="muted">Notifications</span>
            <strong>{alertsCount} risk alerts</strong>
          </div>
          <button type="button" className="btn" onClick={onSignOut}>
            Logout
          </button>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
