"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { ClientDetail, ClientDuplicateCandidate, ClientListItem, ClientOwner } from "@plugga/shared";

import { hrefDaFicha, iniciais } from "../lib/clientes";
import { ClienteForm } from "./cliente-form";
import { FichaCliente } from "./ficha-cliente";
import { Modal } from "./modal";
import { ShellCard, ShellTable, StatusPill } from "./plugga-shell";

type Filtros = { q?: string; active?: string };

/**
 * Clientes (PLU-268): cadastro único, PF ou PJ, das duas empresas. A lista
 * mostra CPF e telefone mascarados; a ficha abre em modal com endereço próprio.
 */
export function ClientesView({
  itens,
  filtros,
  responsaveis,
  ficha,
  fichaNaoEncontrada,
}: {
  itens: ClientListItem[];
  filtros: Filtros;
  responsaveis: ClientOwner[];
  ficha: ClientDetail | null;
  fichaNaoEncontrada: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filtros.q ?? "");
  const [active, setActive] = useState(filtros.active ?? "");
  const [criando, setCriando] = useState(false);
  const [avisos, setAvisos] = useState<ClientDuplicateCandidate[]>([]);

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    router.push(hrefDaFicha(null, { q: q.trim() || undefined, active: active || undefined }));
  }

  function limpar() {
    setQ("");
    setActive("");
    router.push("/clientes");
  }

  function abrir(id: string) {
    setAvisos([]);
    router.push(hrefDaFicha(id, filtros), { scroll: false });
  }

  function fecharFicha() {
    setAvisos([]);
    router.push(hrefDaFicha(null, filtros), { scroll: false });
  }

  return (
    <div className="stack">
      <ShellCard className="table-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Comercial</span>
            <h2>Clientes</h2>
          </div>
          <button className="button button--accent" type="button" onClick={() => setCriando(true)}>
            + Novo cliente
          </button>
        </div>

        <form className="filter-form" onSubmit={buscar} role="search">
          <div className="field campo-busca">
            <label htmlFor="clientes-busca">Buscar por nome, CNPJ/CPF, contato, telefone ou e-mail</label>
            <input id="clientes-busca" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" />
          </div>
          <div className="field">
            <label htmlFor="clientes-situacao">Situação</label>
            <select id="clientes-situacao" value={active} onChange={(e) => setActive(e.target.value)}>
              <option value="">Todos</option>
              <option value="true">Ativos</option>
              <option value="false">Inativos</option>
            </select>
          </div>
          <div className="filter-actions">
            <button className="button button--accent" type="submit">
              Buscar
            </button>
            {filtros.q || filtros.active ? (
              <button className="button button--secondary" type="button" onClick={limpar}>
                Limpar
              </button>
            ) : null}
          </div>
        </form>

        {fichaNaoEncontrada ? (
          <p className="aviso aviso--alerta" role="status" style={{ margin: "0 22px 14px" }}>
            Cliente não encontrado. O link pode estar errado ou você não tem acesso a ele.
          </p>
        ) : null}

        <ShellTable caption="Clientes cadastrados">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>CNPJ / CPF</th>
              <th>Contato principal</th>
              <th>Telefone</th>
              <th>E-mail</th>
              <th>Responsável</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr key={item.id} className="linha-cliente" onClick={() => abrir(item.id)}>
                <td>
                  <div className="celula-cliente">
                    <span className="mini-avatar" aria-hidden="true">
                      {iniciais(item.name)}
                    </span>
                    <div>
                      <Link href={hrefDaFicha(item.id, filtros)} scroll={false} onClick={(e) => e.stopPropagation()}>
                        {item.name}
                      </Link>
                      <small>{[item.personType === "pj" ? "PJ" : "PF", [item.city, item.state].filter(Boolean).join("/")].filter(Boolean).join(" · ")}</small>
                    </div>
                  </div>
                </td>
                <td>{item.documentDisplay ?? "—"}</td>
                <td>{item.primaryContactName ?? "—"}</td>
                <td>{item.phoneDisplay ?? "—"}</td>
                <td>{item.email ?? "—"}</td>
                <td>{item.owner?.name ?? "—"}</td>
                <td>
                  <StatusPill variant={item.active ? "success" : "danger"}>{item.active ? "Ativo" : "Inativo"}</StatusPill>
                </td>
              </tr>
            ))}
            {itens.length === 0 ? (
              <tr>
                <td colSpan={7}>{filtros.q ? "Nenhum cliente encontrado para a busca." : "Nenhum cliente cadastrado ainda."}</td>
              </tr>
            ) : null}
          </tbody>
        </ShellTable>
        <p className="card-note">CPF e telefone aparecem mascarados na lista; os dados completos ficam na ficha.</p>
      </ShellCard>

      {criando ? (
        <Modal rotulo="Novo cliente" aoFechar={() => setCriando(false)}>
          <div className="modal-topo">
            <h2>Novo cliente</h2>
            <button className="botao-fechar" type="button" aria-label="Fechar" onClick={() => setCriando(false)}>
              ✕
            </button>
          </div>
          <ClienteForm
            modo="criar"
            responsaveis={responsaveis}
            aoCancelar={() => setCriando(false)}
            aoCriar={(resposta) => {
              setCriando(false);
              setAvisos(resposta.duplicateCandidates);
              router.push(hrefDaFicha(resposta.client.id, filtros), { scroll: false });
              router.refresh();
            }}
          />
        </Modal>
      ) : null}

      {ficha ? (
        <Modal key={ficha.id} rotulo={`Ficha de ${ficha.name}`} largura="larga" aoFechar={fecharFicha}>
          <FichaCliente cliente={ficha} responsaveis={responsaveis} avisos={avisos} aoFechar={fecharFicha} />
        </Modal>
      ) : null}
    </div>
  );
}
