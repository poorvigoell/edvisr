import { Link } from "react-router-dom";
import { getAuthToken } from "../lib/api";

export function HomePage() {
  const appEntryPath = getAuthToken() ? "/dashboard" : "/sign-in";

  return (
    <div className="landing">
      <header className="landing-topbar">
        <h2 className="landing-logo">EDVISR</h2>
        <nav className="landing-links">
          <a href="#features">Features</a>
          <a href="#how">How It Works</a>
          <a href="#impact">Impact</a>
        </nav>
        <div className="row">
          <Link to="/sign-in" className="btn">
            Sign In
          </Link>
          <Link to={appEntryPath} className="btn btn-primary">
            Open Platform
          </Link>
        </div>
      </header>

      <section className="landing-hero landing-hero-main">
        <div className="landing-hero-content hero-copy">
          <p className="landing-kicker">Classroom Insight + Early Intervention</p>
          <h1>Develop stronger teaching decisions with actionable class intelligence.</h1>
          <p className="landing-lead">
            EdVisr analyzes classroom submissions, scores, and timelines to
            identify who needs support, which concepts are unclear, and where
            interventions should happen first.
          </p>
          <div className="row">
            <Link to={appEntryPath} className="btn btn-primary">
              Start Now
            </Link>
            <Link to={appEntryPath} className="btn">
              Watch Demo
            </Link>
          </div>
          <div className="hero-tags">
            <span>Risk Signals</span>
            <span>Concept Insights</span>
            <span>Teacher Notes</span>
          </div>
        </div>

        <div className="landing-hero-panel hero-visual">
          <div className="hero-orb">
            <div className="hero-core">
              <p className="muted">Teacher Workspace</p>
              <strong>Live Class Insight</strong>
            </div>
            <div className="hero-float hero-float-1">Submission Trends</div>
            <div className="hero-float hero-float-2">At-Risk Alerts</div>
            <div className="hero-float hero-float-3">Weak Concepts</div>
            <div className="hero-float hero-float-4">Intervention Log</div>
          </div>
        </div>
      </section>

      <section className="landing-strip" id="how">
        <span>Google Classroom</span>
        <span>Structured Datasets</span>
        <span>FastAPI</span>
        <span>PostgreSQL</span>
        <span>React + Vite</span>
      </section>

      <section className="landing-section" id="features">
        <h2>Built For Educators, Not Workflow Changes</h2>
        <div className="landing-grid">
          <article className="card">
            <h3>Data Ingestion</h3>
            <p className="muted">
              Pull assignments and submissions from existing systems or load
              structured datasets for quick onboarding.
            </p>
          </article>
          <article className="card">
            <h3>Performance Profiling</h3>
            <p className="muted">
              Track each student over time for consistency, improvement, and
              decline patterns.
            </p>
          </article>
          <article className="card">
            <h3>Concept Insights</h3>
            <p className="muted">
              Group common mistakes and identify topics where class-level
              reteaching is needed.
            </p>
          </article>
          <article className="card">
            <h3>Early Warnings</h3>
            <p className="muted">
              Detect risk based on underperformance, declines, and missing
              submissions before outcomes worsen.
            </p>
          </article>
          <article className="card">
            <h3>Class Dashboard</h3>
            <p className="muted">
              See score distribution, submission rates, and assignment trends in
              one place.
            </p>
          </article>
          <article className="card">
            <h3>Teacher Notes</h3>
            <p className="muted">
              Record private interventions and track follow-ups for
              accountability and continuity.
            </p>
          </article>
        </div>
      </section>

      <section className="landing-footer-cta" id="impact">
        <h3>Start with your current classroom data.</h3>
        <p className="muted">
          No LMS replacement, no grading overhaul, and no black-box AI required.
        </p>
        <Link to={appEntryPath} className="btn btn-primary">
          Go To Interventions
        </Link>
      </section>
    </div>
  );
}
