import { useEffect, useRef, useState } from "react";
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
  const { teacher, alertsCount, alerts, logout } = useTeacher();
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

  const [showNotifications, setShowNotifications] = useState(false);

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
          <div className="topbar-item" style={{ position: 'relative' }}>
            <div 
              className="row" 
              style={{ cursor: 'pointer' }}
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <span className="muted">Notifications</span>
              <strong>{alertsCount} risk alerts</strong>
            </div>

            {showNotifications && (
              <div className="card" style={{ 
                position: 'absolute', 
                top: '100%', 
                right: 0, 
                width: '320px', 
                zIndex: 100, 
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                maxHeight: '400px',
                overflowY: 'auto',
                marginTop: '10px'
              }}>
                <div className="row row-space" style={{ marginBottom: '1rem' }}>
                  <h3>Alerts</h3>
                  <button className="btn" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => setShowNotifications(false)}>Close</button>
                </div>
                <div className="stack-sm">
                  {alerts.map((alert) => (
                    <div 
                      key={alert.id} 
                      className="subcard table-row-click" 
                      style={{ padding: '10px' }}
                      onClick={() => {
                        navigate(`/students/${alert.student_id}?classId=${alert.class_id}`);
                        setShowNotifications(false);
                      }}
                    >
                      <div className="row row-space">
                        <strong>{alert.payload_json?.student_name}</strong>
                        <span className={`risk-tag risk-tag-${alert.severity}`}>{alert.severity}</span>
                      </div>
                      <p style={{ fontSize: '12px', marginTop: '4px' }}>{alert.payload_json?.reason}</p>
                    </div>
                  ))}
                  {alerts.length === 0 && <p className="muted">No new alerts.</p>}
                </div>
              </div>
            )}
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
