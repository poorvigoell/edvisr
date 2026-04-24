import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, setAuthToken } from "../lib/api";
import { loadTeacherAndClasses } from "../lib/context";

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
  const [teacherName, setTeacherName] = useState("Teacher");
  const [riskAlerts, setRiskAlerts] = useState(0);
  const inactivityTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const loadHeaderData = async () => {
      try {
        const me = await api.getMe();
        setTeacherName(me.full_name);
        const { classes } = await loadTeacherAndClasses();
        const risks = await Promise.all(classes.map((item) => api.getRiskSignals(item.id)));
        const totalAlerts = risks.reduce(
          (sum, item) => sum + item.signals.filter((signal) => signal.risk_level !== "low").length,
          0
        );
        setRiskAlerts(totalAlerts);
      } catch {
        setTeacherName("Teacher");
        setRiskAlerts(0);
      }
    };
    loadHeaderData();
  }, []);

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
            <strong>{teacherName}</strong>
          </div>
          <div className="topbar-item">
            <span className="muted">Notifications</span>
            <strong>{riskAlerts} risk alerts</strong>
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
