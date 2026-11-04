"use client";

import type { DealDetail, LeadProposal, LeadProposalContent, LeadProposalTemplate } from "@plugga/shared";
import { CheckCircle2, Download, Eye, FileText, Pencil, Plus, ShieldCheck, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { carregarModelos, carregarPropostas, caminhoPropostas, codigoProposta, dataDaProposta, FalhaProposta, gerarProposta, salvarProposta } from "../../lib/propostas-lead";
import { formatarBRL, formatarData } from "../../lib/format";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { EditorPropostaModal, ModelosDePropostaModal, VisualizacaoPropostaModal } from "./proposta-dialogos";
import styles from "./propostas-do-lead.module.css";

type Sessao = { atual: LeadProposal | null; templateId: string; templateName: string; conteudo: LeadProposalContent; inicio: string };
type Props = { negocio: DealDetail; ativo: boolean; aoRascunho: (valor: boolean) => void; aoOcupar: (valor: boolean) => void; aoGerar: () => void };

export function PropostasDoLead({ negocio, ativo, aoRascunho, aoOcupar, aoGerar }: Props) {
  const [propostas, setPropostas] = useState<LeadProposal[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [erroEditor, setErroEditor] = useState<string | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [sucesso, setSucesso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [modelos, setModelos] = useState<LeadProposalTemplate[]>([]);
  const [selecionado, setSelecionado] = useState("");
  const [modo, setModo] = useState<"modelos" | "editor" | null>(null);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [visualizando, setVisualizando] = useState<{ proposta: LeadProposal; voltar: boolean } | null>(null);
  const [saida, setSaida] = useState<{ executar: () => void } | null>(null);
  const alterado = !!sessao && JSON.stringify(sessao.conteudo) !== sessao.inicio;
  useEffect(() => { aoRascunho(alterado); return () => aoRascunho(false); }, [alterado, aoRascunho]);
  useEffect(() => { aoOcupar(ocupado); return () => aoOcupar(false); }, [ocupado, aoOcupar]);
  useEffect(() => {
    if (!ativo || carregado) return;
    const controller = new AbortController();
    setErroLista(null);
    void carregarPropostas(negocio.id, controller.signal).then((lista) => {
      if (!controller.signal.aborted) { setPropostas(lista); setCarregado(true); }
    }).catch((erro: Error) => { if (!controller.signal.aborted) setErroLista(erro.message); });
    return () => controller.abort();
  }, [ativo, carregado, negocio.id, tentativa]);

  const guardar = useCallback((proposta: LeadProposal) => {
    setPropostas((lista) => [proposta, ...lista.filter((item) => item.id !== proposta.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    setSessao({ atual: proposta, templateId: proposta.templateId, templateName: proposta.templateName, conteudo: { ...proposta.content }, inicio: JSON.stringify(proposta.content) });
  }, []);
  function pedirSaida(executar: () => void) {
    if (ocupado) return;
    if (alterado) setSaida({ executar }); else executar();
  }
  function fechar() { pedirSaida(() => { setModo(null); setSessao(null); setErroEditor(null); setBloqueado(false); }); }
  async function nova() {
    if (ocupado) return;
    setOcupado(true); setErroLista(null); setSucesso("");
    try {
      const lista = await carregarModelos(negocio.id);
      if (!lista.length) throw new Error("Nenhum modelo disponível para este lead.");
      setModelos(lista); setSelecionado(lista[0]!.id); setSessao(null); setModo("modelos"); setErroEditor(null); setBloqueado(false);
    } catch (erro) { setErroLista(erro instanceof Error ? erro.message : "Não foi possível carregar os modelos."); }
    finally { setOcupado(false); }
  }
  function escolher() {
    const modelo = modelos.find((item) => item.id === selecionado);
    if (!modelo) return;
    setSessao({ atual: null, templateId: modelo.id, templateName: modelo.name, conteudo: { ...modelo.defaults }, inicio: JSON.stringify(modelo.defaults) }); setModo("editor");
  }
  function editar(proposta: LeadProposal) { guardar(proposta); setErroEditor(null); setBloqueado(false); setVisualizando(null); setModo("editor"); setSucesso(""); }
  async function acao(valor: "salvar" | "preview" | "gerar") {
    if (!sessao || ocupado || bloqueado) return;
    setOcupado(true); setErroEditor(null); setSucesso("");
    try {
      let atual = sessao.atual;
      if (!atual || alterado) {
        atual = await salvarProposta(negocio.id, sessao.templateId, sessao.conteudo, atual);
        guardar(atual);
      }
      if (valor === "gerar") {
        if (atual.status !== "generated") {
          atual = await gerarProposta(negocio.id, atual);
          guardar(atual); aoGerar(); setSucesso("PDF gerado e adicionado aos documentos do lead.");
        }
        setModo(null); setSessao(null); setVisualizando({ proposta: atual, voltar: false });
      } else if (valor === "preview") { setVisualizando({ proposta: atual, voltar: true }); }
      else { setModo(null); setSessao(null); setSucesso("Proposta salva."); }
    } catch (erro) {
      setErroEditor(erro instanceof Error ? erro.message : "Não foi possível salvar a proposta. Seu texto foi preservado.");
      setBloqueado(erro instanceof FalhaProposta && (erro.conflito || erro.incerta));
    } finally { setOcupado(false); }
  }
  async function recarregarAtual() {
    if (ocupado) return;
    pedirSaida(() => { void (async () => {
      setOcupado(true);
      try {
        const lista = await carregarPropostas(negocio.id); setPropostas(lista);
        const atual = lista.find((item) => item.id === sessao?.atual?.id);
        if (atual) editar(atual); else { setModo(null); setSessao(null); setErroEditor(null); setBloqueado(false); }
      } catch (erro) { setErroEditor(erro instanceof Error ? erro.message : "Não foi possível carregar a proposta."); }
      finally { setOcupado(false); }
    })(); });
  }

  const geradas = propostas.filter((proposta) => proposta.status === "generated").length;
  return <div className={styles.propostas}>
    <div className={styles.toolbar}><div><h3>Propostas comerciais <span>{String(propostas.length).padStart(2, "0")}</span></h3><p>Crie, personalize e acompanhe as propostas deste lead.</p></div><Button size="sm" icon={<Plus />} loading={ocupado && !modo} disabled={!carregado} onClick={() => void nova()}>Gerar proposta</Button></div>
    <div className={styles.contexto}><span><UserRound size={14} aria-hidden="true" />{negocio.lead.name}</span><span>{geradas} {geradas === 1 ? "gerada" : "geradas"}<i aria-hidden="true" />{propostas.length - geradas} em rascunho</span></div>
    {erroLista ? <div role="alert" className="aviso aviso--erro"><p>{erroLista}</p><Button variant="secondary" size="sm" onClick={() => { setCarregado(false); setTentativa((valor) => valor + 1); }}>Tentar novamente</Button></div> : null}
    {sucesso ? <p role="status" className={styles.sucesso}><CheckCircle2 size={15} aria-hidden="true" />{sucesso}</p> : null}
    {!carregado && !erroLista ? <div className={styles.skeleton} role="status" aria-label="Carregando propostas" /> : null}
    {carregado && !propostas.length ? <div className={styles.vazio}><FileText size={28} aria-hidden="true" /><h4>A primeira proposta começa aqui</h4><p>Escolha um modelo e aproveite os dados já preenchidos do lead.</p></div> : null}
    {propostas.length ? <><div className={styles.listaCabecalho} aria-hidden="true"><span>Proposta</span><span>Investimento</span><span>Situação</span><span>Ações</span></div><div className={styles.lista} role="list" aria-label="Propostas comerciais">{propostas.map((proposta) => <article className={styles.linha} role="listitem" key={proposta.id} aria-label={proposta.content.title}>
      <div className={styles.arquivo} aria-hidden="true"><FileText size={20} /></div><div className={styles.identidade}><div className={styles.codigo}>{codigoProposta(proposta)} <span>· {proposta.version ? `v${proposta.version}` : "Nova"}</span></div><button type="button" className={styles.nome} onClick={() => setVisualizando({ proposta, voltar: false })}>{proposta.content.title}</button><p><span>{proposta.templateName}</span><span>· Atualizada em {formatarData(proposta.updatedAt)}</span></p></div>
      <div className={styles.investimento}>{formatarBRL(proposta.content.amount)}<small>Válida até {dataDaProposta(proposta.content.validUntil)}</small></div><span className={`${styles.status} ${proposta.status === "generated" ? styles.statusGerada : ""}`}>{proposta.status === "generated" ? "Gerada" : "Rascunho"}</span>
      <div className={styles.acoes}><Button variant="secondary" size="sm" icon={<Eye />} iconOnly aria-label={`Visualizar ${proposta.content.title}`} onClick={() => setVisualizando({ proposta, voltar: false })} /><Button variant="secondary" size="sm" icon={<Pencil />} iconOnly aria-label={`Editar ${proposta.content.title}`} onClick={() => editar(proposta)} /><a className={styles.download} href={`${caminhoPropostas(negocio.id)}/${proposta.id}/download`} download aria-label={`Baixar ${proposta.content.title}`}><Download size={15} aria-hidden="true" /></a></div>
    </article>)}</div></> : null}
    {propostas.length ? <p className={styles.rodapeLista}><ShieldCheck size={13} aria-hidden="true" />Os PDFs gerados também ficam disponíveis na aba Documentos.</p> : null}
    {modo === "modelos" ? <ModelosDePropostaModal modelos={modelos} selecionado={selecionado} aoSelecionar={setSelecionado} aoContinuar={escolher} aoFechar={fechar} /> : null}
    {modo === "editor" && sessao && !visualizando ? <EditorPropostaModal conteudo={sessao.conteudo} modelo={sessao.templateName} atual={sessao.atual} ocupado={ocupado} erro={erroEditor} bloqueado={bloqueado} aoAlterar={(campo, valor) => setSessao((atual) => atual && { ...atual, conteudo: { ...atual.conteudo, [campo]: valor } })} aoAcao={(valor) => void acao(valor)} aoModelo={() => pedirSaida(() => { setModo("modelos"); setSessao(null); })} aoFechar={fechar} aoRecarregar={() => void recarregarAtual()} /> : null}
    {visualizando ? <VisualizacaoPropostaModal proposta={visualizando.proposta} voltar={visualizando.voltar} aoEditar={() => editar(visualizando.proposta)} aoFechar={() => setVisualizando(null)} /> : null}
    {saida ? createPortal(<Dialog title="Descartar alterações da proposta?" description="Os textos ainda não salvos serão descartados. O perfil do lead e as propostas já salvas serão preservados." onClose={() => setSaida(null)} cancelText="Continuar editando" variant="danger" cancelAutoFocus footer={<Button variant="danger" onClick={() => { const executar = saida.executar; setSaida(null); executar(); }}>Descartar alterações</Button>}><p>Deseja continuar sem salvar este rascunho?</p></Dialog>, document.body) : null}
  </div>;
}
