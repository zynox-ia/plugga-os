"use client";

import type { BulkDealsAction, ClientDetail, Deal, Pipeline, PipelinePerson } from "@plugga/shared";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Filter,
  Mail,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from "react";

import { documentoFormatado, telefoneFormatado } from "../../lib/clientes";
import { formatarBRL } from "../../lib/format";
import {
  diasNaEtapa,
  estaParado,
  ordenar,
  somaDosValores,
  valorCurto,
  type Ordem,
} from "../../lib/negocios";
import { ShellCard, ShellTable } from "../plugga-shell";
import { Button } from "../ui";
import { MenuDoNegocio } from "./cartao-de-negocio";
import { DetalhesDoLeadModal } from "./detalhes-do-lead-modal";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";

const COLUNAS: { campo: Ordem["campo"] | null; rotulo: string; centro?: boolean }[] = [
  { campo: "titulo", rotulo: "Lead / Oportunidade" },
  { campo: null, rotulo: "Cliente / Empresa", centro: true },
  { campo: "etapa", rotulo: "Etapa do Funil", centro: true },
  { campo: "valor", rotulo: "Valor Estimado", centro: true },
  { campo: null, rotulo: "Status", centro: true },
  { campo: "dias", rotulo: "Última Atividade", centro: true },
];

const ITENS_POR_PAGINA = 10;

type Lote = { tipo: "owner" | "tag" | "stage"; valor: string };

/**
 * Tabela de Leads do Pipeline (CRM).
 * Visual refinado e moderno seguindo o design system do Plugga OS.
 * Alinhamento centralizado para campos de empresa, etapa, valor, status e atividade.
 * Subtítulo rico com dados de contato, documento e tags abaixo do nome do lead.
 * Rigor de tipografia: font-weight estritamente <= 500.
 */
export function ListaDeNegocios({
  pipeline,
  negocios,
  acoes,
  responsaveis,
}: {
  responsaveis: PipelinePerson[];
  pipeline: Pipeline;
  negocios: Deal[];
  acoes: AcoesDoNegocio;
}) {
  const [ordem, setOrdem] = useState<Ordem>({ campo: "etapa", direcao: "asc" });
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [lote, setLote] = useState<Lote>({ tipo: "owner", valor: "" });
  const [aplicando, setAplicando] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [leadSelecionado, setLeadSelecionado] = useState<Deal | null>(null);

  // Cache de dados complementares de clientes para enriquecimento de linhas visíveis
  const [cacheClientes, setCacheClientes] = useState<Record<string, ClientDetail>>({});

  const linhas = useMemo(() => ordenar(negocios, ordem, pipeline), [negocios, ordem, pipeline]);
  const visiveis = useMemo(() => new Set(linhas.map((n) => n.id)), [linhas]);
  const marcados = useMemo(() => [...selecionados].filter((id) => visiveis.has(id)), [selecionados, visiveis]);

  const totalItens = linhas.length;
  const totalPaginas = Math.max(1, Math.ceil(totalItens / ITENS_POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicioIndice = (paginaAtual - 1) * ITENS_POR_PAGINA;
  const fimIndice = Math.min(inicioIndice + ITENS_POR_PAGINA, totalItens);
  const linhasPaginadas = useMemo(() => linhas.slice(inicioIndice, fimIndice), [linhas, inicioIndice, fimIndice]);
  const todos = linhasPaginadas.length > 0 && linhasPaginadas.every((n) => selecionados.has(n.id));

  const valorTotalPipeline = useMemo(() => somaDosValores(negocios), [negocios]);

  // Carrega dados adicionais de contato/documento/endereço dos clientes visíveis
  useEffect(() => {
    const idsFaltantes = linhasPaginadas
      .map((l) => l.client.id)
      .filter((id) => !cacheClientes[id]);

    if (idsFaltantes.length === 0) return;

    let vivo = true;
    const idsUnicos = Array.from(new Set(idsFaltantes));

    void Promise.all(idsUnicos.map(async (id) => {
      try {
        const res = await fetch(`/api/clientes/${id}`);
        if (!res.ok) return null;
        const detalhe: ClientDetail = await res.json();
        return [id, detalhe] as const;
      } catch {
        return null;
      }
    })).then((resultados) => {
      if (!vivo) return;
      const novos = Object.fromEntries(resultados.filter((item) => item !== null));
      if (Object.keys(novos).length > 0) setCacheClientes((prev) => ({ ...prev, ...novos }));
    });

    return () => {
      vivo = false;
    };
  }, [linhasPaginadas, cacheClientes]);

  const alternar = (id: string) =>
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const alternarTodos = () => {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      for (const n of linhasPaginadas) {
        if (todos) novo.delete(n.id);
        else novo.add(n.id);
      }
      return novo;
    });
  };

  const opcoesDoLote =
    lote.tipo === "owner"
      ? responsaveis.map((m) => ({ id: m.id, nome: m.name }))
      : lote.tipo === "tag"
        ? pipeline.tags.map((t) => ({ id: t.id, nome: t.name }))
        : pipeline.stages.map((e) => ({ id: e.id, nome: e.name }));

  async function aplicarLote() {
    if (!lote.valor || marcados.length === 0) return;
    const acao: BulkDealsAction =
      lote.tipo === "owner"
        ? { type: "owner", ownerId: lote.valor }
        : lote.tipo === "tag"
          ? { type: "tag", tagId: lote.valor }
          : { type: "stage", stageId: lote.valor };
    setAplicando(true);
    const ok = await acoes.emLote(marcados, acao);
    setAplicando(false);
    if (ok) {
      setSelecionados(new Set());
      setLote((atual) => ({ ...atual, valor: "" }));
    }
  }

  const aoClicarLinha = (n: Deal, e: MouseEvent<HTMLTableRowElement>) => {
    const alvo = e.target as HTMLElement;
    if (alvo.closest("input, button, select, a, [role='menuitem']")) return;
    setLeadSelecionado(n);
  };

  return (
    <div className="lista-negocios">
      {/* Barra de lote flutuante quando há itens selecionados */}
      {marcados.length > 0 ? (
        <div className="barra-lote" role="region" aria-label="Ações em lote">
          <div className="barra-lote-info">
            <CheckSquare size={15} aria-hidden="true" />
            <span>{marcados.length === 1 ? "1 lead selecionado" : `${marcados.length} leads selecionados`}</span>
          </div>
          <div className="barra-lote-controles">
            <select
              aria-label="Ação em lote"
              value={lote.tipo}
              onChange={(e) => setLote({ tipo: e.target.value as Lote["tipo"], valor: "" })}
            >
              <option value="owner">Trocar responsável</option>
              {pipeline.tags.length > 0 ? <option value="tag">Adicionar etiqueta</option> : null}
              <option value="stage">Mover de etapa</option>
            </select>
            <select
              aria-label="Destino da ação"
              value={lote.valor}
              onChange={(e) => setLote((atual) => ({ ...atual, valor: e.target.value }))}
            >
              <option value="">Escolha…</option>
              {opcoesDoLote.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
            <Button
              variant="primary"
              size="sm"
              disabled={!lote.valor || aplicando}
              onClick={aplicarLote}
            >
              {aplicando ? "Aplicando…" : "Aplicar"}
            </Button>
            <button type="button" className="link-lote" onClick={() => setSelecionados(new Set())}>
              Limpar seleção
            </button>
          </div>
        </div>
      ) : null}

      <ShellCard className="table-card lista-negocios-card">
        {/* Cabeçalho do Card */}
        <div className="card-heading">
          <div>
            <span className="eyebrow">Pipeline · Tabela de Leads</span>
            <h2>{pipeline.name}</h2>
            <div className="card-subtitulo">
              Mostrando <strong>{totalItens}</strong> {totalItens === 1 ? "lead ativo" : "leads"}
              {valorTotalPipeline > 0 ? (
                <>
                  {" • Total em negociação: "}
                  <strong>{formatarBRL(valorTotalPipeline)}</strong>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {totalItens === 0 ? (
          <div className="lista-negocios-vazia" role="status">
            <div className="lista-negocios-vazia-icone" aria-hidden="true">
              <Filter size={22} />
            </div>
            <h3 className="lista-negocios-vazia-titulo">Nenhum lead encontrado</h3>
            <p className="lista-negocios-vazia-desc">
              Não encontramos oportunidades com os filtros ou termo de busca atuais.
            </p>
          </div>
        ) : (
          <>
            <ShellTable caption={`Lista de leads do pipeline ${pipeline.name}`}>
              <thead>
                <tr>
                  <th scope="col" className="coluna-marcar">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os leads visíveis"
                      checked={todos}
                      onChange={alternarTodos}
                    />
                  </th>
                  {COLUNAS.map((c) => (
                    <th
                      key={c.rotulo}
                      scope="col"
                      className={c.centro ? "coluna-centro" : undefined}
                      aria-sort={
                        c.campo && ordem.campo === c.campo
                          ? ordem.direcao === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      {c.campo ? (
                        <button
                          type="button"
                          className={c.centro ? "ordenar ordenar--centro" : "ordenar"}
                          onClick={() =>
                            setOrdem((atual) => ({
                              campo: c.campo!,
                              direcao: atual.campo === c.campo && atual.direcao === "asc" ? "desc" : "asc",
                            }))
                          }
                        >
                          <span>{c.rotulo}</span>
                          {ordem.campo === c.campo ? (
                            ordem.direcao === "asc" ? (
                              <ArrowUp size={13} className="ordenar-icone" aria-hidden="true" />
                            ) : (
                              <ArrowDown size={13} className="ordenar-icone" aria-hidden="true" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="ordenar-icone ordenar-icone--neutro" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        <span>{c.rotulo}</span>
                      )}
                    </th>
                  ))}
                  <th scope="col" className="coluna-centro">
                    <span>Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhasPaginadas.map((n) => {
                  const etapa = pipeline.stages.find((e) => e.id === n.stageId);
                  const parado = estaParado(n, pipeline);
                  const dias = diasNaEtapa(n);
                  const estaMarcado = selecionados.has(n.id);
                  const detalheCliente = cacheClientes[n.client.id];

                  // Documento formatado (CNPJ ou CPF)
                  const docFormatado = detalheCliente?.document
                    ? documentoFormatado(detalheCliente.personType, detalheCliente.document)
                    : null;

                  // Telefone formatado
                  const foneFormatado = detalheCliente?.phone
                    ? telefoneFormatado(detalheCliente.phone)
                    : null;

                  // Localização (Cidade / UF)
                  const localidade = [detalheCliente?.city, detalheCliente?.state]
                    .filter(Boolean)
                    .join("/");

                  return (
                    <tr
                      key={n.id}
                      className={estaMarcado ? "linha-marcada" : undefined}
                      onClick={(e) => aoClicarLinha(n, e)}
                    >
                      {/* 1. Checkbox */}
                      <td className="coluna-marcar" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${n.title}`}
                          checked={estaMarcado}
                          onChange={() => alternar(n.id)}
                        />
                      </td>

                      {/* 2. Lead / Oportunidade com Subtítulo Rico */}
                      <td>
                        <div className="celula-lead-bloco">
                          <span className="lead-nome">{n.title}</span>
                          <div className="lead-subtitulo">
                            {docFormatado ? (
                              <span className="lead-subtitulo-item" title="Documento do cliente">
                                {docFormatado}
                              </span>
                            ) : null}

                            {n.contact ? (
                              <>
                                {docFormatado ? <span className="lead-subtitulo-divisor">•</span> : null}
                                <span className="lead-subtitulo-item" title="Contato direto">
                                  <User size={11} aria-hidden="true" />
                                  <span>{n.contact.name}</span>
                                </span>
                              </>
                            ) : null}

                            {foneFormatado ? (
                              <>
                                <span className="lead-subtitulo-divisor">•</span>
                                <span className="lead-subtitulo-item" title="Telefone de contato">
                                  <Phone size={11} aria-hidden="true" />
                                  <span>{foneFormatado}</span>
                                </span>
                              </>
                            ) : null}

                            {detalheCliente?.email ? (
                              <>
                                <span className="lead-subtitulo-divisor">•</span>
                                <span className="lead-subtitulo-item" title="E-mail de contato">
                                  <Mail size={11} aria-hidden="true" />
                                  <span>{detalheCliente.email}</span>
                                </span>
                              </>
                            ) : null}
                          </div>

                          {n.tags.length > 0 ? (
                            <div className="etiquetas-linha">
                              {n.tags.map((t) => (
                                <span
                                  key={t.id}
                                  className="etiqueta-pill"
                                  style={{ "--cor": t.color } as CSSProperties}
                                >
                                  <span className="etiqueta-pill-dot" aria-hidden="true" />
                                  <span>{t.name}</span>
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </td>

                      {/* 3. Cliente / Empresa (Centralizado) */}
                      <td className="coluna-centro">
                        <div className="celula-empresa-centro">
                          <span className="empresa-nome">
                            {detalheCliente?.legalName || n.client.name}
                          </span>
                          <div className="empresa-sub">
                            <span className="empresa-badge-tipo">{n.client.personType}</span>
                            {localidade ? (
                              <span title="Localização">
                                <MapPin size={10} aria-hidden="true" style={{ display: "inline", verticalAlign: "-1px", marginRight: "2px" }} />
                                {localidade}
                              </span>
                            ) : (
                              <span>Plugga CRM</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 4. Etapa do Funil (Centralizado) */}
                      <td className="coluna-centro">
                        <span className="etapa-pill">
                          <span
                            className="etapa-dot"
                            style={{ background: etapa?.color ?? "var(--ui-primary)" }}
                            aria-hidden="true"
                          />
                          <span>{etapa?.name ?? "Sem etapa"}</span>
                        </span>
                      </td>

                      {/* 5. Valor Estimado (Centralizado) */}
                      <td className="coluna-centro">
                        <span className="valor-linha" title={n.value ? formatarBRL(n.value) : undefined}>
                          {n.value ? valorCurto(Number(n.value)) : "—"}
                        </span>
                      </td>

                      {/* 6. Status do Lead (Centralizado) */}
                      <td className="coluna-centro">
                        <span className={`selo-status-lead selo-status-lead--${n.status}`}>
                          <span className="selo-status-lead-dot" aria-hidden="true" />
                          <span>
                            {n.status === "won"
                              ? pipeline.wonLabel
                              : n.status === "lost"
                                ? pipeline.lostLabel
                                : "Em aberto"}
                          </span>
                        </span>
                      </td>

                      {/* 7. Última Atividade / Tempo na Etapa (Centralizado) */}
                      <td className="coluna-centro">
                        {n.status === "open" ? (
                          <span className={parado ? "atividade-linha atividade-linha--parado" : "atividade-linha"}>
                            <Clock size={12} aria-hidden="true" />
                            <span>{parado ? `Parado há ${dias}d` : `${dias}d na etapa`}</span>
                          </span>
                        ) : (
                          <span className="sem-dado">—</span>
                        )}
                      </td>

                      {/* 8. Ações (Centralizado) */}
                      <td className="coluna-acoes coluna-centro" onClick={(e) => e.stopPropagation()}>
                        <div className="lista-negocios-acoes">
                          <button
                            type="button"
                            className="lista-negocios-btn-ver"
                            aria-label={`Ver detalhes do lead ${n.title}`}
                            title="Ver detalhes do lead"
                            onClick={() => setLeadSelecionado(n)}
                          >
                            <Eye size={14} aria-hidden="true" />
                          </button>
                          {n.status === "open" ? <MenuDoNegocio
                            negocio={n}
                            pipeline={pipeline}
                            acoes={acoes}
                            aoVerLead={() => setLeadSelecionado(n)}
                          /> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </ShellTable>

            {/* Paginação */}
            <div className="lista-paginacao" aria-label="Paginação da lista de leads">
              <div className="lista-paginacao-info">
                Mostrando <strong>{inicioIndice + 1}–{fimIndice}</strong> de <strong>{totalItens}</strong>{" "}
                {totalItens === 1 ? "lead" : "leads"}
              </div>
              {totalPaginas > 1 ? (
                <div className="lista-paginacao-controles">
                  <button
                    type="button"
                    className="lista-paginacao-btn"
                    disabled={paginaAtual <= 1}
                    onClick={() => setPagina(Math.max(1, paginaAtual - 1))}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft size={14} aria-hidden="true" />
                    <span>Anterior</span>
                  </button>
                  <div className="lista-paginacao-paginas">
                    {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((num) => (
                      <button
                        key={num}
                        type="button"
                        className={`lista-paginacao-num ${paginaAtual === num ? "lista-paginacao-num--ativo" : ""}`}
                        onClick={() => setPagina(num)}
                        aria-label={`Ir para a página ${num}`}
                        aria-current={paginaAtual === num ? "page" : undefined}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="lista-paginacao-btn"
                    disabled={paginaAtual >= totalPaginas}
                    onClick={() => setPagina(Math.min(totalPaginas, paginaAtual + 1))}
                    aria-label="Próxima página"
                  >
                    <span>Próxima</span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </ShellCard>

      {/* Modal de Detalhes do Lead */}
      {leadSelecionado ? (
        <DetalhesDoLeadModal
          negocio={leadSelecionado}
          pipeline={pipeline}
          acoes={acoes}
          aoFechar={() => setLeadSelecionado(null)}
        />
      ) : null}
    </div>
  );
}
