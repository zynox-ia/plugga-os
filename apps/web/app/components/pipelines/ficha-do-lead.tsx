"use client";

import { formatarCep, somenteDigitos, telefoneNacional, ufs, type LeadProfile, type PipelinePerson } from "@plugga/shared";
import { Building2, Globe, Mail, MapPin, MessageSquare, Pencil, Phone, Target, UserRound } from "lucide-react";
import { useId, type Dispatch, type InputHTMLAttributes, type ReactNode, type SetStateAction } from "react";
import { telefoneFormatado } from "../../lib/clientes";
import { mascaraCep, mascaraTelefone, normalizarSite, urlSiteSeguro } from "../../lib/perfil-lead";
import type { RascunhoLead } from "../../lib/rascunho-lead";
import { Button } from "../ui/button";
import { TextField, TextareaField } from "../ui/fields";
import { SelectField } from "../ui/select-field";
import { WhatsAppIcon } from "../ui/whatsapp-icon";
import { Avatar } from "./icones";
import { MapaDoEndereco } from "./mapa-do-endereco";
import perfilStyles from "./perfil-do-lead.module.css";
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

function Dado({ label, value, children }: { label: string; value?: string | null; children?: ReactNode }) {
  return <div className={perfilStyles.dado}><dt>{label}</dt><dd>{value || children || <span className={perfilStyles.ausente}>Não informado</span>}</dd></div>;
}

export function FichaDoLead({ rascunho, aoAlterar, erros, editando, aoEditar, responsaveis }: PropsEdicaoLead & {
  editando: boolean; aoEditar: () => void; responsaveis: PipelinePerson[];
}) {
  const perfil = rascunho.lead;
  function alterar(campo: keyof LeadProfile, valor: string) {
    aoAlterar((atual) => atual && { ...atual, lead: { ...atual.lead, [campo]: valor } });
  }
  const campo = (label: string, chave: keyof Omit<LeadProfile, "personType">, props: InputHTMLAttributes<HTMLInputElement> = {}) => {
    const telefone = chave === "phone" || chave === "landlinePhone";
    const cep = chave === "postalCode";
    const valor = perfil[chave] ?? "";
    return <TextField label={label} value={telefone ? mascaraTelefone(valor, chave === "landlinePhone") : cep ? mascaraCep(valor) : valor}
      error={erros[`lead.${chave}`]} onChange={(evento) => {
        const digitado = evento.target.value;
        alterar(chave, telefone ? telefoneNacional(digitado).slice(0, chave === "landlinePhone" ? 10 : 11) : cep ? somenteDigitos(digitado).slice(0, 8) : digitado);
      }} onBlur={(evento) => {
        if (chave === "email") alterar(chave, evento.target.value.trim());
        if (chave === "website") alterar(chave, normalizarSite(evento.target.value));
      }} {...props} />;
  };
  const responsavel = responsaveis.find((pessoa) => pessoa.id === rascunho.ownerId);
  const telefone = somenteDigitos(perfil.phone ?? "");
  const whatsapp = telefone ? `https://wa.me/${telefone.length <= 11 ? "55" : ""}${telefone}` : null;
  const site = urlSiteSeguro(perfil.website);

  return <div className={perfilStyles.perfil}>
    <div className={perfilStyles.cabecalho}><div><h3>Perfil do Lead</h3><p>Informações para conhecer o lead e conduzir a negociação.</p></div><div className={perfilStyles.acoes}>
      {whatsapp ? <a className="button button--secondary ui-button ui-button--sm" href={whatsapp} target="_blank" rel="noopener noreferrer"><span className="ui-button-icon" aria-hidden="true"><WhatsAppIcon /></span><span className="ui-button-label">WhatsApp</span></a> : null}
      {editando ? <span className={perfilStyles.emEdicao}><Pencil size={13} aria-hidden="true" />Em edição</span> : <Button size="sm" icon={<Pencil />} onClick={aoEditar}>Editar perfil</Button>}
    </div></div>
    <div className={perfilStyles.grade}>
      <section className={perfilStyles.secao} aria-label="Identificação"><h4><UserRound size={16} aria-hidden="true" />Identificação</h4>
        {editando ? <div className={perfilStyles.campos}>
          {campo("Nome / nome fantasia", "name", { required: true, maxLength: 150, autoComplete: "name" })}
          <SelectField label="Tipo de pessoa" value={perfil.personType} error={erros["lead.personType"]} onChange={(valor) => alterar("personType", valor)} options={[{ value: "pf", label: "Pessoa física", icon: <UserRound /> }, { value: "pj", label: "Pessoa jurídica", icon: <Building2 /> }]} />
          {campo("Empresa", "companyName", { maxLength: 200, autoComplete: "organization", placeholder: "Se aplicável" })}
          {campo("Cargo / função do contato", "jobTitle", { maxLength: 100, autoComplete: "organization-title" })}
        </div> : <dl className={perfilStyles.dados}><Dado label="Nome / nome fantasia" value={perfil.name} /><Dado label="Tipo" value={perfil.personType === "pj" ? "Pessoa jurídica" : "Pessoa física"} /><Dado label="Empresa" value={perfil.companyName} /><Dado label="Cargo / função do contato" value={perfil.jobTitle} /></dl>}
      </section>
      <section className={perfilStyles.secao} aria-label="Contato e canais"><h4><MessageSquare size={16} aria-hidden="true" />Contato e canais</h4>
        {editando ? <div className={perfilStyles.campos}>
          {campo("Celular / WhatsApp", "phone", { type: "tel", inputMode: "tel", autoComplete: "tel-national", maxLength: 20, placeholder: "(11) 99999-0000" })}
          {campo("Telefone fixo", "landlinePhone", { type: "tel", inputMode: "tel", maxLength: 20, placeholder: "(11) 3333-4444" })}
          {campo("E-mail", "email", { type: "email", inputMode: "email", autoComplete: "email", autoCapitalize: "none", spellCheck: false, maxLength: 254 })}
          {campo("Site", "website", { type: "url", inputMode: "url", autoComplete: "url", maxLength: 2048, placeholder: "https://empresa.com.br" })}
        </div> : <dl className={perfilStyles.dados}>
          <Dado label="Celular / WhatsApp">{whatsapp ? <a href={whatsapp} target="_blank" rel="noopener noreferrer"><Phone size={13} aria-hidden="true" />{telefoneFormatado(perfil.phone)}</a> : null}</Dado>
          <Dado label="Telefone fixo">{perfil.landlinePhone ? <a href={`tel:${somenteDigitos(perfil.landlinePhone)}`}><Phone size={13} aria-hidden="true" />{telefoneFormatado(perfil.landlinePhone)}</a> : null}</Dado>
          <Dado label="E-mail">{perfil.email ? <a href={`mailto:${perfil.email}`}><Mail size={13} aria-hidden="true" />{perfil.email}</a> : null}</Dado>
          <Dado label="Site">{site ? <a href={site} target="_blank" rel="noopener noreferrer"><Globe size={13} aria-hidden="true" />{perfil.website}</a> : perfil.website}</Dado>
        </dl>}
      </section>
    </div>
    <section className={`${perfilStyles.secao} ${perfilStyles.endereco}`} aria-label="Endereço completo"><h4><MapPin size={16} aria-hidden="true" />Endereço completo<span>Opcional</span></h4>
      {editando ? <div className={perfilStyles.enderecoGrade}>
        {campo("CEP", "postalCode", { inputMode: "numeric", autoComplete: "postal-code", placeholder: "00000-000", maxLength: 9 })}
        <div className={perfilStyles.enderecoLargo}>{campo("Rua / número", "street", { maxLength: 200, autoComplete: "address-line1" })}</div>
        {campo("Complemento", "addressComplement", { maxLength: 100, autoComplete: "address-line2" })}{campo("Bairro", "district", { maxLength: 100 })}
        <div className={perfilStyles.enderecoLargo}>{campo("Cidade", "city", { maxLength: 100, autoComplete: "address-level2" })}</div>
        <SelectField label="Estado / UF" value={perfil.state || "nao-informado"} error={erros["lead.state"]} onChange={(valor) => alterar("state", valor === "nao-informado" ? "" : valor)} options={[{ value: "nao-informado", label: "Não informado" }, ...ufs.map((uf) => ({ value: uf, label: uf, icon: <MapPin /> }))]} />
      </div> : <dl className={perfilStyles.enderecoGrade}>
        <Dado label="CEP" value={perfil.postalCode ? formatarCep(perfil.postalCode) : null} /><div className={perfilStyles.enderecoLargo}><Dado label="Rua / número" value={perfil.street} /></div>
        <Dado label="Complemento" value={perfil.addressComplement} /><Dado label="Bairro" value={perfil.district} /><div className={perfilStyles.enderecoLargo}><Dado label="Cidade" value={perfil.city} /></div><Dado label="Estado / UF" value={perfil.state} />
      </dl>}
      <MapaDoEndereco endereco={perfil} />
    </section>
    <section className={`${perfilStyles.secao} ${perfilStyles.qualificacao}`} aria-label="Qualificação comercial">
      <div className={perfilStyles.principal}><h4><Target size={16} aria-hidden="true" />Qualificação comercial</h4>
        {editando ? <div className={perfilStyles.dadosQualificacao}>
          <SelectField label="Responsável comercial interno" value={rascunho.ownerId} error={erros.ownerId} onChange={(valor) => aoAlterar((atual) => atual && { ...atual, ownerId: valor })} options={responsaveis.map((pessoa) => ({ value: pessoa.id, label: pessoa.name, icon: <UserRound /> }))} />
          {campo("Segmento / interesse principal", "mainInterest", { maxLength: 150, placeholder: "Ex.: comércio · redução de custos com energia" })}
        </div> : <dl className={perfilStyles.dadosQualificacao}>
          <Dado label="Responsável comercial interno">{responsavel ? <span className={perfilStyles.pessoa}><span aria-hidden="true"><Avatar id={responsavel.id} nome={responsavel.name} tamanho="pequeno" /></span>{responsavel.name}</span> : null}</Dado>
          <Dado label="Segmento / interesse principal">{perfil.mainInterest || <button type="button" className={perfilStyles.adicionar} onClick={aoEditar}>Adicionar interesse<Pencil size={12} aria-hidden="true" /></button>}</Dado>
        </dl>}
      </div>
      <div className={perfilStyles.observacoes}>{editando ? <TextareaField label="Observações importantes" value={perfil.notes ?? ""} error={erros["lead.notes"]} onChange={(evento) => alterar("notes", evento.target.value)} rows={3} maxLength={2000} /> : <dl><Dado label="Observações importantes" value={perfil.notes} /></dl>}</div>
    </section>
  </div>;
}
