import { PageHeader } from "../components/PageHeader";

export function DiscussionsPage() {
  return (
    <section>
      <PageHeader
        title="Discussions"
        subtitle="Collaboration panel placeholder for teacher-staff conversations"
      />

      <article className="card">
        <h3>Coming Next</h3>
        <p className="muted">
          This route is ready in the new React app. You can connect it to your
          future discussion APIs or Firebase/chat backend.
        </p>
      </article>
    </section>
  );
}
