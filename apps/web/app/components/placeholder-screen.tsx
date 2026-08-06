import { ShellCard, StatusPill } from "./plugga-shell";

type PlaceholderStatus = "em-construcao" | "em-breve" | "bloqueado";

const STATUS_COPY: Record<PlaceholderStatus, { label: string; variant: "neutral" | "warning" }> = {
  "em-construcao": { label: "Em construção", variant: "neutral" },
  "em-breve": { label: "V2 · Em breve", variant: "neutral" },
  bloqueado: { label: "Aguardando fundação (P2-6)", variant: "warning" },
};

export function PlaceholderScreen({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status: PlaceholderStatus;
}) {
  const badge = STATUS_COPY[status];

  return (
    <ShellCard className="panel-card">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Área</span>
          <h2>{title}</h2>
        </div>
        <StatusPill variant={badge.variant}>{badge.label}</StatusPill>
      </div>
      <p className="card-note">{description}</p>
    </ShellCard>
  );
}
