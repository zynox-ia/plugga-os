import type { IntegrationStatus, IntegrationSummary } from "@plugga/shared";

import { ShellCard, StatusPill, ShellTable } from "./plugga-shell";

const STATUS_VARIANT: Record<IntegrationStatus, "neutral" | "success" | "warning" | "danger"> = {
  healthy: "success",
  degraded: "warning",
  down: "danger",
  unknown: "neutral",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Manaus" });
}

export function IntegracoesView({ items, isLive }: { items: IntegrationSummary[]; isLive: boolean }) {
  const whatsapp = items.find((item) => item.key === "whatsapp");
  const others = items.filter((item) => item.key !== "whatsapp");

  return (
    <div className="stack">
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Plataforma</span>
            <h2>GET /integrations</h2>
          </div>
          {isLive ? (
            <StatusPill variant="success">Dados reais</StatusPill>
          ) : (
            <StatusPill variant="warning">Mock local</StatusPill>
          )}
        </div>
        <p className="card-note">
          {isLive
            ? "Metadados de integração vindos da API (sem credenciais)."
            : "API indisponível agora — exibindo o seed local de referência do Bloco A."}
        </p>
      </ShellCard>

      {whatsapp ? (
        <ShellCard tone="accent" className="panel-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Canal P0</span>
              <h2>WhatsApp</h2>
            </div>
            <StatusPill variant={STATUS_VARIANT[whatsapp.status]}>{whatsapp.status}</StatusPill>
          </div>
          <ShellTable caption="Detalhes da integração WhatsApp">
            <thead>
              <tr>
                <th>Modo</th>
                <th>Última sincronização</th>
                <th>Erro</th>
                <th>Dono</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{whatsapp.mode}</td>
                <td>{formatDate(whatsapp.lastSyncAt)}</td>
                <td>{whatsapp.lastError ?? "—"}</td>
                <td>{whatsapp.owner}</td>
              </tr>
            </tbody>
          </ShellTable>
          <p className="card-note">
            ADR-0006: envio sempre mock (POST /channels/whatsapp/send nunca despacha uma mensagem real). Destino é
            sempre mascarado; opt-out e conteúdo crítico/campanha exigem aprovação.
          </p>
        </ShellCard>
      ) : null}

      <ShellCard className="table-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Inventário</span>
            <h2>Demais integrações</h2>
          </div>
          <StatusPill variant="neutral">{others.length} itens</StatusPill>
        </div>
        <ShellTable caption="Integrações cadastradas">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Modo</th>
              <th>Status</th>
              <th>Última sincronização</th>
              <th>Dono</th>
            </tr>
          </thead>
          <tbody>
            {others.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.mode}</td>
                <td>
                  <StatusPill variant={STATUS_VARIANT[item.status]}>{item.status}</StatusPill>
                </td>
                <td>{formatDate(item.lastSyncAt)}</td>
                <td>{item.owner}</td>
              </tr>
            ))}
          </tbody>
        </ShellTable>
        <p className="card-note">
          Bloco A opera só em modo mock/leitura (ADR-0005). Nenhum adaptador real de escrita existe neste bloco.
        </p>
      </ShellCard>
    </div>
  );
}
