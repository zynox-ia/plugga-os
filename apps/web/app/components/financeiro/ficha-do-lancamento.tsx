"use client";

import { rotulosDaEtapaDeLancamento, type AcaoDoLancamento, type Lancamento, type OpcoesDoFinanceiro } from "@plugga/shared";
import {
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  CloudOff,
  FilePlus2,
  History,
  LayoutGrid,
  Link2,
  Pencil,
  UserRound,
  Wallet,
  X,
  ArrowDownLeft,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { enviar } from "../../lib/clientes";
import { dataEmManaus, diaLegivel, hojeEmManaus, numeroDoPedido, ROTULO_DA_EMPRESA, ROTA_COMPRAS, valorEmReais } from "../../lib/compras";
import { competenciaLegivel, prazoDoLancamento } from "../../lib/financeiro";
import {
  eventosDoLancamento,
  eventosPorDia,
  fraseDoOmie,
  pendenciasDoLancamento,
  resumoDaTrilhaDoLancamento,
  ROTULO_DA_FORMA,
  trilhaDoLancamento,
  type IconeDoEvento,
} from "../../lib/ficha-do-lancamento";
import { horaEmManaus } from "../../lib/ficha-do-pedido";
import estilosFicha from "../compras/ficha-do-pedido.module.css";
import { FecharModal, Modal } from "../modal";
import detalhes from "../pipelines/detalhes-do-lead-modal.module.css";
import historico from "../pipelines/historico-do-lead.module.css";
import visao from "../pipelines/resumo-do-lead.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Alert, Button, Dialog, TextareaField } from "../ui";
import { ContaAPagarForm } from "./conta-a-pagar-form";
import styles from "./ficha.module.css";
import { ICONE_DA_NATUREZA, rotuloDoTipo, SetaDoTipo } from "./partes";

type Aba = "geral" | "omie" | "tempo";

const ICONE_DO_EVENTO: Record<IconeDoEvento, LucideIcon> = {
  criado: FilePlus2, aprovado: CheckCircle2, pago: Wallet, recebido: ArrowDownLeft, conciliado: Link2, cancelado: Ban,
};

const AVISO_DA_ACAO: Partial<Record<AcaoDoLancamento["acao"], string>> = {
  aprovar: "Conta aprovada: segue para o pagamento.",
  cancelar: "Lançamento cancelado.",
};

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
  const [janela, setJanela] = useState<null | "editar" | "cancelar">(null);
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
    if (r.ok) { atualizado(r.dados, AVISO_DA_ACAO[acao.acao] ?? null); return true; }
    if (r.erro.codigo === "CONFLITO_ESTADO") {
      const mudou = await recarregar();
      setErro(mudou ? `${r.erro.mensagem} O lançamento mudou enquanto a ficha estava aberta: ela foi atualizada.` : r.erro.mensagem);
      return false;
    }
    setErro(Object.values(r.erro.porCampo)[0] ? `${r.erro.mensagem} ${Object.values(r.erro.porCampo).join(" ")}` : r.erro.mensagem);
    return false;
  }

  const abas: { id: Aba; titulo: string; icone: LucideIcon }[] = [
    { id: "geral", titulo: "Visão geral", icone: LayoutGrid },
    { id: "omie", titulo: "OMIE", icone: l.omie.estado === "erro" || l.omie.estado === "divergente" ? CloudOff : Cloud },
    { id: "tempo", titulo: "Linha do tempo", icone: History },
  ];
  function navegar(evento: KeyboardEvent<HTMLDivElement>) {
    const i = abas.findIndex((a) => a.id === aba);
    const j = evento.key === "ArrowRight" ? (i + 1) % abas.length : evento.key === "ArrowLeft" ? (i - 1 + abas.length) % abas.length : evento.key === "Home" ? 0 : evento.key === "End" ? abas.length - 1 : null;
    if (j === null) return;
    evento.preventDefault(); setAba(abas[j]!.id); botoes.current[j]?.focus();
  }
  const irParaOmie = () => { setAba("omie"); botoes.current[1]?.focus(); };

  const Icone = ICONE_DA_NATUREZA[l.categoria.natureza];
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
            <button ref={(el) => { botoes.current[i] = el; }} type="button" role="tab" id={`${id}-${a.id}`} aria-selected={aba === a.id} aria-controls={`${id}-painel`} tabIndex={aba === a.id ? 0 : -1} className={detalhes.abaBotao} onClick={() => setAba(a.id)}>
              <a.icone size={15} aria-hidden="true" /><span>{a.titulo}</span>
            </button>
          </div>)}
        </div>
        <section id={`${id}-painel`} role="tabpanel" aria-labelledby={`${id}-${aba}`} className={`${detalhes.conteudo} ${estilosFicha.painel} plg-parte`} aria-busy={ocupado}>
          {erro || aviso ? <div className={estilosFicha.avisos}>
            {erro ? <p role="alert" className="aviso aviso--erro">{erro}</p> : null}
            {aviso ? <p role="status" className="aviso aviso--sucesso">{aviso}</p> : null}
          </div> : null}
          {aba === "geral" ? <VisaoGeralDoLancamento l={l} ocupado={ocupado} aoAgir={(a) => void agir(a)} aoCancelar={() => setJanela("cancelar")} aoVerOmie={irParaOmie} /> : null}
          {aba === "omie" ? <OmieDoLancamento l={l} /> : null}
          {aba === "tempo" ? <LinhaDoTempoDoLancamento l={l} hoje={hoje} /> : null}
        </section>
      </div>
    </div>
    {janela === "editar" && opcoes ? <ContaAPagarForm opcoes={opcoes} lancamento={l} gerente={gerente} aoCancelar={() => setJanela(null)} aoSalvar={(novo) => { setJanela(null); atualizado(novo, "Conta atualizada."); }} /> : null}
    {janela === "cancelar" ? <MotivoDoCancelamento codigo={l.codigo} aoVoltar={() => setJanela(null)}
      aoConfirmar={async (motivo) => { const ok = await agir({ acao: "cancelar", motivo }); if (ok) setJanela(null); return ok; }} /> : null}
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

function VisaoGeralDoLancamento({ l, ocupado, aoAgir, aoCancelar, aoVerOmie }: {
  l: Lancamento; ocupado: boolean; aoAgir: (acao: AcaoDoLancamento) => void; aoCancelar: () => void; aoVerOmie: () => void;
}) {
  const pode = (a: Lancamento["acoesPermitidas"][number]) => l.acoesPermitidas.includes(a);
  const prazo = prazoDoLancamento(l);
  const pendencias = pendenciasDoLancamento(l);
  const feitos = pendencias.filter((p) => p.feito || p.opcional).length;
  const empresa = ROTULO_DA_EMPRESA[l.empresa];
  const omie = fraseDoOmie(l, empresa);
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

    <div className={`${styles.faixaOmie} ${omie.tom === "perigo" ? styles.faixaPerigo : ""}`} role={omie.tom === "perigo" ? "alert" : undefined}>
      {omie.tom === "perigo" ? <CloudOff size={16} aria-hidden="true" /> : <Cloud size={16} aria-hidden="true" />}
      <span>{omie.texto}</span>
      <button type="button" className={styles.linkOmie} onClick={aoVerOmie}>Detalhes</button>
    </div>

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
    </section> : l.etapa === "aberta" && pode("aprovar") ? <section className={`${visao.destaque} ${estilosFicha.acao}`} aria-label="Aprovação">
      <h3><CheckCircle2 size={15} aria-hidden="true" />Aprovação</h3>
      <p>Confira e aprove. Aprovada, a conta segue para o pagamento e vai ao OMIE da {empresa}.</p>
    </section> : l.etapa === "conciliada" ? <section className={`${visao.destaque} ${estilosFicha.acao} ${estilosFicha.acaoOk}`} aria-label="Lançamento conciliado">
      <h3><CheckCircle2 size={15} aria-hidden="true" />Conciliado com o extrato</h3>
      <p>{l.marcos.conciliado ? `Conciliado em ${dataEmManaus(l.marcos.conciliado.em)}${l.marcos.conciliado.por ? ` por ${l.marcos.conciliado.por.nome}` : ""}.` : "Conciliado."}</p>
    </section> : null}

    <section aria-label="Dados do lançamento">
      <dl className={visao.grade}>
        <div><dt>Empresa</dt><dd>{empresa}</dd></div>
        <div><dt>{l.favorecido.tipo === "fornecedor" ? "Fornecedor" : "Cliente"}</dt><dd>{l.favorecido.nome}</dd></div>
        <div><dt>Categoria do OMIE</dt><dd>{l.categoria.nome}<small>{l.categoria.codigo}</small></dd></div>
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

    {!l.cancelado && (pode("cancelar") || pode("aprovar")) ? <footer className={estilosFicha.rodape}>
      {pode("cancelar") ? <Button variant="secondary" className={estilosFicha.perigo} icon={<Ban size={15} />} disabled={ocupado} onClick={aoCancelar}>{l.etapa === "aberta" ? "Recusar" : "Cancelar"}</Button> : null}
      <span className={estilosFicha.espaco} />
      {pode("aprovar") ? <Button icon={<Check size={15} />} disabled={ocupado} onClick={() => aoAgir({ acao: "aprovar" })}>Aprovar</Button> : null}
    </footer> : null}
  </div>;
}

/** O estado no OMIE da empresa, sem tela própria de integração (decisão A2). */
function OmieDoLancamento({ l }: { l: Lancamento }) {
  const empresa = ROTULO_DA_EMPRESA[l.empresa];
  const omie = fraseDoOmie(l, empresa);
  return <div className={estilosFicha.secao}>
    <div className={estilosFicha.barra}><div><h3>No OMIE da {empresa}</h3><p>O lançamento vai ao OMIE da empresa dele pelas ações do fluxo: aprovar, pagar e conciliar.</p></div></div>
    {omie.tom === "perigo" ? <Alert tone="danger" title={omie.texto} /> : <Alert tone="info" title={omie.texto} />}
    <dl className={visao.grade}>
      <div><dt>Situação</dt><dd>{{ nao_enviado: "Não enviado", enviando: "Enviando", enviado: "Enviado", erro: "Com erro", baixado: "Baixado", divergente: "Diferente do OMIE" }[l.omie.estado]}</dd></div>
      <div><dt>Código no OMIE</dt><dd>{l.omie.codigo ?? "Ainda sem código"}</dd></div>
    </dl>
  </div>;
}

function LinhaDoTempoDoLancamento({ l, hoje }: { l: Lancamento; hoje: string }) {
  const dias = eventosPorDia(eventosDoLancamento(l), hoje);
  return <div className={estilosFicha.secao}>
    <div className={estilosFicha.barra}><div><h3>Linha do tempo</h3><p>Quem fez o quê, com data e hora de Manaus.</p></div></div>
    <section className={`${historico.historico} ${styles.linhaDoTempo}`} aria-label="Linha do tempo do lançamento">
      {dias.map((grupo) => <section key={grupo.dia} className={historico.historicoDia} aria-label={grupo.rotulo}>
        <h3 className={historico.historicoData}>{grupo.rotulo}</h3>
        <ol className={historico.historicoLista}>
          {grupo.itens.map((evento) => {
            const Icone = ICONE_DO_EVENTO[evento.icone];
            return <li key={evento.chave} className={historico.historicoEvento}>
              <span className={historico.historicoIcone} aria-hidden="true"><Icone size={16} /></span>
              <time className={historico.historicoHora} dateTime={evento.em}>{horaEmManaus(evento.em)}</time>
              <div className={historico.historicoConteudo}>
                <div className={historico.historicoLinha}>
                  <span className={historico.historicoAvatar} aria-hidden="true">{evento.quem ? iniciais(evento.quem) : <UserRound size={13} />}</span>
                  <p>{evento.quem ? <><strong>{evento.quem}</strong> {evento.texto}</> : `O sistema ${evento.texto}`}</p>
                </div>
                {evento.nota ? <div className={`${historico.historicoDetalhe} ${historico.historicoAnotacao}`}>{evento.nota}</div> : null}
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
