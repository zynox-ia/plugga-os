import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Boxes, Building2, ClipboardList, FileText, Fuel, HardHat, Info, Landmark, Link2, Package, PanelsTopLeft, Scale, ShoppingCart, Sparkles, Truck, User, Users, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import {
  dataCurta,
  hrefDosProjetos,
  reais,
  resumoDoProjeto,
  ROTA_DO_CENTRO_DE_CUSTO,
  ROTULO_DA_CLASSE,
  ROTULO_DA_SITUACAO,
  saidasPorCategoria,
  totalDaSaidaDoEstoque,
  projetoVazio,
  type CategoriaDaSaida,
  type CompraDoProjeto,
  type Entrada,
  type Projeto,
  type Saida,
} from "../../lib/prototipo-centro-de-custo";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { CardDeMetrica } from "../suprimentos/card-de-metrica";
import { EmpresaComPonto } from "../suprimentos/empresa";
import { Badge } from "../ui";
import { iconeDoProjeto, SeloDoPrototipo, TOM_DA_SITUACAO } from "./centro-de-custo-partes";
import styles from "./centro-de-custo.module.css";

/**
 * As peças do centro de custo de um projeto (PLU-362), PROTÓTIPO: o resumo e as
 * origens (entradas, saídas por categoria, material do estoque e compras). A
 * ficha em modal e a página inteira usam as mesmas. Só leitura: cada linha vem
 * de onde foi vinculada ao projeto e leva ao registro de origem.
 */

/** Que telas de origem a pessoa abre: sem a tela, o código aparece como texto, sem link. */
export type TelasDeOrigem = { lancamentos: boolean; compras: boolean; estoque: boolean; clientes: boolean; projetos: boolean };

const ROTA_DA_ORIGEM: Record<keyof TelasDeOrigem, { href: string; tela: string }> = {
  lancamentos: { href: "/financeiro/lancamentos", tela: "Lançamentos" },
  compras: { href: "/suprimentos/compras", tela: "Compras" },
  estoque: { href: "/suprimentos/estoque", tela: "Estoque" },
  clientes: { href: "/clientes", tela: "Clientes" },
  projetos: { href: "/engenharia/obras", tela: "Projetos, na Engenharia" },
};

const ICONE_DA_CATEGORIA: Record<CategoriaDaSaida, LucideIcon> = {
  material: Package,
  mao_de_obra: HardHat,
  servicos: FileText,
  locacao: Truck,
  frete: Fuel,
  impostos: Landmark,
};

/**
 * O código do registro de origem (CP-0233, PC-0101, EST-0012). No protótipo, o
 * link abre a tela real de origem; no sistema real, abrirá a ficha do registro.
 */
function Origem({ codigo, tela, abre }: { codigo: string; tela: keyof TelasDeOrigem; abre: TelasDeOrigem }) {
  if (!abre[tela]) return <span>{codigo}</span>;
  const destino = ROTA_DA_ORIGEM[tela];
  return <Link href={destino.href} className={styles.origem} title={`Protótipo: abre ${destino.tela}. No sistema real, abre a ficha de ${codigo}.`}>{codigo}</Link>;
}

export function Bloco({ id, titulo, icone, sub, total, acao, children }: { id?: string; titulo: string; icone: ReactNode; sub: ReactNode; total?: { valor: string; nota?: string }; acao?: ReactNode; children: ReactNode }) {
  return <section id={id} className={styles.bloco} aria-labelledby={id ? `${id}-titulo` : undefined} aria-label={id ? undefined : titulo}>
    <header className={styles.blocoTopo}>
      <div><h2 id={id ? `${id}-titulo` : undefined}>{icone}{titulo}</h2><p>{sub}</p></div>
      {total || acao ? <span className={styles.blocoLado}>
        {total ? <span className={styles.blocoTotal}><strong>{total.valor}</strong>{total.nota ? <small>{total.nota}</small> : null}</span> : null}
        {acao}
      </span> : null}
    </header>
    {children}
  </section>;
}

function situacaoDaEntrada(e: Entrada): string {
  if (e.situacao === "recebida") return `Recebida em ${dataCurta(e.recebidaEm!)}`;
  if (e.situacao === "cancelada") return "Cancelada · fora dos totais";
  return `A receber · vence ${dataCurta(e.vencimento)}`;
}

function situacaoDaSaida(s: Saida): string {
  if (s.situacao === "paga") return `Paga em ${dataCurta(s.pagaEm!)}`;
  if (s.situacao === "cancelada") return "Cancelada · fora dos totais";
  return `A pagar · vence ${dataCurta(s.vencimento)}`;
}

function custoDaCompra(c: CompraDoProjeto, abre: TelasDeOrigem): ReactNode {
  if (c.custo.tipo === "conta") return <>custo em Saídas, na <Origem codigo={c.custo.codigo} tela="lancamentos" abre={abre} /></>;
  if (c.custo.tipo === "estoque") return "custo pelo Material do estoque";
  return "ainda sem conta a pagar";
}

/** Os números do projeto em cards de métrica; `colunas` fixa a grade (a ficha em modal é mais estreita que a página). */
export function ResumoDoProjeto({ projeto: p, naFicha = false }: { projeto: Projeto; naFicha?: boolean }) {
  const r = resumoDoProjeto(p);
  return <div className={`${styles.metricas} ${naFicha ? styles.metricasDaFicha : ""}`} role="group" aria-label={`Resumo do centro de custo de ${p.nome}`} style={{ "--colunas": r.orcamento ? 5 : 4 } as CSSProperties}>
    <CardDeMetrica rotulo="Recebido" valor={reais(r.recebido)} icone={<ArrowDownLeft />} nota={r.aReceber ? `+ ${reais(r.aReceber)} a receber` : "nada a receber"} />
    <CardDeMetrica rotulo="Pago" valor={reais(r.pago)} icone={<ArrowUpRight />} nota={r.aPagar ? `+ ${reais(r.aPagar)} a pagar` : "nada a pagar"} />
    <CardDeMetrica rotulo="Material do estoque" valor={reais(r.material)} icone={<Boxes />}
      nota={p.material.length ? `${p.material.length === 1 ? "1 saída" : `${p.material.length} saídas`} de estoque, pelo custo` : "nenhuma saída de estoque"} />
    <CardDeMetrica rotulo="Resultado" valor={<span className={r.resultado < 0 ? styles.negativo : undefined}>{reais(r.resultado)}</span>} icone={<Scale />}
      nota={r.aReceber || r.aPagar ? `previsto ${reais(r.resultadoPrevisto)}, com o que falta receber e pagar` : "recebido menos pago e material"} />
    {r.orcamento ? <CardDeMetrica rotulo="Orçamento consumido" icone={<Wallet />} tom={r.orcamento.estourou ? "ambar" : "primaria"} barra={Math.min(100, r.orcamento.percentual)}
      valor={<span className={r.orcamento.estourou ? styles.negativo : undefined}>{r.orcamento.percentual}%</span>}
      nota={r.orcamento.estourou ? `${reais(r.comprometido - r.orcamento.valor)} acima de ${reais(r.orcamento.valor)}` : `${reais(r.comprometido)} de ${reais(r.orcamento.valor)}`} /> : null}
  </div>;
}

export function VazioDoProjeto({ acao }: { acao?: ReactNode }) {
  return <section className={`${styles.bloco} ${styles.vazioDoProjeto}`} aria-label="Centro de custo vazio">
    <span className={styles.marca} aria-hidden="true"><ClipboardList size={15} /></span>
    <h2>Nada vinculado a este projeto ainda</h2>
    <p>Assim que uma cobrança ou uma conta a pagar for vinculada a ele, um pedido de compra for feito para ele ou um material sair do estoque para ele, o valor aparece aqui.</p>
    {acao}
  </section>;
}

export function EntradasDoProjeto({ projeto: p, abre, acao }: { projeto: Projeto; abre: TelasDeOrigem; acao?: ReactNode }) {
  const r = resumoDoProjeto(p);
  return <Bloco id="entradas" titulo="Entradas" icone={<ArrowDownLeft size={16} aria-hidden="true" />} sub="O que o cliente pagou e vai pagar por este projeto."
    total={{ valor: reais(r.recebido + r.aReceber), nota: r.aReceber ? `${reais(r.recebido)} recebido` : "tudo recebido" }} acao={acao}>
    {p.entradas.length ? <ul className={styles.linhas}>{p.entradas.map((e) => <li key={e.id} className={`${styles.linha} ${e.situacao === "cancelada" ? styles.cancelada : ""} ${e.nova ? styles.linhaNova : ""}`}>
      <span className={styles.marca} aria-hidden="true">{e.nova ? <Sparkles size={15} /> : <ArrowDownLeft size={15} />}</span>
      <span className={styles.texto}>
        <strong>{e.descricao}</strong>
        <small>{e.nova ? <span className={`${styles.selo} ${styles.seloNovo}`}>Nova · só nesta sessão</span> : <Origem codigo={e.codigo} tela="lancamentos" abre={abre} />} · cobrança · vence {dataCurta(e.vencimento)}</small>
      </span>
      <span className={styles.lado}><strong>{reais(e.valor)}</strong><small>{situacaoDaEntrada(e)}</small></span>
    </li>)}</ul> : <p className={styles.vazioDoBloco}>Nenhuma cobrança vinculada a este projeto.</p>}
  </Bloco>;
}

export function SaidasDoProjeto({ projeto: p, abre }: { projeto: Projeto; abre: TelasDeOrigem }) {
  const r = resumoDoProjeto(p);
  const grupos = saidasPorCategoria(p);
  return <Bloco id="saidas" titulo="Saídas" icone={<ArrowUpRight size={16} aria-hidden="true" />} sub="Contas a pagar do projeto, por categoria."
    total={{ valor: reais(r.pago + r.aPagar), nota: r.aPagar ? `${reais(r.pago)} pago` : "tudo pago" }}>
    {grupos.length ? grupos.map((g) => {
      const IconeDoGrupo = ICONE_DA_CATEGORIA[g.categoria];
      const quantas = g.saidas.filter((s) => s.situacao !== "cancelada").length;
      return <section key={g.categoria} className={styles.grupo} aria-labelledby={`grupo-${g.categoria}`}>
        <div className={styles.grupoTopo}>
          <span><span className={styles.iconeDoGrupo} aria-hidden="true"><IconeDoGrupo size={14} /></span><span><h3 id={`grupo-${g.categoria}`}>{g.rotulo}</h3><small>{g.nota}</small></span></span>
          <span>{reais(g.total)}<small>{g.percentual}% das saídas · {quantas === 1 ? "1 conta" : `${quantas} contas`}</small></span>
        </div>
        <ul className={styles.linhas}>{g.saidas.map((s) => <li key={s.id} className={`${styles.linha} ${s.situacao === "cancelada" ? styles.cancelada : ""}`}>
          <span className={styles.texto}>
            <strong>{s.descricao}</strong>
            <small><Origem codigo={s.codigo} tela="lancamentos" abre={abre} /> · {s.favorecido}{s.origem.tipo === "pedido_de_compra" ? <> · do pedido <Origem codigo={s.origem.codigo} tela="compras" abre={abre} /></> : null}</small>
          </span>
          <span className={styles.lado}><strong>{reais(s.valor)}</strong><small>{situacaoDaSaida(s)}</small></span>
        </li>)}</ul>
      </section>;
    }) : <p className={styles.vazioDoBloco}>Nenhuma conta a pagar vinculada a este projeto.</p>}
  </Bloco>;
}

export function MaterialDoProjeto({ projeto: p, abre }: { projeto: Projeto; abre: TelasDeOrigem }) {
  const r = resumoDoProjeto(p);
  return <Bloco id="material" titulo="Material do estoque" icone={<Boxes size={16} aria-hidden="true" />} sub="O que saiu do estoque para este projeto, pelo custo do dia da saída."
    total={{ valor: reais(r.material) }}>
    {p.material.length ? <ul className={styles.linhas}>{p.material.map((m) => <li key={m.id} className={styles.linha}>
      <span className={styles.marca} aria-hidden="true"><Package size={15} /></span>
      <span className={styles.texto}>
        <strong>{m.nome}</strong>
        <small><Origem codigo={m.item} tela="estoque" abre={abre} /> · {m.quantidade.toLocaleString("pt-BR")} {m.unidade} × {reais(m.custoUnitario)} · saída em {dataCurta(m.data)}</small>
      </span>
      <span className={styles.lado}><strong>{reais(totalDaSaidaDoEstoque(m))}</strong><small>por {m.registradaPor}</small></span>
    </li>)}</ul> : <p className={styles.vazioDoBloco}>Nenhum material saiu do estoque para este projeto.</p>}
    <p className={styles.nota}><Info size={13} aria-hidden="true" />O material comprado direto para o projeto não entra aqui: ele já está em Saídas, pela conta a pagar.</p>
  </Bloco>;
}

export function ComprasDoProjeto({ projeto: p, abre }: { projeto: Projeto; abre: TelasDeOrigem }) {
  return <Bloco id="compras" titulo="Compras do projeto" icone={<ShoppingCart size={16} aria-hidden="true" />} sub="Pedidos de compra com destino a este projeto.">
    {p.compras.length ? <ul className={styles.linhas}>{p.compras.map((c) => <li key={c.id} className={styles.linha}>
      <span className={styles.marca} aria-hidden="true"><ShoppingCart size={15} /></span>
      <span className={styles.texto}>
        <strong>{c.titulo}</strong>
        <small><Origem codigo={c.codigo} tela="compras" abre={abre} />{c.fornecedor ? ` · ${c.fornecedor}` : ""} · {custoDaCompra(c, abre)}</small>
      </span>
      <span className={styles.lado}><strong>{c.valor === null ? "—" : reais(c.valor)}</strong><small><span className={styles.selo}>{c.etapa}</span></small></span>
    </li>)}</ul> : <p className={styles.vazioDoBloco}>Nenhum pedido de compra para este projeto.</p>}
    <p className={styles.nota}><Info size={13} aria-hidden="true" />Os pedidos não somam de novo: o custo de cada um entra uma vez só, na conta a pagar ou no material do estoque.</p>
  </Bloco>;
}

export function CadastroDoProjeto({ projeto: p, abre }: { projeto: Projeto; abre: TelasDeOrigem }) {
  const r = resumoDoProjeto(p);
  return <Bloco titulo="Ficha do projeto" icone={<ClipboardList size={16} aria-hidden="true" />} sub={abre.projetos ? <>Cadastro em <Link href={ROTA_DA_ORIGEM.projetos.href} className={styles.origem}>Projetos, na Engenharia</Link>.</> : "Cadastro em Projetos, na Engenharia."}>
    <dl className={styles.ficha}>
      <div><dt>Cliente</dt><dd>{abre.clientes ? <Link href={ROTA_DA_ORIGEM.clientes.href} className={styles.origem} title="Protótipo: abre Clientes. No sistema real, abre a ficha do cliente.">{p.cliente.nome}</Link> : p.cliente.nome}</dd></div>
      <div><dt>Empresa</dt><dd><EmpresaComPonto empresa={p.empresa} /></dd></div>
      <div><dt>Tipo</dt><dd>{ROTULO_DA_CLASSE[p.classe]} · {p.tipo}</dd></div>
      <div><dt>Situação</dt><dd>{ROTULO_DA_SITUACAO[p.situacao]}</dd></div>
      <div><dt>Responsável</dt><dd>{p.responsavel ?? "—"}</dd></div>
      <div><dt>Início</dt><dd>{p.inicio ? dataCurta(p.inicio) : "—"}</dd></div>
      <div><dt>Orçamento</dt><dd>{p.orcamento ? reais(p.orcamento) : "Sem orçamento"}</dd></div>
      <div><dt>Resultado previsto</dt><dd className={r.resultadoPrevisto < 0 ? styles.negativo : undefined}>{reais(r.resultadoPrevisto)}</dd></div>
    </dl>
  </Bloco>;
}

export function ComoChegaAqui() {
  return <Bloco titulo="Como as informações chegam aqui" icone={<Link2 size={16} aria-hidden="true" />} sub="O centro de custo junta o que já foi vinculado ao projeto nas origens.">
    <ul className={styles.comoChega}>
      <li><span aria-hidden="true"><ArrowDownLeft size={14} /></span><span><strong>Entradas e saídas</strong><small>Vinculadas ao projeto no próprio lançamento, em Lançamentos (mão de obra incluída). Nova entrada, aqui, é um atalho: cria a cobrança em Lançamentos já com o cliente e o projeto.</small></span></li>
      <li><span aria-hidden="true"><ShoppingCart size={14} /></span><span><strong>Compras</strong><small>O pedido com destino a este projeto; a conta a pagar dele já nasce vinculada.</small></span></li>
      <li><span aria-hidden="true"><Boxes size={14} /></span><span><strong>Material do estoque</strong><small>A saída registrada no Estoque para este projeto.</small></span></li>
    </ul>
  </Bloco>;
}

/** Os outros projetos do mesmo cliente; `hrefDe` diz para onde cada um leva (a ficha em modal ou a página). */
export function OutrosProjetos({ projeto: p, outros, hrefDe }: { projeto: Projeto; outros: readonly Projeto[]; hrefDe: (id: string) => string }) {
  if (!outros.length) return null;
  return <Bloco titulo={`Outros projetos de ${p.cliente.nome}`} icone={<Users size={16} aria-hidden="true" />} sub="Cada projeto tem o seu centro de custo.">
    <ul className={styles.linhas}>{outros.map((o) => {
      const ro = resumoDoProjeto(o);
      const IconeDoOutro = iconeDoProjeto(o);
      return <li key={o.id}><Link href={hrefDe(o.id)} scroll={false} className={styles.linha}>
        <span className={styles.marca} aria-hidden="true"><IconeDoOutro size={15} /></span>
        <span className={styles.texto}><strong>{o.nome}</strong><small>{o.tipo} · <EmpresaComPonto empresa={o.empresa} curto /> · {ROTULO_DA_SITUACAO[o.situacao]}</small></span>
        <span className={styles.lado}><strong className={ro.resultado < 0 ? styles.negativo : undefined}>{reais(ro.resultado)}</strong><small>resultado</small></span>
      </Link></li>;
    })}</ul>
  </Bloco>;
}

/**
 * O centro de custo de um projeto em página inteira (a primeira forma do
 * protótipo). Fica para o André comparar com a ficha em modal, que abre da lista.
 */
export function ProjetoDoCentroDeCusto({ projeto: p, outros, abre, acao, aviso, hrefDe }: { projeto: Projeto; outros: readonly Projeto[]; abre: TelasDeOrigem; acao?: ReactNode; aviso?: ReactNode; hrefDe: (id: string) => string }) {
  const vazio = projetoVazio(p);
  const Icone = iconeDoProjeto(p);
  const secoes = [
    { id: "entradas", rotulo: "Entradas", n: p.entradas.length },
    { id: "saidas", rotulo: "Saídas", n: p.saidas.length },
    { id: "material", rotulo: "Material do estoque", n: p.material.length },
    { id: "compras", rotulo: "Compras", n: p.compras.length },
  ];

  return <div className={`${estilosClientes.pagina} ${styles.pagina}`}>
    <div className={styles.navegacaoDaPagina}>
      <Link href={ROTA_DO_CENTRO_DE_CUSTO} className={styles.voltar}><ArrowLeft size={14} aria-hidden="true" />Centro de custo</Link>
      <Link href={hrefDosProjetos({ visao: "cards" }, p.id)} className={styles.voltar}><PanelsTopLeft size={14} aria-hidden="true" />Ver como ficha</Link>
    </div>
    <header className={estilosPipelines.cabecalho}>
      <div className={estilosPipelines.tituloGrupo}>
        <h1 className={estilosPipelines.titulo}>{p.nome}</h1>
        <p className={styles.quemEOque}>
          <span><User size={14} aria-hidden="true" />{p.cliente.nome}</span>
          <span><Icone size={14} aria-hidden="true" />{ROTULO_DA_CLASSE[p.classe]} · {p.tipo}</span>
          <span><EmpresaComPonto empresa={p.empresa} /></span>
        </p>
      </div>
      <div className={estilosPipelines.acoes}>
        <Badge tone={TOM_DA_SITUACAO[p.situacao]}>{ROTULO_DA_SITUACAO[p.situacao]}</Badge>
        <SeloDoPrototipo />
        {acao}
      </div>
    </header>

    <ResumoDoProjeto projeto={p} />
    {aviso}

    {vazio ? null : <nav aria-label="Seções do centro de custo"><ul className={styles.secoes}>
      {secoes.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.rotulo}<span>{s.n}</span></a></li>)}
    </ul></nav>}

    <div className={styles.corpo}>
      <div className={styles.principal}>
        {vazio ? <VazioDoProjeto /> : <>
          <EntradasDoProjeto projeto={p} abre={abre} />
          <SaidasDoProjeto projeto={p} abre={abre} />
          <MaterialDoProjeto projeto={p} abre={abre} />
          <ComprasDoProjeto projeto={p} abre={abre} />
        </>}
      </div>

      <aside className={styles.lateral} aria-label="Sobre o projeto">
        <CadastroDoProjeto projeto={p} abre={abre} />
        <ComoChegaAqui />
        <OutrosProjetos projeto={p} outros={outros} hrefDe={hrefDe} />
        <p className={styles.nota}><Building2 size={13} aria-hidden="true" />Protótipo para avaliação: projetos, clientes, valores e códigos desta tela são de exemplo.</p>
      </aside>
    </div>
  </div>;
}
