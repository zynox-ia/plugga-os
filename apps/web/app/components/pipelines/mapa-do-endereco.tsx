"use client";

import type { LeadProfile } from "@plugga/shared";
import { ExternalLink, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { mapaDoEndereco } from "../../lib/perfil-lead";
import styles from "./perfil-do-lead.module.css";

/** Usado na ficha do lead e na do fornecedor (PLU-334): só os campos do endereço importam. */
export function MapaDoEndereco({ endereco, descricao = "Atualiza conforme o CEP e o endereço informados.", rotulo = "lead" }: {
  endereco: Pick<LeadProfile, "postalCode" | "street" | "district" | "city" | "state">;
  descricao?: string;
  /** De quem é a localização, para o título do mapa ("localização do lead"). */
  rotulo?: string;
}) {
  const consulta = mapaDoEndereco(endereco)?.query ?? "";
  const [busca, setBusca] = useState(consulta);
  useEffect(() => {
    const timer = setTimeout(() => setBusca(consulta), 650);
    return () => clearTimeout(timer);
  }, [consulta]);
  const embedUrl = `https://maps.google.com/maps?${new URLSearchParams({ q: busca, output: "embed", z: "16", hl: "pt-BR" })}`;
  const externalUrl = `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: busca })}`;

  return <div className={styles.mapa}>
    <div className={styles.cabecalhoMapa}>
      <div><span><MapPin size={14} aria-hidden="true" />Localização no mapa</span><p>{descricao}</p></div>
      {busca ? <a className="button button--secondary ui-button ui-button--sm" href={externalUrl} target="_blank" rel="noopener noreferrer"><span className="ui-button-icon" aria-hidden="true"><ExternalLink /></span><span className="ui-button-label">Abrir no Google Maps</span></a> : null}
    </div>
    {busca ? <iframe title={`Google Maps — localização do ${rotulo}`} src={embedUrl} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /> : <div className={styles.mapaVazio}><MapPin size={24} aria-hidden="true" /><p>Preencha o CEP ou o endereço para visualizar a localização.</p></div>}
  </div>;
}
