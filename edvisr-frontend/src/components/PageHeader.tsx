import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
