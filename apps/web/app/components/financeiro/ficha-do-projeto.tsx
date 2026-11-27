"use client";

import { ArrowDownLeft, ArrowUpRight, Boxes, ExternalLink, LayoutGrid, Plus, ShoppingCart, UserRound, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { hojeEmManaus } from "../../lib/compras";
import { hrefDoProjeto, projetoVazio, ROTULO_DA_CLASSE, ROTULO_DA_SITUACAO, type Projeto } from "../../lib/prototipo-centro-de-custo";
import estilosFicha from "../compras/ficha-do-pedido.module.css";
import { FecharModal, Modal } from "../modal";
import detalhes from "../pipelines/detalhes-do-lead-modal.module.css";
import visao from "../pipelines/resumo-do-lead.module.css";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Badge, Button } from "../ui";
import { iconeDoProjeto, SeloDoPrototipo, TOM_DA_SITUACAO } from "./centro-de-custo-partes";
import styles from "./centro-de-custo.module.css";
import fichaDoLancamento from "./ficha.module.css";
import { NovaEntradaDoProjeto } from "./nova-entrada-do-projeto";
import {
  ComprasDoProjeto,
  DadosDoProjeto,
  EntradasDoProjeto,
  ListaDeOutrosProjetos,
  ListaDeVencimentos,
  MaterialDoProjeto,
  ResumoDoProjeto,
  SaidasDoProjeto,
  VazioDoProjeto,
  type TelasDeOrigem,
} from "./projeto-do-centro-de-custo";

type Aba = "geral" | "entradas" | "saidas" | "material" | "compras";

/**
 * A ficha do projeto em modal (PLU-362, pedido do André em 27/11/2026): o
 * padrão das fichas do sistema (lançamento, pedido de compra, lead), com
 * cabeçalho, abas e o rodapé de ações fixo no fim. Abre a partir do card, com o
 * endereço `?projeto=` (compartilhável); Esc fecha e devolve o foco ao card.
 * Só leitura, com um atalho: Nova entrada, que cria a cobrança em Lançamentos
 * com o cliente e o projeto já preenchidos (no protótipo, em memória).
 */
export function FichaDoProjeto({ projeto: p, outros, abre, hrefDe, aoFechar }: {
  projeto: Projeto;
  outros: readonly Projeto[];
  abre: TelasDeOrigem;
  /** O endereço da ficha de outro projeto (a lista por baixo, com a ficha dele aberta). */
  hrefDe: (id: string) => string;
  aoFechar: () => void;
}) {
  const id = useId();
  const [aba, setAba] = useState<Aba>("geral");
  const [criando, setCriando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 8000); return () => clearTimeout(t); }, [aviso]);

  const vazio = projetoVazio(p);
  const hoje = hojeEmManaus();
  const Icone = iconeDoProjeto(p);
  const abas: { id: Aba; titulo: string; curto: string; conta?: number; icone: LucideIcon }[] = [
    { id: "geral", titulo: "Visão geral", curto: "Geral", icone: LayoutGrid },
    { id: "entradas", titulo: "Entradas", curto: "Entradas", conta: p.entradas.length, icone: ArrowDownLeft },
    { id: "saidas", titulo: "Saídas", curto: "Saídas", conta: p.saidas.length, icone: ArrowUpRight },
    { id: "material", titulo: "Material do estoque", curto: "Material", conta: p.material.length, icone: Boxes },
    { id: "compras", titulo: "Compras", curto: "Compras", conta: p.compras.length, icone: ShoppingCart },
  ];
  function navegar(evento: KeyboardEvent<HTMLDivElement>) {
    const i = abas.findIndex((a) => a.id === aba);
    const j = evento.key === "ArrowRight" ? (i + 1) % abas.length : evento.key === "ArrowLeft" ? (i - 1 + abas.length) % abas.length : evento.key === "Home" ? 0 : evento.key === "End" ? abas.length - 1 : null;
    if (j === null) return;
    evento.preventDefault(); setAba(abas[j]!.id); botoes.current[j]?.focus();
  }

  const novaEntrada = <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setCriando(true)}>Nova entrada</Button>;

  return <Modal rotulo={`Centro de custo de ${p.nome}`} aoFechar={aoFechar} largura="larga" className={detalhes.modal}>
    <div className={detalhes.layout}>
      <header className={`${detalhes.cabecalhoLead} plg-parte`}>
        <div className={detalhes.identidadeCabecalho}>
          <div className={detalhes.leadCardLinhaSuperior}>
            <div className={detalhes.iconeLead} aria-hidden="true"><Icone size={20} /></div>
            <div className={detalhes.identidadeLead}>
              <h2 className={detalhes.leadCardTitulo}>{p.nome}</h2>
              <div className={detalhes.metadadosCabecalho}>
                <span><UserRound size={13} aria-hidden="true" />{p.cliente.nome}</span><span aria-hidden="true">·</span>
                <span>{ROTULO_DA_CLASSE[p.classe]} · {p.tipo}</span><span aria-hidden="true">·</span>
                <span className={estilosFicha.empresaCabecalho}><EmpresaComPonto empresa={p.empresa} curto /></span>
              </div>
            </div>
          </div>
        </div>
        <div className={detalhes.controlesCabecalho}>
          <span className={styles.seloDaFicha}><SeloDoPrototipo /></span>
          <Badge tone={TOM_DA_SITUACAO[p.situacao]}>{ROTULO_DA_SITUACAO[p.situacao]}</Badge>
          <FecharModal>{(fechar) => <button type="button" className={`${detalhes.botaoFechar} plg-pressiona`} onClick={fechar} aria-label="Fechar"><X size={18} aria-hidden="true" /></button>}</FecharModal>
        </div>
      </header>
      <div className={detalhes.painelPrincipal}>
        <div className={`${detalhes.navegacao} plg-parte`} role="tablist" aria-label="Seções do centro de custo" aria-orientation="horizontal" onKeyDown={navegar}>
          {abas.map((a, i) => <div key={a.id}>
            <button ref={(el) => { botoes.current[i] = el; }} type="button" role="tab" id={`${id}-${a.id}`} aria-selected={aba === a.id} aria-controls={`${id}-painel`} aria-label={a.conta !== undefined ? `${a.titulo} ${a.conta}` : a.titulo} tabIndex={aba === a.id ? 0 : -1} className={detalhes.abaBotao} onClick={() => setAba(a.id)}>
              <a.icone size={15} aria-hidden="true" /><span><span className={estilosFicha.abaLonga}>{a.titulo}</span><span className={estilosFicha.abaCurta} aria-hidden="true">{a.curto}</span>{a.conta !== undefined ? <span className={estilosFicha.contaAba}> {a.conta}</span> : null}</span>
            </button>
          </div>)}
        </div>
        <section id={`${id}-painel`} role="tabpanel" aria-labelledby={`${id}-${aba}`} className={`${detalhes.conteudo} ${estilosFicha.painel} ${styles.painelDaFicha} plg-parte`}>
          {aviso ? <p role="status" className="aviso aviso--sucesso">{aviso}</p> : null}
          {/* Visão geral no padrão da ficha do lançamento: seções com o título pequeno (resumo-do-lead, .secao h3) e os dados na grade. */}
          {aba === "geral" ? <div className={visao.resumo}>
            <ResumoDoProjeto projeto={p} />
            {vazio ? <VazioDoProjeto /> : null}
            <section className={visao.secao} aria-labelledby={`${id}-dados`}>
              <h3 id={`${id}-dados`}>Ficha do projeto</h3>
              <DadosDoProjeto projeto={p} abre={abre} className={visao.grade} />
            </section>
            <section className={visao.secao} aria-labelledby={`${id}-vencimentos`}>
              <h3 id={`${id}-vencimentos`}>Próximos vencimentos</h3>
              <ListaDeVencimentos projeto={p} hoje={hoje} />
            </section>
            {outros.length ? <section className={visao.secao} aria-labelledby={`${id}-outros`}>
              <h3 id={`${id}-outros`}>Outros projetos de {p.cliente.nome}</h3>
              <ListaDeOutrosProjetos outros={outros} hrefDe={hrefDe} />
            </section> : null}
          </div> : null}
          {aba === "entradas" ? <EntradasDoProjeto projeto={p} abre={abre} acao={novaEntrada} /> : null}
          {aba === "saidas" ? <SaidasDoProjeto projeto={p} abre={abre} /> : null}
          {aba === "material" ? <MaterialDoProjeto projeto={p} abre={abre} /> : null}
          {aba === "compras" ? <ComprasDoProjeto projeto={p} abre={abre} /> : null}

          <footer className={`${estilosFicha.rodape} ${fichaDoLancamento.rodapeFixo}`}>
            <Link href={hrefDoProjeto(p.id)} className={`button button--secondary ui-button ui-button--md ${styles.botaoLink}`} title="A primeira forma do protótipo, em página inteira, para comparar">
              <span className="ui-button-icon" aria-hidden="true"><ExternalLink size={15} /></span><span className="ui-button-label">Abrir em página inteira</span>
            </Link>
            <span className={estilosFicha.espaco} />
            <Button icon={<Plus size={15} />} onClick={() => setCriando(true)}>Nova entrada</Button>
          </footer>
        </section>
      </div>
    </div>
    {criando ? <NovaEntradaDoProjeto projeto={p} aoFechar={() => setCriando(false)}
      aoCriar={() => { setCriando(false); setAba("entradas"); setAviso("Entrada criada em Lançamentos, vinculada a este projeto. Protótipo: some ao recarregar a página."); }} /> : null}
  </Modal>;
}
