import { Link } from "react-router-dom";
import { BubbleBackground } from "../components/BubbleBackground";

export function HomePage() {
  return (
    <div className="landing">
      <BubbleBackground interactive>
        <header className="landing-topbar">
          <h2 className="landing-logo">EDVISR</h2>
        </header>

        <section className="landing-hero">
          <h1>Actionable class intelligence.</h1>
          <div className="hero-accent" />
          <p className="landing-lead">
            EdVisr analyzes classroom data to identify risk signals and concept
            gaps before they impact outcomes.
          </p>
          <div className="hero-actions">
            <Link to="/sign-in" className="btn btn-primary">
              Sign In
            </Link>
            <Link to="/sign-up" className="btn btn-outline">
              Create Account
            </Link>
          </div>
        </section>
      </BubbleBackground>
    </div>
  );
}
