"use client";

import { lancamentosDoRelatorioSchema, type CompanyKey, type GrupoDoRelatorio, type LancamentosDoRelatorio, type OpcoesDoFinanceiro, type RelatorioPorCategoria, type SecaoDoRelatorio, type TipoDeLancamento } from "@plugga/shared";
import { ArrowDownLeft, ArrowUpRight, Building2, ChevronRight, Download, ExternalLink, Scale } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { ROTULO_DA_EMPRESA, valorEmReais } from "../../lib/compras";
import { hrefDosLancamentos } from "../../lib/financeiro";
import {
  ATALHOS_DO_PERIODO,
  ROTULO_DO_ATALHO,
  TELA_DA_SECAO,
  atalhoDoPeriodo,
  consultaDosLancamentosDaLinha,
  csvDoRelatorio,
  diaLegivel,
  hrefDoRelatorio,
  nomeDoCsv,
  periodoDoAtalho,
  quantosLancamentos,
  resultadoDoRelatorio,
  rotuloDoPeriodo,
  type FiltrosDoRelatorio,
} from "../../lib/relatorios-do-financeiro";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { CardDeMetrica, MetricasDoTopo } from "../suprimentos/card-de-metrica";
import { EmpresaComPonto, PontoDaEmpresa } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { Alert, Button, DatePicker, Dialog, EmptyState, Skeleton } from "../ui";
import { EngrenagemDoFinanceiro } from "./engrenagem-do-financeiro";
import styles from "./relatorios.module.css";

type Linha = { tipo: TipoDeLancamento; grupo: string; nome: string; codigo: string | null; categorias: string[]; total: string; quantidade: number };

const empresas = [
  { value: "todas", label: "Todas as empresas", icon: <Building2 /> },
  { value: "plugga", label: "Plugga", icon: <PontoDaEmpresa empresa="plugga" /> },
  { value: "waze", label: "Waze Energia", icon: <PontoDaEmpresa empresa="waze" /> },
];

const reais = (valor: string) => valorEmReais(valor) ?? "R$ 0,00";
const pct = (valor: string) => `${valor.replace(".", ",")}%`;

/** O percentual da linha como barra fina, sem biblioteca de gráfico. */
function Barra({ percentual }: { percentual: string }) {
  return <span className={styles.barra} aria-hidden="true"><span style={{ inlineSize: `${Math.min(100, Number(percentual))}%` }} /></span>;
}

function Grupo({ tipo, grupo, aberto, aoAlternar, aoAbrirLinha }: { tipo: TipoDeLancamento; grupo: GrupoDoRelatorio; aberto: boolean; aoAlternar: () => void; aoAbrirLinha: (linha: Linha) => void }) {
  const id = useId();
  return <li className={styles.grupo}>
    <button type="button" className={styles.linhaDoGrupo} aria-expanded={aberto} aria-controls={id} onClick={aoAlternar}>
      <ChevronRight size={16} aria-hidden="true" className={styles.seta} />
      <span className={styles.nome}>
        <strong>{grupo.codigo ? <span className={styles.codigo}>{grupo.codigo}</span> : null}{grupo.nome}</strong>
        <small>{quantosLancamentos(grupo.quantidade)}</small>
      </span>
      <span className={styles.parte}><Barra percentual={grupo.percentual} /><small>{pct(grupo.percentual)}</small></span>
      <span className={styles.valor}>{reais(grupo.total)}</span>
    </button>
    {aberto ? <ul id={id} className={styles.categorias}>
      {grupo.categorias.map((categoria) => <li key={categoria.chave}>
        <button type="button" className={styles.linhaDaCategoria}
          onClick={() => aoAbrirLinha({ tipo, grupo: grupo.nome, nome: categoria.nome, codigo: categoria.codigo, categorias: categoria.categorias, total: categoria.total, quantidade: categoria.quantidade })}
          aria-label={`${categoria.nome}: ${reais(categoria.total)}, ${pct(categoria.percentual)} da seção. Ver os lançamentos`}>
          <span className={styles.nome}>
            <strong>{categoria.codigo ? <span className={styles.codigo}>{categoria.codigo}</span> : null}{categoria.nome}</strong>
            <small>{quantosLancamentos(categoria.quantidade)}</small>
          </span>
          <span className={styles.parte}><Barra percentual={categoria.percentual} /><small>{pct(categoria.percentual)}</small></span>
          <span className={styles.valor}>{reais(categoria.total)}</span>
        </button>
      </li>)}
    </ul> : null}
  </li>;
}

function Secao({ chave, titulo, secao, abertos, aoAlternar, aoAbrirLinha }: {
  chave: "entradas" | "saidas";
  titulo: string;
  secao: SecaoDoRelatorio | null;
  abertos: ReadonlySet<string>;
  aoAlternar: (grupo: string) => void;
  aoAbrirLinha: (linha: Linha) => void;
}) {
  const id = useId();
  const tipo: TipoDeLancamento = chave === "entradas" ? "entrada" : "saida";
  return <section className={styles.secao} aria-labelledby={id}>
    <header className={styles.topoDaSecao}>
      <h2 id={id}>{chave === "entradas" ? <ArrowDownLeft size={18} aria-hidden="true" /> : <ArrowUpRight size={18} aria-hidden="true" />}{titulo}</h2>
      {secao ? <span className={styles.totalDaSecao}><small>{quantosLancamentos(secao.quantidade)}</small><strong>{reais(secao.total)}</strong></span> : null}
    </header>
    {!secao ? <Alert tone="info" title={`Sem acesso às ${titulo.toLowerCase()}`}>Esta seção soma só o que você vê nos Lançamentos. Para ver as {titulo.toLowerCase()}, falta a tela {TELA_DA_SECAO[chave]}.</Alert>
      : secao.grupos.length === 0 ? <EmptyState title={chave === "entradas" ? "Nada recebido no período" : "Nada pago no período"}>Escolha outro período ou outra empresa.</EmptyState>
      : <>
        <div className={styles.cabecalhoDaTabela} aria-hidden="true"><span>Grupo e categoria</span><span>% da seção</span><span>Total</span></div>
        <ul className={styles.grupos}>
          {secao.grupos.map((grupo) => <Grupo key={grupo.chave} tipo={tipo} grupo={grupo} aberto={abertos.has(`${chave}:${grupo.chave}`)} aoAlternar={() => aoAlternar(`${chave}:${grupo.chave}`)} aoAbrirLinha={aoAbrirLinha} />)}
        </ul>
        <footer className={styles.rodapeDaSecao}><span>Total das {titulo.toLowerCase()}</span><strong>{reais(secao.total)}</strong></footer>
      </>}
  </section>;
}

/** Os lançamentos que somam a linha, lidos do proxy quando a linha abre. */
function LancamentosDaLinha({ linha, filtros, abreLancamentos, aoFechar }: { linha: Linha; filtros: FiltrosDoRelatorio; abreLancamentos: boolean; aoFechar: () => void }) {
  const [estado, setEstado] = useState<{ tipo: "lendo" } | { tipo: "erro" } | { tipo: "pronto"; dados: LancamentosDoRelatorio }>({ tipo: "lendo" });
  useEffect(() => {
    const controle = new AbortController();
    fetch(`/api/financeiro/relatorios/categorias/lancamentos?${consultaDosLancamentosDaLinha(filtros, linha.tipo, linha.categorias)}`, { signal: controle.signal, cache: "no-store" })
      .then(async (resposta) => {
        const lido = resposta.ok ? lancamentosDoRelatorioSchema.safeParse(await resposta.json()) : null;
        setEstado(lido?.success ? { tipo: "pronto", dados: lido.data } : { tipo: "erro" });
      })
      .catch((erro: unknown) => { if (!(erro instanceof DOMException && erro.name === "AbortError")) setEstado({ tipo: "erro" }); });
    return () => controle.abort();
  }, [filtros, linha]);

  const titulo = linha.codigo ? `${linha.codigo} · ${linha.nome}` : linha.nome;
  const descricao = `${linha.tipo === "entrada" ? "Recebidos" : "Pagos"} de ${rotuloDoPeriodo(filtros.de, filtros.ate)}${filtros.empresa ? ` · ${ROTULO_DA_EMPRESA[filtros.empresa]}` : ""}`;
  return <Dialog title={titulo} description={descricao} size="larga" onClose={aoFechar} cancelText="Fechar" className={styles.telaCheia}>
    {estado.tipo === "lendo" ? <Skeleton label="Carregando os lançamentos" />
      : estado.tipo === "erro" ? <Alert tone="danger" title="Não deu para carregar">Não foi possível ler os lançamentos desta linha. Feche e tente de novo.</Alert>
      : <div className={styles.daLinha}>
        <p className={styles.somaDaLinha}><span>{quantosLancamentos(estado.dados.total)}</span><strong>{reais(estado.dados.soma)}</strong></p>
        {estado.dados.total > estado.dados.itens.length ? <Alert tone="warning" title="Lista resumida">Mostrando os {estado.dados.itens.length} primeiros de {estado.dados.total}; a soma acima conta todos. Escolha um período menor para ver cada um.</Alert> : null}
        <ul className={styles.lancamentos}>
          {estado.dados.itens.map((item) => {
            const conteudo = <>
              <span className={styles.nome}>
                <strong>{item.descricao}</strong>
                <small>{item.codigo} · {item.favorecido.nome} · <EmpresaComPonto empresa={item.empresa} /></small>
              </span>
              <span className={styles.ladoDoLancamento}>
                <strong>{reais(item.valorLiquidado)}</strong>
                <small>{item.liquidadoEm ? diaLegivel(item.liquidadoEm) : ""}{item.valorLiquidado !== item.valor ? ` · de ${reais(item.valor)}` : ""}</small>
              </span>
            </>;
            return <li key={item.id}>
              {abreLancamentos
                ? <Link className={styles.lancamento} href={hrefDosLancamentos({ visao: "lista", ...(filtros.empresa ? { empresa: filtros.empresa } : {}) }, item.id)}>{conteudo}<ExternalLink size={14} aria-hidden="true" className={styles.abrir} /></Link>
                : <div className={styles.lancamento}>{conteudo}</div>}
            </li>;
          })}
        </ul>
      </div>}
  </Dialog>;
}

export function RelatoriosDoFinanceiroView({ hoje, filtros, relatorio, opcoes, abreLancamentos }: {
  hoje: string;
  filtros: FiltrosDoRelatorio;
  relatorio: RelatorioPorCategoria;
  opcoes: OpcoesDoFinanceiro | null;
  abreLancamentos: boolean;
}) {
  const router = useRouter();
  const [de, setDe] = useState(filtros.de);
  const [ate, setAte] = useState(filtros.ate);
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set());
  const [linha, setLinha] = useState<Linha | null>(null);
  // A URL manda: quando ela muda (atalho, voltar do navegador), os campos acompanham.
  useEffect(() => { setDe(filtros.de); setAte(filtros.ate); }, [filtros.de, filtros.ate]);

  const ir = (novos: FiltrosDoRelatorio) => router.push(hrefDoRelatorio(novos));
  const comEmpresa = (periodo: { de: string; ate: string }): FiltrosDoRelatorio => ({ ...periodo, ...(filtros.empresa ? { empresa: filtros.empresa } : {}) });
  const erroDoPeriodo = de && ate && de > ate ? "O fim vem depois do início." : undefined;
  const mudarPeriodo = (novoDe: string, novoAte: string) => {
    setDe(novoDe);
    setAte(novoAte);
    if (novoDe && novoAte && novoDe <= novoAte && (novoDe !== filtros.de || novoAte !== filtros.ate)) ir(comEmpresa({ de: novoDe, ate: novoAte }));
  };
  const atalho = atalhoDoPeriodo(filtros, hoje);
  const resultado = resultadoDoRelatorio(relatorio);
  const todosOsGrupos = [
    ...(relatorio.entradas?.grupos.map((g) => `entradas:${g.chave}`) ?? []),
    ...(relatorio.saidas?.grupos.map((g) => `saidas:${g.chave}`) ?? []),
  ];
  const tudoAberto = todosOsGrupos.length > 0 && todosOsGrupos.every((g) => abertos.has(g));
  const alternar = (grupo: string) => setAbertos((atual) => {
    const proximo = new Set(atual);
    if (proximo.has(grupo)) proximo.delete(grupo); else proximo.add(grupo);
    return proximo;
  });
  const exportar = () => {
    const url = URL.createObjectURL(new Blob([csvDoRelatorio(relatorio)], { type: "text/csv;charset=utf-8" }));
    const ancora = document.createElement("a");
    ancora.href = url;
    ancora.download = nomeDoCsv(relatorio);
    ancora.click();
    URL.revokeObjectURL(url);
  };
  const daEmpresa = filtros.empresa ? ROTULO_DA_EMPRESA[filtros.empresa] : "Plugga e Waze Energia";

  return <div className={`${estilosClientes.pagina} ${styles.pagina}`}>
    <header className={estilosPipelines.cabecalho}>
      <div className={`${estilosPipelines.tituloGrupo} ${styles.titulos}`}>
        <h1 className={estilosPipelines.titulo}>Relatórios</h1>
        <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>Entradas e saídas por grupo e categoria, pelo que foi pago e recebido no período.</h2>
      </div>
      <div className={`${estilosPipelines.acoes} ${styles.acoes}`}>
        <div className={styles.filtroEmpresa}>
          <FiltroComBusca label="Empresa" icon={<Building2 />} semFiltro="todas" value={filtros.empresa ?? "todas"} onChange={(valor) => ir({ de: filtros.de, ate: filtros.ate, ...(valor === "todas" ? {} : { empresa: valor as CompanyKey }) })} options={empresas} />
        </div>
        <Button variant="secondary" icon={<Download size={16} />} onClick={exportar}>Exportar CSV</Button>
        {opcoes ? <EngrenagemDoFinanceiro opcoes={opcoes} /> : null}
      </div>
    </header>

    <section className={styles.periodo} aria-label="Período">
      <div className={styles.atalhos} role="group" aria-label="Atalhos do período">
        {ATALHOS_DO_PERIODO.map((item) => <button key={item} type="button" aria-pressed={atalho === item} onClick={() => ir(comEmpresa(periodoDoAtalho(item, hoje)))}>{ROTULO_DO_ATALHO[item]}</button>)}
      </div>
      <div className={styles.datas}>
        <DatePicker label="De" hint="Primeiro dia do período" value={de} max={ate || undefined} onChange={(valor) => mudarPeriodo(valor, ate)} />
        <DatePicker label="Até" hint="Último dia, incluso" value={ate} min={de || undefined} onChange={(valor) => mudarPeriodo(de, valor)} error={erroDoPeriodo} />
      </div>
    </section>

    <MetricasDoTopo rotulo="Totais do período">
      <CardDeMetrica rotulo="Entradas" icone={<ArrowDownLeft />} valor={relatorio.entradas ? reais(relatorio.entradas.total) : "—"}
        nota={relatorio.entradas ? `${quantosLancamentos(relatorio.entradas.quantidade)} recebidos` : `Falta a tela ${TELA_DA_SECAO.entradas}`} />
      <CardDeMetrica rotulo="Saídas" icone={<ArrowUpRight />} valor={relatorio.saidas ? reais(relatorio.saidas.total) : "—"}
        nota={relatorio.saidas ? `${quantosLancamentos(relatorio.saidas.quantidade)} pagos` : `Falta a tela ${TELA_DA_SECAO.saidas}`} />
      <CardDeMetrica rotulo="Resultado do período" icone={<Scale />}
        valor={resultado.tipo === "inteiro" ? <span className={resultado.valor.startsWith("-") ? styles.negativo : undefined}>{reais(resultado.valor)}</span> : "Parcial"}
        nota={resultado.tipo === "inteiro" ? "entradas menos saídas" : resultado.texto} />
    </MetricasDoTopo>

    <div className={styles.contexto}>
      <p><strong>Por grupo e categoria</strong> · {rotuloDoPeriodo(relatorio.de, relatorio.ate)} · {daEmpresa}</p>
      {todosOsGrupos.length > 0 ? <Button variant="secondary" size="sm" onClick={() => setAbertos(tudoAberto ? new Set() : new Set(todosOsGrupos))}>{tudoAberto ? "Recolher tudo" : "Expandir tudo"}</Button> : null}
    </div>

    <div className={styles.secoes}>
      <Secao chave="entradas" titulo="Entradas" secao={relatorio.entradas} abertos={abertos} aoAlternar={alternar} aoAbrirLinha={setLinha} />
      <Secao chave="saidas" titulo="Saídas" secao={relatorio.saidas} abertos={abertos} aoAlternar={alternar} aoAbrirLinha={setLinha} />
    </div>

    <p className={styles.nota}>Regime de caixa: entra o que foi pago ou recebido no período, pelo dia e pelo valor liquidados (na entrada, o valor recebido). Lançamento cancelado não entra; transferência entre contas não é entrada nem saída. Sem categoria aparece em "Sem categoria", para o total fechar com o caixa.</p>

    {linha ? <LancamentosDaLinha linha={linha} filtros={filtros} abreLancamentos={abreLancamentos} aoFechar={() => setLinha(null)} /> : null}
  </div>;
}
