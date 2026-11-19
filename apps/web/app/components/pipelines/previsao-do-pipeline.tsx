"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { aplicarFiltros, FILTROS_INICIAIS, hojeNoFuso, valorCurto } from "../../lib/negocios";
import { calcularPrevisao, calcularProjecaoSelecionada, idsSelecionadosDaPipeline, META_TRIMESTRAL_EXEMPLO, valorDoNegocioNoCenario, type CenárioPrevisao, type PontoPrevisao, type SelecaoDaPrevisao } from "../../lib/previsao";
import styles from "./previsao-do-pipeline.module.css";

const CENARIOS: Array<{ id: CenárioPrevisao; nome: string; legenda: string }> = [
  { id: "comprometido", nome: "Comprometido", legenda: "Ganhos + etapas finais" },
  { id: "provavel", nome: "Mais provável", legenda: "Estimativa ponderada por etapa" },
  { id: "melhor", nome: "Melhor cenário", legenda: "Ganhos + todos os negócios" },
];

function moeda(valor: number) { return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }); }
function dataCurta(data: string) { return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${data}T12:00:00Z`)); }

function GraficoPrevisao({ serie, meta, selecionado, cenario }: { serie: PontoPrevisao[]; meta: number; selecionado: number; cenario: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const graficoRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(760);
  const [tooltipLeft, setTooltipLeft] = useState<number | null>(null);
  useEffect(() => {
    const elemento = graficoRef.current;
    if (!elemento) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setLargura(Math.max(320, Math.round(entry.contentRect.width)));
    });
    observer.observe(elemento);
    return () => observer.disconnect();
  }, []);
  const mobile = largura < 640;
  const altura = 290;
  const alturaGrafico = mobile ? 290 : 366;
  const deslocamentoSvg = (alturaGrafico - altura) / 2;
  const margem = { topo: 18, direita: 12, baixo: 32, esquerda: mobile ? 44 : 58 };
  const plotLargura = largura - margem.esquerda - margem.direita;
  const plotAltura = altura - margem.topo - margem.baixo;
  const hojeIndice = Math.max(0, serie.findIndex((item) => item.data === hojeNoFuso()));
  const realizadoHoje = serie[hojeIndice]?.realizado ?? 0;
  const valoresProjetados = serie.map((item, indice) => {
    if (indice <= hojeIndice) return item.realizado;
    const fracao = (indice - hojeIndice) / Math.max(1, serie.length - 1 - hojeIndice);
    return realizadoHoje + (selecionado - realizadoHoje) * fracao ** 1.25;
  });
  const faixa = valoresProjetados.map((valor) => {
    const distancia = valor - realizadoHoje;
    return { baixa: Math.max(realizadoHoje, valor - distancia * 0.18), alta: valor + distancia * 0.14 };
  });
  const maximo = Math.max(selecionado, meta, ...faixa.map((item) => item.alta), ...serie.map((ponto) => ponto.realizado), 1) * 1.1;
  const ponto = (valor: number, indice: number) => ({
    x: margem.esquerda + (serie.length <= 1 ? 0 : (indice / (serie.length - 1)) * plotLargura),
    y: margem.topo + plotAltura - (valor / maximo) * plotAltura,
  });
  const linha = (valores: Array<number | null>, inicio = 0) => {
    let caminho = "";
    let anterior: { x: number; y: number } | null = null;
    valores.slice(inicio).forEach((valor, posicao) => {
      if (valor === null) { anterior = null; return; }
      const atual = ponto(valor, posicao + inicio);
      if (!anterior) caminho += `M${atual.x} ${atual.y}`;
      else {
        const meio = (atual.x - anterior.x) / 2;
        caminho += ` C${anterior.x + meio} ${anterior.y} ${atual.x - meio} ${atual.y} ${atual.x} ${atual.y}`;
      }
      anterior = atual;
    });
    return caminho;
  };
  const realizados = serie.slice(0, hojeIndice + 1);
  const areaRealizado = `${linha(realizados.map((item) => item.realizado))} L${ponto(realizadoHoje, hojeIndice).x} ${margem.topo + plotAltura} L${margem.esquerda} ${margem.topo + plotAltura} Z`;
  const faixaAlta = faixa.slice(hojeIndice).map((item, posicao) => {
    const xy = ponto(item.alta, posicao + hojeIndice);
    return `${posicao ? "L" : "M"}${xy.x} ${xy.y}`;
  }).join(" ");
  const faixaBaixa = faixa.slice(hojeIndice).map((item, posicao) => ponto(item.baixa, posicao + hojeIndice)).reverse().map((xy) => `L${xy.x} ${xy.y}`).join(" ");
  const tooltip = hover === null ? null : serie[hover];
  const xyTooltip = hover === null ? null : ponto(valoresProjetados[hover] ?? 0, hover);
  const datasChave = Array.from({ length: 7 }, (_, indice) => Math.round(indice * (serie.length - 1) / 6));

  useLayoutEffect(() => {
    const elementoGrafico = graficoRef.current;
    const elementoTooltip = tooltipRef.current;
    if (hover === null || !xyTooltip || !elementoGrafico || !elementoTooltip) return;
    const metadeTooltip = elementoTooltip.offsetWidth / 2;
    const xDoPonto = (xyTooltip.x / largura) * elementoGrafico.clientWidth;
    setTooltipLeft(Math.max(metadeTooltip + 4, Math.min(elementoGrafico.clientWidth - metadeTooltip - 4, xDoPonto)));
  }, [hover, largura, xyTooltip?.x, cenario]);

  function moverPonteiro(evento: ReactPointerEvent<SVGSVGElement>) {
    const rect = evento.currentTarget.getBoundingClientRect();
    const fracaoX = (evento.clientX - rect.left) / rect.width;
    const posicao = (fracaoX * largura - margem.esquerda) / plotLargura;
    setHover(Math.min(serie.length - 1, Math.max(0, Math.round(posicao * (serie.length - 1)))));
  }

  return (
    <div className={styles.grafico} ref={graficoRef}>
      <svg viewBox={`0 0 ${largura} ${altura}`} role="img" tabIndex={0} aria-label="Gráfico semanal de ganhos, projeção e ritmo da meta" onPointerMove={moverPonteiro} onPointerLeave={() => setHover(null)} onKeyDown={(evento) => {
        if (evento.key === "ArrowRight" || evento.key === "ArrowLeft") {
          evento.preventDefault();
          setHover((atual) => Math.min(serie.length - 1, Math.max(0, (atual ?? hojeIndice) + (evento.key === "ArrowRight" ? 1 : -1))));
        }
      }}>
        <defs><linearGradient id="previsao-area-ganho" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--ui-primary)" stopOpacity=".24" /><stop offset="1" stopColor="var(--ui-primary)" stopOpacity="0" /></linearGradient></defs>
        {[0, 0.25, 0.5, 0.75, 1].map((fracao) => {
          const y = margem.topo + plotAltura * (1 - fracao);
          return <g key={fracao}><line x1={margem.esquerda} x2={largura - margem.direita} y1={y} y2={y} className={styles.grade} /><text x={margem.esquerda - 10} y={y + 4} textAnchor="end" className={styles.rotuloEixo}>{valorCurto(maximo * fracao)}</text></g>;
        })}
        <path d={`${faixaAlta} ${faixaBaixa} Z`} className={styles.faixaProjecao} />
        <path d={areaRealizado} fill="url(#previsao-area-ganho)" />
        <path d={linha(realizados.map((item) => item.realizado))} className={styles.linhaRealizada} />
        <path d={linha(serie.map((item) => item.ritmoMeta))} className={styles.linhaMeta} />
        <path d={linha(valoresProjetados, hojeIndice)} className={styles.linhaProjecao} />
        <circle cx={ponto(realizadoHoje, hojeIndice).x} cy={ponto(realizadoHoje, hojeIndice).y} r="4" className={styles.pontoRealizado} />
        {datasChave.map((indice) => {
          const xy = ponto(valoresProjetados[indice] ?? 0, indice);
          return <text key={indice} x={xy.x} y={altura - 7} textAnchor={indice === 0 ? "start" : indice === serie.length - 1 ? "end" : "middle"} className={`${styles.rotuloEixo} ${mobile && indice !== datasChave[0] && indice !== datasChave.at(-1) ? styles.rotuloDataOculto : ""}`}>{dataCurta(serie[indice]?.data ?? "")}</text>;
        })}
        <g><line x1={ponto(0, hojeIndice).x} x2={ponto(0, hojeIndice).x} y1={margem.topo} y2={margem.topo + plotAltura} className={styles.marcadorHoje} /><text x={ponto(0, hojeIndice).x + 6} y={margem.topo + 12} className={styles.rotuloHoje}>Hoje</text></g>
        {hover !== null ? <line x1={ponto(0, hover).x} x2={ponto(0, hover).x} y1={margem.topo} y2={margem.topo + plotAltura} className={styles.linhaHover} /> : null}
        {hover !== null && xyTooltip ? <circle cx={xyTooltip.x} cy={xyTooltip.y} r="5" className={styles.pontoHover} /> : null}
      </svg>
      {tooltip && xyTooltip ? <div ref={tooltipRef} className={styles.tooltip} role="status" style={{ left: tooltipLeft === null ? "50%" : `${tooltipLeft}px`, top: `${Math.max(4, deslocamentoSvg + xyTooltip.y - 12)}px` }}><strong>{dataCurta(tooltip.data)}</strong><span><i className={styles.chaveProjecao} /> {cenario}: {moeda(valoresProjetados[hover ?? 0] ?? 0)}</span><span><i className={styles.chaveRealizada} /> Ganho: {moeda(tooltip.realizado)}</span><span><i className={styles.chaveMeta} /> Meta: {moeda(tooltip.ritmoMeta)}</span></div> : null}
    </div>
  );
}

export function PrevisaoDoPipeline({ pipeline, negocios, busca }: { pipeline: Pipeline; negocios: Deal[]; busca: string }) {
  const hoje = hojeNoFuso();
  const dados = useMemo(() => calcularPrevisao(negocios, pipeline, hoje), [negocios, pipeline, hoje]);
  const filtrados = useMemo(() => aplicarFiltros(negocios, { ...FILTROS_INICIAIS, busca, status: "open" }, hoje, pipeline), [negocios, busca, hoje, pipeline]);
  const negociosDoTrimestre = dados.negociosAbertos.filter((deal) => filtrados.some((item) => item.id === deal.id));
  const [cenario, setCenario] = useState<CenárioPrevisao>("provavel");
  const [selecao, setSelecao] = useState<SelecaoDaPrevisao>(null);
  const idsIncluidos = idsSelecionadosDaPipeline(pipeline.id, selecao, dados.negociosAbertos);
  const quantidadeIncluida = dados.negociosAbertos.filter((deal) => idsIncluidos.has(deal.id)).length;
  const projecaoSelecionada = calcularProjecaoSelecionada(dados.negociosAbertos, idsIncluidos, cenario, pipeline.stages);
  const meta = META_TRIMESTRAL_EXEMPLO;
  const cenarios = CENARIOS.map((item) => ({ ...item, ...dados.cenarios[item.id] }));

  return (
    <main className={styles.pagina}>
      <section className={styles.cenarios} role="radiogroup" aria-label="Cenário da projeção">
        {cenarios.map((item) => (
          <label key={item.id} className={`${styles.cenario} ${cenario === item.id ? styles.cenarioAtivo : ""}`}>
            <input type="radio" name="cenario-previsao" value={item.id} checked={cenario === item.id} onChange={() => setCenario(item.id)} />
            <span className={styles.cenarioTitulo}>{item.nome}<i aria-hidden="true" /></span>
            <strong className={styles.cenarioValor}>{moeda(item.valor)}</strong>
            <small className={styles.cenarioLegenda}>{item.legenda} · {Math.round(item.percentualMeta)}% da meta</small>
            <span className={styles.cenarioMeta} aria-label={`${Math.round(item.percentualMeta)}% da meta`}><span className={styles.barraMeta}><span style={{ inlineSize: `${Math.min(100, Math.max(0, item.percentualMeta))}%` }} /></span></span>
          </label>
        ))}
      </section>

      <div className={styles.gradePrincipal}>
        <section className={styles.painel} aria-labelledby="previsao-grafico-titulo">
          <header className={styles.cabecalhoPainel}>
            <div><h2 id="previsao-grafico-titulo">O trimestre, semana a semana</h2><p>Ganhos até aqui {moeda(dados.realizado)} · {CENARIOS.find((item) => item.id === cenario)?.nome.toLowerCase()} projeta {moeda(dados.cenarios[cenario].valor)} · Meta: Exemplo</p></div>
            <ul className={styles.legenda} aria-label="Séries do gráfico"><li><span className={styles.chaveRealizada} /> Ganho</li><li><span className={styles.chaveProjecao} /> Projeção</li><li><span className={styles.chaveMeta} /> Ritmo da meta</li></ul>
          </header>
          <GraficoPrevisao serie={dados.serie} meta={meta} selecionado={dados.cenarios[cenario].valor} cenario={CENARIOS.find((item) => item.id === cenario)?.nome ?? "Projeção"} />
        </section>

        <section className={`${styles.painel} ${styles.painelSelecao}`} aria-labelledby="previsao-selecao-titulo">
          <header className={styles.cabecalhoPainel}><div><h2 id="previsao-selecao-titulo">Sua projeção</h2><p>Inclua ou retire negócios do cálculo</p></div></header>
          <strong className={styles.totalSelecao}>{moeda(dados.realizado + projecaoSelecionada.valor)}</strong>
          <span className={styles.subTotalSelecao}>{Math.round((dados.realizado + projecaoSelecionada.valor) / meta * 100)}% de {moeda(meta)} · {quantidadeIncluida} selecionados</span>
          {negociosDoTrimestre.length ? (
            <ul className={styles.listaNegocios}>
              {negociosDoTrimestre.map((deal) => (
                <li key={deal.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={idsIncluidos.has(deal.id)}
                      onChange={(evento) => setSelecao((atual) => {
                        const disponiveis = new Set(dados.negociosAbertos.map((item) => item.id));
                        const novos = atual?.pipelineId === pipeline.id
                          ? new Set([...atual.ids].filter((id) => disponiveis.has(id)))
                          : disponiveis;
                        if (evento.target.checked) novos.add(deal.id);
                        else novos.delete(deal.id);
                        return { pipelineId: pipeline.id, ids: novos };
                      })}
                    />
                    <span className={styles.nomeNegocio}><strong>{deal.title}</strong><small>{deal.owner.name} · {deal.expectedCloseDate ? dataCurta(deal.expectedCloseDate) : "Sem previsão"}</small></span>
                    <strong className={!idsIncluidos.has(deal.id) ? styles.negocioDesmarcado : ""}>{valorCurto(valorDoNegocioNoCenario(deal, cenario, pipeline.stages))}</strong>
                  </label>
                </li>
              ))}
            </ul>
          ) : <p className={styles.vazio}>Nenhum negócio aberto com fechamento previsto neste trimestre.</p>}
        </section>
      </div>

      <section className={`${styles.painel} ${styles.painelVendedores}`} aria-labelledby="previsao-vendedores-titulo">
        <header className={styles.cabecalhoPainel}><div><h2 id="previsao-vendedores-titulo">Por vendedor</h2><p>Meta dividida igualmente entre responsáveis · Exemplo</p></div></header>
        {dados.vendedores.length ? <div className={styles.tabelaRolagem}><table><thead><tr><th>Vendedor</th><th>Meta</th><th>Ganho</th><th>Comprometido</th><th>Mais provável</th><th>Lacuna</th></tr></thead><tbody>{dados.vendedores.map((vendedor) => <tr key={vendedor.id}><th scope="row">{vendedor.nome}</th><td data-label="Meta">{valorCurto(vendedor.meta)}</td><td data-label="Ganho">{valorCurto(vendedor.ganho)}</td><td data-label="Comprometido">{valorCurto(vendedor.comprometido)}</td><td data-label="Mais provável">{valorCurto(vendedor.provavel)}</td><td data-label="Lacuna">{valorCurto(vendedor.lacuna)}</td></tr>)}</tbody></table></div> : <p className={styles.vazio}>Ainda não há negócios com responsável neste trimestre.</p>}
      </section>
    </main>
  );
}
