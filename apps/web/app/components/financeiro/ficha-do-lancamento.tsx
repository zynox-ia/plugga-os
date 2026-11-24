"use client";

import { rotulosDaEtapaDeLancamento, type AcaoDoLancamento, type EventoDoLancamento, type Lancamento, type OpcoesDoFinanceiro, type TipoDeAnexo } from "@plugga/shared";
import {
  ArrowDownLeft,
  Ban,
  Barcode,
  Check,
  CheckCircle2,
  Clock,
  FilePlus2,
  FileText,
  History,
  LayoutGrid,
  Link2,
  MessageSquare,
  Paperclip,
  Pencil,
  Send,
  Upload,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { enviar } from "../../lib/clientes";
import { dataEmManaus, diaLegivel, hojeEmManaus, numeroDoPedido, ROTULO_DA_EMPRESA, ROTA_COMPRAS, valorEmReais } from "../../lib/compras";
import { competenciaLegivel, prazoDoLancamento } from "../../lib/financeiro";
import { acaoPrincipal, eventosPorDia, resumoDaTrilhaDoLancamento, ROTULO_DA_FORMA, ROTULO_DO_ANEXO, trilhaDoLancamento } from "../../lib/ficha-do-lancamento";
import { horaEmManaus } from "../../lib/ficha-do-pedido";
import estilosFicha from "../compras/ficha-do-pedido.module.css";
import { FecharModal, Modal } from "../modal";
import detalhes from "../pipelines/detalhes-do-lead-modal.module.css";
import historico from "../pipelines/historico-do-lead.module.css";
import visao from "../pipelines/resumo-do-lead.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Alert, Button, Dialog, TextareaField } from "../ui";
import { AcaoDaEtapaDoLancamento, CorrigirValor, RegistrarNf, RegistrarRecebimento } from "./acoes-do-lancamento";
import { AnexarArquivo, AnexosDoLancamento, enviarAnexo } from "./anexos-do-lancamento";
import { ContaAPagarForm } from "./conta-a-pagar-form";
import styles from "./ficha.module.css";
import { ICONE_DA_NATUREZA, rotuloDoTipo, SetaDoTipo } from "./partes";

type Aba = "geral" | "anexos" | "tempo";

// "omie" sai do contrato com a extinção da integração (24/11/2026); a API já não manda esse evento.
type TipoDoEvento = Exclude<EventoDoLancamento["tipo"], "omie">;
const ICONE_DO_EVENTO: Record<TipoDoEvento, LucideIcon> = {
  criado: FilePlus2, editado: Pencil, aprovado: CheckCircle2, valor_corrigido: Pencil, nf_registrada: FileText, boleto_registrado: Barcode,
  enviado: Send, cobranca_registrada: MessageSquare, pago: Wallet, recebido: ArrowDownLeft, conciliado: Link2, cancelado: Ban,
  anexo_enviado: Paperclip, anexo_substituido: Upload,
};

const AVISO_DA_ACAO: Record<AcaoDoLancamento["acao"], string> = {
  aprovar: "Conta aprovada: segue para o pagamento.",
  cancelar: "Lançamento cancelado.",
  corrigir_valor: "Valor corrigido; o motivo ficou na linha do tempo.",
  registrar_nf: "NF registrada: falta anexar o boleto.",
  registrar_boleto: "Boleto registrado: falta enviar ao cliente.",
  registrar_envio: "Envio registrado: agora é aguardar o pagamento.",
  registrar_cobranca: "Cobrança registrada na linha do tempo.",
  registrar_pagamento: "Pagamento registrado com o comprovante.",
  registrar_recebimento: "Recebimento registrado.",
};

type Janela = null | "editar" | "cancelar" | "nf" | "receber" | "corrigir" | { anexar: TipoDeAnexo | null };

const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

/**
 * Ficha do lançamento (PLU-336/337): o cabeçalho e as abas da ficha do pedido de
 * compra, guiada pelas ações que a API permite agora (`acoesPermitidas`). As
 * ações de pagamento, NF, boleto e recebimento aparecem quando a API as liga.
 */
export function FichaDoLancamento({ lancamento: inicial, opcoes, gerente, aoFechar, aoAtualizar }: {
  lancamento: Lancamento;
  /** Nulas quando a leitura falhou: a ficha abre, sem Editar. */
  opcoes: OpcoesDoFinanceiro | null;
  gerente: boolean;
  aoFechar: () => void;
  aoAtualizar: () => void;
}) {
  const id = useId();
  const [l, setL] = useState(inicial);
  const [aba, setAba] = useState<Aba>("geral");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [janela, setJanela] = useState<Janela>(null);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const hoje = hojeEmManaus();

  // O servidor recarrega a ficha depois de cada ação (router.refresh); a versão mais nova vence.
  useEffect(() => { setL((atual) => (inicial.updatedAt > atual.updatedAt ? inicial : atual)); }, [inicial]);

  function atualizado(novo: Lancamento, mensagem: string | null) {
    setL(novo); setErro(null); setAviso(mensagem); aoAtualizar();
  }

  async function recarregar(): Promise<boolean> {
    const r = await enviar<Lancamento>(`/api/financeiro/lancamentos/${l.id}`, "GET");
    if (!r.ok) return false;
    setL(r.dados);
    return r.dados.etapa !== l.etapa || r.dados.cancelado !== l.cancelado;
  }

  async function agir(acao: AcaoDoLancamento): Promise<boolean> {
    setOcupado(true); setErro(null); setAviso(null);
    const r = await enviar<Lancamento>(`/api/financeiro/lancamentos/${l.id}/acoes`, "POST", acao);
    setOcupado(false);
    if (r.ok) { atualizado(r.dados, AVISO_DA_ACAO[acao.acao]); return true; }
    if (r.erro.codigo === "CONFLITO_ESTADO") {
      // O conflito com campo ("Anexe o comprovante antes de pagar.") diz o que falta; sem campo, a mensagem geral.
      const motivo = Object.values(r.erro.porCampo)[0] ?? r.erro.mensagem;
      const mudou = await recarregar();
      setErro(mudou ? `${motivo} O lançamento mudou enquanto a ficha estava aberta: ela foi atualizada.` : motivo);
      return false;
    }
    setErro(Object.values(r.erro.porCampo)[0] ? `${r.erro.mensagem} ${Object.values(r.erro.porCampo).join(" ")}` : r.erro.mensagem);
    return false;
  }

  /** Anexa e mantém a ficha aberta; devolve o problema para o diálogo mostrar, ou nulo. */
  async function anexar(tipo: TipoDeAnexo, arquivo: File): Promise<string | null> {
    setOcupado(true); setErro(null); setAviso(null);
    const r = await enviarAnexo(l.id, tipo, arquivo);
    setOcupado(false);
    if (!r.ok) return Object.values(r.erro.porCampo)[0] ?? r.erro.mensagem;
    const substituiu = l.arquivos.some((a) => a.tipo === tipo && tipo !== "documento" && !a.substituido);
    atualizado(r.dados, `${ROTULO_DO_ANEXO[tipo]} ${substituiu ? "substituído: o anterior ficou nas versões anteriores" : "anexado"}.`);
    if (typeof janela === "object") setJanela(null);
    return null;
  }

  const abas: { id: Aba; titulo: string; curto: string; conta?: number; icone: LucideIcon }[] = [
    { id: "geral", titulo: "Visão geral", curto: "Geral", icone: LayoutGrid },
    { id: "anexos", titulo: "Anexos", curto: "Anexos", conta: l.anexos, icone: Paperclip },
    { id: "tempo", titulo: "Linha do tempo", curto: "Histórico", icone: History },
  ];
  function navegar(evento: KeyboardEvent<HTMLDivElement>) {
    const i = abas.findIndex((a) => a.id === aba);
    const j = evento.key === "ArrowRight" ? (i + 1) % abas.length : evento.key === "ArrowLeft" ? (i - 1 + abas.length) % abas.length : evento.key === "Home" ? 0 : evento.key === "End" ? abas.length - 1 : null;
    if (j === null) return;
    evento.preventDefault(); setAba(abas[j]!.id); botoes.current[j]?.focus();
  }

  const Icone = ICONE_DA_NATUREZA[l.categoria?.natureza ?? "outros"];
  return <Modal rotulo={`${l.codigo}: ${l.descricao}`} aoFechar={aoFechar} largura="larga" className={detalhes.modal}>
    <div className={detalhes.layout}>
      <header className={`${detalhes.cabecalhoLead} plg-parte`}>
        <div className={detalhes.identidadeCabecalho}>
          <div className={detalhes.leadCardLinhaSuperior}>
            <div className={detalhes.iconeLead} aria-hidden="true"><Icone size={20} /></div>
            <div className={detalhes.identidadeLead}>
              <h2 className={detalhes.leadCardTitulo}>{l.descricao}</h2>
              <div className={detalhes.metadadosCabecalho}>
                <span>{l.codigo}</span><span aria-hidden="true">·</span>
                <span><SetaDoTipo tipo={l.tipo} tamanho={13} />{rotuloDoTipo(l.tipo)}</span><span aria-hidden="true">·</span>
                <span className={estilosFicha.empresaCabecalho}><EmpresaComPonto empresa={l.empresa} curto /></span><span aria-hidden="true">·</span>
                <span><UserRound size={13} aria-hidden="true" />{l.favorecido.nome}</span>
              </div>
            </div>
          </div>
        </div>
        <div className={detalhes.controlesCabecalho}>
          {l.podeEditar && l.tipo === "saida" && opcoes ? <Button variant="secondary" size="sm" icon={<Pencil size={14} />} disabled={ocupado} onClick={() => setJanela("editar")}>Editar</Button> : null}
          <FecharModal>{(fechar) => <button type="button" className={`${detalhes.botaoFechar} plg-pressiona`} disabled={ocupado} onClick={fechar} aria-label="Fechar"><X size={18} aria-hidden="true" /></button>}</FecharModal>
        </div>
      </header>
      <div className={detalhes.painelPrincipal}>
        <div className={`${detalhes.navegacao} plg-parte`} role="tablist" aria-label="Seções do lançamento" aria-orientation="horizontal" onKeyDown={navegar}>
          {abas.map((a, i) => <div key={a.id}>
            <button ref={(el) => { botoes.current[i] = el; }} type="button" role="tab" id={`${id}-${a.id}`} aria-selected={aba === a.id} aria-controls={`${id}-painel`} aria-label={a.conta !== undefined ? `${a.titulo} ${a.conta}` : a.titulo} tabIndex={aba === a.id ? 0 : -1} className={detalhes.abaBotao} onClick={() => setAba(a.id)}>
              <a.icone size={15} aria-hidden="true" /><span><span className={estilosFicha.abaLonga}>{a.titulo}</span><span className={estilosFicha.abaCurta} aria-hidden="true">{a.curto}</span>{a.conta !== undefined ? <span className={estilosFicha.contaAba}> {a.conta}</span> : null}</span>
            </button>
          </div>)}
        </div>
        <section id={`${id}-painel`} role="tabpanel" aria-labelledby={`${id}-${aba}`} className={`${detalhes.conteudo} ${estilosFicha.painel} plg-parte`} aria-busy={ocupado}>
          {erro || aviso ? <div className={estilosFicha.avisos}>
            {erro ? <p role="alert" className="aviso aviso--erro">{erro}</p> : null}
            {aviso ? <p role="status" className="aviso aviso--sucesso">{aviso}</p> : null}
          </div> : null}
          {aba === "geral" ? <VisaoGeralDoLancamento l={l} opcoes={opcoes} hoje={hoje} ocupado={ocupado} aoAgir={agir} aoAnexar={anexar} aoAbrir={setJanela} /> : null}
          {aba === "anexos" ? <AnexosDoLancamento l={l} ocupado={ocupado} aoAnexar={(tipo) => setJanela({ anexar: tipo })} /> : null}
          {aba === "tempo" ? <LinhaDoTempoDoLancamento l={l} hoje={hoje} /> : null}
        </section>
      </div>
    </div>
    {janela === "editar" && opcoes ? <ContaAPagarForm opcoes={opcoes} lancamento={l} gerente={gerente} aoCancelar={() => setJanela(null)} aoSalvar={(novo) => { setJanela(null); atualizado(novo, "Conta atualizada."); }} /> : null}
    {janela === "cancelar" ? <MotivoDoCancelamento codigo={l.codigo} aoVoltar={() => setJanela(null)}
      aoConfirmar={async (motivo) => { const ok = await agir({ acao: "cancelar", motivo }); if (ok) setJanela(null); return ok; }} /> : null}
    {janela === "nf" ? <RegistrarNf l={l} aoVoltar={() => setJanela(null)} aoAgir={agir} aoAnexar={anexar} /> : null}
    {janela === "receber" ? <RegistrarRecebimento l={l} opcoes={opcoes} hoje={hoje} aoVoltar={() => setJanela(null)} aoAgir={agir} aoAnexar={anexar} /> : null}
    {janela === "corrigir" ? <CorrigirValor l={l} aoVoltar={() => setJanela(null)} aoAgir={agir} aoAnexar={anexar} /> : null}
    {janela !== null && typeof janela === "object" ? <AnexarArquivo l={l} tipoInicial={janela.anexar} aoVoltar={() => setJanela(null)} aoEnviar={anexar} /> : null}
  </Modal>;
}

function Trilha({ l }: { l: Lancamento }) {
  const passos = trilhaDoLancamento(l);
  const r = resumoDaTrilhaDoLancamento(l);
  return <>
    <ol className={`${visao.trilha} ${estilosFicha.trilha}`} aria-label={`Etapas da ${l.tipo === "saida" ? "conta a pagar" : "cobrança"}`}>
      {passos.map((p, i) => <li key={p.etapa} aria-current={p.estado === "atual" ? "step" : undefined} data-anterior={p.estado === "feito" || undefined} data-cancelada={p.estado === "cancelado" || undefined}>
        <button type="button" disabled>
          <span className={visao.marcador} aria-hidden="true">{p.estado === "cancelado" ? <X size={12} /> : p.estado === "feito" ? <Check size={12} /> : i + 1}</span>
          <span>{p.rotulo}{p.estado === "cancelado" ? <small className={`${estilosFicha.nota} ${estilosFicha.notaPerigo}`}>cancelada aqui</small> : null}</span>
        </button>
      </li>)}
    </ol>
    {/* A 390 px a trilha vira "2 de 4 · Aprovada". */}
    <div className={estilosFicha.trilhaCompacta}>
      <p><strong>{r.posicao} de {r.total}</strong> · {r.atual}</p>
      <div className={estilosFicha.passoBarra} role="progressbar" aria-label="Etapas do lançamento" aria-valuemin={0} aria-valuemax={r.total} aria-valuenow={r.posicao} aria-valuetext={`${r.posicao} de ${r.total}: ${r.atual}`}>
        <span style={{ width: `${(r.posicao / r.total) * 100}%` }} />
      </div>
      {r.proxima ? <p className={estilosFicha.muted}>Próxima: {r.proxima}</p> : null}
    </div>
  </>;
}

function VisaoGeralDoLancamento({ l, opcoes, hoje, ocupado, aoAgir, aoAnexar, aoAbrir }: {
  l: Lancamento; opcoes: OpcoesDoFinanceiro | null; hoje: string; ocupado: boolean;
  aoAgir: (acao: AcaoDoLancamento) => Promise<boolean>; aoAnexar: (tipo: TipoDeAnexo, arquivo: File) => Promise<string | null>;
  aoAbrir: (janela: Janela) => void;
}) {
  const formId = useId();
  const pode = (a: Lancamento["acoesPermitidas"][number]) => l.acoesPermitidas.includes(a);
  const principal = acaoPrincipal(l);
  const prazo = prazoDoLancamento(l);
  // O painel vem pronto da API, na ordem do fluxo; some quando tudo está feito.
  const pendencias = l.pendencias.some((p) => !p.feito) ? l.pendencias : [];
  const feitos = pendencias.filter((p) => p.feito || p.opcional).length;
  const empresa = ROTULO_DA_EMPRESA[l.empresa];
  const etapa = l.cancelado ? "Cancelada" : rotulosDaEtapaDeLancamento[l.etapa];
  const prazoTexto = l.cancelado ? `Cancelada · vencia em ${diaLegivel(l.vencimento)}` : l.liquidadoEm ? `${l.tipo === "saida" ? "Paga" : "Recebida"} em ${diaLegivel(l.liquidadoEm)}` : `${prazo.relativo ? `${prazo.relativo[0]!.toUpperCase()}${prazo.relativo.slice(1)} · ` : ""}${diaLegivel(l.vencimento)}`;
  const cancelado = l.marcos.cancelado;

  return <div className={visao.resumo}>
    <section aria-label="Indicadores do lançamento" className={visao.indicadores}>
      <header className={visao.identidade}>
        <span className={visao.iconeNegocio} aria-hidden="true"><SetaDoTipo tipo={l.tipo} tamanho={18} /></span>
        <div className={visao.identidadeTexto}>
          <p className={visao.muted}>{l.codigo} · {l.tipo === "saida" ? "saída criada" : "entrada gerada"} em {dataEmManaus(l.marcos.criado.em)}{l.marcos.criado.por ? ` por ${l.marcos.criado.por.nome}` : ""}</p>
          <span className={visao.etapaAtual}>{etapa}</span>
        </div>
        <div className={`${visao.valor} ${estilosFicha.valorDoPedido}`}>
          <span><span className="sr-only">Valor: </span>{valorEmReais(l.valor)}</span>
          <small className={prazo.tom === "perigo" ? estilosFicha.prazoVencido : prazo.tom === "alerta" ? estilosFicha.prazoHoje : undefined}>{prazoTexto}</small>
        </div>
      </header>
      <Trilha l={l} />
    </section>

    {pendencias.length ? <section className={estilosFicha.passo} aria-label="O que falta para avançar">
      <div className={estilosFicha.passoTopo}>
        <div>
          <span className={estilosFicha.passoRotulo}>O que falta</span>
          {!l.liquidadoEm ? <p><strong className={prazo.tom === "perigo" ? estilosFicha.prazoVencido : prazo.tom === "alerta" ? estilosFicha.prazoHoje : undefined}>{prazo.relativo ? `${prazo.relativo[0]!.toUpperCase()}${prazo.relativo.slice(1)}` : "Sem prazo"}</strong><span className={estilosFicha.muted}> · {diaLegivel(l.vencimento)}</span></p> : null}
        </div>
        <span className={estilosFicha.passoQuem}><UserRound size={13} aria-hidden="true" /><span><span className="sr-only">Quem age: </span>{l.etapa === "aberta" ? "Gerente do Financeiro" : "Financeiro"}</span></span>
      </div>
      <div className={estilosFicha.passoBarra} role="progressbar" aria-label="Itens desta etapa concluídos" aria-valuemin={0} aria-valuemax={pendencias.length} aria-valuenow={feitos}>
        <span style={{ width: `${(feitos / pendencias.length) * 100}%` }} />
      </div>
      <ul className={estilosFicha.passoLista}>
        {pendencias.map((p) => <li key={p.texto} data-feito={p.feito || undefined} data-opcional={p.opcional || undefined}>
          {p.feito ? <CheckCircle2 size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
          <span><span className="sr-only">{p.feito ? "Feito: " : "Falta: "}</span>{p.texto}</span>
          {p.opcional && !p.feito ? <small>opcional</small> : null}
        </li>)}
      </ul>
    </section> : null}

    {cancelado ? <section className={`${visao.destaque} ${estilosFicha.acao} ${estilosFicha.acaoPerigo}`} aria-label="Lançamento cancelado">
      <h3><Ban size={15} aria-hidden="true" />Lançamento cancelado</h3>
      <p>Cancelado{cancelado.por ? ` por ${cancelado.por.nome}` : ""} em {dataEmManaus(cancelado.em)}, na etapa {rotulosDaEtapaDeLancamento[l.etapa]}.</p>
      <p className={estilosFicha.motivo}><strong>Motivo:</strong> {cancelado.motivo}</p>
    </section> : <AcaoDaEtapaDoLancamento l={l} opcoes={opcoes} ocupado={ocupado} hoje={hoje} formId={formId} aoAgir={aoAgir} aoAnexar={aoAnexar} />}

    <section aria-label="Dados do lançamento">
      <dl className={visao.grade}>
        <div><dt>Empresa</dt><dd>{empresa}</dd></div>
        <div><dt>{l.favorecido.tipo === "fornecedor" ? "Fornecedor" : "Cliente"}</dt><dd>{l.favorecido.nome}</dd></div>
        <div><dt>Categoria</dt><dd>{l.categoria ? <>{l.categoria.nome}<small>{l.categoria.codigo}</small></> : "Sem categoria · classificar"}</dd></div>
        <div><dt>Conta corrente</dt><dd>{l.contaCorrente?.nome ?? "Não informada"}</dd></div>
        <div><dt>Forma de pagamento</dt><dd>{l.forma ? ROTULO_DA_FORMA[l.forma] : "Não informada"}</dd></div>
        <div><dt>Vencimento</dt><dd>{diaLegivel(l.vencimento)}</dd></div>
        {l.competencia ? <div><dt>Competência</dt><dd>{competenciaLegivel(l.competencia)}</dd></div> : null}
        <div><dt>Origem</dt><dd>{l.origem.pedidoDeCompra
          ? <Link href={`${ROTA_COMPRAS}?pedido=${l.origem.pedidoDeCompra.id}`}>Pedido de compra {numeroDoPedido(l.origem.pedidoDeCompra.numero)}</Link>
          : l.origem.tipo === "agente" ? "Pedido do agente" : l.origem.tipo === "cobranca_manual" ? "Cobrança criada à mão" : "Lançada à mão"}</dd></div>
      </dl>
    </section>

    <section className={visao.secao} aria-label="Observação">
      <h3>Observação</h3>
      <p className={visao.notas}>{l.observacao || "Sem observação."}</p>
    </section>

    {!l.cancelado && (pode("cancelar") || pode("corrigir_valor") || principal || pode("registrar_recebimento")) ? <footer className={`${estilosFicha.rodape} ${styles.rodapeFixo}`}>
      {pode("cancelar") ? <Button variant="secondary" className={estilosFicha.perigo} icon={<Ban size={15} />} disabled={ocupado} onClick={() => aoAbrir("cancelar")}>{l.etapa === "aberta" ? "Recusar" : "Cancelar"}</Button> : null}
      <span className={estilosFicha.espaco} />
      {pode("corrigir_valor") ? <Button variant="secondary" icon={<Pencil size={15} />} disabled={ocupado} onClick={() => aoAbrir("corrigir")}>Corrigir valor</Button> : null}
      {/* Com o boleto gerado, o cliente pode pagar antes do envio ser registrado. */}
      {l.etapa === "boleto_gerado" && pode("registrar_recebimento") ? <Button variant="secondary" icon={<ArrowDownLeft size={15} />} disabled={ocupado} onClick={() => aoAbrir("receber")}>Lançar recebimento</Button> : null}
      {principal ? <BotaoPrincipal acao={principal.acao} rotulo={principal.rotulo} formId={formId} ocupado={ocupado} aoAgir={aoAgir} aoAbrir={aoAbrir} /> : null}
    </footer> : null}
  </div>;
}

const ICONE_DO_BOTAO: Partial<Record<AcaoDoLancamento["acao"], LucideIcon>> = {
  aprovar: Check, registrar_pagamento: Wallet, registrar_nf: FileText, registrar_boleto: Barcode, registrar_envio: Send, registrar_recebimento: ArrowDownLeft,
};

/**
 * O botão principal da etapa: aprovar age direto; pagamento, boleto e envio enviam
 * o formulário do bloco da etapa (`formId`); NF e recebimento abrem o diálogo.
 */
function BotaoPrincipal({ acao, rotulo, formId, ocupado, aoAgir, aoAbrir }: {
  acao: AcaoDoLancamento["acao"]; rotulo: string; formId: string; ocupado: boolean; aoAgir: (acao: AcaoDoLancamento) => Promise<boolean>; aoAbrir: (janela: Janela) => void;
}) {
  const Icone = ICONE_DO_BOTAO[acao] ?? Check;
  const icone = <Icone size={15} />;
  if (acao === "aprovar") return <Button icon={icone} disabled={ocupado} onClick={() => void aoAgir({ acao: "aprovar" })}>{rotulo}</Button>;
  if (acao === "registrar_nf") return <Button icon={icone} disabled={ocupado} onClick={() => aoAbrir("nf")}>{rotulo}</Button>;
  if (acao === "registrar_recebimento") return <Button icon={icone} disabled={ocupado} onClick={() => aoAbrir("receber")}>{rotulo}</Button>;
  return <Button type="submit" form={formId} icon={icone} disabled={ocupado}>{rotulo}</Button>;
}

function LinhaDoTempoDoLancamento({ l, hoje }: { l: Lancamento; hoje: string }) {
  const dias = eventosPorDia(l.linhaDoTempo, hoje);
  return <div className={estilosFicha.secao}>
    <div className={estilosFicha.barra}><div><h3>Linha do tempo</h3><p>Quem fez o quê, com data e hora de Manaus.</p></div></div>
    <section className={`${historico.historico} ${styles.linhaDoTempo}`} aria-label="Linha do tempo do lançamento">
      {dias.map((grupo) => <section key={grupo.dia} className={historico.historicoDia} aria-label={grupo.rotulo}>
        <h3 className={historico.historicoData}>{grupo.rotulo}</h3>
        <ol className={historico.historicoLista}>
          {grupo.itens.map((evento, i) => {
            const Icone = ICONE_DO_EVENTO[evento.tipo as TipoDoEvento] ?? History;
            const quem = evento.por?.nome ?? null;
            return <li key={`${evento.em}-${evento.tipo}-${i}`} className={historico.historicoEvento}>
              <span className={historico.historicoIcone} aria-hidden="true"><Icone size={16} /></span>
              <time className={historico.historicoHora} dateTime={evento.em}>{horaEmManaus(evento.em)}</time>
              <div className={historico.historicoConteudo}>
                <div className={historico.historicoLinha}>
                  <span className={historico.historicoAvatar} aria-hidden="true">{quem ? iniciais(quem) : <UserRound size={13} />}</span>
                  <p>{quem ? <><strong>{quem}</strong> · {evento.resumo}</> : evento.resumo}</p>
                </div>
                {evento.texto ? <div className={`${historico.historicoDetalhe} ${historico.historicoAnotacao}`}>{evento.texto}</div> : null}
              </div>
            </li>;
          })}
        </ol>
      </section>)}
    </section>
  </div>;
}

/** Cancelar (ou recusar a conta aberta) pede o motivo, que fica na linha do tempo. */
function MotivoDoCancelamento({ codigo, aoVoltar, aoConfirmar }: { codigo: string; aoVoltar: () => void; aoConfirmar: (motivo: string) => Promise<boolean> }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    if (!motivo.trim()) { setErro("informe o motivo do cancelamento."); return; }
    setEnviando(true); setErro(null);
    const ok = await aoConfirmar(motivo.trim());
    setEnviando(false);
    if (!ok) setErro("não foi possível cancelar. Veja o aviso na ficha.");
  }
  return <Dialog title={`Cancelar ${codigo}`} size="estreita" variant="danger" icon={<Ban size={20} />}
    description="O lançamento sai das filas e guarda a etapa em que parou. Não dá para desfazer."
    onClose={aoVoltar} cancelText="Voltar"
    footer={<Button type="submit" form="form-cancelar-lancamento" variant="danger" disabled={enviando}>{enviando ? "Cancelando…" : "Cancelar lançamento"}</Button>}>
    <form id="form-cancelar-lancamento" className="ui-dialog-form" onSubmit={confirmar} noValidate>
      {erro ? <Alert tone="danger" title={`Erro: ${erro}`} /> : null}
      <TextareaField label="Motivo" required maxLength={500} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} error={erro && !motivo.trim() ? erro : undefined} placeholder="Ex.: fatura duplicada" />
    </form>
  </Dialog>;
}
