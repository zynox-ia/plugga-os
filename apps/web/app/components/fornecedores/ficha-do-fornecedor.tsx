"use client";

import { rotulosDaCategoriaDeFornecedor, type DesempenhoDoFornecedor, type Fornecedor, type HistoricoDeCotacoesResposta } from "@plugga/shared";
import { LayoutGrid, MapPin, Paperclip, Pencil, Power, Truck, Wallet, X, type LucideIcon } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { enviar } from "../../lib/clientes";
import { documentoFormatado, localDoFornecedor, nomeDoFornecedor } from "../../lib/fornecedores";
import { FecharModal, Modal } from "../modal";
import detalhes from "../pipelines/detalhes-do-lead-modal.module.css";
import { Button } from "../ui";
import { CotacoesDoFornecedor, PagamentoDoFornecedor } from "./abas-do-fornecedor";
import styles from "./ficha-do-fornecedor.module.css";
import { VisaoGeralDoFornecedor } from "./visao-geral-do-fornecedor";

type Aba = "geral" | "cotacoes" | "pagamento";

export type DadosDaFicha = { fornecedor: Fornecedor; desempenho: DesempenhoDoFornecedor | null; cotacoes: HistoricoDeCotacoesResposta | null };

/**
 * Ficha do fornecedor (PLU-334): leitura no padrão da ficha do lead, com
 * desempenho, histórico de cotações e pagamento mascarado. Editar abre o
 * formulário; Inativar e Reativar ficam no rodapé.
 */
export function FichaDoFornecedor({ dados, podeAbrirCompras, aoFechar, aoEditar, aoAtualizar }: {
  dados: DadosDaFicha; podeAbrirCompras: boolean; aoFechar: () => void; aoEditar: () => void; aoAtualizar: () => void;
}) {
  const id = useId();
  const f = dados.fornecedor;
  const [aba, setAba] = useState<Aba>("geral");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const nome = nomeDoFornecedor(f);

  const abas: { id: Aba; titulo: string; curto: string; conta?: number; icone: LucideIcon }[] = [
    { id: "geral", titulo: "Visão geral", curto: "Geral", icone: LayoutGrid },
    { id: "cotacoes", titulo: "Cotações", curto: "Cotações", conta: dados.cotacoes?.total ?? f.cotacoes, icone: Paperclip },
    { id: "pagamento", titulo: "Pagamento", curto: "Pagamento", icone: Wallet },
  ];
  function navegar(evento: KeyboardEvent<HTMLDivElement>) {
    const i = abas.findIndex((a) => a.id === aba);
    const j = evento.key === "ArrowRight" ? (i + 1) % abas.length : evento.key === "ArrowLeft" ? (i - 1 + abas.length) % abas.length : evento.key === "Home" ? 0 : evento.key === "End" ? abas.length - 1 : null;
    if (j === null) return;
    evento.preventDefault(); setAba(abas[j]!.id); botoes.current[j]?.focus();
  }

  async function copiar(texto: string, rotulo: string) {
    try { await navigator.clipboard.writeText(texto); setErro(null); setAviso(`${rotulo} copiado.`); }
    catch { setAviso(null); setErro(`Não foi possível copiar ${rotulo.toLowerCase()}. Selecione e copie à mão.`); }
  }

  async function alternarSituacao() {
    setOcupado(true); setErro(null); setAviso(null);
    const r = await enviar<Fornecedor>(`/api/suprimentos/fornecedores/${f.id}/${f.ativo ? "inativar" : "reativar"}`, "POST", {});
    setOcupado(false);
    if (r.ok) { setAviso(`${nome} ${r.dados.ativo ? "reativado" : "inativado"}.`); aoAtualizar(); }
    else setErro(`Não foi possível ${f.ativo ? "inativar" : "reativar"}: ${r.erro.mensagem}`);
  }

  const local = localDoFornecedor(f);
  return <Modal rotulo={`Fornecedor ${nome}`} aoFechar={aoFechar} largura="larga" className={detalhes.modal}>
    <div className={detalhes.layout}>
      <header className={`${detalhes.cabecalhoLead} plg-parte`}>
        <div className={detalhes.identidadeCabecalho}>
          <div className={detalhes.leadCardLinhaSuperior}>
            <div className={detalhes.iconeLead} aria-hidden="true"><Truck size={20} /></div>
            <div className={detalhes.identidadeLead}>
              <h2 className={detalhes.leadCardTitulo}>{nome}</h2>
              <div className={detalhes.metadadosCabecalho}>
                <span>{documentoFormatado(f.documento) ?? "Sem documento"}</span><span aria-hidden="true">·</span>
                <span>{rotulosDaCategoriaDeFornecedor[f.categoria]}</span>
                {local ? <><span aria-hidden="true">·</span><span><MapPin size={13} aria-hidden="true" />{local}</span></> : null}
                <span aria-hidden="true">·</span><span>{f.ativo ? "Ativo" : "Inativo"}</span>
              </div>
            </div>
          </div>
        </div>
        <div className={detalhes.controlesCabecalho}>
          <Button variant="secondary" size="sm" icon={<Pencil size={14} />} disabled={ocupado} onClick={aoEditar}>Editar</Button>
          <FecharModal>{(fechar) => <button type="button" className={`${detalhes.botaoFechar} plg-pressiona`} disabled={ocupado} onClick={fechar} aria-label="Fechar"><X size={18} aria-hidden="true" /></button>}</FecharModal>
        </div>
      </header>
      <div className={detalhes.painelPrincipal}>
        <div className={`${detalhes.navegacao} ${styles.abas} plg-parte`} role="tablist" aria-label="Seções do fornecedor" aria-orientation="horizontal" onKeyDown={navegar}>
          {abas.map((a, i) => <div key={a.id}>
            <button ref={(el) => { botoes.current[i] = el; }} type="button" role="tab" id={`${id}-${a.id}`} aria-selected={aba === a.id} aria-controls={`${id}-painel`} aria-label={a.conta !== undefined ? `${a.titulo} ${a.conta}` : a.titulo}
              tabIndex={aba === a.id ? 0 : -1} className={detalhes.abaBotao} onClick={() => setAba(a.id)}>
              <a.icone size={15} aria-hidden="true" /><span><span className={styles.abaLonga}>{a.titulo}</span><span className={styles.abaCurta} aria-hidden="true">{a.curto}</span>{a.conta !== undefined ? <span className={styles.contaAba}> {a.conta}</span> : null}</span>
            </button>
          </div>)}
        </div>
        <section id={`${id}-painel`} role="tabpanel" aria-labelledby={`${id}-${aba}`} className={`${detalhes.conteudo} ${styles.painel} plg-parte`} aria-busy={ocupado}>
          {erro || aviso || !f.ativo ? <div className={styles.avisos}>
            {!f.ativo ? <p className={styles.inativo}><Power size={14} aria-hidden="true" />Fornecedor inativo: não aparece nas novas cotações. As cotações antigas continuam com ele.</p> : null}
            {erro ? <p role="alert" className="aviso aviso--erro">{erro}</p> : null}
            {aviso ? <p role="status" className="aviso aviso--sucesso">{aviso}</p> : null}
          </div> : null}
          {aba === "geral" ? <VisaoGeralDoFornecedor fornecedor={f} desempenho={dados.desempenho} aoCopiar={(t, r) => void copiar(t, r)} /> : null}
          {aba === "cotacoes" ? <CotacoesDoFornecedor historico={dados.cotacoes} podeAbrirCompras={podeAbrirCompras} /> : null}
          {aba === "pagamento" ? <PagamentoDoFornecedor fornecedor={f} aoCopiar={(t, r) => void copiar(t, r)} /> : null}
          <footer className={styles.rodape}>
            <Button variant="secondary" icon={<Power size={15} />} disabled={ocupado} onClick={() => void alternarSituacao()}>{f.ativo ? "Inativar" : "Reativar"}</Button>
            <span className={styles.espaco} />
            <Button icon={<Pencil size={15} />} disabled={ocupado} onClick={aoEditar}>Editar fornecedor</Button>
          </footer>
        </section>
      </div>
    </div>
  </Modal>;
}
