"use client";

import type { CompanyKey, OpcoesDoFinanceiro } from "@plugga/shared";
import { ArrowDownLeft, ArrowUpRight, Building2, CalendarDays, Eye, FileCode2, FileText, Filter, Link2, Paperclip, ReceiptText } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";

import { valorEmReais } from "../../lib/compras";
import {
  filtrarNotas,
  notasDoLado,
  periodosDasNotas,
  quantasNotas,
  resumoDoLado,
  saldoDasNotas,
  ROTULO_DO_PERIODO_DAS_NOTAS,
  ROTULO_DO_TIPO_DA_NOTA,
  temFiltroNasNotas,
  tiposDaNota,
  type ContraparteDaNota,
  type FiltrosDasNotas,
  type LancamentoParaNota,
  type NotaFiscal,
  type PeriodoDasNotas,
  type TipoDaNota,
} from "../../lib/notas-fiscais";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosLista from "../pipelines/lista-de-negocios.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { ShellCard, ShellTable } from "../plugga-shell";
import { EmpresaComPonto, PontoDaEmpresa } from "../suprimentos/empresa";
import { FiltroComBusca } from "../suprimentos/menu-com-busca";
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

const diaLegivel = (dia: string) => dia.split("-").reverse().join("/");

/**
 * Notas fiscais (PLU-361), PROTÓTIPO visual com dados de exemplo: o seletor
 * Entradas / Saídas, a lista do lado escolhido com filtros de empresa, período e
 * busca, a ficha de leitura e "Adicionar nota fiscal". Tudo em memória: nada vai
 * à API, e recarregar a página volta aos exemplos.
 */
export function NotasFiscaisView({ hoje, ladoInicial, opcoes, exemplos }: {
  hoje: string;
  ladoInicial: TipoDaNota;
  opcoes: OpcoesDoFinanceiro | null;
  /** Os dados de exemplo chegam do servidor por props: o módulo deles nunca entra num bundle de cliente. */
  exemplos: { notas: NotaFiscal[]; lancamentos: LancamentoParaNota[]; contrapartes: ContraparteDaNota[] };
}) {
  const [notas, setNotas] = useState<NotaFiscal[]>(exemplos.notas);
  const { lancamentos, contrapartes } = exemplos;
  const [lado, setLado] = useState<TipoDaNota>(ladoInicial);
  const [filtros, setFiltros] = useState<FiltrosDasNotas>({});
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);
  const seletorRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLElement>(null);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(t); }, [aviso]);
  useEffect(() => { if (!destaque) return; const t = setTimeout(() => setDestaque(null), 4000); return () => clearTimeout(t); }, [destaque]);

  const filtradas = useMemo(() => filtrarNotas(notas, filtros, hoje), [notas, filtros, hoje]);
  const doLado = notasDoLado(filtradas, lado);
  const resumo = resumoDoLado(doLado);
  const filtrado = temFiltroNasNotas(filtros);
  const saldo = saldoDasNotas(notas, filtros, hoje);
  const rotulos = ROTULO_DO_TIPO_DA_NOTA[lado];

  function escolherLado(tipo: TipoDaNota) {
    setLado(tipo);
    // O lado vai no endereço (?lado=saidas), sem recarregar: dá para mandar o link.
    const url = new URL(window.location.href);
    if (tipo === "saida") url.searchParams.set("lado", "saidas"); else url.searchParams.delete("lado");
    window.history.replaceState(null, "", url);
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
  const limpar = () => { setBusca(""); setFiltros({}); };

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
  const periodos = [{ value: "", label: "Todo o período", icon: <CalendarDays /> }, ...periodosDasNotas.map((p) => ({ value: p, label: ROTULO_DO_PERIODO_DAS_NOTAS[p], icon: <CalendarDays /> }))];
  const notaAberta = aberta ? notas.find((n) => n.id === aberta) ?? null : null;

  const vazio = doLado.length === 0 ? <div className={`lista-negocios-vazia ${styles.vazio}`} role="status">
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
        <div className={styles.filtroEmpresa}>
          <FiltroComBusca label="Empresa" icon={<Building2 />} semFiltro="" value={filtros.empresa ?? ""} options={empresas}
            onChange={(v) => mudarFiltros({ empresa: (v || undefined) as CompanyKey | undefined })} />
        </div>
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

    <p className={styles.saldo} title="Entradas menos saídas, com os filtros de empresa e período">
      Saldo das notas · <strong className={saldo.startsWith("-") ? styles.negativo : undefined}>{valorEmReais(saldo)}</strong>
    </p>

    <div className={styles.barra} role="group" aria-label="Busca e filtros das notas">
      <form className={`equipe-busca ${styles.busca}`} onSubmit={buscar} role="search" aria-label="Buscar notas fiscais">
        <button type="submit" className={estilosClientes.botaoBusca} aria-label="Buscar"><IconSearch className="equipe-busca-icon" /></button>
        <input className="equipe-busca-input" type="search" maxLength={120} aria-label={`Buscar por número ou ${rotulos.contraparte.toLowerCase()}`} value={busca}
          onChange={(e) => { setBusca(e.target.value); if (!e.target.value) mudarFiltros({ busca: undefined }); }}
          placeholder={`Buscar número ou ${rotulos.contraparte.toLowerCase()}…`} />
      </form>
      <div className={styles.filtros}>
        <FiltroComBusca label="Período" icon={<CalendarDays />} semFiltro="" value={filtros.periodo ?? ""} options={periodos}
          onChange={(v) => mudarFiltros({ periodo: (v || undefined) as PeriodoDasNotas | undefined })} />
        {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar</Button> : null}
      </div>
    </div>

    {aviso ? <p className="aviso aviso--sucesso" role="status">{aviso}</p> : null}

    <section ref={listaRef} id="notas-lista" role="tabpanel" aria-labelledby={`notas-lado-${lado}`} className={styles.conteudo}>
      {vazio ?? <div className={`lista-negocios ${estilosLista.lista} ${estilosLancamentos.lista} ${styles.lista}`}>
        <ShellCard className="table-card lista-negocios-card">
          <div className="card-heading"><div className={estilosLista.cabecalhoTabela}>
            <div>
              <h2>{quantasNotas(resumo.quantidade, lado)}</h2>
              <span>{valorEmReais(resumo.total)}{resumo.semLancamento ? ` · ${resumo.semLancamento} sem lançamento` : ""}{resumo.semArquivo ? ` · ${resumo.semArquivo} sem arquivo` : ""}</span>
            </div>
          </div></div>
          <div className={`${estilosLista.rolagemTabela} ${styles.rolagem}`} role="region" aria-label={rotulos.lado}>
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
      </div>}
    </section>

    {notaAberta ? <FichaDaNotaFiscal nota={notaAberta} aoFechar={() => setAberta(null)} /> : null}
    {adicionando ? <AdicionarNotaFiscal hoje={hoje} tipoInicial={lado} empresaInicial={filtros.empresa ?? ""} notas={notas} contrapartes={contrapartes}
      lancamentos={lancamentos} aoCancelar={() => setAdicionando(false)} aoSalvar={adicionada} /> : null}
  </div>;
}
