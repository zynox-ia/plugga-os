"use client";

import type { PlataformaDeInversor, Usina } from "@plugga/shared";
import { Activity, ArrowRight, FileCheck, LayoutGrid, Monitor, Pencil, Plus, Sun, TriangleAlert, Wrench, X, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { dataEmManaus, diaLegivel, ROTULO_DA_EMPRESA } from "../../lib/compras";
import { horarioEmManaus, hrefDasOrdens, ROTULO_DA_SITUACAO, ROTULO_DO_TIPO } from "../../lib/ordens-de-servico";
import { kwpLegivel, ROTULO_DA_SITUACAO_DO_MONITORAMENTO } from "../../lib/usinas";
import fichaCompras from "../compras/ficha-do-pedido.module.css";
import { FecharModal, Modal } from "../modal";
import detalhes from "../pipelines/detalhes-do-lead-modal.module.css";
import visao from "../pipelines/resumo-do-lead.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Button } from "../ui";
import { OrdemForm } from "./ordem-form";
import { UsinaForm } from "./usina-form";
import styles from "./usinas.module.css";

type Aba = "geral" | "monitoramento" | "os" | "protocolos";
const ROTULO_DA_ORIGEM = { manual: "Cadastro manual", importacao: "Planilha de levantamento", comissionamento: "Comissionamento" } as const;

/**
 * Ficha da usina (PLU-347): visão geral com o último alerta, o monitoramento por
 * dia, as O.S. e os protocolos da UC (estes chegam com a PLU-348). Editar e
 * Abrir O.S. seguem `acoesPermitidas`.
 */
export function FichaDaUsina({ usina: inicial, plataformas, hoje, prazoSugerido, aoFechar, aoAtualizar }: {
  usina: Usina;
  plataformas: PlataformaDeInversor[];
  hoje: string;
  prazoSugerido?: Record<string, string>;
  aoFechar: () => void;
  aoAtualizar: (aviso: string, ordemId?: string) => void;
}) {
  const id = useId();
  const [u, setU] = useState(inicial);
  const [aba, setAba] = useState<Aba>("geral");
  const [janela, setJanela] = useState<null | "editar" | "os">(null);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const pode = (a: Usina["acoesPermitidas"][number]) => u.acoesPermitidas.includes(a);
  const ultimo = u.monitoramento[0] ?? null;
  const alerta = ultimo && ultimo.situacao !== "normal" ? ultimo : null;

  const abas: { id: Aba; titulo: string; curto: string; conta?: number; icone: LucideIcon }[] = [
    { id: "geral", titulo: "Visão geral", curto: "Geral", icone: LayoutGrid },
    { id: "monitoramento", titulo: "Monitoramento", curto: "Monitor.", icone: Activity },
    { id: "os", titulo: "O.S.", curto: "O.S.", conta: u.ordens.length, icone: Wrench },
    { id: "protocolos", titulo: "Protocolos", curto: "Protoc.", icone: FileCheck },
  ];
  function navegar(evento: KeyboardEvent<HTMLDivElement>) {
    const i = abas.findIndex((a) => a.id === aba);
    const j = evento.key === "ArrowRight" ? (i + 1) % abas.length : evento.key === "ArrowLeft" ? (i - 1 + abas.length) % abas.length : evento.key === "Home" ? 0 : evento.key === "End" ? abas.length - 1 : null;
    if (j === null) return;
    evento.preventDefault(); setAba(abas[j]!.id); botoes.current[j]?.focus();
  }

  return <><Modal rotulo={u.nome} aoFechar={aoFechar} largura="larga" className={detalhes.modal}>
    <div className={detalhes.layout}>
      <header className={`${detalhes.cabecalhoLead} plg-parte`}>
        <div className={detalhes.identidadeCabecalho}><div className={detalhes.leadCardLinhaSuperior}>
          <div className={detalhes.iconeLead} aria-hidden="true"><Sun size={20} /></div>
          <div className={detalhes.identidadeLead}>
            <h2 className={detalhes.leadCardTitulo}>{u.nome}</h2>
            <div className={detalhes.metadadosCabecalho}>
              <span>UC {u.uc.codigo}</span><span aria-hidden="true">·</span>
              <span className={fichaCompras.empresaCabecalho}><EmpresaComPonto empresa={u.empresa} /></span><span aria-hidden="true">·</span>
              <span><Monitor size={13} aria-hidden="true" />{u.plataforma.nome}</span><span aria-hidden="true">·</span>
              <span><Zap size={13} aria-hidden="true" />{kwpLegivel(u.potenciaKwp)} kWp</span>
              {u.ativa ? null : <><span aria-hidden="true">·</span><span>inativa</span></>}
            </div>
          </div>
        </div></div>
        <div className={detalhes.controlesCabecalho}>
          {pode("editar") ? <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={() => setJanela("editar")}>Editar</Button> : null}
          <FecharModal>{(fechar) => <button type="button" className={`${detalhes.botaoFechar} plg-pressiona`} onClick={fechar} aria-label="Fechar"><X size={18} aria-hidden="true" /></button>}</FecharModal>
        </div>
      </header>
      <div className={detalhes.painelPrincipal}>
        <div className={`${detalhes.navegacao} ${fichaCompras.abas} plg-parte`} role="tablist" aria-label="Seções da usina" onKeyDown={navegar}>
          {abas.map((a, i) => <div key={a.id}>
            <button ref={(el) => { botoes.current[i] = el; }} type="button" role="tab" id={`${id}-${a.id}`} aria-selected={aba === a.id} aria-controls={`${id}-painel`}
              aria-label={a.conta !== undefined ? `${a.titulo} ${a.conta}` : a.titulo} tabIndex={aba === a.id ? 0 : -1} className={detalhes.abaBotao} onClick={() => setAba(a.id)}>
              <a.icone size={15} aria-hidden="true" /><span><span className={fichaCompras.abaLonga}>{a.titulo}</span><span className={fichaCompras.abaCurta} aria-hidden="true">{a.curto}</span>{a.conta !== undefined ? <span className={fichaCompras.contaAba}> {a.conta}</span> : null}</span>
            </button>
          </div>)}
        </div>
        <section id={`${id}-painel`} role="tabpanel" aria-labelledby={`${id}-${aba}`} className={`${detalhes.conteudo} ${fichaCompras.painel} plg-parte`}>
          {aba === "geral" ? <div className={visao.resumo}>
            {alerta ? <div className={styles.alertaDaUsina} role="status">
              <TriangleAlert size={16} aria-hidden="true" />
              <div><strong>{ROTULO_DA_SITUACAO_DO_MONITORAMENTO[alerta.situacao]}</strong><p>{alerta.nota ?? "Sem nota."} {alerta.ordem ? <>· <Link href={hrefDasOrdens({ visao: "cards" }, alerta.ordem.id)}>{alerta.ordem.codigo}</Link></> : null}</p></div>
              <button type="button" className={styles.linkBotao} onClick={() => setAba("monitoramento")}>Histórico<ArrowRight size={14} aria-hidden="true" /></button>
            </div> : null}
            <dl className={visao.grade}>
              <div><dt>Empresa</dt><dd>{ROTULO_DA_EMPRESA[u.empresa]}</dd></div>
              <div><dt>Cliente</dt><dd>{u.cliente.nome}</dd></div>
              <div><dt>Unidade consumidora</dt><dd>UC {u.uc.codigo}<small>{u.uc.distribuidora}</small></dd></div>
              <div><dt>Potência</dt><dd>{kwpLegivel(u.potenciaKwp)} kWp</dd></div>
              <div><dt>Plataforma</dt><dd>{u.plataforma.nome}</dd></div>
              <div><dt>Inversor</dt><dd>{[u.fabricante, u.modelo].filter(Boolean).join(" ") || "Não informado"}{u.numeroSerie ? <small>Nº de série {u.numeroSerie}</small> : null}</dd></div>
              <div><dt>Comissionada em</dt><dd>{diaLegivel(u.comissionadaEm)}<small>{ROTULO_DA_ORIGEM[u.origem]}</small></dd></div>
              <div><dt>Garantia do inversor</dt><dd>{u.garantiaAte ? `até ${diaLegivel(u.garantiaAte)}` : "Não informada"}</dd></div>
            </dl>
          </div> : null}
          {aba === "monitoramento" ? <div className={fichaCompras.secao}>
            <div className={fichaCompras.barra}><div><h3>Monitoramento por dia</h3><p>A conferência de cada dia, dos últimos 90 dias.</p></div></div>
            {u.monitoramento.length === 0 ? <p className={fichaCompras.muted}>Ainda não conferida. A usina entra no monitoramento do dia na plataforma {u.plataforma.nome}.</p>
              : <ul className={styles.historico}>{u.monitoramento.map((m) => <li key={m.dia} data-situacao={m.situacao}>
                <span className={styles.diaDoHistorico}>{diaLegivel(m.dia)}</span>
                <span className={styles.situacaoFeita} data-situacao={m.situacao}>{ROTULO_DA_SITUACAO_DO_MONITORAMENTO[m.situacao]}</span>
                <span className={styles.textoDoHistorico}>{m.nota ?? ""}{m.ordem ? <> · <Link href={hrefDasOrdens({ visao: "cards" }, m.ordem.id)}>{m.ordem.codigo}</Link></> : null}<small>{horarioEmManaus(m.conferido.em)}{m.conferido.por ? ` · ${m.conferido.por.nome}` : ""}</small></span>
              </li>)}</ul>}
          </div> : null}
          {aba === "os" ? <div className={fichaCompras.secao}>
            <div className={fichaCompras.barra}><div><h3>O.S. da usina</h3><p>As mais recentes primeiro.</p></div></div>
            {u.ordens.length === 0 ? <p className={fichaCompras.muted}>Nenhuma O.S. desta usina.</p>
              : <ul className={styles.historico}>{u.ordens.map((o) => <li key={o.id}>
                <span className={styles.diaDoHistorico}><Link href={hrefDasOrdens({ visao: "cards" }, o.id)}>{o.codigo}</Link></span>
                <span className={styles.situacaoFeita}>{ROTULO_DA_SITUACAO[o.situacao as keyof typeof ROTULO_DA_SITUACAO] ?? o.situacao}</span>
                <span className={styles.textoDoHistorico}>{ROTULO_DO_TIPO[o.tipo as keyof typeof ROTULO_DO_TIPO] ?? o.tipo} · {o.descricao}<small>aberta em {dataEmManaus(o.createdAt)}</small></span>
              </li>)}</ul>}
          </div> : null}
          {aba === "protocolos" ? <div className={fichaCompras.secao}>
            <div className={fichaCompras.barra}><div><h3>Protocolos da UC {u.uc.codigo}</h3><p>Pedidos à distribuidora: ligação, liberação, orçamento de conexão.</p></div></div>
            <p className={fichaCompras.muted}>Os protocolos da UC aparecem aqui quando a tela de Protocolos chegar.</p>
          </div> : null}
        </section>
        {pode("abrir_os") ? <footer className={`${fichaCompras.rodape} ${styles.rodapeDaFicha}`}>
          <span className={fichaCompras.espaco} />
          <Button icon={<Plus size={15} />} onClick={() => setJanela("os")}>Abrir O.S.</Button>
        </footer> : null}
      </div>
    </div>
  </Modal>
  {janela === "editar" ? <UsinaForm usina={u} plataformas={plataformas} hoje={hoje} aoCancelar={() => setJanela(null)}
    aoSalvar={(nova) => { setJanela(null); setU(nova); aoAtualizar("Usina atualizada."); }} /> : null}
  {janela === "os" ? <OrdemForm hoje={hoje} prazoSugerido={prazoSugerido} usinaInicial={{ id: u.id, nome: u.nome, empresa: u.empresa, cliente: u.cliente, uc: u.uc }} aoCancelar={() => setJanela(null)}
    aoSalvar={(o) => { setJanela(null); aoAtualizar(`${o.codigo} aberta para ${u.nome}.`, o.id); }} /> : null}
  </>;
}
