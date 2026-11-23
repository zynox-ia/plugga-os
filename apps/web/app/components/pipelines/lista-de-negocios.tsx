"use client";

import { type BulkDealsAction, type Deal, type Pipeline, type PipelinePerson } from "@plugga/shared";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckSquare,
  Download,
  Eye,
  Filter,
  SolarPanel,
  User,
  X,
} from "lucide-react";
import { useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";

import { formatarBRL } from "../../lib/format";
import { COREOGRAFIA, useEntrada } from "../../lib/movimento";
import {
  diasNaEtapa,
  estaParado,
  podeAtribuirLead,
} from "../../lib/negocios";
import { camposPersonalizadosNaLista, csvNegocios, filtrarNegociosLista, ordenarNegociosLista, valorPonderadoDoNegocio, type CampoOrdenacaoLista, type SituacaoLista } from "../../lib/negocios/lista-de-negocios";
import { useSessionUser } from "../../lib/use-session-user";
import { ShellCard, ShellTable } from "../plugga-shell";
import { Button, Checkbox } from "../ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/shadcn/select";
import { MenuDoNegocio } from "./cartao-de-negocio";

import { PaginacaoDaLista } from "./paginacao-da-lista";
import type { AcoesDoNegocio } from "./quadro-do-pipeline";
import styles from "./lista-de-negocios.module.css";

const COLUNAS: { campo: CampoOrdenacaoLista; rotulo: string }[] = [
  { campo: "negocio", rotulo: "Negócio" },
  { campo: "etapa", rotulo: "Etapa" },
  { campo: "valor", rotulo: "Valor" },
  { campo: "responsavel", rotulo: "Responsável" },
  { campo: "contato", rotulo: "Na etapa há" },
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
  const { usuario } = useSessionUser();
  const podeAtribuir = podeAtribuirLead(usuario?.acesso);
  const [ordem, setOrdem] = useState<{ campo: CampoOrdenacaoLista; direcao: "asc" | "desc" }>({ campo: "etapa", direcao: "asc" });
  const [situacao, setSituacao] = useState<SituacaoLista>("open");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [selecionando, setSelecionando] = useState(false);
  const botaoSelecao = useRef<HTMLSpanElement>(null);
  const [lote, setLote] = useState<Lote>({ tipo: podeAtribuir ? "owner" : "stage", valor: "" });
  const [aplicando, setAplicando] = useState(false);
  const [pagina, setPagina] = useState(1);
  const raiz = useRef<HTMLDivElement>(null);
  // Entrada (PLU-325): topo da tabela, linhas em cascata (com teto) e as
  // etapas saltando no fim. Só na montagem: filtrar, ordenar e paginar não re-animam.
  useEntrada(raiz, (passos) => {
    passos.itens(".card-heading", COREOGRAFIA.lista.cabecalho);
    passos.itens("tbody > tr", COREOGRAFIA.lista.linhas);
    passos.pilulas("tbody .etapa-pill", COREOGRAFIA.lista.pilulas);
  });

  const filtrados = useMemo(() => filtrarNegociosLista(negocios, { busca: "", responsavel: "", situacao, emRisco: false }, pipeline), [negocios, situacao, pipeline]);
  const linhas = useMemo(() => ordenarNegociosLista(filtrados, ordem, pipeline), [filtrados, ordem, pipeline]);
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
  const valorTotal = linhas.reduce((total, negocio) => total + (negocio.value ? Number(negocio.value) : 0), 0);

  const exportar = () => {
    const blob = new Blob([csvNegocios(linhas, pipeline)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "negocios.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

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
    if (!lote.valor || marcados.length === 0 || (lote.tipo === "owner" && !podeAtribuir)) return;
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
    <div ref={raiz} className={`lista-negocios ${styles.lista}`} data-plg-raiz="">
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
                {podeAtribuir ? <SelectItem value="owner">Trocar responsável</SelectItem> : null}
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
              disabled={!lote.valor || aplicando || (lote.tipo === "owner" && !podeAtribuir)}
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
        <div className="card-heading">
          <div className={styles.cabecalhoTabela}>
            <div><h2>{totalItens} {totalItens === 1 ? "negócio" : "negócios"}</h2><span>{formatarBRL(valorTotal)} no total</span></div>
            <div className={styles.controlesTabela}>
              <div className={styles.segmentado} role="group" aria-label="Situação">
                {([ ["open", "Em aberto"], ["won", "Ganhos"], ["lost", "Perdidos"], ["all", "Todos"] ] as const).map(([valor, rotulo]) => <button key={valor} type="button" aria-pressed={situacao === valor} onClick={() => { setSituacao(valor); setPagina(1); }}>{rotulo}</button>)}
              </div>
              <Button variant="secondary" size="sm" icon={<Download />} iconOnly aria-label="Exportar CSV" title="Exportar CSV" onClick={exportar} />
              {totalItens > 0 ? <span ref={botaoSelecao} className={styles.selecaoIcone}><Button variant="secondary" size="sm" icon={<CheckSquare />} iconOnly aria-label={selecionando ? "Cancelar seleção" : "Selecionar negócios"} title={selecionando ? "Cancelar seleção" : "Selecionar negócios"} aria-pressed={selecionando} onClick={() => { setSelecionando(!selecionando); setSelecionados(new Set()); }} /></span> : null}
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
            <div className={styles.rolagemTabela} role="region" aria-label="Oportunidades do pipeline" tabIndex={0}>
            <ShellTable caption={`Lista de negócios do pipeline ${pipeline.name}`}>
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
                        {c.campo === "negocio" && selecionando ? <Checkbox
                          className={styles.checkbox}
                          label="Selecionar todos os leads visíveis"
                          checked={todos}
                          indeterminate={alguns && !todos}
                          onChange={alternarTodos}
                        /> : null}
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
                      </div>
                    </th>
                  ))}
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {linhasPaginadas.map((n) => {
                  const etapa = pipeline.stages.find((e) => e.id === n.stageId);
                  const parado = estaParado(n, pipeline);
                  const dias = diasNaEtapa(n);
                  const camposLista = camposPersonalizadosNaLista(n, pipeline, responsaveis);
                  const camposListaVisiveis = camposLista.slice(0, 3);
                  const camposListaRestantes = Math.max(0, camposLista.length - camposListaVisiveis.length);
                  const estaMarcado = selecionados.has(n.id);

                  return (
                    <tr
                      key={n.id}
                      className={estaMarcado ? "linha-marcada" : undefined}
                      data-selected={estaMarcado}
                      onClick={(e) => aoClicarLinha(n, e)}
                      tabIndex={0}
                      onKeyDown={(evento) => { if (evento.target === evento.currentTarget && evento.key === "Enter") acoes.abrirDetalhes(n); }}
                    >
                      <td data-l="Negócio">
                        <div className={styles.oportunidade}>
                          {selecionando ? <span>
                            <Checkbox className={styles.checkbox} label={`Selecionar ${n.lead.name}`} checked={estaMarcado} onChange={() => alternar(n.id)} />
                          </span> : null}
                          <span className={styles.iconeOportunidade} aria-hidden="true"><SolarPanel size={16} strokeWidth={1.8} /></span>
                          <div className="celula-lead-bloco">
                            <button type="button" className={`lead-nome ${styles.titulo}`} title={n.title} onClick={() => acoes.abrirDetalhes(n)}>{n.title}</button>
                            <span className={styles.codigo} title={`PLU-${String(n.number).padStart(4, "0")} · ${n.lead.mainInterest || n.lead.companyName || n.lead.name}`}>PLU-{String(n.number).padStart(4, "0")} · {n.lead.mainInterest || n.lead.companyName || n.lead.name}</span>
                            {camposLista.length > 0 ? <span className={styles.camposLista} title={camposLista.join(" · ")}>
                              {camposListaVisiveis.map((campo, indice) => <span className={styles.campoLista} key={`${n.id}-campo-${indice}`}>
                                {indice > 0 ? <span className={styles.separadorCampoLista} aria-hidden="true">·</span> : null}
                                <span className={styles.valorCampoLista}>{campo}</span>
                              </span>)}
                              {camposListaRestantes > 0 ? <span className={styles.contadorCamposLista}>+{camposListaRestantes}</span> : null}
                            </span> : null}
                          </div>
                        </div>
                      </td>
                      <td data-l="Etapa">
                        <div className={styles.etapa}>
                          <span className={`etapa-pill ${styles.badgeEtapa}`} style={{ "--cor-etapa": etapa?.color ?? "var(--ui-primary)" } as CSSProperties}>
                            <span
                              className="etapa-dot"
                              style={{ background: etapa?.color ?? "var(--ui-primary)" }}
                              aria-hidden="true"
                            />
                            <span>{etapa?.name ?? "Sem etapa"}</span>
                          </span>
                          {parado ? <span className={styles.alertaRisco}>Parado há {dias} dias</span> : null}
                        </div>
                      </td>
                      <td data-l="Valor">
                        <div className={styles.valor}>
                          <strong>{formatarBRL(n.value)}</strong>
                          <small>{formatarBRL(valorPonderadoDoNegocio(n, pipeline))} ponderado</small>
                        </div>
                      </td>
                      <td data-l="Responsável"><div className={styles.responsavel} title={n.owner.name}><User className={styles.iconeResponsavel} size={14} strokeWidth={2} aria-hidden="true" /><strong>{n.owner.name.split(/\s+/)[0]}</strong></div></td>
                      <td data-l="Na etapa há"><span className={styles.contato}>{dias === 0 ? "hoje" : dias === 1 ? "1 dia" : `${dias} dias`}</span></td>
                      <td className={styles.colunaAcoes}><div className={styles.acoesLinha}>
                        <Button variant="secondary" size="sm" icon={<Eye />} iconOnly aria-label={`Ver detalhes de ${n.title}`} onClick={() => acoes.abrirDetalhes(n)} />
                        <MenuDoNegocio negocio={n} pipeline={pipeline} acoes={acoes} aoVerLead={() => acoes.abrirDetalhes(n)} menuClassName={styles.menuVidro} mostrarPrioridade />
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </ShellTable>
            </div>

            <PaginacaoDaLista entidade="negocios" pagina={paginaAtual} totalItens={totalItens} itensPorPagina={ITENS_POR_PAGINA} aoMudarPagina={setPagina} />
          </>
        )}
      </ShellCard>
    </div>
  );
}
