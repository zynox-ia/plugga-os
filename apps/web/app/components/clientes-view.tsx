"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { ClientDuplicateCandidate, ClientSegment, ClientSummary, CreateClientRequest } from "@plugga/shared";

import { ShellCard, StatusPill, ShellTable } from "./plugga-shell";

const SEGMENT_LABEL: Record<ClientSegment, string> = {
  prospect: "Prospect",
  opm: "OPM",
  pluggamob: "PluggaMob",
  associacoes_gd: "Associações/GD",
  inativo: "Inativo",
};

const MATCH_LABEL: Record<ClientDuplicateCandidate["matchedOn"][number], string> = {
  phone: "telefone",
  email: "e-mail",
  name: "nome",
};

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; data: unknown }> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, data };
}

export function ClientesView({
  items,
  isLive,
  filters,
}: {
  items: ClientSummary[];
  isLive: boolean;
  filters: { q?: string; segment?: string; active?: string };
}) {
  const router = useRouter();

  const [q, setQ] = useState(filters.q ?? "");
  const [segment, setSegment] = useState(filters.segment ?? "");
  const [active, setActive] = useState(filters.active ?? "");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [duplicateCandidates, setDuplicateCandidates] = useState<ClientDuplicateCandidate[] | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (segment) params.set("segment", segment);
    if (active) params.set("active", active);
    router.push(`/clientes${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function clearFilters() {
    setQ("");
    setSegment("");
    setActive("");
    router.push("/clientes");
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    setDuplicateCandidates(null);

    const form = new FormData(event.currentTarget);
    const input: CreateClientRequest = {
      name: String(form.get("name") ?? "").trim(),
      company: emptyToUndefined(form.get("company")),
      phone: emptyToUndefined(form.get("phone")),
      email: emptyToUndefined(form.get("email")),
      externalId: emptyToUndefined(form.get("externalId")),
      segment: (emptyToUndefined(form.get("segment")) as ClientSegment | undefined) ?? undefined,
    };

    const { ok, data } = await postJson("/api/clientes", input);
    setCreating(false);

    if (!ok) {
      setCreateError((data as { message?: string })?.message ?? "não foi possível criar o cliente");
      return;
    }

    const response = data as { duplicateCandidates: ClientDuplicateCandidate[] };
    setDuplicateCandidates(response.duplicateCandidates);
    setShowCreateForm(false);
    event.currentTarget.reset();
    router.refresh();
  }

  async function toggleActive(client: ClientSummary) {
    setPendingActionId(client.id);
    const path = client.active ? `/api/clientes/${client.id}/inactivate` : `/api/clientes/${client.id}/activate`;
    await postJson(path, {});
    setPendingActionId(null);
    router.refresh();
  }

  return (
    <div className="stack">
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Base única</span>
            <h2>Buscar clientes</h2>
          </div>
          {isLive ? <StatusPill variant="success">Dados reais</StatusPill> : <StatusPill variant="warning">Mock local</StatusPill>}
        </div>
        <form className="filter-form" onSubmit={applyFilters}>
          <div className="field">
            <label htmlFor="clientes-q">Nome, empresa, telefone ou identificador</label>
            <input id="clientes-q" name="q" type="text" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar..." />
          </div>
          <div className="field">
            <label htmlFor="clientes-segment">Segmento</label>
            <select id="clientes-segment" value={segment} onChange={(event) => setSegment(event.target.value)}>
              <option value="">Todos</option>
              {Object.entries(SEGMENT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="clientes-active">Status</label>
            <select id="clientes-active" value={active} onChange={(event) => setActive(event.target.value)}>
              <option value="">Todos</option>
              <option value="true">Ativos</option>
              <option value="false">Inativos</option>
            </select>
          </div>
          <div className="filter-actions">
            <button className="button button--accent" type="submit">Buscar</button>
            <button className="button" type="button" onClick={clearFilters}>Limpar filtros</button>
          </div>
        </form>
      </ShellCard>

      {duplicateCandidates && duplicateCandidates.length > 0 ? (
        <ShellCard tone="warm" className="panel-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Possível duplicado</span>
              <h2>Cliente criado — confira antes de seguir</h2>
            </div>
            <button className="button button--small" type="button" onClick={() => setDuplicateCandidates(null)}>Fechar aviso</button>
          </div>
          <ShellTable caption="Clientes já existentes que podem ser o mesmo cadastro">
            <thead><tr><th>Nome</th><th>Empresa</th><th>Telefone</th><th>E-mail</th><th>Coincide em</th><th /></tr></thead>
            <tbody>
              {duplicateCandidates.map((candidate) => (
                <tr key={candidate.id}>
                  <td>{candidate.name}</td>
                  <td>{candidate.company ?? "—"}</td>
                  <td>{candidate.phone ?? "—"}</td>
                  <td>{candidate.email ?? "—"}</td>
                  <td>{candidate.matchedOn.map((reason) => MATCH_LABEL[reason]).join(", ")}</td>
                  <td><a className="button button--small" href={`/clientes/${candidate.id}`}>Ver ficha</a></td>
                </tr>
              ))}
            </tbody>
          </ShellTable>
          <p className="card-note">
            O cadastro foi criado normalmente — a decisão de vincular ou manter os dois é sua. Nada foi bloqueado automaticamente.
          </p>
        </ShellCard>
      ) : null}

      <ShellCard className="table-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Clientes</span>
            <h2>{items.length} {items.length === 1 ? "cliente" : "clientes"}</h2>
          </div>
          <button className="button button--accent" type="button" onClick={() => setShowCreateForm((open) => !open)}>
            {showCreateForm ? "Cancelar" : "+ Novo cliente"}
          </button>
        </div>

        {showCreateForm ? (
          <form className="filter-form" onSubmit={submitCreate} style={{ padding: "0 18px 18px" }}>
            <div className="field">
              <label htmlFor="new-client-name">Nome *</label>
              <input id="new-client-name" name="name" type="text" required maxLength={150} />
            </div>
            <div className="field">
              <label htmlFor="new-client-company">Empresa</label>
              <input id="new-client-company" name="company" type="text" maxLength={150} />
            </div>
            <div className="field">
              <label htmlFor="new-client-phone">Telefone</label>
              <input id="new-client-phone" name="phone" type="text" maxLength={40} />
            </div>
            <div className="field">
              <label htmlFor="new-client-email">E-mail</label>
              <input id="new-client-email" name="email" type="email" maxLength={254} />
            </div>
            <div className="field">
              <label htmlFor="new-client-external-id">Identificador (externalId)</label>
              <input id="new-client-external-id" name="externalId" type="text" maxLength={100} />
            </div>
            <div className="field">
              <label htmlFor="new-client-segment">Segmento</label>
              <select id="new-client-segment" name="segment" defaultValue="prospect">
                {Object.entries(SEGMENT_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="filter-actions">
              <button className="button button--accent" type="submit" disabled={creating}>{creating ? "Criando..." : "Criar cliente"}</button>
            </div>
            {createError ? <p className="auth-error">{createError}</p> : null}
          </form>
        ) : null}

        <ShellTable caption="Clientes cadastrados">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Empresa</th>
              <th>Contato</th>
              <th>Segmento</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((client) => (
              <tr key={client.id}>
                <td>{client.name}</td>
                <td>{client.company ?? "—"}</td>
                <td>{client.phone ?? client.email ?? "—"}</td>
                <td><StatusPill variant="neutral">{SEGMENT_LABEL[client.segment]}</StatusPill></td>
                <td><StatusPill variant={client.active ? "success" : "danger"}>{client.active ? "Ativo" : "Inativo"}</StatusPill></td>
                <td>
                  <div className="row-actions">
                    <a className="button button--small" href={`/clientes/${client.id}`}>Ver ficha</a>
                    <button
                      className="button button--small"
                      type="button"
                      disabled={pendingActionId === client.id}
                      onClick={() => toggleActive(client)}
                    >
                      {client.active ? "Inativar" : "Ativar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr><td colSpan={6}>Nenhum cliente encontrado para os filtros atuais.</td></tr>
            ) : null}
          </tbody>
        </ShellTable>
        <p className="card-note">
          Clientes é a base única — não é uma segunda lista de leads.
        </p>
      </ShellCard>
    </div>
  );
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : undefined;
}
