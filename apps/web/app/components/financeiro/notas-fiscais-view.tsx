"use client";

import type { CompanyKey, OpcoesDoFinanceiro } from "@plugga/shared";
import type { LucideIcon } from "lucide-react";
import { ArrowDownLeft, ArrowUpRight, Building2, Eye, FileCode2, FileText, Filter, LayoutGrid, Link2, List, Paperclip, ReceiptText } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";

import { valorEmReais } from "../../lib/compras";
import {
  filtrarNotas,
  notasDoLado,
  periodosDasNotas,
  enfileirarGravacao,
  estadoDoEnderecoDasNotas,
  quantasNotas,
  reconhecerGravacao,
  visoesDasNotas,
  resumoDoLado,
  ROTULO_DO_PERIODO_DAS_NOTAS,
  ROTULO_DO_TIPO_DA_NOTA,
  temFiltroNasNotas,
  tiposDaNota,
  type ContraparteDaNota,
  type FiltrosDasNotas,
  type VisaoDasNotas,
  type LancamentoParaNota,
  type NotaFiscal,
  type PeriodoDasNotas,
  type TipoDaNota,
} from "../../lib/notas-fiscais";
import { escreverIntervaloNaUrl, type IntervaloLivre } from "../../lib/periodo-livre";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { ShellCard, ShellTable } from "../plugga-shell";
import { EmpresaComPonto, PontoDaEmpresa } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
import { FiltroDePeriodo, type EscolhaDePeriodo } from "../filtro-de-periodo";
import { CardsDasNotasFiscais } from "./cards-das-notas-fiscais";
import { Button, IconPlus, IconSearch } from "../ui";
import { AdicionarNotaFiscal } from "./adicionar-nota-fiscal";
import { EngrenagemDoFinanceiro } from "./engrenagem-do-financeiro";
import { FichaDaNotaFiscal } from "./ficha-da-nota-fiscal";
import estilosLancamentos from "./lancamentos.module.css";
import styles from "./notas-fiscais.module.css";

const LADO: Record<TipoDaNota, { icone: typeof ArrowDownLeft; descricao: string }> = {
  entrada: { icone: ArrowDownLeft, descricao: "Emitidas para clientes" },
  saida: { icone: ArrowUpRight, descricao: "Recebidas de fornecedores" },
};

const VISOES: Record<VisaoDasNotas, { rotulo: string; icone: LucideIcon }> = { cards: { rotulo: "Cards", icone: LayoutGrid }, lista: { rotulo: "Lista", icone: List } };
const diaLegivel = (dia: string) => dia.split("-").reverse().join("/");

/**
 * Notas fiscais (PLU-361), PROTÓTIPO visual com dados de exemplo: o seletor
 * Entradas / Saídas, a lista do lado escolhido com filtros de empresa, período e
 * busca, a ficha de leitura e "Adicionar nota fiscal". Tudo em memória: nada vai
 * à API, e recarregar a página volta aos exemplos.
 */
export function NotasFiscaisView({ hoje, ladoInicial, intervaloInicial, visaoInicial = "lista", opcoes, exemplos }: {
  hoje: string;
  ladoInicial: TipoDaNota;
  /** O período personalizado do endereço (?de=…&ate=…), já validado. */
  intervaloInicial?: IntervaloLivre | null;
  /** A visão do endereço (?visao=cards|lista), já validada; a Lista é a padrão. */
  visaoInicial?: VisaoDasNotas;
  opcoes: OpcoesDoFinanceiro | null;
  /** Os dados de exemplo chegam do servidor por props: o módulo deles nunca entra num bundle de cliente. */
  exemplos: { notas: NotaFiscal[]; lancamentos: LancamentoParaNota[]; contrapartes: ContraparteDaNota[] };
}) {
  const [notas, setNotas] = useState<NotaFiscal[]>(exemplos.notas);
  const { lancamentos, contrapartes } = exemplos;
  const [lado, setLado] = useState<TipoDaNota>(ladoInicial);
  const [filtros, setFiltros] = useState<FiltrosDasNotas>(intervaloInicial ? { intervalo: intervaloInicial } : {});
  const [visao, setVisao] = useState<VisaoDasNotas>(visaoInicial);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);
  // O endereço manda também depois da primeira vez: uma navegação suave para outros parâmetros
  // (?lado, ?visao, ?de, ?ate) atualiza a tela sem remontá-la. As gravações da própria tela
  // (history.replaceState) voltam pelo mesmo caminho e são reconhecidas em `gravadas`.
  const enderecoAtual = useSearchParams();
  const chaveDoEndereco = enderecoAtual.toString();
  const gravadas = useRef<string[]>([]);
  useEffect(() => {
    const { propria, fila } = reconhecerGravacao(gravadas.current, chaveDoEndereco);
    gravadas.current = fila;
    if (propria) return;
    const doEndereco = estadoDoEnderecoDasNotas(new URLSearchParams(chaveDoEndereco));
    setLado(doEndereco.lado);
    setVisao(doEndereco.visao);
    setFiltros((atuais) => {
      const mesmo = atuais.intervalo?.de === doEndereco.intervalo?.de && atuais.intervalo?.ate === doEndereco.intervalo?.ate;
      if (mesmo) return atuais;
      const resto: FiltrosDasNotas = { ...atuais };
      delete resto.intervalo;
      return doEndereco.intervalo ? { ...resto, intervalo: doEndereco.intervalo } : resto;
    });
  }, [chaveDoEndereco]);
  const seletorRef = useRef<HTMLDivElement>(null);
  const visoesRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLElement>(null);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(t); }, [aviso]);
  useEffect(() => { if (!destaque) return; const t = setTimeout(() => setDestaque(null), 4000); return () => clearTimeout(t); }, [destaque]);

  const filtradas = useMemo(() => filtrarNotas(notas, filtros, hoje), [notas, filtros, hoje]);
  const doLado = notasDoLado(filtradas, lado);
  const resumo = resumoDoLado(doLado);
  const filtrado = temFiltroNasNotas(filtros);
  const rotulos = ROTULO_DO_TIPO_DA_NOTA[lado];

  function escolherLado(tipo: TipoDaNota) {
    setLado(tipo);
    // O lado vai no endereço (?lado=saidas), sem recarregar: dá para mandar o link.
    const url = new URL(window.location.href);
    if (tipo === "saida") url.searchParams.set("lado", "saidas"); else url.searchParams.delete("lado");
    gravar(url);
  }
  /** Grava o endereço sem recarregar e anota a chave, para o efeito acima não tratá-la como navegação de fora. */
  function gravar(url: URL) {
    gravadas.current = enfileirarGravacao(gravadas.current, new URL(window.location.href).searchParams.toString(), url.searchParams.toString());
    window.history.replaceState(null, "", url);
  }
  function escolherVisao(nova: VisaoDasNotas) {
    setVisao(nova);
    // A visão vai no endereço (?visao=cards); a Lista, que é a padrão, não precisa dele.
    const url = new URL(window.location.href);
    if (nova === "cards") url.searchParams.set("visao", "cards"); else url.searchParams.delete("visao");
    gravar(url);
  }
  function navegarVisoes(evento: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    const i = visoesDasNotas.indexOf(visao);
    const proxima = visoesDasNotas[evento.key === "Home" ? 0 : evento.key === "End" ? visoesDasNotas.length - 1 : (i + (evento.key === "ArrowRight" ? 1 : visoesDasNotas.length - 1)) % visoesDasNotas.length]!;
    escolherVisao(proxima);
    visoesRef.current?.querySelector<HTMLButtonElement>(`#notas-visao-${proxima}`)?.focus();
  }
  function navegarLados(evento: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    const proximo = evento.key === "Home" ? "entrada" : evento.key === "End" ? "saida" : lado === "entrada" ? "saida" : "entrada";
    escolherLado(proximo);
    seletorRef.current?.querySelector<HTMLButtonElement>(`#notas-lado-${proximo}`)?.focus();
  }
  const mudarFiltros = (parcial: Partial<FiltrosDasNotas>) => setFiltros((atuais) => {
    const novos = { ...atuais, ...parcial };
    for (const chave of Object.keys(novos) as (keyof FiltrosDasNotas)[]) if (!novos[chave]) delete novos[chave];
    return novos;
  });
  function buscar(evento: FormEvent) { evento.preventDefault(); mudarFiltros({ busca: busca.trim() || undefined }); }
  // O período personalizado vai no endereço (?de=…&ate=…), como o lado: dá para mandar o link.
  function gravarIntervalo(intervalo: IntervaloLivre | null) {
    const url = new URL(window.location.href);
    escreverIntervaloNaUrl(url, intervalo);
    gravar(url);
  }
  const mudarPeriodo = (escolha: EscolhaDePeriodo) => { mudarFiltros({ periodo: (escolha.atalho || undefined) as PeriodoDasNotas | undefined, intervalo: escolha.intervalo ?? undefined }); gravarIntervalo(escolha.intervalo); };
  const limpar = () => { setBusca(""); setFiltros({}); gravarIntervalo(null); };

  function adicionada(nota: NotaFiscal) {
    setNotas((atuais) => [nota, ...atuais]);
    setAdicionando(false);
    escolherLado(nota.tipo);
    // A nota nova tem de aparecer: os filtros que a esconderiam saem.
    if (filtrarNotas([nota], filtros, hoje).length === 0) limpar();
    setDestaque(nota.id);
    setAviso("Nota fiscal adicionada.");
    requestAnimationFrame(() => listaRef.current?.querySelector(`[data-nota="${nota.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }

  const empresas = [{ value: "", label: "Todas as empresas", icon: <Building2 /> }, { value: "plugga", label: "Plugga", icon: <PontoDaEmpresa empresa="plugga" /> }, { value: "waze", label: "Waze Energia", icon: <PontoDaEmpresa empresa="waze" /> }];
  const atalhosDePeriodo = periodosDasNotas.map((p) => ({ value: p, label: ROTULO_DO_PERIODO_DAS_NOTAS[p] }));
  const notaAberta = aberta ? notas.find((n) => n.id === aberta) ?? null : null;

  const vazio = doLado.length === 0 ? <div className="lista-negocios-vazia" role="status">
    <div className="lista-negocios-vazia-icone" aria-hidden="true">{filtrado ? <Filter size={22} /> : <ReceiptText size={22} />}</div>
    <h3 className="lista-negocios-vazia-titulo">{filtrado ? `Nenhuma ${rotulos.singular} com esses filtros` : `Nenhuma ${rotulos.singular} ainda`}</h3>
    <p className="lista-negocios-vazia-desc">{filtrado
      ? "Experimente outra busca, outro período ou outra empresa."
      : lado === "entrada"
        ? "Aqui ficam as notas que a Plugga e a Waze Energia emitem para os clientes. Registre a primeira com o PDF ou o XML."
        : "Aqui ficam as notas que os fornecedores emitem para a Plugga e a Waze Energia. Registre a primeira com o PDF ou o XML."}</p>
    {filtrado
      ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar filtros</Button>
      : <Button size="sm" icon={<IconPlus />} onClick={() => setAdicionando(true)}>Adicionar nota fiscal</Button>}
  </div> : null;

  return <div className={`${estilosClientes.pagina} ${styles.pagina}`}>
    <header className={`${estilosPipelines.cabecalho} ${styles.cabecalho}`}>
      <div className={estilosPipelines.tituloGrupo}>
        <h1 className={estilosPipelines.titulo}>Notas fiscais</h1>
        <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>
          {filtros.empresa ? `Notas de entrada e de saída da ${filtros.empresa === "plugga" ? "Plugga" : "Waze Energia"}.` : "Notas de entrada e de saída das duas empresas."}
        </h2>
      </div>
      <div className={`${estilosPipelines.acoes} ${styles.acoes}`}>
        <Button className={styles.adicionar} icon={<IconPlus />} onClick={() => setAdicionando(true)}>Adicionar nota fiscal</Button>
        {opcoes ? <EngrenagemDoFinanceiro opcoes={opcoes} /> : null}
      </div>
    </header>

    <div ref={seletorRef} className={styles.seletor} role="tablist" aria-label="Notas de entrada ou de saída" onKeyDown={navegarLados}>
      {tiposDaNota.map((tipo) => {
        const { icone: Icone, descricao } = LADO[tipo];
        const deste = resumoDoLado(notasDoLado(filtradas, tipo));
        return <button key={tipo} type="button" role="tab" id={`notas-lado-${tipo}`} aria-selected={lado === tipo} aria-controls="notas-lista"
          tabIndex={lado === tipo ? 0 : -1} className={`${styles.lado} ${tipo === "entrada" ? styles.ladoEntrada : styles.ladoSaida}`} onClick={() => escolherLado(tipo)}>
          <span className={styles.ladoIcone} aria-hidden="true"><Icone size={18} /></span>
          <span className={styles.ladoTexto}>
            <span className={styles.ladoNome}>{ROTULO_DO_TIPO_DA_NOTA[tipo].lado}</span>
            <span className={styles.ladoDescricao}>{descricao}</span>
          </span>
          <span className={styles.ladoNumeros}>
            <span className={styles.ladoTotal}>{valorEmReais(deste.total)}</span>
            <span className={styles.ladoQuantidade}>{quantasNotas(deste.quantidade)}</span>
          </span>
        </button>;
      })}
    </div>

    <div className={styles.barra} role="group" aria-label="Visualização, busca e filtros das notas">
      <div className={styles.ladoEsquerdo}>
      <div ref={visoesRef} className={`${estilosPipelines.visoes} ${estilosClientes.abas} ${estilosLancamentos.abas} ${styles.abas}`} role="tablist" aria-label="Visualização das notas" onKeyDown={navegarVisoes}>
        {visoesDasNotas.map((id) => {
          const { rotulo, icone: Icone } = VISOES[id];
          return <button key={id} type="button" id={`notas-visao-${id}`} className="ui-tab" role="tab" aria-selected={visao === id} aria-controls="notas-lista"
            tabIndex={visao === id ? 0 : -1} onClick={() => escolherVisao(id)}><Icone size={15} aria-hidden="true" />{rotulo}</button>;
        })}
      </div>
      <form className={`equipe-busca ${styles.busca}`} onSubmit={buscar} role="search" aria-label="Buscar notas fiscais">
        <button type="submit" className={estilosClientes.botaoBusca} aria-label="Buscar"><IconSearch className="equipe-busca-icon" /></button>
        <input className="equipe-busca-input" type="search" maxLength={120} aria-label={`Buscar por número ou ${rotulos.contraparte.toLowerCase()}`} value={busca}
          onChange={(e) => { setBusca(e.target.value); if (!e.target.value) mudarFiltros({ busca: undefined }); }}
          placeholder={`Buscar número ou ${rotulos.contraparte.toLowerCase()}…`} />
      </form>
      </div>
      {/* Filtros minimalistas: o visual vem do CSS local (.filtros), sem mudar o FiltroComBusca compartilhado. */}
      <div className={styles.filtros}>
        <FiltroComBusca label="Empresa" icon={<Building2 />} semFiltro="" value={filtros.empresa ?? ""} options={empresas} classeDoPainel={styles.painelDoFiltro}
          onChange={(v) => mudarFiltros({ empresa: (v || undefined) as CompanyKey | undefined })} />
        <FiltroDePeriodo hoje={hoje} classeDoPainel={styles.painelDoFiltro} atalhos={atalhosDePeriodo} atalho={filtros.periodo ?? ""} intervalo={filtros.intervalo ?? null} aoMudar={mudarPeriodo} />
        {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar</Button> : null}
      </div>
    </div>

    {aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null}

    <section ref={listaRef} id="notas-lista" role="tabpanel" aria-labelledby={`notas-lado-${lado}`} className={styles.conteudo}>
      {vazio ?? (visao === "cards" ? <CardsDasNotasFiscais notas={doLado} destaque={destaque} aoAbrir={setAberta} /> : <div className={`lista-negocios ${estilosLista.lista} ${estilosLancamentos.lista} ${styles.lista}`}>
        <ShellCard className="table-card lista-negocios-card">
          <div className={`${estilosLista.rolagemTabela} ${styles.rolagem}`} role="region" aria-label={`Notas de ${lado === "entrada" ? "entrada" : "saída"}: ${quantasNotas(resumo.quantidade).toLowerCase()}`}>
            <ShellTable caption={`Notas fiscais de ${lado === "entrada" ? "entrada" : "saída"}`}>
              <thead><tr>
                <th scope="col">Nota</th><th scope="col">{rotulos.contraparte}</th><th scope="col">Valor</th>
                <th scope="col">Lançamento</th><th scope="col">Arquivo</th><th scope="col">Ações</th>
              </tr></thead>
              <tbody>{doLado.map((nota, indice) => <tr key={nota.id} data-nota={nota.id} data-selected={destaque === nota.id || undefined}
                className={estilosLancamentos.entra} style={{ "--i": indice } as CSSProperties}
                onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a")) setAberta(nota.id); }}>
                <td data-l="Nota"><div className={estilosLista.oportunidade}>
                  <span className={estilosLista.iconeOportunidade} aria-hidden="true"><FileText size={16} /></span>
                  <div className="celula-lead-bloco">
                    <button type="button" className={`lead-nome ${estilosLista.titulo}`} onClick={() => setAberta(nota.id)}>Nº {nota.numero}</button>
                    <span className={estilosLista.codigo}>Emitida em {diaLegivel(nota.emitidaEm)}</span>
                  </div>
                </div></td>
                <td data-l={rotulos.contraparte}><div className={styles.quem}>
                  <strong title={nota.contraparte.nome}>{nota.contraparte.nome}</strong>
                  <EmpresaComPonto empresa={nota.empresa} />
                </div></td>
                <td data-l="Valor"><div className={estilosLista.valor}><strong>{valorEmReais(nota.valor)}</strong></div></td>
                <td data-l="Lançamento">{nota.lancamento
                  ? <div className={estilosLista.valor}><strong className={styles.codigo}><Link2 size={13} aria-hidden="true" />{nota.lancamento.codigo}</strong><small>{nota.lancamento.situacao}</small></div>
                  : <span className={styles.semNada}>Sem vínculo</span>}</td>
                <td data-l="Arquivo">{nota.arquivo
                  ? <span className={styles.arquivo} title={nota.arquivo.nome}>{nota.arquivo.formato === "xml" ? <FileCode2 size={15} aria-hidden="true" /> : <Paperclip size={15} aria-hidden="true" />}{nota.arquivo.formato.toUpperCase()}</span>
                  : <span className={styles.semNada}>Sem arquivo</span>}</td>
                <td><div className={estilosLista.acoesLinha}><Button variant="secondary" size="sm" iconOnly icon={<Eye size={14} />} aria-label={`Ver a nota nº ${nota.numero}`} onClick={() => setAberta(nota.id)} /></div></td>
              </tr>)}</tbody>
            </ShellTable>
          </div>
        </ShellCard>
      </div>)}
    </section>

    {notaAberta ? <FichaDaNotaFiscal nota={notaAberta} aoFechar={() => setAberta(null)} /> : null}
    {adicionando ? <AdicionarNotaFiscal hoje={hoje} tipoInicial={lado} empresaInicial={filtros.empresa ?? ""} notas={notas} contrapartes={contrapartes}
      lancamentos={lancamentos} aoCancelar={() => setAdicionando(false)} aoSalvar={adicionada} /> : null}
  </div>;
}
