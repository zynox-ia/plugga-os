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
import { DetalhesDoLeadModal } from "./detalhes-do-lead-modal";
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
const OPCOES_DE_ORDEM = [
  { value: "etapa:asc", label: "Etapa: início ao fim" },
  { value: "etapa:desc", label: "Etapa: fim ao início" },
  { value: "titulo:asc", label: "Oportunidade: A–Z" },
  { value: "titulo:desc", label: "Oportunidade: Z–A" },
  { value: "valor:desc", label: "Maior valor" },
  { value: "valor:asc", label: "Menor valor" },
  { value: "dias:desc", label: "Mais tempo na etapa" },
  { value: "dias:asc", label: "Menos tempo na etapa" },
];

type Lote = { tipo: "owner" | "tag" | "stage"; valor: string };

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
  const [leadSelecionado, setLeadSelecionado] = useState<Deal | null>(null);

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
    if (alvo.closest("input, label, button, select, a, [role='menuitem']")) return;
    setLeadSelecionado(n);
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
            <button type="button" className="link-lote" onClick={() => {
              setSelecionados(new Set());
              botaoSelecao.current?.querySelector("button")?.focus();
            }}>
              Limpar seleção
            </button>
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
            <div className={styles.ordenacao}>
              <Select value={`${ordem.campo}:${ordem.direcao}`} onValueChange={(valor) => {
                const [campo, direcao] = valor.split(":") as [Ordem["campo"], Ordem["direcao"]];
                setOrdem({ campo, direcao });
              }}>
                <SelectTrigger aria-label="Ordenar oportunidades"><SelectValue /></SelectTrigger>
                <SelectContent aria-label="Ordenar oportunidades">
                  {OPCOES_DE_ORDEM.map((opcao) => <SelectItem key={opcao.value} value={opcao.value}>{opcao.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
                  const detalheCliente = n.client;

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
                      data-selected={estaMarcado}
                      onClick={(e) => aoClicarLinha(n, e)}
                    >
                      <td>
                        <div className={styles.oportunidade}>
                          {selecionando ? <span onClick={(e) => e.stopPropagation()}>
                            <Checkbox className={styles.checkbox} label={`Selecionar ${n.title}`} checked={estaMarcado} onChange={() => alternar(n.id)} />
                          </span> : null}
                          <span className={styles.iconeOportunidade} aria-hidden="true"><Target size={20} /></span>
                          <div className="celula-lead-bloco">
                            <button type="button" className={`lead-nome ${styles.titulo}`} title={n.title} onClick={() => setLeadSelecionado(n)}>{n.title}</button>
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
                                  <span className={`lead-subtitulo-item ${styles.email}`} title={detalheCliente.email}>
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
                        </div>
                      </td>
                      <td>
                        <div className="celula-empresa-centro">
                          <span className="empresa-nome" title={detalheCliente.legalName || n.client.name}>
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
                              <span>Local não informado</span>
                            )}
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
                            onClick={() => setLeadSelecionado(n)}
                          >
                            <Eye size={14} aria-hidden="true" />
                          </button>
                          <MenuDoNegocio
                            negocio={n}
                            pipeline={pipeline}
                            acoes={acoes}
                            aoVerLead={() => setLeadSelecionado(n)}
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
