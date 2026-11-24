"use client";

import { protocoloEncerrado, type OpcoesDosProtocolosResposta, type Protocolo, type SituacaoDoProtocolo } from "@plugga/shared";
import { CalendarClock, Check, CheckCircle2, CircleAlert, FileCheck, History, LayoutGrid, Pencil, Plus, TriangleAlert, UserRound, X, type LucideIcon } from "lucide-react";
import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { enviar } from "../../lib/clientes";
import { dataEmManaus, diaLegivel, ROTULO_DA_EMPRESA } from "../../lib/compras";
import { horaEmManaus } from "../../lib/ficha-do-pedido";
import { eventosPorDia } from "../../lib/ordens-de-servico";
import {
  corpoDaVerificacao,
  ETAPAS_DO_PROTOCOLO,
  passoDoProtocolo,
  prazoDoProtocolo,
  problemasDaVerificacao,
  RESULTADOS_DA_VERIFICACAO,
  ROTULO_DA_SITUACAO_DO_PROTOCOLO,
  ROTULO_DO_DEPARTAMENTO_DO_PROTOCOLO,
  ROTULO_DO_RESULTADO,
  ROTULO_DO_TIPO_DE_PROTOCOLO,
  rotuloDoDesfecho,
  somarDias,
  textoDaVerificacao,
  type ProblemasDaVerificacao,
  type Verificacao,
} from "../../lib/protocolos";
import { rotuloDaUc } from "../../lib/usinas";
import fichaCompras from "../compras/ficha-do-pedido.module.css";
import { FecharModal, Modal } from "../modal";
import detalhes from "../pipelines/detalhes-do-lead-modal.module.css";
import historico from "../pipelines/historico-do-lead.module.css";
import visao from "../pipelines/resumo-do-lead.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, DatePicker, TextField } from "../ui";
import styles from "./ficha-da-ordem.module.css";
import { ProtocoloForm } from "./protocolo-form";

type Aba = "geral" | "verificacoes";
const ICONE_DO_RESULTADO: Record<SituacaoDoProtocolo, LucideIcon> = {
  aberto: Plus, em_analise: History, com_pendencia: CircleAlert, respondido: CheckCircle2, liberado: CheckCircle2, indeferido: X,
};
const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

function Destaque({ icone: Icone, titulo, tom, children }: { icone: LucideIcon; titulo: string; tom?: "perigo" | "ok"; children: ReactNode }) {
  return <section className={`${visao.destaque} ${fichaCompras.acao} ${tom === "perigo" ? fichaCompras.acaoPerigo : tom === "ok" ? fichaCompras.acaoOk : ""}`} aria-label={titulo}>
    <h3><Icone size={15} aria-hidden="true" />{titulo}</h3>
    {children}
  </section>;
}

function Trilha({ situacao }: { situacao: SituacaoDoProtocolo }) {
  const atual = passoDoProtocolo(situacao);
  const fim = protocoloEncerrado(situacao);
  const rotulos = ["Aberto", "Em análise", rotuloDoDesfecho(situacao)];
  return <>
    <ol className={`${visao.trilha} ${fichaCompras.trilha}`} aria-label="Etapas do protocolo">
      {ETAPAS_DO_PROTOCOLO.map((etapa, i) => {
        const aqui = i === atual;
        const passou = i < atual || fim;
        return <li key={etapa} aria-current={aqui && !fim ? "step" : undefined} data-anterior={(passou && !aqui) || undefined}>
          <button type="button" disabled>
            <span className={visao.marcador} aria-hidden="true">{passou && !(aqui && !fim) ? <Check size={12} /> : i + 1}</span>
            <span>{rotulos[i]}{aqui && situacao === "com_pendencia" ? <small className={fichaCompras.nota}>com pendência</small> : null}</span>
          </button>
        </li>;
      })}
    </ol>
    <div className={fichaCompras.trilhaCompacta}>
      <p><strong>{atual + 1} de 3</strong> · {ROTULO_DA_SITUACAO_DO_PROTOCOLO[situacao]}</p>
      <div className={fichaCompras.passoBarra} role="progressbar" aria-label="Etapas do protocolo" aria-valuemin={0} aria-valuemax={3} aria-valuenow={atual + 1}>
        <span style={{ width: `${((atual + 1) / 3) * 100}%` }} />
      </div>
    </div>
  </>;
}

/**
 * Ficha do protocolo (PLU-348): a situação com a trilha, a pendência, a verificação
 * (o resultado vira a nova situação e a próxima verificação, o lembrete), os dados
 * e o histórico das verificações por dia. Editar e verificar seguem `acoesPermitidas`.
 */
export function FichaDoProtocolo({ protocolo: inicial, opcoes, hoje, aoFechar, aoAtualizar }: {
  protocolo: Protocolo;
  opcoes: OpcoesDosProtocolosResposta | null;
  hoje: string;
  aoFechar: () => void;
  aoAtualizar: () => void;
}) {
  const id = useId();
  const [p, setP] = useState(inicial);
  const [aba, setAba] = useState<Aba>("geral");
  const [editando, setEditando] = useState(false);
  const vazia = (situacao: SituacaoDoProtocolo): Verificacao => ({ situacao: situacao === "aberto" ? "em_analise" : situacao, nota: "", acaoPendente: "", proximaVerificacao: somarDias(hoje, 3) });
  const [v, setV] = useState<Verificacao>(() => vazia(inicial.situacao));
  const [erros, setErros] = useState<ProblemasDaVerificacao>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const pode = (a: Protocolo["acoesPermitidas"][number]) => p.acoesPermitidas.includes(a);
  const encerrado = protocoloEncerrado(p.situacao);
  const verifica = !encerrado && pode("verificar");
  const fecha = protocoloEncerrado(v.situacao);
  const prazo = prazoDoProtocolo(p);

  const abas: { id: Aba; titulo: string; curto: string; conta?: number; icone: LucideIcon }[] = [
    { id: "geral", titulo: "Visão geral", curto: "Geral", icone: LayoutGrid },
    { id: "verificacoes", titulo: "Verificações", curto: "Histórico", conta: p.historico.length, icone: History },
  ];
  function navegar(evento: KeyboardEvent<HTMLDivElement>) {
    const i = abas.findIndex((a) => a.id === aba);
    const j = evento.key === "ArrowRight" ? (i + 1) % abas.length : evento.key === "ArrowLeft" ? (i - 1 + abas.length) % abas.length : evento.key === "Home" ? 0 : evento.key === "End" ? abas.length - 1 : null;
    if (j === null) return;
    evento.preventDefault(); setAba(abas[j]!.id); botoes.current[j]?.focus();
  }
  const mudar = (parcial: Partial<Verificacao>) => {
    setV((x) => ({ ...x, ...parcial }));
    setErros((e) => { const n = { ...e }; for (const k of Object.keys(parcial)) delete n[k as keyof Verificacao]; return n; });
  };

  async function verificar(evento?: FormEvent) {
    evento?.preventDefault();
    if (aba !== "geral") { setAba("geral"); return; }
    const problemas = problemasDaVerificacao(v, hoje);
    setErros(problemas);
    if (Object.values(problemas).some(Boolean)) return;
    setEnviando(true); setFalha(null);
    const r = await enviar<Protocolo>(`/api/protocolos/${p.id}/verificacoes`, "POST", corpoDaVerificacao(v));
    setEnviando(false);
    if (!r.ok) { setErros(r.erro.porCampo); setFalha(r.erro.mensagem); return; }
    setP(r.dados);
    setAviso(protocoloEncerrado(r.dados.situacao) ? `Protocolo ${r.dados.numero} encerrado: ${ROTULO_DA_SITUACAO_DO_PROTOCOLO[r.dados.situacao].toLowerCase()}.`
      : `Verificação registrada. Próxima: ${diaLegivel(r.dados.proximaVerificacao ?? v.proximaVerificacao)}.`);
    setV(vazia(r.dados.situacao));
    aoAtualizar();
  }

  const titulo = `${ROTULO_DO_TIPO_DE_PROTOCOLO[p.tipo]} · ${p.cliente.nome}`;
  const eventos = [
    ...p.historico.map((h) => ({ id: h.id, em: h.verificado.em, por: h.verificado.por, situacao: h.situacao, texto: `verificou: ${ROTULO_DA_SITUACAO_DO_PROTOCOLO[h.situacao].toLowerCase()}`, h })),
    { id: "criado", em: p.criado.em, por: p.criado.por, situacao: "aberto" as const, texto: `registrou o protocolo ${p.numero}`, h: null },
  ];
  const dias = eventosPorDia(eventos, hoje);

  return <><Modal rotulo={`Protocolo ${p.numero}: ${titulo}`} aoFechar={aoFechar} largura="larga" className={detalhes.modal}>
    <div className={detalhes.layout}>
      <header className={`${detalhes.cabecalhoLead} plg-parte`}>
        <div className={detalhes.identidadeCabecalho}><div className={detalhes.leadCardLinhaSuperior}>
          <div className={detalhes.iconeLead} aria-hidden="true"><FileCheck size={20} /></div>
          <div className={detalhes.identidadeLead}>
            <h2 className={detalhes.leadCardTitulo}>{titulo}</h2>
            <div className={detalhes.metadadosCabecalho}>
              <span>{p.numero}</span><span aria-hidden="true">·</span>
              <span className={fichaCompras.empresaCabecalho}><EmpresaComPonto empresa={p.empresa} /></span><span aria-hidden="true">·</span>
              <span>{rotuloDaUc(p.uc.codigo)}</span><span aria-hidden="true">·</span>
              <span>{ROTULO_DO_DEPARTAMENTO_DO_PROTOCOLO[p.departamento]}</span>
            </div>
          </div>
        </div></div>
        <div className={detalhes.controlesCabecalho}>
          {pode("editar") && opcoes ? <Button variant="secondary" size="sm" icon={<Pencil size={14} />} disabled={enviando} onClick={() => setEditando(true)}>Editar</Button> : null}
          <FecharModal>{(fechar) => <button type="button" className={`${detalhes.botaoFechar} plg-pressiona`} disabled={enviando} onClick={fechar} aria-label="Fechar"><X size={18} aria-hidden="true" /></button>}</FecharModal>
        </div>
      </header>
      <div className={detalhes.painelPrincipal}>
        <div className={`${detalhes.navegacao} ${fichaCompras.abas} plg-parte`} role="tablist" aria-label="Seções do protocolo" onKeyDown={navegar}>
          {abas.map((a, i) => <div key={a.id}>
            <button ref={(el) => { botoes.current[i] = el; }} type="button" role="tab" id={`${id}-${a.id}`} aria-selected={aba === a.id} aria-controls={`${id}-painel`}
              aria-label={a.conta !== undefined ? `${a.titulo} ${a.conta}` : a.titulo} tabIndex={aba === a.id ? 0 : -1} className={detalhes.abaBotao} onClick={() => setAba(a.id)}>
              <a.icone size={15} aria-hidden="true" /><span><span className={fichaCompras.abaLonga}>{a.titulo}</span><span className={fichaCompras.abaCurta} aria-hidden="true">{a.curto}</span>{a.conta !== undefined ? <span className={fichaCompras.contaAba}> {a.conta}</span> : null}</span>
            </button>
          </div>)}
        </div>
        <section id={`${id}-painel`} role="tabpanel" aria-labelledby={`${id}-${aba}`} className={`${detalhes.conteudo} ${fichaCompras.painel} plg-parte`}>
          {aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null}
          {aba === "geral" ? <div className={visao.resumo}>
            <section aria-label="Situação do protocolo" className={visao.indicadores}>
              <header className={visao.identidade}>
                <span className={visao.iconeNegocio} aria-hidden="true"><FileCheck size={18} /></span>
                <div className={visao.identidadeTexto}>
                  <p className={visao.muted}>{p.numero} · {p.distribuidora.nome}</p>
                  <span className={visao.etapaAtual}>{ROTULO_DA_SITUACAO_DO_PROTOCOLO[p.situacao]}</span>
                </div>
                <div className={`${visao.valor} ${fichaCompras.valorDoPedido}`}>
                  <span>{encerrado ? "Sem lembrete" : textoDaVerificacao(p, hoje).replace(/^v/, "V")}</span>
                  <small className={prazo.tom === "perigo" ? fichaCompras.prazoVencido : undefined}>limite {diaLegivel(p.dataLimite)}{encerrado ? "" : ` · ${prazo.texto}`}</small>
                </div>
              </header>
              <Trilha situacao={p.situacao} />
            </section>

            {p.situacao === "com_pendencia" && p.acaoPendente ? <Destaque icone={TriangleAlert} titulo="Pendência da distribuidora"><p>{p.acaoPendente}</p></Destaque> : null}
            {encerrado ? <Destaque icone={CheckCircle2} titulo={`Protocolo ${ROTULO_DA_SITUACAO_DO_PROTOCOLO[p.situacao].toLowerCase()}`} tom={p.situacao === "indeferido" ? "perigo" : "ok"}>
              <p>{p.ultimaVerificacao ? `Encerrado em ${dataEmManaus(p.ultimaVerificacao.em)}${p.ultimaVerificacao.por ? ` por ${p.ultimaVerificacao.por.nome}` : ""}.` : "Encerrado."} Encerrado não tem próxima verificação.</p>
            </Destaque> : null}

            {verifica ? <Destaque icone={CalendarClock} titulo="Registrar verificação">
              <p>O que a distribuidora mostrou hoje. A próxima verificação vira o lembrete.</p>
              <form id={`${id}-verificar`} className={styles.camposDoAgendamento} onSubmit={verificar} noValidate>
                {falha ? <div className={styles.largo}><Alert tone="danger" title={`Erro: ${falha}`} /></div> : null}
                <CampoDeMenu label="Resultado" required icon={<History />} value={v.situacao} onChange={(x) => mudar({ situacao: x as SituacaoDoProtocolo, ...(x === "com_pendencia" ? {} : { acaoPendente: "" }) })} disabled={enviando}
                  options={RESULTADOS_DA_VERIFICACAO.map((s) => { const Icone = ICONE_DO_RESULTADO[s]; return { value: s, label: ROTULO_DO_RESULTADO[s], icon: <Icone /> }; })} />
                {fecha ? null : <DatePicker label="Próxima verificação" required min={hoje} value={v.proximaVerificacao} onChange={(x) => mudar({ proximaVerificacao: x })} error={erros.proximaVerificacao} disabled={enviando} />}
                {v.situacao === "com_pendencia" ? <TextField label="O que precisa ser feito" required maxLength={500} value={v.acaoPendente} onChange={(e) => mudar({ acaoPendente: e.target.value })} error={erros.acaoPendente}
                  placeholder="Ex.: reenviar o diagrama unifilar assinado" disabled={enviando} /> : null}
                <TextField label="Nota" maxLength={2000} value={v.nota} onChange={(e) => mudar({ nota: e.target.value })} error={erros.nota} placeholder="Ex.: ainda em análise técnica" disabled={enviando} />
              </form>
            </Destaque> : null}

            <section aria-label="Dados do protocolo">
              <dl className={visao.grade}>
                <div><dt>Empresa</dt><dd>{ROTULO_DA_EMPRESA[p.empresa]}</dd></div>
                <div><dt>Departamento</dt><dd>{ROTULO_DO_DEPARTAMENTO_DO_PROTOCOLO[p.departamento]}</dd></div>
                <div><dt>Cliente</dt><dd>{p.cliente.nome}</dd></div>
                <div><dt>Unidade consumidora</dt><dd>{rotuloDaUc(p.uc.codigo)}</dd></div>
                <div><dt>Distribuidora</dt><dd>{p.distribuidora.nome}</dd></div>
                <div><dt>Tipo</dt><dd>{ROTULO_DO_TIPO_DE_PROTOCOLO[p.tipo]}</dd></div>
                <div><dt>Aberto em</dt><dd>{diaLegivel(p.abertoEm)}</dd></div>
                <div><dt>Data-limite</dt><dd>{diaLegivel(p.dataLimite)}{encerrado ? null : <small className={prazo.tom === "perigo" ? fichaCompras.prazoVencido : undefined}>{prazo.texto}</small>}</dd></div>
                <div><dt>Registrado</dt><dd>{dataEmManaus(p.criado.em)}{p.criado.por ? <small>por {p.criado.por.nome}</small> : null}</dd></div>
                {p.ultimaVerificacao ? <div><dt>Última verificação</dt><dd>{dataEmManaus(p.ultimaVerificacao.em)}{p.ultimaVerificacao.por ? <small>por {p.ultimaVerificacao.por.nome}</small> : null}</dd></div> : null}
              </dl>
            </section>
            {p.observacao ? <section className={visao.secao} aria-label="Observação"><h3>Observação</h3><p className={visao.notas}>{p.observacao}</p></section> : null}
          </div> : null}

          {aba === "verificacoes" ? <div className={fichaCompras.secao}>
            <div className={fichaCompras.barra}><div><h3>Verificações</h3><p>Cada consulta à distribuidora, agrupada por dia, no lugar de uma tarefa por verificação.</p></div></div>
            <section className={historico.historico} aria-label="Verificações do protocolo">
              {dias.map((grupo) => <section key={grupo.dia} className={historico.historicoDia} aria-label={grupo.rotulo}>
                <h3 className={historico.historicoData}>{grupo.rotulo}</h3>
                <ol className={historico.historicoLista}>
                  {grupo.itens.map((e) => {
                    const Icone = ICONE_DO_RESULTADO[e.situacao];
                    const detalhe = e.h ? [e.h.acaoPendente ? `Pendência: ${e.h.acaoPendente}` : null, e.h.nota, e.h.proximaVerificacao ? `Próxima verificação: ${diaLegivel(e.h.proximaVerificacao)}` : null].filter(Boolean).join(" · ") : null;
                    return <li key={e.id} className={historico.historicoEvento}>
                      <span className={historico.historicoIcone} aria-hidden="true"><Icone size={16} /></span>
                      <time className={historico.historicoHora} dateTime={e.em}>{horaEmManaus(e.em)}</time>
                      <div className={historico.historicoConteudo}>
                        <div className={historico.historicoLinha}>
                          <span className={historico.historicoAvatar} aria-hidden="true">{e.por ? iniciais(e.por.nome) : <UserRound size={13} />}</span>
                          <p>{e.por ? <><strong>{e.por.nome}</strong> · {e.texto}</> : e.texto}</p>
                        </div>
                        {detalhe ? <div className={`${historico.historicoDetalhe} ${historico.historicoAnotacao}`}>{detalhe}</div> : null}
                      </div>
                    </li>;
                  })}
                </ol>
              </section>)}
            </section>
          </div> : null}
        </section>
        {verifica ? <footer className={`${fichaCompras.rodape} ${styles.rodape}`}>
          <span className={fichaCompras.espaco} />
          <Button icon={<Check size={15} />} disabled={enviando} onClick={() => void verificar()}>{enviando ? "Registrando…" : "Registrar verificação"}</Button>
        </footer> : null}
      </div>
    </div>
  </Modal>
  {editando && opcoes ? <ProtocoloForm protocolo={p} opcoes={opcoes} hoje={hoje} aoCancelar={() => setEditando(false)}
    aoSalvar={(novo) => { setEditando(false); setP(novo); setAviso("Protocolo atualizado."); aoAtualizar(); }} /> : null}
  </>;
}
