"use client";

import { rotulosDaCategoriaDeFornecedor, rotulosDaFormaDePagamento, type DesempenhoDoFornecedor, type Fornecedor } from "@plugga/shared";
import { Building2, Check, FileText, Mail, MapPin, Paperclip, Phone, Send, ShoppingCart, Trophy, Truck } from "lucide-react";
import type { ReactNode } from "react";

import { diaCurto, hojeEmManaus, valorCurto } from "../../lib/compras";
import { cepFormatado, documentoFormatado, enderecoNoMapa, linksDoTelefone, ruaDoFornecedor, telefoneFormatado, textosDoDesempenho } from "../../lib/fornecedores";
import { MapaDoEndereco } from "../pipelines/mapa-do-endereco";
import perfil from "../pipelines/perfil-do-lead.module.css";
import { CardDeMetrica, MetricasDoTopo } from "../suprimentos/card-de-metrica";
import { Button } from "../ui";
import styles from "./ficha-do-fornecedor.module.css";

function Dado({ rotulo, children, largo = false }: { rotulo: string; children: ReactNode; largo?: boolean }) {
  return <div className={`${perfil.dado} ${largo ? perfil.enderecoLargo : ""}`}>
    <dt>{rotulo}</dt>
    <dd>{children || <span className={perfil.ausente}>Não informado</span>}</dd>
  </div>;
}

/** Visão geral: 4 cards de desempenho, identificação, contato, endereço com o mapa e observações. */
export function VisaoGeralDoFornecedor({ fornecedor: f, desempenho, aoCopiar }: {
  fornecedor: Fornecedor; desempenho: DesempenhoDoFornecedor | null; aoCopiar: (texto: string, rotulo: string) => void;
}) {
  const textos = desempenho ? textosDoDesempenho(desempenho, (iso) => diaCurto(hojeEmManaus(new Date(iso)))) : null;
  const links = linksDoTelefone(f.telefone);
  const endereco = enderecoNoMapa(f);
  return <div className={styles.corpo}>
    {desempenho && textos ? <MetricasDoTopo rotulo="Desempenho do fornecedor">
      <CardDeMetrica rotulo="Cotações" valor={textos.cotacoes.valor} nota={textos.cotacoes.nota} icone={<Paperclip size={15} />} />
      <CardDeMetrica rotulo="Vitórias" valor={textos.vitorias.valor} nota={textos.vitorias.nota} icone={<Trophy size={15} />} barra={textos.vitorias.barra} />
      <CardDeMetrica rotulo="Comprado" valor={valorCurto(desempenho.valorComprado)} nota="nas cotações vencedoras de pedidos concluídos" icone={<ShoppingCart size={15} />} />
      <CardDeMetrica rotulo="Prazo médio" valor={textos.prazo.valor} nota={textos.prazo.nota} icone={<Truck size={15} />} />
    </MetricasDoTopo> : <p className={styles.vazio} role="status">Não foi possível carregar o desempenho agora. O cadastro abaixo está completo.</p>}

    <div className={perfil.grade}>
      <section className={`${perfil.secao} ${styles.painel}`} aria-label="Identificação">
        <h4><Building2 size={16} aria-hidden="true" />Identificação</h4>
        <dl className={perfil.dados}>
          <Dado rotulo="Razão social / nome">{f.nome}</Dado>
          <Dado rotulo="Nome fantasia">{f.nomeFantasia}</Dado>
          <Dado rotulo="CNPJ / CPF">{documentoFormatado(f.documento)}</Dado>
          <Dado rotulo="Categoria">{rotulosDaCategoriaDeFornecedor[f.categoria]}</Dado>
        </dl>
        <div className={styles.selos} aria-label="Formas de pagamento aceitas">
          {f.formasDePagamento.length
            ? f.formasDePagamento.map((forma) => <span key={forma} className={styles.selo}><Check size={11} aria-hidden="true" />{rotulosDaFormaDePagamento[forma]}</span>)
            : <span className={perfil.ausente}>Formas de pagamento não informadas</span>}
        </div>
      </section>

      <section className={`${perfil.secao} ${styles.painel}`} aria-label="Contato">
        <h4><Phone size={16} aria-hidden="true" />Contato</h4>
        <dl className={perfil.dados}>
          <Dado rotulo="Contato">{f.contatoNome}</Dado>
          <Dado rotulo="Telefone / WhatsApp">{telefoneFormatado(f.telefone)}</Dado>
          <Dado rotulo="E-mail" largo>{f.email}</Dado>
        </dl>
        {links || f.email ? <div className={styles.acoesRapidas}>
          {links ? <>
            <a className="button button--secondary ui-button ui-button--sm" href={links.ligar}><span className="ui-button-icon" aria-hidden="true"><Phone /></span><span className="ui-button-label">Ligar</span></a>
            <a className="button button--secondary ui-button ui-button--sm" href={links.whatsapp} target="_blank" rel="noopener noreferrer"><span className="ui-button-icon" aria-hidden="true"><Send /></span><span className="ui-button-label">WhatsApp</span></a>
          </> : null}
          {f.email ? <Button variant="secondary" size="sm" icon={<Mail size={14} />} onClick={() => aoCopiar(f.email!, "E-mail")}>Copiar e-mail</Button> : null}
        </div> : null}
      </section>
    </div>

    <section className={`${perfil.secao} ${perfil.endereco} ${styles.painel}`} aria-label="Endereço">
      <h4><MapPin size={16} aria-hidden="true" />Endereço</h4>
      <dl className={perfil.enderecoGrade}>
        <Dado rotulo="CEP">{cepFormatado(f.cep)}</Dado>
        <Dado rotulo="Rua / número" largo>{ruaDoFornecedor(f)}</Dado>
        <Dado rotulo="Bairro">{f.bairro}</Dado>
        <Dado rotulo="Cidade" largo>{f.cidade}</Dado>
        <Dado rotulo="Estado / UF">{f.uf}</Dado>
      </dl>
      <MapaDoEndereco endereco={endereco} descricao="Pelo endereço do cadastro." rotulo="fornecedor" />
    </section>

    {f.observacoes ? <section className={`${perfil.secao} ${styles.painel}`} aria-label="Observações">
      <h4><FileText size={16} aria-hidden="true" />Observações</h4>
      <p className={styles.observacoes}>{f.observacoes}</p>
    </section> : null}
  </div>;
}
