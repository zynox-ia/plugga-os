"use client";

import type { MarketMigrationSummary } from "@plugga/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { activateMarketMigration, advanceMarketMigrationStage, cancelMarketMigration } from "../lib/energy-client";
import { ShellCard, StatusPill } from "./plugga-shell";

const STAGE_LABEL: Record<string, string> = {
  analise: "Análise",
  contratacao: "Contratação",
  documentacao: "Documentação",
  denuncia: "Denúncia",
  ativacao: "Ativação",
};

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  em_andamento: "neutral",
  ativa: "success",
  cancelada: "danger",
};

type ActionPanel = "stage" | "activate" | "cancel" | null;

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

export function MigracaoDetailView({ migration, isLive }: { migration: MarketMigrationSummary; isLive: boolean }) {
  const router = useRouter();
  const [panel, setPanel] = useState<ActionPanel>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = migration.status === "em_andamento";

  function closePanel() {
    setPanel(null);
    setError(null);
  }

  async function withAction<T>(action: () => Promise<{ ok: boolean; message?: string } | { ok: true; data: T }>) {
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      setError((result as { message: string }).message);
      return null;
    }
    return (result as { data: T }).data;
  }

  async function handleStage(formData: FormData) {
    const stage = String(formData.get("stage"));
    const ownerId = String(formData.get("ownerId") ?? "").trim() || undefined;
    const nextActionAtLocal = String(formData.get("nextActionAt") ?? "");
    const result = await withAction(() =>
      advanceMarketMigrationStage(migration.id, {
        stage,
        ownerId,
        nextActionAt: nextActionAtLocal ? new Date(nextActionAtLocal).toISOString() : undefined,
        nextActionNote: String(formData.get("nextActionNote") ?? "").trim() || undefined,
      }),
    );
    if (result) {
      closePanel();
      router.refresh();
    }
  }

  async function handleActivate(formData: FormData) {
    const clientId = String(formData.get("clientId") ?? "").trim();
    const newClientName = String(formData.get("newClientName") ?? "").trim();
    const body = clientId
      ? { clientId }
      : {
          newClient: {
            name: newClientName,
            email: String(formData.get("newClientEmail") ?? "").trim() || undefined,
            phone: String(formData.get("newClientPhone") ?? "").trim() || undefined,
          },
        };
    const result = await withAction(() => activateMarketMigration(migration.id, body));
    if (result) {
      closePanel();
      router.refresh();
    }
  }

  async function handleCancel(formData: FormData) {
    const result = await withAction(() =>
      cancelMarketMigration(migration.id, { cancelReason: String(formData.get("cancelReason") ?? "").trim() }),
    );
    if (result) {
      closePanel();
      router.refresh();
    }
  }

  return (
    <div className="detail" style={{ display: "grid", gridTemplateColumns: "1.25fr .8fr", gap: 16 }}>
      <section>
        <ShellCard className="table-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Energia & OPM · Migração</span>
              <h2>{migration.consumerUnitCode}</h2>
            </div>
            <div className="row-actions">
              {!isLive ? <StatusPill variant="warning">Dados de exemplo (API indisponível)</StatusPill> : null}
              <StatusPill variant={STATUS_VARIANT[migration.status] ?? "neutral"}>{migration.status}</StatusPill>
            </div>
          </div>

          <div style={{ padding: "0 18px 18px", display: "grid", gap: 10 }}>
            <p>
              Etapa: <strong>{STAGE_LABEL[migration.stage] ?? migration.stage}</strong>
            </p>
            <p>
              Responsável: <strong>{migration.ownerName ?? "sem responsável"}</strong>
            </p>
            <p>
              Cliente:{" "}
              {migration.clientId ? (
                <strong>{migration.clientName ?? migration.clientId}</strong>
              ) : (
                <span className="card-note" style={{ padding: 0 }}>
                  nenhum vinculado ainda
                </span>
              )}
            </p>
            <div className="box" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
              <strong>Próxima ação</strong>
              <p style={{ margin: "6px 0 0" }}>
                {migration.nextActionNote ?? "sem nota registrada"} — {formatDateTime(migration.nextActionAt)}
              </p>
            </div>
            {migration.status === "cancelada" ? (
              <p className="auth-error" role="alert">
                Motivo do cancelamento: {migration.cancelReason}
              </p>
            ) : null}
            {migration.status === "ativa" ? <p>Ativada em {formatDateTime(migration.activatedAt)}</p> : null}
          </div>
        </ShellCard>
      </section>

      <aside>
        <ShellCard className="panel-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Ações</span>
              <h2>Conduzir migração</h2>
            </div>
          </div>
          <div style={{ padding: "0 18px 18px", display: "grid", gap: 8 }}>
            {isOpen ? (
              <>
                {/* Sem API não há o que escrever: agir sobre dado de exemplo
                    fingiria uma migração que não existe. */}
                <button
                  className="button"
                  type="button"
                  disabled={!isLive}
                  onClick={() => setPanel(panel === "stage" ? null : "stage")}
                >
                  Avançar etapa
                </button>
                <button
                  className="button button--accent"
                  type="button"
                  disabled={!isLive}
                  onClick={() => setPanel(panel === "activate" ? null : "activate")}
                >
                  Ativar
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={!isLive}
                  onClick={() => setPanel(panel === "cancel" ? null : "cancel")}
                >
                  Cancelar migração
                </button>
              </>
            ) : (
              <p className="card-note" style={{ padding: 0 }}>
                Migração encerrada — sem novas ações.
              </p>
            )}
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </ShellCard>

        {panel === "stage" ? (
          <ShellCard className="panel-card">
            <form action={handleStage} style={{ padding: 16, display: "grid", gap: 8 }}>
              <label>
                Nova etapa
                <select name="stage" defaultValue={migration.stage}>
                  {Object.entries(STAGE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reatribuir responsável (opcional)
                <input name="ownerId" placeholder="uuid do responsável" />
              </label>
              <label>
                Nova próxima ação (opcional)
                <input name="nextActionAt" type="datetime-local" />
              </label>
              <label>
                Nota (opcional)
                <input name="nextActionNote" maxLength={500} />
              </label>
              <div className="row-actions">
                <button className="button button--accent" type="submit" disabled={pending}>
                  Salvar
                </button>
                <button className="button" type="button" onClick={closePanel}>
                  Cancelar
                </button>
              </div>
            </form>
          </ShellCard>
        ) : null}

        {panel === "activate" ? (
          <ShellCard className="panel-card">
            <form action={handleActivate} style={{ padding: 16, display: "grid", gap: 8 }}>
              <p className="card-note" style={{ padding: 0 }}>
                Vincule um cliente existente ou preencha um novo — não os dois.
              </p>
              <label>
                Cliente existente (ID)
                <input name="clientId" placeholder="uuid do cliente" />
              </label>
              <label>
                Ou nome do novo cliente
                <input name="newClientName" />
              </label>
              <label>
                E-mail do novo cliente (opcional)
                <input name="newClientEmail" type="email" />
              </label>
              <label>
                Telefone do novo cliente (opcional)
                <input name="newClientPhone" />
              </label>
              <div className="row-actions">
                <button className="button button--accent" type="submit" disabled={pending}>
                  Ativar
                </button>
                <button className="button" type="button" onClick={closePanel}>
                  Cancelar
                </button>
              </div>
            </form>
          </ShellCard>
        ) : null}

        {panel === "cancel" ? (
          <ShellCard className="panel-card">
            <form action={handleCancel} style={{ padding: 16, display: "grid", gap: 8 }}>
              <label>
                Motivo do cancelamento
                <input name="cancelReason" required maxLength={500} />
              </label>
              <div className="row-actions">
                <button className="button button--accent" type="submit" disabled={pending}>
                  Cancelar migração
                </button>
                <button className="button" type="button" onClick={closePanel}>
                  Voltar
                </button>
              </div>
            </form>
          </ShellCard>
        ) : null}
      </aside>
    </div>
  );
}
