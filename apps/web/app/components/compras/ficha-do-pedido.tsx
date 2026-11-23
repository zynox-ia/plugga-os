"use client";

import { rotulosDoDestinoDeCompra, type AcaoDoPedido, type OpcoesDeCompraResposta, type PedidoDeCompra } from "@plugga/shared";
import { Ban, Building2, HardHat, History, LayoutGrid, ListChecks, Package, Paperclip, Pencil, Undo2, UserRound, X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { enviar } from "../../lib/clientes";
import { AVISO_DA_ACAO, hojeEmManaus, numeroDoPedido, quantidadeLegivel } from "../../lib/compras";
import { FecharModal, Modal } from "../modal";
import { Avatar } from "../pipelines/icones";
import detalhes from "../pipelines/detalhes-do-lead-modal.module.css";
import { Alert, Button, Dialog, TextareaField } from "../ui";
import { CotacoesDoPedido } from "./cotacoes-do-pedido";
import styles from "./ficha-do-pedido.module.css";
import { LinhaDoTempoDoPedido } from "./linha-do-tempo-do-pedido";
import { enviarComArquivo, NovaCotacao, problemaDoArquivo } from "./nova-cotacao";
import { NovoPedido } from "./novo-pedido";
import { EmpresaDoPedido } from "./quadro-de-compras";
import { VisaoGeralDoPedido } from "./visao-geral-do-pedido";

type Aba = "geral" | "itens" | "cotacoes" | "tempo";
const ICONE_DO_DESTINO = { obra: HardHat, cliente: UserRound, interno: Building2 } as const;

/** Ficha do pedido de compra (PLU-328): cabeçalho e abas da ficha do lead, guiada pelas ações que a API permite agora. */
export function FichaDoPedido({ pedido: inicial, opcoes, aoFechar, aoAtualizar }: { pedido: PedidoDeCompra; opcoes: OpcoesDeCompraResposta; aoFechar: () => void; aoAtualizar: () => void }) {
  const id = useId();
  const [pedido, setPedido] = useState(inicial);
  const [aba, setAba] = useState<Aba>("geral");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [janela, setJanela] = useState<null | "editar" | "cotacao" | "cancelar" | "revisar">(null);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const hoje = hojeEmManaus();

  // O servidor recarrega a ficha depois de cada ação (router.refresh); a versão mais nova vence.
  useEffect(() => { setPedido((atual) => (inicial.updatedAt > atual.updatedAt ? inicial : atual)); }, [inicial]);

  function atualizado(novo: PedidoDeCompra, mensagem: string | null) {
    setPedido(novo); setErro(null); setAviso(mensagem); aoAtualizar();
  }

  /** Relê o pedido; diz se a etapa ou a situação mudaram enquanto a ficha estava aberta. */
  async function recarregar(): Promise<boolean> {
    const r = await enviar<PedidoDeCompra>(`/api/suprimentos/compras/pedidos/${pedido.id}`, "GET");
    if (!r.ok) return false;
    setPedido(r.dados);
    return r.dados.etapa !== pedido.etapa || r.dados.situacao !== pedido.situacao;
  }

  async function agir(acao: AcaoDoPedido): Promise<boolean> {
    setOcupado(true); setErro(null); setAviso(null);
    const r = await enviar<PedidoDeCompra>(`/api/suprimentos/compras/pedidos/${pedido.id}/acoes`, "POST", acao);
    setOcupado(false);
    if (r.ok) {
      atualizado(r.dados, acao.acao === "decidir_estoque" ? (acao.origem === "estoque" ? "Atendido pelo estoque: o pedido foi para Retirada." : "Precisa comprar: o pedido foi para Cotações.")
        : acao.acao === "selecionar_cotacao" ? `Vencedora: ${r.dados.cotacoes.find((c) => c.id === acao.cotacaoId)?.fornecedor.nome ?? "escolhida"}.` : AVISO_DA_ACAO[acao.acao] ?? null);
      return true;
    }
    if (r.erro.codigo === "CONFLITO_ESTADO") {
      const mudou = await recarregar();
      setErro(mudou ? `${r.erro.mensagem} O pedido mudou enquanto a ficha estava aberta: ela foi atualizada.` : r.erro.mensagem);
      return false;
    }
    setErro(Object.values(r.erro.porCampo)[0] ? `${r.erro.mensagem} ${Object.values(r.erro.porCampo).join(" ")}` : r.erro.mensagem);
    return false;
  }

  async function enviarComprovante(arquivo: File) {
    const problema = problemaDoArquivo(arquivo);
    if (problema) { setErro(`Comprovante: ${problema}`); return; }
    const form = new FormData(); form.set("arquivo", arquivo);
    setOcupado(true); setErro(null); setAviso(null);
    const r = await enviarComArquivo(`/api/suprimentos/compras/pedidos/${pedido.id}/comprovante`, form);
    setOcupado(false);
    if (r.ok) atualizado(r.dados, "Comprovante anexado.");
    else setErro(r.erro.mensagem);
  }

  const abas: { id: Aba; titulo: string; conta?: number; icone: LucideIcon }[] = [
    { id: "geral", titulo: "Visão geral", icone: LayoutGrid },
    { id: "itens", titulo: "Itens", conta: pedido.itens.length, icone: ListChecks },
    { id: "cotacoes", titulo: "Cotações", conta: pedido.cotacoes.length, icone: Paperclip },
    { id: "tempo", titulo: "Linha do tempo", icone: History },
  ];
  function navegar(evento: KeyboardEvent<HTMLDivElement>) {
    const i = abas.findIndex((a) => a.id === aba);
    const j = evento.key === "ArrowRight" ? (i + 1) % abas.length : evento.key === "ArrowLeft" ? (i - 1 + abas.length) % abas.length : evento.key === "Home" ? 0 : evento.key === "End" ? abas.length - 1 : null;
    if (j === null) return;
    evento.preventDefault(); setAba(abas[j]!.id); botoes.current[j]?.focus();
  }

  const IconeDestino = ICONE_DO_DESTINO[pedido.destino.tipo];
  const destino = pedido.destino.obra?.nome ?? pedido.destino.cliente?.nome;
  const verCotacoes = () => { setAba("cotacoes"); botoes.current[2]?.focus(); };

  return <Modal rotulo={`Pedido ${numeroDoPedido(pedido.numero)}`} aoFechar={aoFechar} largura="larga" className={detalhes.modal}>
    <div className={detalhes.layout}>
      <header className={`${detalhes.cabecalhoLead} plg-parte`}>
        <div className={detalhes.identidadeCabecalho}>
          <div className={detalhes.leadCardLinhaSuperior}>
            <div className={detalhes.iconeLead} aria-hidden="true"><Package size={20} /></div>
            <div className={detalhes.identidadeLead}>
              <h2 className={detalhes.leadCardTitulo}>{pedido.titulo}</h2>
              <div className={detalhes.metadadosCabecalho}>
                <span>{numeroDoPedido(pedido.numero)}</span><span aria-hidden="true">·</span>
                <span className={styles.empresaCabecalho}><EmpresaDoPedido empresa={pedido.empresa} /></span><span aria-hidden="true">·</span>
                <span><IconeDestino size={13} aria-hidden="true" />{rotulosDoDestinoDeCompra[pedido.destino.tipo]}{destino ? `: ${destino}` : ""}</span>
                {pedido.responsavel ? <><span aria-hidden="true">·</span><span className={detalhes.responsavelInline}><span aria-hidden="true"><Avatar id={pedido.responsavel.id} nome={pedido.responsavel.nome} tamanho="pequeno" /></span>{pedido.responsavel.nome}</span></> : null}
              </div>
            </div>
          </div>
        </div>
        <div className={detalhes.controlesCabecalho}>
          {pedido.podeEditar ? <Button variant="secondary" size="sm" icon={<Pencil size={14} />} disabled={ocupado} onClick={() => setJanela("editar")}>Editar</Button> : null}
          <FecharModal>{(fechar) => <button type="button" className={`${detalhes.botaoFechar} plg-pressiona`} disabled={ocupado} onClick={fechar} aria-label="Fechar"><X size={18} aria-hidden="true" /></button>}</FecharModal>
        </div>
      </header>
      <div className={detalhes.painelPrincipal}>
        <div className={`${detalhes.navegacao} plg-parte`} role="tablist" aria-label="Seções do pedido" aria-orientation="horizontal" onKeyDown={navegar}>
          {abas.map((a, i) => <div key={a.id}>
            <button ref={(el) => { botoes.current[i] = el; }} type="button" role="tab" id={`${id}-${a.id}`} aria-selected={aba === a.id} aria-controls={`${id}-painel`} tabIndex={aba === a.id ? 0 : -1} className={detalhes.abaBotao} onClick={() => setAba(a.id)}>
              <a.icone size={15} aria-hidden="true" /><span>{a.titulo}{a.conta !== undefined ? <span className={styles.contaAba}> {a.conta}</span> : null}</span>
            </button>
          </div>)}
        </div>
        <section id={`${id}-painel`} role="tabpanel" aria-labelledby={`${id}-${aba}`} className={`${detalhes.conteudo} ${styles.painel} plg-parte`} aria-busy={ocupado}>
          {erro || aviso ? <div className={styles.avisos}>
            {erro ? <p role="alert" className="aviso aviso--erro">{erro}</p> : null}
            {aviso ? <p role="status" className="aviso aviso--sucesso">{aviso}</p> : null}
          </div> : null}
          {aba === "geral" ? <VisaoGeralDoPedido key={`${pedido.etapa}-${pedido.situacao}`} pedido={pedido} hoje={hoje} ocupado={ocupado} aoAgir={(a) => void agir(a)} aoPedirMotivo={setJanela}
            aoVerCotacoes={verCotacoes} aoNovaCotacao={() => setJanela("cotacao")} aoComprovante={(f) => void enviarComprovante(f)} /> : null}
          {aba === "itens" ? <ItensDoPedido pedido={pedido} /> : null}
          {aba === "cotacoes" ? <CotacoesDoPedido pedido={pedido} ocupado={ocupado} aoEscolher={(cotacaoId) => void agir({ acao: "selecionar_cotacao", cotacaoId })} aoNovaCotacao={() => setJanela("cotacao")} /> : null}
          {aba === "tempo" ? <LinhaDoTempoDoPedido pedido={pedido} hoje={hoje} /> : null}
        </section>
      </div>
    </div>
    {janela === "editar" ? <NovoPedido opcoes={opcoes} pedido={pedido} aoCancelar={() => setJanela(null)} aoSalvar={(p) => { setJanela(null); atualizado(p, "Pedido atualizado."); }} /> : null}
    {janela === "cotacao" ? <NovaCotacao pedido={pedido} opcoes={opcoes} aoCancelar={() => setJanela(null)} aoSalvar={(p) => { setJanela(null); atualizado(p, "Cotação registrada."); }} /> : null}
    {janela === "cancelar" || janela === "revisar" ? <MotivoDaAcao acao={janela} aoCancelar={() => setJanela(null)}
      aoConfirmar={async (motivo) => { const ok = await agir({ acao: janela, motivo }); if (ok) setJanela(null); return ok; }} /> : null}
  </Modal>;
}

function ItensDoPedido({ pedido }: { pedido: PedidoDeCompra }) {
  return <div className={styles.secao}>
    <div className={styles.barra}><div><h3>Itens do pedido <span className={styles.contaAba}>{String(pedido.itens.length).padStart(2, "0")}</span></h3><p>O que foi pedido, como descrito pelo solicitante.</p></div></div>
    <div className={styles.tabela}>
      <table>
        <caption className="sr-only">Itens do pedido</caption>
        <thead><tr><th scope="col">Descrição</th><th scope="col">Quantidade</th><th scope="col">Unidade</th></tr></thead>
        <tbody>{pedido.itens.map((i) => <tr key={i.id}>
          <td>{i.descricao}{i.itemDeEstoque ? <small>Estoque: {i.itemDeEstoque.codigo} · {i.itemDeEstoque.nome}</small> : null}</td>
          <td>{quantidadeLegivel(i.quantidade, null)}</td>
          <td>{i.unidade ?? "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

/** Cancelar ou revisar pedem o motivo, que fica no histórico do pedido. */
function MotivoDaAcao({ acao, aoCancelar, aoConfirmar }: { acao: "cancelar" | "revisar"; aoCancelar: () => void; aoConfirmar: (motivo: string) => Promise<boolean> }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cancelar = acao === "cancelar";
  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    if (!motivo.trim()) { setErro(cancelar ? "informe o motivo do cancelamento." : "informe o que precisa ser revisto."); return; }
    setEnviando(true); setErro(null);
    const ok = await aoConfirmar(motivo.trim());
    setEnviando(false);
    if (!ok) setErro("não foi possível concluir. Veja o aviso na ficha.");
  }
  return <Dialog title={cancelar ? "Cancelar pedido" : "Revisar cotações"} size="estreita" variant={cancelar ? "danger" : "default"} icon={cancelar ? <Ban size={20} /> : <Undo2 size={20} />}
    description={cancelar ? "O pedido sai do quadro e guarda a etapa em que parou. Não dá para desfazer." : "O pedido volta para Cotações e a vencedora é desmarcada."}
    onClose={aoCancelar} cancelText="Voltar"
    footer={<Button type="submit" form="form-motivo" variant={cancelar ? "danger" : "primary"} disabled={enviando}>{enviando ? "Enviando…" : cancelar ? "Cancelar pedido" : "Voltar para Cotações"}</Button>}>
    <form id="form-motivo" className="ui-dialog-form" onSubmit={confirmar} noValidate>
      {erro ? <Alert tone="danger" title={`Erro: ${erro}`} /> : null}
      <TextareaField label="Motivo" required maxLength={1000} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} error={erro && !motivo.trim() ? erro : undefined}
        placeholder={cancelar ? "Ex.: obra adiada pelo cliente" : "Ex.: pedir nova cotação com frete incluso"} />
    </form>
  </Dialog>;
}
