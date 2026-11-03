"use client";

import type { BulkDealsAction, Deal, Pipeline, PipelinePerson } from "@plugga/shared";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckSquare,
  Clock,
  Eye,
  Filter,
  Mail,
  MapPin,
  Phone,
  Target,
  User,
  X,
} from "lucide-react";
import { useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";

import { documentoFormatado, telefoneFormatado } from "../../lib/clientes";
import { formatarBRL } from "../../lib/format";
import {
  diasNaEtapa,
  estaParado,
  ordenar,
  valorCurto,
  type Ordem,
} from "../../lib/negocios";
import { ShellCard, ShellTable } from "../plugga-shell";
import { Button, Checkbox } from "../ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/shadcn/select";
import { MenuDoNegocio } from "./cartao-de-negocio";

import { PaginacaoDaLista } from "./paginacao-da-lista";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";
import styles from "./lista-de-negocios.module.css";

const COLUNAS: { campo: Ordem["campo"] | null; rotulo: string }[] = [
  { campo: "titulo", rotulo: "Oportunidade" },
  { campo: null, rotulo: "Cliente" },
  { campo: "etapa", rotulo: "Etapa" },
  { campo: "valor", rotulo: "Valor" },
];

const ITENS_POR_PAGINA = 6;

type Lote = { tipo: "owner" | "tag" | "stage" | "priority"; valor: string };

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
  const [selecionando, setSelecionando] = useState(false);
  const botaoSelecao = useRef<HTMLSpanElement>(null);
  const [lote, setLote] = useState<Lote>({ tipo: "owner", valor: "" });
  const [aplicando, setAplicando] = useState(false);
  const [pagina, setPagina] = useState(1);


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
  const alguns = linhasPaginadas.some((n) => selecionados.has(n.id));

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
        : lote.tipo === "stage"
          ? pipeline.stages.map((e) => ({ id: e.id, nome: e.name }))
          : [{ id: "urgente", nome: "Urgente" }, { id: "medio", nome: "Médio" }, { id: "normal", nome: "Normal" }, { id: "sem-prioridade", nome: "Sem prioridade" }];

  async function aplicarLote() {
    if (!lote.valor || marcados.length === 0) return;
    const acao: BulkDealsAction =
      lote.tipo === "owner"
        ? { type: "owner", ownerId: lote.valor }
        : lote.tipo === "tag"
          ? { type: "tag", tagId: lote.valor }
          : lote.tipo === "stage"
            ? { type: "stage", stageId: lote.valor }
            : { type: "priority", priority: lote.valor === "sem-prioridade" ? null : lote.valor as "urgente" | "medio" | "normal" };
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
    if (alvo.closest("input, label, button, select, a, [role='menuitem']")) return;
    acoes.abrirDetalhes(n);
  };

  return (
    <div className={`lista-negocios ${styles.lista}`}>
      {/* Barra de lote flutuante quando há itens selecionados */}
      {marcados.length > 0 ? (
        <div className="barra-lote" role="region" aria-label="Ações em lote">
          <div className="barra-lote-info" role="status">
            <CheckSquare size={15} aria-hidden="true" />
            <span>{marcados.length === 1 ? "1 lead selecionado" : `${marcados.length} leads selecionados`}</span>
          </div>
          <div className="barra-lote-controles">
            <Select value={lote.tipo} onValueChange={(tipo) => setLote({ tipo: tipo as Lote["tipo"], valor: "" })}>
              <SelectTrigger className={styles.selectLote} aria-label="Ação em lote"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Trocar responsável</SelectItem>
                {pipeline.tags.length > 0 ? <SelectItem value="tag">Adicionar etiqueta</SelectItem> : null}
                <SelectItem value="stage">Mover de etapa</SelectItem>
                <SelectItem value="priority">Definir prioridade</SelectItem>
              </SelectContent>
            </Select>
            <Select value={lote.valor} onValueChange={(valor) => setLote((atual) => ({ ...atual, valor }))}>
              <SelectTrigger className={styles.selectLote} aria-label="Destino da ação"><SelectValue placeholder="Escolha…" /></SelectTrigger>
              <SelectContent>{opcoesDoLote.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
            </Select>
            <Button
              variant="primary"
              size="sm"
              disabled={!lote.valor || aplicando}
              onClick={aplicarLote}
            >
              {aplicando ? "Aplicando…" : "Aplicar"}
            </Button>
            <Button variant="secondary" size="sm" icon={<X size={14} />} onClick={() => {
              setSelecionados(new Set());
              botaoSelecao.current?.querySelector("button")?.focus();
            }}>
              Limpar seleção
            </Button>
          </div>
        </div>
      ) : null}

      <ShellCard className="table-card lista-negocios-card">
        {/* Cabeçalho do Card */}
        <div className="card-heading">
          <div>
            <span className="eyebrow">Visão em lista</span>
            <h2>{pipeline.name}</h2>
          </div>
          {totalItens > 0 ? <div className={styles.controles}>
            <span ref={botaoSelecao} className={styles.selecao}>
              <Button variant="secondary" size="sm" icon={<CheckSquare size={14} />} aria-pressed={selecionando} onClick={() => {
                setSelecionando(!selecionando);
                setSelecionados(new Set());
              }}>
                {selecionando ? "Cancelar seleção" : "Selecionar leads"}
              </Button>
            </span>
          </div> : null}
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
            <div className={styles.rolagemTabela} role="region" aria-label="Oportunidades do pipeline" tabIndex={0}>
            <ShellTable caption={`Lista de leads do pipeline ${pipeline.name}`}>
              <thead>
                <tr>
                  {COLUNAS.map((c) => (
                    <th
                      key={c.rotulo}
                      scope="col"
                      aria-sort={
                        c.campo && ordem.campo === c.campo
                          ? ordem.direcao === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      <div className={styles.cabecalhoColuna}>
                        {c.campo === "titulo" && selecionando ? <Checkbox
                          className={styles.checkbox}
                          label="Selecionar todos os leads visíveis"
                          checked={todos}
                          indeterminate={alguns && !todos}
                          onChange={alternarTodos}
                        /> : null}
                        {c.campo ? (
                          <button
                            type="button"
                            className="ordenar"
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
                      </div>
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
                  const lead = n.lead;

                  // Documento formatado (CNPJ ou CPF)
                  const docFormatado = lead.document
                    ? documentoFormatado(lead.personType, lead.document)
                    : null;

                  // Telefone formatado
                  const foneFormatado = lead.phone
                    ? telefoneFormatado(lead.phone)
                    : null;

                  // Localização (Cidade / UF)
                  const localidade = [lead.city, lead.state]
                    .filter(Boolean)
                    .join("/");

                  return (
                    <tr
                      key={n.id}
                      className={estaMarcado ? "linha-marcada" : undefined}
                      data-selected={estaMarcado}
                      onClick={(e) => aoClicarLinha(n, e)}
                    >
                      <td>
                        <div className={styles.oportunidade}>
                          {selecionando ? <span onClick={(e) => e.stopPropagation()}>
                            <Checkbox className={styles.checkbox} label={`Selecionar ${n.lead.name}`} checked={estaMarcado} onChange={() => alternar(n.id)} />
                          </span> : null}
                          <span className={styles.iconeOportunidade} aria-hidden="true"><Target size={20} /></span>
                          <div className="celula-lead-bloco">
                            <button type="button" className={`lead-nome ${styles.titulo}`} title={n.lead.name} onClick={() => acoes.abrirDetalhes(n)}>{n.lead.name}</button>
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

                              {lead.email ? (
                                <>
                                  <span className="lead-subtitulo-divisor">•</span>
                                  <span className={`lead-subtitulo-item ${styles.email}`} title={lead.email}>
                                    <Mail size={11} aria-hidden="true" />
                                    <span>{lead.email}</span>
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
                        </div>
                      </td>
                      <td>
                        <div className="celula-empresa-centro">
                          <span className="empresa-nome" title={lead.legalName || lead.name}>
                            {lead.legalName || lead.name}
                          </span>
                          <div className="empresa-sub">
                            <span className="empresa-badge-tipo">{lead.personType.toUpperCase()}</span>
                            {localidade ? (
                              <span title="Localização">
                                <MapPin size={10} aria-hidden="true" style={{ display: "inline", verticalAlign: "-1px", marginRight: "2px" }} />
                                {localidade}
                              </span>
                            ) : (
                              <span>Local não informado</span>
                            )}
                            {n.client ? (
                              <span className="empresa-badge-cliente" title={`Convertido em cliente: ${n.client.name}`}>
                                Cliente
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className={styles.etapa}>
                          <span className="etapa-pill">
                            <span
                              className="etapa-dot"
                              style={{ background: etapa?.color ?? "var(--ui-primary)" }}
                              aria-hidden="true"
                            />
                            <span>{etapa?.name ?? "Sem etapa"}</span>
                          </span>
                          <span className={parado ? "atividade-linha atividade-linha--parado" : "atividade-linha"}>
                            <Clock size={12} aria-hidden="true" />
                            <span>{parado ? `Parado há ${dias}d` : `${dias}d na etapa`}</span>
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.valor}>
                          <span className="valor-linha" title={n.value ? formatarBRL(n.value) : undefined}>
                            {n.value ? valorCurto(Number(n.value)) : "—"}
                          </span>
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
                        </div>
                      </td>
                      <td className="coluna-acoes coluna-centro" onClick={(e) => e.stopPropagation()}>
                        <div className="lista-negocios-acoes">
                          <button
                            type="button"
                            className="lista-negocios-btn-ver"
                            aria-label={`Ver detalhes do lead ${n.title}`}
                            title="Ver detalhes do lead"
                            onClick={() => acoes.abrirDetalhes(n)}
                          >
                            <Eye size={14} aria-hidden="true" />
                          </button>
                          <MenuDoNegocio
                            negocio={n}
                            pipeline={pipeline}
                            acoes={acoes}
                            aoVerLead={() => acoes.abrirDetalhes(n)}
                            menuClassName={styles.menuVidro}
                            mostrarPrioridade
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </ShellTable>
            </div>

            <PaginacaoDaLista pagina={paginaAtual} totalItens={totalItens} itensPorPagina={ITENS_POR_PAGINA} aoMudarPagina={setPagina} />
          </>
        )}
      </ShellCard>
    </div>
  );
}
