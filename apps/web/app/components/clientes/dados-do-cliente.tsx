import type { ClientListItem } from "@plugga/shared";
import { Building2, Mail, MapPin, Phone, UserRound } from "lucide-react";

import styles from "./tela-clientes.module.css";

export function AvatarDoCliente({ pequeno = false }: { pequeno?: boolean }) {
  return <span className={`${styles.avatar}${pequeno ? ` ${styles.avatarPequeno}` : ""}`} data-avatar-cliente aria-hidden="true"><UserRound size={pequeno ? 15 : 19} /></span>;
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

export function SituacaoDoCliente({ ativo }: { ativo: boolean }) {
  return <span className={styles.situacao} data-ativo={ativo}>{ativo ? "Ativo" : "Inativo"}</span>;
}

export function ContatoDoCliente({ cliente }: { cliente: ClientListItem }) {
  return <div className={styles.contatos}>
    <span title={cliente.email ?? "E-mail não informado"}><Mail size={13} aria-hidden="true" /><span>{cliente.email ?? "E-mail não informado"}</span></span>
    <span><Phone size={13} aria-hidden="true" /><span>{cliente.phoneDisplay ?? "Telefone não informado"}</span></span>
  </div>;
}

export function ResponsavelDoCliente({ cliente, comRotulo = false }: { cliente: ClientListItem; comRotulo?: boolean }) {
  return <div className={styles.responsavel}>
    <AvatarDoCliente pequeno />
    <div>{comRotulo ? <small>Responsável</small> : null}<span title={cliente.owner?.name ?? "Não atribuído"}>{cliente.owner?.name ?? "Não atribuído"}</span></div>
  </div>;
}
