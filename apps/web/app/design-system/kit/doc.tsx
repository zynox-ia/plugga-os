import type { ReactElement, ReactNode } from "react";
import { ListTreeIcon, PanelsTopLeftIcon } from "lucide-react";
import { Heading } from "../../components/ui/heading";

export function DocPage({ title, description, category, children, icon = <PanelsTopLeftIcon /> }: { title: string; description: ReactNode; category?: string; children: ReactNode; icon?: ReactElement }) {
  return <article className="ds-doc-page">
    <header className="ds-page-header">
      {category && <span className="ds-eyebrow">{category}</span>}
      <Heading as="h1" icon={icon}>{title}</Heading><div className="ds-page-desc">{description}</div>
    </header>
    <div className="ds-page-sections">{children}</div>
  </article>;
}

export function DocSection({ title, description, children, icon = <ListTreeIcon /> }: { title: string; description?: ReactNode; children?: ReactNode; icon?: ReactElement }) {
  return <section className="ds-section"><header><Heading icon={icon}>{title}</Heading>{description && <p>{description}</p>}</header>{children}</section>;
}

export function Playground({ title = "Experimente", description, preview, controls }: { title?: string; description?: string; preview: ReactNode; controls?: ReactNode }) {
  return <div className="ds-playground">
    <div className="ds-playground-header"><div><span>{title}</span>{description && <p>{description}</p>}</div><span className="ds-live-label"><i />Interativo</span></div>
    <div className="ds-playground-canvas">{preview}</div>
    {controls && <div className="ds-playground-controls">{controls}</div>}
  </div>;
}

export function CodeBadge({ children }: { children: ReactNode }) { return <code className="ds-code-badge">{children}</code>; }

export function Usage({ children }: { children: string }) {
  return <details className="ds-usage"><summary>Como usar no código</summary><pre><code>{children}</code></pre></details>;
}
