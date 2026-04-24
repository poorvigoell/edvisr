import { Link } from "react-router-dom";
import { BubbleBackground } from "../components/BubbleBackground";

export function HomePage() {
  return (
    <div className="landing">
      <BubbleBackground interactive>
        <header className="landing-topbar">
          <h2 className="landing-logo">EDVISR</h2>
          <div className="row" style={{ gap: '2rem' }}>
            <Link to="/sign-in" className="muted" style={{ fontSize: '0.9rem', fontWeight: 500 }}>Login</Link>
            <Link to="/sign-up" className="btn" style={{ padding: '8px 20px' }}>Get Started</Link>
          </div>
        </header>

        <section className="landing-hero">
          <div className="badge" style={{ 
            background: 'rgba(111, 71, 255, 0.1)', 
            color: 'var(--primary)', 
            padding: '6px 16px', 
            borderRadius: '99px', 
            fontSize: '0.8rem', 
            fontWeight: 600,
            marginBottom: '1.5rem',
            border: '1px solid rgba(111, 71, 255, 0.2)',
            animation: 'fade-in 0.8s ease-out'
          }}>
            TRUSTED BY 500+ EDUCATORS
          </div>
          <h1 style={{ maxWidth: '900px' }}>Actionable class intelligence.</h1>
          <div className="hero-accent" />
          <p className="landing-lead" style={{ maxWidth: '640px' }}>
            EdVisr transforms classroom data into predictive insights. 
            Identify risk signals and concept gaps before they impact outcomes 
            with our LPU-powered analytics engine.
          </p>
          <div className="hero-actions">
            <Link to="/sign-up" className="btn btn-primary" style={{ boxShadow: '0 0 40px rgba(111, 71, 255, 0.4)' }}>
              Start For Free
            </Link>
            <Link to="/sign-in" className="btn btn-outline" style={{ backdropFilter: 'blur(10px)' }}>
              View Demo
            </Link>
          </div>
          <div className="muted" style={{ marginTop: '4rem', fontSize: '0.8rem', opacity: 0.6 }}>
            No credit card required. Setup in under 2 minutes.
          </div>
        </section>
      </BubbleBackground>
    </div>
  );
}
