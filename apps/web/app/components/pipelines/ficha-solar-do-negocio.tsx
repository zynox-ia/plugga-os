"use client";

import { listLeadDocumentsResponseSchema, type DealSolarProject, type LeadDocument } from "@plugga/shared";
import { FileText, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { lerErro } from "../../lib/clientes";
import { contasDeEnergiaDaFicha } from "../../lib/documentos-ficha-solar";
import { Button } from "../ui/button";
import { TextField } from "../ui/fields";
import estilosFicha from "./detalhes-do-lead-modal.module.css";
import styles from "./ficha-solar-do-negocio.module.css";

type ConsultaDocumentos = {
  negocioId: string;
  estado: "carregando" | "pronto" | "erro";
  documentos: LeadDocument[];
  erro: string | null;
};
const idDaBeneficiaria = (negocioId: string, id: string) => `solar-${negocioId}-beneficiaria-${id}`;

export function FichaSolarDoNegocio({ negocioId, projeto, aoAlterar, erros, aoVerDocumentos, bloqueado = false }: {
  negocioId: string;
  projeto: DealSolarProject;
  aoAlterar: (projeto: DealSolarProject) => void;
  erros: Record<string, string>;
  aoVerDocumentos: () => void;
  bloqueado?: boolean;
}) {
  const [tentativa, setTentativa] = useState(0);
  const [consulta, setConsulta] = useState<ConsultaDocumentos>({ negocioId, estado: "carregando", documentos: [], erro: null });
  const focoPendente = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setConsulta({ negocioId, estado: "carregando", documentos: [], erro: null });
    async function carregar() {
      try {
        const resposta = await fetch(`/api/leads/${encodeURIComponent(negocioId)}/documentos`, { signal: controller.signal, cache: "no-store" });
        const dados: unknown = await resposta.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!resposta.ok) {
          setConsulta({ negocioId, estado: "erro", documentos: [], erro: lerErro(dados, "Não foi possível carregar as contas de energia. Tente novamente.").mensagem });
          return;
        }
        const lista = listLeadDocumentsResponseSchema.safeParse(dados);
        if (!lista.success) {
          setConsulta({ negocioId, estado: "erro", documentos: [], erro: "Não foi possível interpretar a lista de documentos. Tente novamente." });
          return;
        }
        setConsulta({ negocioId, estado: "pronto", documentos: lista.data.documents, erro: null });
      } catch {
        if (!controller.signal.aborted) setConsulta({ negocioId, estado: "erro", documentos: [], erro: "Sem conexão para carregar as contas de energia. Tente novamente." });
      }
    }
    void carregar();
    return () => controller.abort();
  }, [negocioId, tentativa]);

  useEffect(() => {
    if (!focoPendente.current) return;
    document.getElementById(focoPendente.current)?.focus();
    focoPendente.current = null;
  }, [projeto.beneficiaryUcs]);

  const carregando = consulta.negocioId !== negocioId || consulta.estado === "carregando";
  const pronto = consulta.negocioId === negocioId && consulta.estado === "pronto";
  const erroConsulta = consulta.negocioId === negocioId ? consulta.erro : null;
  const documentos = consulta.negocioId === negocioId ? consulta.documentos : [];
  const contas = contasDeEnergiaDaFicha(documentos, negocioId, projeto.primaryEnergyBillDocumentId);
  const indisponivel = pronto && contas.selecionadaIndisponivel;
  const semContas = pronto && !contas.opcoes.some((opcao) => !opcao.indisponivel);
  const contaId = `solar-${negocioId}-conta`;
  const erroConta = erros["solarProject.primaryEnergyBillDocumentId"];
  const adicionarId = `solar-${negocioId}-adicionar-beneficiaria`;

  function adicionarBeneficiaria() {
    const id = crypto.randomUUID();
    focoPendente.current = idDaBeneficiaria(negocioId, id);
    aoAlterar({ ...projeto, beneficiaryUcs: [...projeto.beneficiaryUcs, { id, code: "" }] });
  }

  function removerBeneficiaria(id: string, indice: number) {
    const proxima = projeto.beneficiaryUcs[indice + 1] ?? projeto.beneficiaryUcs[indice - 1];
    focoPendente.current = proxima ? idDaBeneficiaria(negocioId, proxima.id) : adicionarId;
    aoAlterar({ ...projeto, beneficiaryUcs: projeto.beneficiaryUcs.filter((uc) => uc.id !== id) });
  }

  return <section className={`${estilosFicha.painelCard} ${styles.ficha}`} aria-labelledby={`solar-${negocioId}-titulo`}>
    <div className={estilosFicha.painelCardHeader}><h4 id={`solar-${negocioId}-titulo`}>Projeto Solar</h4></div>
    {erros.solarProject ? <p className="ui-field-error" role="alert">{erros.solarProject}</p> : null}
    <div className={styles.principais}>
      <TextField label="UC principal" name="solar-principal-uc" value={projeto.principalUc?.code ?? ""} maxLength={80} disabled={bloqueado} autoComplete="off"
        hint="Informe a unidade consumidora como aparece na conta de energia."
        error={erros["solarProject.principalUc.code"] ?? erros["solarProject.principalUc"]}
        onChange={(evento) => aoAlterar({ ...projeto, principalUc: evento.target.value === "" ? null : { code: evento.target.value } })} />
      <div className={styles.documentos} aria-busy={carregando}>
        <div className="ui-field">
          <label htmlFor={contaId}>Conta de energia principal</label>
          <select id={contaId} name="solar-conta-energia" className="ui-input" disabled={bloqueado} value={projeto.primaryEnergyBillDocumentId ?? ""}
            aria-invalid={!!erroConta} aria-describedby={[`${contaId}-ajuda`, erroConta && `${contaId}-erro`, indisponivel && `${contaId}-indisponivel`].filter(Boolean).join(" ")}
            onChange={(evento) => aoAlterar({ ...projeto, primaryEnergyBillDocumentId: evento.target.value || null })}>
            <option value="">Não informada</option>
            {contas.opcoes.map((opcao) => <option key={opcao.id} value={opcao.id} disabled={opcao.indisponivel}>{opcao.indisponivel && !pronto ? "Conta de energia selecionada" : opcao.nome}</option>)}
          </select>
          <p id={`${contaId}-ajuda`} className="ui-field-hint">Selecione um arquivo deste negócio na categoria Conta de energia.</p>
          {erroConta ? <p id={`${contaId}-erro`} className="ui-field-error">{erroConta}</p> : null}
        </div>
        <p className={styles.estado} role="status">{carregando ? "Carregando contas de energia…" : semContas ? "Nenhuma conta de energia ativa neste negócio. Envie o arquivo em Documentos, na categoria Conta de energia." : ""}</p>
        {erroConsulta ? <div className={styles.falha} role="alert"><p>{erroConsulta}</p><Button variant="secondary" size="sm" disabled={bloqueado} onClick={() => setTentativa((atual) => atual + 1)}>Tentar novamente</Button></div> : null}
        {indisponivel ? <p id={`${contaId}-indisponivel`} className={styles.aviso}>A conta selecionada está indisponível. A referência foi mantida. Escolha outra conta ou selecione “Não informada” para remover o vínculo.</p> : null}
        <div className={styles.acoes}><Button variant="secondary" size="sm" icon={<FileText size={16} />} disabled={bloqueado} onClick={aoVerDocumentos}>Ver documentos</Button></div>
      </div>
    </div>
    <fieldset className={styles.beneficiarias} disabled={bloqueado}>
      <legend>UCs beneficiárias (opcional)</legend>
      <p className={styles.ajuda}>Adicione as outras unidades consumidoras que farão parte deste projeto.</p>
      {erros["solarProject.beneficiaryUcs"] ? <p className="ui-field-error">{erros["solarProject.beneficiaryUcs"]}</p> : null}
      <div className={styles.lista}>{projeto.beneficiaryUcs.map((uc, indice) => <div className={styles.linha} key={uc.id}>
        <TextField id={idDaBeneficiaria(negocioId, uc.id)} label={`UC beneficiária ${indice + 1}`} name={`solar-beneficiaria-${uc.id}`} value={uc.code} maxLength={80} autoComplete="off"
          error={erros[`solarProject.beneficiaryUcs.${indice}.code`] ?? erros[`solarProject.beneficiaryUcs.${indice}.id`]}
          onChange={(evento) => aoAlterar({ ...projeto, beneficiaryUcs: projeto.beneficiaryUcs.map((item) => item.id === uc.id ? { ...item, code: evento.target.value } : item) })} />
        <Button className={styles.remover} variant="secondary" size="sm" iconOnly icon={<Trash2 size={16} />} aria-label={`Remover UC beneficiária ${indice + 1}`} onClick={() => removerBeneficiaria(uc.id, indice)} />
      </div>)}</div>
      <div className={styles.acoes}><Button id={adicionarId} variant="secondary" size="sm" icon={<Plus size={16} />} onClick={adicionarBeneficiaria}>Adicionar UC beneficiária</Button></div>
    </fieldset>
  </section>;
}
