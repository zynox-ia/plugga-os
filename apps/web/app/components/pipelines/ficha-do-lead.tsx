"use client";

import { clientContactRoles, clientOrigins, type ClientContactRole, type LeadContactInput } from "@plugga/shared";
import { Copy, MessageSquare } from "lucide-react";
import { useId, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { ROTULO_ORIGEM, ROTULO_PAPEL } from "../../lib/clientes";
import type { RascunhoLead } from "../../lib/rascunho-lead";
import styles from "./detalhes-do-lead-modal.module.css";

export function CampoDoLead({ rotulo, erro, children }: { rotulo: string; erro?: string; children: ReactNode }) {
  const id = useId();
  return <label className={styles.campoEditavel}>
    <span>{rotulo}</span>
    {children}
    {erro ? <small id={id} className={styles.erroCampo}>{erro}</small> : null}
  </label>;
}

export type PropsEdicaoLead = {
  rascunho: RascunhoLead;
  aoAlterar: Dispatch<SetStateAction<RascunhoLead | null>>;
  erros: Record<string, string>;
};

export function FichaDoLead({ rascunho, aoAlterar, erros }: PropsEdicaoLead) {
  const [copia, setCopia] = useState<string | null>(null);
  const perfil = rascunho.lead;
  function alterar(campo: keyof RascunhoLead["lead"], valor: string) {
    aoAlterar((atual) => atual && { ...atual, lead: { ...atual.lead, [campo]: valor } });
  }
  function alterarContato(campo: keyof LeadContactInput, valor: string | boolean) {
    aoAlterar((atual) => atual?.contact ? { ...atual, contact: { ...atual.contact, [campo]: valor } } : atual);
  }
  async function copiar() {
    try {
      await navigator.clipboard.writeText(perfil.email ?? "");
      setCopia("E-mail copiado.");
    } catch { setCopia("Não foi possível copiar. Selecione o e-mail para copiá-lo."); }
  }
  const campo = (rotulo: string, chave: keyof Omit<RascunhoLead["lead"], "personType">, tipo = "text") => <CampoDoLead rotulo={rotulo} erro={erros[`lead.${chave}`]}>
    <input className="ui-input" type={tipo} aria-label={rotulo} aria-invalid={!!erros[`lead.${chave}`]} value={perfil[chave] ?? ""} onChange={(e) => alterar(chave, e.target.value)} />
  </CampoDoLead>;

  return <>
    <div className={styles.tituloSecao}><h3>Ficha cadastral</h3><p>Dados próprios do lead, canais de contato e anotações.</p></div>
    <div className={styles.leadCardsGrid}>
      <div className={styles.painelCard}>
        <div className={styles.painelCardHeader}><h4>Identificação</h4></div>
        <CampoDoLead rotulo="Tipo de pessoa" erro={erros["lead.personType"]}>
          <select className="ui-input" value={perfil.personType} onChange={(e) => alterar("personType", e.target.value)}>
            <option value="pj">Pessoa jurídica (PJ)</option><option value="pf">Pessoa física (PF)</option>
          </select>
        </CampoDoLead>
        {campo("Nome", "name")}{perfil.personType === "pj" ? campo("Razão Social", "legalName") : null}{campo("Documento", "document")}
        <CampoDoLead rotulo="Origem do lead" erro={erros["lead.origin"]}>
          <select className="ui-input" value={perfil.origin ?? ""} onChange={(e) => alterar("origin", e.target.value)}>
            <option value="">Não informada</option>{clientOrigins.map((origem) => <option key={origem} value={origem}>{ROTULO_ORIGEM[origem]}</option>)}
          </select>
        </CampoDoLead>
      </div>
      <div className={styles.painelCard}>
        <div className={styles.painelCardHeader}><h4>Canais de comunicação</h4></div>
        {campo("Telefone", "phone", "tel")}
        {perfil.phone ? <a className={styles.btnAcaoRapida} href={`https://wa.me/${perfil.phone.replace(/\D/g, "").length <= 11 ? "55" : ""}${perfil.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"><MessageSquare size={14} /> WhatsApp</a> : null}
        {campo("E-mail", "email", "email")}
        {perfil.email ? <button type="button" className={styles.btnAcaoRapida} onClick={() => void copiar()}><Copy size={14} /> Copiar e-mail</button> : null}
        {copia ? <span role="status">{copia}</span> : null}
      </div>
      <div className={styles.painelCard}>
        <div className={styles.painelCardHeader}><h4>Endereço</h4></div>
        {campo("Logradouro", "street")}{campo("Complemento", "addressComplement")}{campo("Bairro", "district")}
        <div className={styles.cidadeUf}>{campo("Cidade", "city")}{campo("UF", "state")}</div>
        {campo("CEP", "postalCode")}
      </div>
      <div className={styles.painelCard}>
        <div className={styles.painelCardHeader}><h4>Contato do lead</h4></div>
        {rascunho.contact ? <>
          {([ ["Nome do contato", "name"], ["Cargo do contato", "jobTitle"], ["Telefone do contato", "phone"], ["E-mail do contato", "email"], ["CPF do contato", "cpf"], ["RG do contato", "rg"] ] as const).map(([rotulo, chave]) => <CampoDoLead key={chave} rotulo={rotulo} erro={erros[`contact.${chave}`]}>
            <input className="ui-input" type={chave === "email" ? "email" : "text"} aria-invalid={!!erros[`contact.${chave}`]} value={rascunho.contact?.[chave] ?? ""} onChange={(e) => alterarContato(chave, e.target.value)} />
          </CampoDoLead>)}
          <CampoDoLead rotulo="Papel do contato" erro={erros["contact.role"]}>
            <select className="ui-input" value={rascunho.contact.role ?? ""} onChange={(e) => alterarContato("role", e.target.value as ClientContactRole)}>
              <option value="">Não informado</option>{clientContactRoles.map((papel) => <option key={papel} value={papel}>{ROTULO_PAPEL[papel]}</option>)}
            </select>
          </CampoDoLead>
          <label className={styles.opcaoMarcavel}><input type="checkbox" checked={!!rascunho.contact.phoneIsWhatsapp} onChange={(e) => alterarContato("phoneIsWhatsapp", e.target.checked)} /> Telefone do contato tem WhatsApp</label>
          <label className={styles.opcaoMarcavel}><input type="checkbox" checked={!!rascunho.contact.isPrimary} onChange={(e) => alterarContato("isPrimary", e.target.checked)} /> Contato principal</label>
          <button type="button" className={styles.btnAcaoRapida} onClick={() => aoAlterar((atual) => atual && { ...atual, contact: null })}>Remover contato do lead</button>
        </> : <><p className={styles.cockpitCardSub}>Nenhum contato cadastrado neste lead.</p><button type="button" className={styles.btnAcaoRapida} onClick={() => aoAlterar((atual) => atual && { ...atual, contact: { name: "", phone: null, email: null } })}>Adicionar contato do lead</button></>}
      </div>
    </div>
    <CampoDoLead rotulo="Anotações do atendimento" erro={erros["lead.notes"]}>
      <textarea rows={4} value={perfil.notes ?? ""} onChange={(e) => alterar("notes", e.target.value)} maxLength={2000} />
    </CampoDoLead>
  </>;
}
