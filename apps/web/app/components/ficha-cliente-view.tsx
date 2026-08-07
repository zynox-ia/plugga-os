"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { ClientFicha, ClientSegment } from "@plugga/shared";

import { ShellCard, StatusPill, ShellTable } from "./plugga-shell";

const SEGMENT_LABEL: Record<ClientSegment, string> = {
  prospect: "Prospect",
  opm: "OPM",
  pluggamob: "PluggaMob",
  associacoes_gd: "Associações/GD",
  inativo: "Inativo",
};

const TAB_IDS = ["resumo", "contatos", "oportunidades", "energia-opm", "pluggamob", "financeiro", "contratos", "documentos", "timeline", "acoes-agente"] as const;
type TabId = typeof TAB_IDS[number];

const TAB_LABEL: Record<TabId, string> = {
  resumo: "Resumo",
  contatos: "Contatos",
  oportunidades: "Oportunidades",
  "energia-opm": "Energia & OPM",
  pluggamob: "PluggaMob",
  financeiro: "Financeiro",
  contratos: "Contratos",
  documentos: "Documentos",
  timeline: "Timeline",
  "acoes-agente": "Ações do Agente",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Manaus" });
}

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; data: unknown }> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { ok: response.ok, data: await response.json().catch(() => null) };
}

async function patchJson(path: string, body: unknown): Promise<{ ok: boolean; data: unknown }> {
  const response = await fetch(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { ok: response.ok, data: await response.json().catch(() => null) };
}

export function FichaClienteView({ ficha }: { ficha: ClientFicha }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("resumo");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { resumo } = ficha;

  async function toggleActive() {
    setBusy(true);
    setError(null);
    const path = resumo.active ? `/api/clientes/${resumo.id}/inactivate` : `/api/clientes/${resumo.id}/activate`;
    const { ok, data } = await postJson(path, {});
    setBusy(false);
    if (!ok) {
      setError((data as { message?: string })?.message ?? "não foi possível atualizar o status");
      return;
    }
    router.refresh();
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const input = {
      name: String(form.get("name") ?? "").trim(),
      company: emptyToNull(form.get("company")),
      phone: emptyToNull(form.get("phone")),
      email: emptyToNull(form.get("email")),
      externalId: emptyToNull(form.get("externalId")),
      segment: form.get("segment") as ClientSegment,
    };

    const { ok, data } = await patchJson(`/api/clientes/${resumo.id}`, input);
    setBusy(false);
    if (!ok) {
      setError((data as { message?: string })?.message ?? "não foi possível salvar as alterações");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="stack">
      <ShellCard className="table-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Ficha do cliente</span>
            <h2>{resumo.name}</h2>
          </div>
          <div className="row-actions">
            <StatusPill variant="neutral">{SEGMENT_LABEL[resumo.segment]}</StatusPill>
            <StatusPill variant={resumo.active ? "success" : "danger"}>{resumo.active ? "Ativo" : "Inativo"}</StatusPill>
          </div>
        </div>

        <div role="tablist" aria-label="Seções da ficha do cliente" className="view-tabs">
          {TAB_IDS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={tab === activeTab}
              className={`view-tab${tab === activeTab ? " view-tab--active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABEL[tab]}
            </button>
          ))}
        </div>

        {error ? <p className="auth-error" style={{ margin: "0 18px 14px" }}>{error}</p> : null}

        <div style={{ padding: "0 18px 18px" }}>
          {activeTab === "resumo" ? (
            <div className="stack">
              <div className="row-actions">
                <button className="button" type="button" onClick={() => setEditing((open) => !open)}>{editing ? "Cancelar edição" : "Editar"}</button>
                <button className="button" type="button" disabled={busy} onClick={toggleActive}>{resumo.active ? "Inativar" : "Ativar"}</button>
              </div>

              {editing ? (
                <form className="filter-form" onSubmit={submitEdit}>
                  <div className="field">
                    <label htmlFor="edit-name">Nome *</label>
                    <input id="edit-name" name="name" type="text" defaultValue={resumo.name} required maxLength={150} />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-company">Empresa</label>
                    <input id="edit-company" name="company" type="text" defaultValue={resumo.company ?? ""} maxLength={150} />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-phone">Telefone</label>
                    <input id="edit-phone" name="phone" type="text" defaultValue={resumo.phone ?? ""} maxLength={40} />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-email">E-mail</label>
                    <input id="edit-email" name="email" type="email" defaultValue={resumo.email ?? ""} maxLength={254} />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-external-id">Identificador (externalId)</label>
                    <input id="edit-external-id" name="externalId" type="text" defaultValue={resumo.externalId ?? ""} maxLength={100} />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-segment">Segmento</label>
                    <select id="edit-segment" name="segment" defaultValue={resumo.segment}>
                      {Object.entries(SEGMENT_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-actions">
                    <button className="button button--accent" type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar alterações"}</button>
                  </div>
                </form>
              ) : (
                <ShellTable caption="Resumo do cliente">
                  <thead><tr><th>Empresa</th><th>Telefone</th><th>E-mail</th><th>Identificador</th></tr></thead>
                  <tbody><tr><td>{resumo.company ?? "—"}</td><td>{resumo.phone ?? "—"}</td><td>{resumo.email ?? "—"}</td><td>{resumo.externalId ?? "—"}</td></tr></tbody>
                </ShellTable>
              )}
            </div>
          ) : null}

          {activeTab === "contatos" ? (
            ficha.contatos.length === 0 ? (
              <p className="card-note" style={{ padding: 0 }}>Nenhum contato registrado — contatos são derivados das oportunidades deste cliente.</p>
            ) : (
              <ShellTable caption="Contatos do cliente">
                <thead><tr><th>Canal</th><th>Resultado</th><th>Nota</th><th>Oportunidade</th><th>Quando</th></tr></thead>
                <tbody>
                  {ficha.contatos.map((contact) => (
                    <tr key={contact.id}><td>{contact.channel}</td><td>{contact.outcome}</td><td>{contact.note ?? "—"}</td><td>{contact.opportunityTitle}</td><td>{formatDateTime(contact.createdAt)}</td></tr>
                  ))}
                </tbody>
              </ShellTable>
            )
          ) : null}

          {activeTab === "oportunidades" ? (
            ficha.oportunidades.length === 0 ? (
              <p className="card-note" style={{ padding: 0 }}>Nenhuma oportunidade vinculada a este cliente ainda.</p>
            ) : (
              <ShellTable caption="Oportunidades vinculadas">
                <thead><tr><th>Título</th><th>Produto</th><th>Etapa</th><th>Status</th><th>Valor estimado</th><th>Próxima ação</th></tr></thead>
                <tbody>
                  {ficha.oportunidades.map((opportunity) => (
                    <tr key={opportunity.id}><td>{opportunity.title}</td><td>{opportunity.product}</td><td>{opportunity.stage}</td><td>{opportunity.status}</td><td>{opportunity.estimatedValue ?? "—"}</td><td>{formatDateTime(opportunity.nextActionAt)}</td></tr>
                  ))}
                </tbody>
              </ShellTable>
            )
          ) : null}

          {activeTab === "contratos" ? (
            ficha.contratos.length === 0 ? (
              <p className="card-note" style={{ padding: 0 }}>Nenhum contrato vinculado a este cliente ainda.</p>
            ) : (
              <ShellTable caption="Contratos vinculados">
                <thead><tr><th>Status</th><th>Início</th><th>Fim</th><th>Assinado em</th></tr></thead>
                <tbody>
                  {ficha.contratos.map((contract) => (
                    <tr key={contract.id}><td>{contract.status}</td><td>{formatDateTime(contract.startsAt)}</td><td>{formatDateTime(contract.endsAt)}</td><td>{formatDateTime(contract.signedAt)}</td></tr>
                  ))}
                </tbody>
              </ShellTable>
            )
          ) : null}

          {activeTab === "energia-opm" ? (
            <p className="card-note" style={{ padding: 0 }}>{ficha.energiaOpm.reason}</p>
          ) : null}

          {activeTab === "pluggamob" ? (
            ficha.pluggamob.available ? (
              <ShellTable caption="Vínculo PluggaMob (EV Point)">
                <thead><tr><th>Identificador</th><th>Segmento</th><th>Saldo carteira</th><th>Última sessão</th><th>Telefone</th></tr></thead>
                <tbody>
                  <tr>
                    <td>{ficha.pluggamob.externalId}</td>
                    <td>{ficha.pluggamob.segment}</td>
                    <td>{ficha.pluggamob.walletBalance ?? "—"}</td>
                    <td>{formatDateTime(ficha.pluggamob.lastSessionAt)}</td>
                    <td>{ficha.pluggamob.phoneMasked ?? "—"}</td>
                  </tr>
                </tbody>
              </ShellTable>
            ) : (
              <p className="card-note" style={{ padding: 0 }}>{ficha.pluggamob.reason}</p>
            )
          ) : null}

          {activeTab === "financeiro" ? (
            <p className="card-note" style={{ padding: 0 }}>{ficha.financeiro.message}</p>
          ) : null}

          {activeTab === "documentos" ? (
            <p className="card-note" style={{ padding: 0 }}>{ficha.documentos.message}</p>
          ) : null}

          {activeTab === "timeline" ? (
            ficha.timeline.length === 0 ? (
              <p className="card-note" style={{ padding: 0 }}>Nenhum evento registrado para este cliente ainda.</p>
            ) : (
              <ShellTable caption="Timeline de eventos">
                <thead><tr><th>Evento</th><th>Origem</th><th>Ator</th><th>Quando</th></tr></thead>
                <tbody>
                  {ficha.timeline.map((entry) => (
                    <tr key={entry.id}><td>{entry.eventName}</td><td>{entry.entityType}</td><td>{entry.actorType}</td><td>{formatDateTime(entry.occurredAt)}</td></tr>
                  ))}
                </tbody>
              </ShellTable>
            )
          ) : null}

          {activeTab === "acoes-agente" ? (
            ficha.acoesDoAgente.length === 0 ? (
              <p className="card-note" style={{ padding: 0 }}>Nenhuma ação de agente registrada para este cliente ainda.</p>
            ) : (
              <ShellTable caption="Ações do agente">
                <thead><tr><th>Agente</th><th>Ação</th><th>Decisão</th><th>Status</th><th>Quando</th></tr></thead>
                <tbody>
                  {ficha.acoesDoAgente.map((action) => (
                    <tr key={action.id}><td>{action.agent}</td><td>{action.action}</td><td>{action.decision}</td><td>{action.status}</td><td>{formatDateTime(action.createdAt)}</td></tr>
                  ))}
                </tbody>
              </ShellTable>
            )
          ) : null}
        </div>
      </ShellCard>
    </div>
  );
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}
