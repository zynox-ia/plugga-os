import type { ReactNode } from "react";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`ui-badge ui-tone--${tone}`}><span aria-hidden="true" className="ui-status-dot" />{children}</span>;
}

export function Alert({ title, children, tone = "info" }: { title: string; children?: ReactNode; tone?: Tone }) {
  const symbols = { neutral: "i", info: "i", success: "✓", warning: "!", danger: "!" };
  return <div className={`ui-alert ui-tone--${tone}`} role={tone === "danger" ? "alert" : "status"}>
    <span aria-hidden="true" className="ui-alert-icon">{symbols[tone]}</span>
    <div><strong>{title}</strong>{children && <div>{children}</div>}</div>
  </div>;
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="ui-empty"><span className="ui-empty-mark" aria-hidden="true">＋</span><h3>{title}</h3><p>{children}</p>{action}</div>;
}

export function Skeleton({ label = "Carregando conteúdo" }: { label?: string }) {
  return <div className="ui-skeleton" role="status" aria-label={label}><span /><span /><span /><span className="sr-only">{label}</span></div>;
}
