import type { ClientListItem } from "@plugga/shared";
import { Building2, Check, Mail, MapPin, Phone, UserRound, X } from "lucide-react";

import { Avatar } from "../pipelines/icones";
import estilosKanban from "../pipelines/cartao-de-negocio.module.css";
import styles from "./tela-clientes.module.css";

export function AvatarDoCliente() {
  return <span className={styles.avatar} data-avatar-cliente aria-hidden="true"><UserRound size={19} /></span>;
}

export function TipoELocalDoCliente({ cliente }: { cliente: ClientListItem }) {
  const local = [cliente.city, cliente.state].filter(Boolean).join(" / ") || "Local não informado";
  const Icone = cliente.personType === "pj" ? Building2 : UserRound;
  return <div className={styles.tipoLocal} data-tipo-local>
    <span className={styles.tipo}><Icone size={12} aria-hidden="true" />Pessoa {cliente.personType === "pj" ? "Jurídica" : "Física"}</span>
    <span aria-hidden="true">·</span>
    <span className={styles.local} title={local}><MapPin size={12} aria-hidden="true" /><span>{local}</span></span>
  </div>;
}

export function SituacaoDoCliente({ ativo, nome, salvando, aoAlternar }: { ativo: boolean; nome: string; salvando: boolean; aoAlternar: () => void }) {
  return <button type="button" className={`${estilosKanban.status} ${styles.situacao}`} data-status={ativo ? "won" : "lost"}
    aria-label={`${ativo ? "Inativar" : "Ativar"} cliente ${nome}`} aria-pressed={ativo} aria-busy={salvando || undefined} disabled={salvando}
    title={salvando ? "Salvando situação…" : `Clique para ${ativo ? "inativar" : "ativar"} o cliente`}
    onClick={(evento) => { evento.stopPropagation(); aoAlternar(); }}>{ativo ? <Check size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />}{ativo ? "Ativo" : "Inativo"}</button>;
}

export function ContatoDoCliente({ cliente, mostrarTelefone = true }: { cliente: ClientListItem; mostrarTelefone?: boolean }) {
  return <div className={styles.contatos}>
    <span title={cliente.email ?? "E-mail não informado"}><Mail size={13} aria-hidden="true" /><span>{cliente.email ?? "E-mail não informado"}</span></span>
    {mostrarTelefone ? <span><Phone size={13} aria-hidden="true" /><span>{cliente.phoneDisplay ?? "Telefone não informado"}</span></span> : null}
  </div>;
}

export function ResponsavelDoCliente({ cliente }: { cliente: ClientListItem }) {
  const nome = cliente.owner?.name ?? "Não atribuído";
  return <div className={`${estilosKanban.responsavel} ${styles.responsavel}`} title={`Responsável: ${nome}`}>
    <Avatar id={cliente.owner?.id} nome={nome} tamanho="pequeno" />
    <span>{nome}</span>
  </div>;
}
