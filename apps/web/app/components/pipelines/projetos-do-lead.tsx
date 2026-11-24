"use client";

import type { LeadSolarProject } from "@plugga/shared";
import { CheckCircle2, Eye, FolderKanban, Pencil, Plus, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatarBRL, formatarData, formatarNumero } from "../../lib/format";
import {
  listarProjetosSolaresDoLead,
  salvarProjetoSolarDoLead,
  ROTULO_TELHADO_SOLAR,
  tituloDoProjetoSolar,
  type RascunhoProjetoSolar,
} from "../../lib/projetos-solares-lead";
import { Button } from "../ui/button";
import { NovoProjetoSolarModal } from "./novo-projeto-solar-modal";
import { VisualizarProjetoSolarModal } from "./visualizar-projeto-solar-modal";
import styles from "./projetos-do-lead.module.css";

type Props = {
  negocioId: string;
  /** Versão do lead lida pela tela; projetos salvos sobre versão antiga são recusados. */
  versao: number | undefined;
  naQualificacao: boolean;
  /** Projeto salvo mudou o lead (versão ou etapa): o modal recarrega o negócio. */
  aoSalvarProjeto: (avancou: boolean) => void;
  ativo: boolean;
  aoRascunho: (valor: boolean) => void;
  aoOcupar: (valor: boolean) => void;
  aoAtualizar?: () => void;
};

type Modal =
  | { tipo: "novo" }
  | { tipo: "editar"; projeto: LeadSolarProject }
  | { tipo: "ver"; projeto: LeadSolarProject };

export function ProjetosDoLead({ negocioId, versao, naQualificacao, aoSalvarProjeto, ativo, aoRascunho, aoOcupar, aoAtualizar }: Props) {
  const [projetos, setProjetos] = useState<LeadSolarProject[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [erroModal, setErroModal] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [sucesso, setSucesso] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);
  const [rascunhoModal, setRascunhoModal] = useState(false);

  useEffect(() => { aoRascunho(rascunhoModal); return () => aoRascunho(false); }, [rascunhoModal, aoRascunho]);
  useEffect(() => { aoOcupar(ocupado); return () => aoOcupar(false); }, [ocupado, aoOcupar]);

  useEffect(() => {
    if (!ativo || carregado) return;
    const controller = new AbortController();
    setErroLista(null);
    void listarProjetosSolaresDoLead(negocioId, controller.signal).then((lista) => {
      if (!controller.signal.aborted) { setProjetos(lista); setCarregado(true); }
    }).catch((erro: unknown) => {
      if (controller.signal.aborted) return;
      setErroLista(erro instanceof Error ? erro.message : "Não foi possível carregar os projetos.");
    });
    return () => controller.abort();
  }, [ativo, carregado, negocioId, tentativa]);

  const guardar = useCallback((projeto: LeadSolarProject) => {
    setProjetos((atuais) => [projeto, ...atuais.filter((item) => item.id !== projeto.id)]);
  }, []);

  const salvar = useCallback(async (rascunho: RascunhoProjetoSolar) => {
    if (!modal || modal.tipo === "ver") return false;
    setOcupado(true); setErroModal(null); setSucesso("");
    try {
      if (versao === undefined) throw new Error("Recarregue o lead antes de salvar o projeto.");
      const { project, advancedToProposal } = await salvarProjetoSolarDoLead(negocioId, modal.tipo === "editar" ? modal.projeto.id : null, rascunho, versao);
      guardar(project);
      setSucesso(advancedToProposal
        ? "Qualificação concluída: o lead avançou para Cotações/Proposta."
        : modal.tipo === "editar" ? "Projeto atualizado." : "Projeto criado.");
      if (rascunho.energyBillDocumentIds.length) aoAtualizar?.();
      aoSalvarProjeto(advancedToProposal);
      return true;
    } catch (erro) {
      setErroModal(erro instanceof Error ? erro.message : "Não foi possível salvar o projeto.");
      return false;
    } finally {
      setOcupado(false);
    }
  }, [aoAtualizar, aoSalvarProjeto, guardar, modal, negocioId, versao]);

  function fecharModal() {
    if (ocupado) return;
    setModal(null);
    setErroModal(null);
  }

  return <div className={styles.projetos}>
    <div className={styles.toolbar}>
      <div>
        <h3>Projetos Solar {carregado ? <span>{String(projetos.length).padStart(2, "0")}</span> : null}</h3>
        <p>Projetos deste lead ficam só nesta ficha — não viram card no Kanban.</p>
      </div>
      <Button size="sm" icon={<Plus />} disabled={!carregado || ocupado} onClick={() => { setErroModal(null); setModal({ tipo: "novo" }); }}>Novo projeto</Button>
    </div>
    {erroLista ? <div role="alert" className="aviso aviso--erro"><p>{erroLista}</p><Button variant="secondary" size="sm" onClick={() => { setCarregado(false); setTentativa((valor) => valor + 1); }}>Tentar novamente</Button></div> : null}
    {sucesso ? <p role="status" className={styles.sucesso}><CheckCircle2 size={15} aria-hidden="true" />{sucesso}</p> : null}
    {!carregado && !erroLista ? <div className={styles.skeleton} role="status" aria-label="Carregando projetos" /> : null}
    {carregado && !projetos.length ? <div className={styles.vazio}><FolderKanban size={28} aria-hidden="true" /><h4>Nenhum projeto ainda</h4><p>Crie o primeiro projeto Solar com tipo de instalação, consumo, UC e conta de energia.</p></div> : null}
    {projetos.length ? <div className={styles.lista} role="list" aria-label="Projetos Solar do lead">
      {projetos.map((projeto) => <article key={projeto.id} className={styles.card} role="listitem" aria-label={tituloDoProjetoSolar(projeto)}>
        <div className={styles.icone} aria-hidden="true"><Sun size={20} /></div>
        <div className={styles.identidade}>
          <h4 className={styles.titulo}>{tituloDoProjetoSolar(projeto)}</h4>
          <div className={styles.meta}>
            <span>Consumo <strong>{formatarNumero(projeto.averageConsumptionKwh)} kWh</strong></span>
            <span>Telhado <strong>{projeto.roofType ? ROTULO_TELHADO_SOLAR[projeto.roofType] : "A definir"}</strong></span>
            <span>Área <strong>{projeto.availableAreaM2 ? `${formatarNumero(projeto.availableAreaM2)} m²` : "A definir"}</strong></span>
            <span>Potência <strong>{projeto.estimatedPowerKwp ? `${formatarNumero(projeto.estimatedPowerKwp)} kWp` : "A definir"}</strong></span>
            {projeto.beneficiaryUcs.length ? <span>{projeto.beneficiaryUcs.length} UC{projeto.beneficiaryUcs.length === 1 ? "" : "s"} beneficiária{projeto.beneficiaryUcs.length === 1 ? "" : "s"}</span> : null}
            {projeto.energyBillDocumentIds.length ? <span>{projeto.energyBillDocumentIds.length} conta{projeto.energyBillDocumentIds.length === 1 ? "" : "s"} anexada{projeto.energyBillDocumentIds.length === 1 ? "" : "s"}</span> : <span className={styles.pendente}>Sem conta de energia</span>}
          </div>
        </div>
        <div className={styles.lado}>
          <div className={styles.investimento}>{projeto.estimatedInvestment ? formatarBRL(projeto.estimatedInvestment) : <span className={styles.semValor}>Investimento a definir</span>}<small>Criado em {formatarData(projeto.createdAt)}</small></div>
          <div className={styles.acoes}>
            <Button variant="secondary" size="sm" icon={<Eye />} iconOnly aria-label={`Visualizar ${tituloDoProjetoSolar(projeto)}`} disabled={ocupado} onClick={() => { setErroModal(null); setModal({ tipo: "ver", projeto }); }} />
            <Button variant="secondary" size="sm" icon={<Pencil />} iconOnly aria-label={`Editar ${tituloDoProjetoSolar(projeto)}`} disabled={ocupado} onClick={() => { setErroModal(null); setModal({ tipo: "editar", projeto }); }} />
          </div>
        </div>
      </article>)}
    </div> : null}
    {modal?.tipo === "novo" || modal?.tipo === "editar" ? <NovoProjetoSolarModal
      key={modal.tipo === "editar" ? modal.projeto.id : "novo"}
      negocioId={negocioId}
      projeto={modal.tipo === "editar" ? modal.projeto : undefined}
      salvando={ocupado}
      erro={erroModal}
      aoSalvar={salvar}
      aoAlterarRascunho={setRascunhoModal}
      aoFechar={fecharModal}
      naQualificacao={naQualificacao}
    /> : null}
    {modal?.tipo === "ver" ? <VisualizarProjetoSolarModal
      projeto={modal.projeto}
      aoFechar={fecharModal}
      aoEditar={() => { setErroModal(null); setModal({ tipo: "editar", projeto: modal.projeto }); }}
    /> : null}
  </div>;
}
