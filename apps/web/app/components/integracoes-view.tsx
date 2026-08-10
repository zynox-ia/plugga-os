import type { EmailStatus, IntegrationStatus, IntegrationSummary } from "@plugga/shared";

import { ShellCard, StatusPill, ShellTable } from "./plugga-shell";

const STATUS_VARIANT: Record<IntegrationStatus, "neutral" | "success" | "warning" | "danger"> = {
  healthy: "success",
  degraded: "warning",
  down: "danger",
  unknown: "neutral",
};

const EMAIL_PROVIDER_LABEL: Record<EmailStatus["provider"], string> = {
  noop: "Desligado (noop)",
  brevo: "Brevo (envio real)",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Manaus" });
}

/** ADR-0009: the migrator is read-only by construction regardless of mode; only
 * `read_only` mode actually reads from Bitrix — `mock` means the cutover hasn't
 * happened yet, not that the capability is unbuilt. */
function bitrixModeNote(mode: IntegrationSummary["mode"]): string {
  switch (mode) {
    case "read_only":
      return "Cutover feito: lê dados reais do Bitrix (OPM/C7), somente leitura — nunca escreve.";
    case "mock":
      return "Construído e pronto para leitura real, mas ainda não promovido (modo mock) — nenhuma leitura acontece até o cutover.";
    default:
      return `Modo atual: ${mode}.`;
  }
}

export function IntegracoesView({
  items,
  isLive,
  emailStatus,
  isEmailStatusLive,
}: {
  items: IntegrationSummary[];
  isLive: boolean;
  emailStatus: EmailStatus;
  isEmailStatusLive: boolean;
}) {
  const whatsapp = items.find((item) => item.key === "whatsapp");
  const bitrix = items.find((item) => item.key === "bitrix");
  const others = items.filter((item) => item.key !== "whatsapp" && item.key !== "bitrix");

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

      {bitrix ? (
        <ShellCard tone="accent" className="panel-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Migrador (temporário)</span>
              <h2>Bitrix</h2>
            </div>
            <StatusPill variant={STATUS_VARIANT[bitrix.status]}>{bitrix.status}</StatusPill>
          </div>
          <ShellTable caption="Detalhes do migrador Bitrix">
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
                <td>{bitrix.mode}</td>
                <td>{formatDate(bitrix.lastSyncAt)}</td>
                <td>{bitrix.lastError ?? "—"}</td>
                <td>{bitrix.owner}</td>
              </tr>
            </tbody>
          </ShellTable>
          <p className="card-note">
            ADR-0009: migrador temporário, somente leitura por construção — nunca escreve no Bitrix.{" "}
            {bitrixModeNote(bitrix.mode)}
          </p>
        </ShellCard>
      ) : null}

      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">E-mail transacional</span>
            <h2>Brevo</h2>
          </div>
          {isEmailStatusLive ? (
            <StatusPill variant="success">Dados reais</StatusPill>
          ) : (
            <StatusPill variant="warning">Mock local</StatusPill>
          )}
        </div>
        <ShellTable caption="Provedor de e-mail transacional configurado">
          <thead>
            <tr>
              <th>Provedor</th>
              <th>Envia de fato</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{EMAIL_PROVIDER_LABEL[emailStatus.provider]}</td>
              <td>{emailStatus.configured ? "Sim" : "Não"}</td>
            </tr>
          </tbody>
        </ShellTable>
        <p className="card-note">
          ADR-0010: convite e redefinição de senha via EmailPort. Não é gerido pelo ciclo mock/read_only/bridge/write
          (ADR-0005) — reflete só o provedor selecionado por EMAIL_PROVIDER, sem endereço ou chave.
        </p>
      </ShellCard>

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
