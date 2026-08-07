"use client";

import type { OpportunityDetail } from "@plugga/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createContract,
  loseOpportunity,
  registerOpportunityContact,
  revisitOpportunity,
  updateOpportunityStage,
  winOpportunity,
} from "../lib/commercial-client";
import { ShellCard, StatusPill } from "./plugga-shell";

const STAGE_LABEL: Record<string, string> = {
  leads: "Leads",
  qualificacao: "Qualificação",
  proposta: "Proposta",
  decisao: "Decisão",
};

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  aberta: "neutral",
  ganha: "success",
  perdida: "danger",
  revisitar: "warning",
};

type ActionPanel = "stage" | "contact" | "win" | "lose" | "revisit" | null;

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

export function OportunidadeDetailView({ opportunity }: { opportunity: OpportunityDetail }) {
  const router = useRouter();
  const [panel, setPanel] = useState<ActionPanel>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"resumo" | "contatos" | "timeline">("resumo");

  const isOpen = opportunity.status === "aberta";

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
      updateOpportunityStage(opportunity.id, {
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

  async function handleContact(formData: FormData) {
    const result = await withAction(() =>
      registerOpportunityContact(opportunity.id, {
        channel: String(formData.get("channel")),
        outcome: String(formData.get("outcome")),
        note: String(formData.get("note") ?? "").trim() || undefined,
      }),
    );
    if (result) {
      closePanel();
      router.refresh();
    }
  }

  async function handleWin(formData: FormData) {
    const clientId = String(formData.get("clientId") ?? "").trim();
    const newClientName = String(formData.get("newClientName") ?? "").trim();
    const body = clientId
      ? { clientId }
      : { newClient: { name: newClientName, email: String(formData.get("newClientEmail") ?? "").trim() || undefined } };
    const result = await withAction(() => winOpportunity(opportunity.id, body));
    if (result) {
      closePanel();
      router.refresh();
    }
  }

  async function handleLose(formData: FormData) {
    const result = await withAction(() =>
      loseOpportunity(opportunity.id, { lossReason: String(formData.get("lossReason") ?? "").trim() }),
    );
    if (result) {
      closePanel();
      router.refresh();
    }
  }

  async function handleRevisit(formData: FormData) {
    const nextActionAtLocal = String(formData.get("nextActionAt") ?? "");
    const result = await withAction(() =>
      revisitOpportunity(opportunity.id, {
        nextActionAt: nextActionAtLocal ? new Date(nextActionAtLocal).toISOString() : undefined,
        nextActionNote: String(formData.get("nextActionNote") ?? "").trim(),
      }),
    );
    if (result) {
      closePanel();
      router.refresh();
    }
  }

  async function handleCreateContract() {
    const result = await withAction(() => createContract({ opportunityId: opportunity.id }));
    if (result) {
      const contract = result as unknown as { id: string };
      router.push(`/comercial/contratos/${contract.id}`);
    }
  }

  return (
    <div className="detail" style={{ display: "grid", gridTemplateColumns: "1.25fr .8fr", gap: 16 }}>
      <section>
        <ShellCard className="table-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Comercial · Oportunidade</span>
              <h2>{opportunity.title}</h2>
            </div>
            <StatusPill variant={STATUS_VARIANT[opportunity.status] ?? "neutral"}>{opportunity.status}</StatusPill>
          </div>

          <div role="tablist" aria-label="Seções da oportunidade" className="view-tabs">
            {(["resumo", "contatos", "timeline"] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`view-tab${tab === id ? " view-tab--active" : ""}`}
                onClick={() => setTab(id)}
              >
                {id === "resumo" ? "Resumo" : id === "contatos" ? "Contatos" : "Timeline"}
              </button>
            ))}
          </div>

          {tab === "resumo" ? (
            <div style={{ padding: "0 18px 18px", display: "grid", gap: 10 }}>
              <p>
                Produto: <strong>{opportunity.product}</strong> · Etapa: <strong>{STAGE_LABEL[opportunity.stage] ?? opportunity.stage}</strong>
              </p>
              <p>
                Responsável: <strong>{opportunity.ownerName ?? "sem responsável"}</strong> · Valor estimado:{" "}
                <strong>{opportunity.estimatedValue ? `R$ ${opportunity.estimatedValue}` : "—"}</strong>
              </p>
              <p>
                Cliente:{" "}
                {opportunity.clientId ? (
                  <strong>{opportunity.clientName ?? opportunity.clientId}</strong>
                ) : (
                  <span className="card-note" style={{ padding: 0 }}>
                    nenhum vinculado ainda
                  </span>
                )}
              </p>
              <div className="box" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
                <strong>Próxima ação</strong>
                <p style={{ margin: "6px 0 0" }}>
                  {opportunity.nextActionNote ?? "sem nota registrada"} — {formatDateTime(opportunity.nextActionAt)}
                </p>
              </div>
              {opportunity.status === "perdida" ? (
                <p className="auth-error" role="alert">
                  Motivo da perda: {opportunity.lossReason}
                </p>
              ) : null}
              {opportunity.contracts.length > 0 ? (
                <div>
                  <strong>Contratos</strong>
                  <ul>
                    {opportunity.contracts.map((contract) => (
                      <li key={contract.id}>
                        <Link href={`/comercial/contratos/${contract.id}`}>
                          {contract.id.slice(0, 8)} · {contract.status}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="card-note" style={{ padding: 0 }}>
                Documentos ficam na Biblioteca (fora de escopo deste bloco) — apenas referência textual aqui.
              </p>
            </div>
          ) : null}

          {tab === "contatos" ? (
            <div style={{ padding: "0 18px 18px" }}>
              {opportunity.contacts.length === 0 ? (
                <p className="card-note" style={{ padding: 0 }}>
                  Nenhum contato registrado ainda.
                </p>
              ) : (
                <ul style={{ display: "grid", gap: 8, padding: 0, listStyle: "none" }}>
                  {opportunity.contacts.map((contact) => (
                    <li key={contact.id} className="lead-card">
                      <strong>
                        {contact.channel} · {contact.outcome}
                      </strong>
                      {contact.note ? <span>{contact.note}</span> : null}
                      <span>{formatDateTime(contact.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === "timeline" ? (
            <div style={{ padding: "0 18px 18px" }}>
              <ul style={{ display: "grid", gap: 6, padding: 0, listStyle: "none" }}>
                <li>Criada em {formatDateTime(opportunity.createdAt)}</li>
                {opportunity.contacts.map((contact) => (
                  <li key={contact.id}>
                    Contato ({contact.channel}) em {formatDateTime(contact.createdAt)}
                  </li>
                ))}
                {opportunity.decidedAt ? <li>Decisão em {formatDateTime(opportunity.decidedAt)}</li> : null}
              </ul>
            </div>
          ) : null}
        </ShellCard>
      </section>

      <aside>
        <ShellCard className="panel-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Ações</span>
              <h2>Trabalhar oportunidade</h2>
            </div>
          </div>
          <div style={{ padding: "0 18px 18px", display: "grid", gap: 8 }}>
            {isOpen ? (
              <>
                <button className="button" type="button" onClick={() => setPanel(panel === "contact" ? null : "contact")}>
                  Registrar contato
                </button>
                <button className="button" type="button" onClick={() => setPanel(panel === "stage" ? null : "stage")}>
                  Atualizar etapa
                </button>
                <button className="button button--accent" type="button" onClick={() => setPanel(panel === "win" ? null : "win")}>
                  Marcar ganha
                </button>
                <button className="button" type="button" onClick={() => setPanel(panel === "lose" ? null : "lose")}>
                  Marcar perdida
                </button>
                <button className="button" type="button" onClick={() => setPanel(panel === "revisit" ? null : "revisit")}>
                  Marcar para revisitar
                </button>
              </>
            ) : opportunity.status === "ganha" ? (
              <button className="button button--accent" type="button" disabled={pending} onClick={handleCreateContract}>
                {pending ? "Criando…" : "Criar contrato"}
              </button>
            ) : (
              <p className="card-note" style={{ padding: 0 }}>
                Oportunidade decidida — sem novas ações.
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
                <select name="stage" defaultValue={opportunity.stage}>
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

        {panel === "contact" ? (
          <ShellCard className="panel-card">
            <form action={handleContact} style={{ padding: 16, display: "grid", gap: 8 }}>
              <label>
                Canal
                <select name="channel" defaultValue="phone">
                  <option value="phone">Telefone</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-mail</option>
                  <option value="presencial">Presencial</option>
                  <option value="outro">Outro</option>
                </select>
              </label>
              <label>
                Resultado
                <select name="outcome" defaultValue="attempted">
                  <option value="attempted">Tentativa</option>
                  <option value="connected">Conectou</option>
                  <option value="proposal_sent">Proposta enviada</option>
                  <option value="no_answer">Sem resposta</option>
                  <option value="declined">Recusou</option>
                  <option value="scheduled">Agendado</option>
                </select>
              </label>
              <label>
                Nota
                <input name="note" maxLength={1000} />
              </label>
              <div className="row-actions">
                <button className="button button--accent" type="submit" disabled={pending}>
                  Registrar
                </button>
                <button className="button" type="button" onClick={closePanel}>
                  Cancelar
                </button>
              </div>
            </form>
          </ShellCard>
        ) : null}

        {panel === "win" ? (
          <ShellCard className="panel-card">
            <form action={handleWin} style={{ padding: 16, display: "grid", gap: 8 }}>
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
              <div className="row-actions">
                <button className="button button--accent" type="submit" disabled={pending}>
                  Marcar ganha
                </button>
                <button className="button" type="button" onClick={closePanel}>
                  Cancelar
                </button>
              </div>
            </form>
          </ShellCard>
        ) : null}

        {panel === "lose" ? (
          <ShellCard className="panel-card">
            <form action={handleLose} style={{ padding: 16, display: "grid", gap: 8 }}>
              <label>
                Motivo da perda
                <input name="lossReason" required maxLength={500} />
              </label>
              <div className="row-actions">
                <button className="button button--accent" type="submit" disabled={pending}>
                  Marcar perdida
                </button>
                <button className="button" type="button" onClick={closePanel}>
                  Cancelar
                </button>
              </div>
            </form>
          </ShellCard>
        ) : null}

        {panel === "revisit" ? (
          <ShellCard className="panel-card">
            <form action={handleRevisit} style={{ padding: 16, display: "grid", gap: 8 }}>
              <label>
                Próxima ação (data)
                <input name="nextActionAt" type="datetime-local" required />
              </label>
              <label>
                Nota
                <input name="nextActionNote" required maxLength={500} />
              </label>
              <div className="row-actions">
                <button className="button button--accent" type="submit" disabled={pending}>
                  Agendar revisita
                </button>
                <button className="button" type="button" onClick={closePanel}>
                  Cancelar
                </button>
              </div>
            </form>
          </ShellCard>
        ) : null}
      </aside>
    </div>
  );
}
