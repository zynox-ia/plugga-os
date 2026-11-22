"use client";

import type { Deal, Pipeline } from "@plugga/shared";
import { Check } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import { iniciais } from "../../lib/clientes";
import { aplicarFiltros, FILTROS_INICIAIS, hojeNoFuso, valorCurto } from "../../lib/negocios";
import { ShellCard } from "../plugga-shell";
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
  const alturaGrafico = altura;
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

  const tomDaBarra: Record<CenárioPrevisao, string | undefined> = { comprometido: styles.barraAmbar, provavel: styles.barraPrimaria, melhor: styles.barraCeu };
  const nomeDoCenario = CENARIOS.find((item) => item.id === cenario)?.nome ?? "Projeção";
  const totalSelecionado = dados.realizado + projecaoSelecionada.valor;

  function alternarNegocio(id: string, incluir: boolean) {
    setSelecao((atual) => {
      const disponiveis = new Set(dados.negociosAbertos.map((item) => item.id));
      const novos = atual?.pipelineId === pipeline.id
        ? new Set([...atual.ids].filter((item) => disponiveis.has(item)))
        : disponiveis;
      if (incluir) novos.add(id);
      else novos.delete(id);
      return { pipelineId: pipeline.id, ids: novos };
    });
  }

  return (
    <main className={styles.pagina}>
      <div className={styles.cenarios} role="radiogroup" aria-label="Cenário de previsão">
        {cenarios.map((item) => (
          <ShellCard key={item.id} className={`${styles.cartao} ${styles.cenario} ${cenario === item.id ? styles.cenarioAtivo : ""}`}>
            <button type="button" role="radio" aria-checked={cenario === item.id} className={styles.cenarioBotao} onClick={() => setCenario(item.id)}>
              <span className={styles.cenarioRotulo}>{item.nome}<i aria-hidden="true" /></span>
              <b className={styles.cenarioValor}>{moeda(item.valor)}</b>
              <small className={styles.cenarioNota}>{item.legenda} · {Math.round(item.percentualMeta)}% da meta</small>
              <span className={`${styles.barra} ${tomDaBarra[item.id]}`} aria-hidden="true"><span style={{ inlineSize: `${Math.min(100, Math.max(0, item.percentualMeta))}%` }} /></span>
            </button>
          </ShellCard>
        ))}
      </div>

      <div className={styles.gradePrincipal}>
        <ShellCard className={`${styles.cartao} ${styles.cartaoGrafico}`}>
          <header className={styles.cabecalho}>
            <div>
              <h2 className={styles.titulo}>O trimestre, semana a semana</h2>
              <p className={styles.subtitulo}>Ganhos até aqui {moeda(dados.realizado)} · {nomeDoCenario.toLowerCase()} projeta {moeda(dados.cenarios[cenario].valor)}</p>
            </div>
            <div className={styles.legenda} aria-label="Séries do gráfico">
              <span><i className={styles.chaveGanho} />Ganho</span>
              <span><i className={styles.chaveProjecao} />Projeção</span>
              <span><i className={styles.chaveMeta} />Ritmo da meta</span>
            </div>
          </header>
          <GraficoPrevisao serie={dados.serie} meta={meta} selecionado={dados.cenarios[cenario].valor} cenario={nomeDoCenario} />
        </ShellCard>

        <ShellCard className={`${styles.cartao} ${styles.cartaoProjecao}`}>
          <header className={styles.cabecalho}>
            <div>
              <h2 className={styles.titulo}>Sua projeção</h2>
              <p className={styles.subtitulo}>Marque ou desmarque negócios</p>
            </div>
          </header>
          <p className={styles.minhaProjecao}>
            <b>{moeda(totalSelecionado)}</b>
            <small>{Math.round((totalSelecionado / meta) * 100)}% de {moeda(meta)} · {quantidadeIncluida} {quantidadeIncluida === 1 ? "negócio" : "negócios"}</small>
          </p>
          {negociosDoTrimestre.length ? (
            <ul className={styles.negocios}>
              {negociosDoTrimestre.map((deal) => {
                const incluido = idsIncluidos.has(deal.id);
                return (
                  <li key={deal.id}>
                    <label className={styles.negocio}>
                      <input type="checkbox" checked={incluido} onChange={(evento) => alternarNegocio(deal.id, evento.target.checked)} />
                      <span className={styles.caixa} aria-hidden="true"><Check size={14} strokeWidth={2.6} /></span>
                      <span className={styles.negocioCorpo}>
                        <b>{deal.title}</b>
                        <small>{pipeline.stages.find((etapa) => etapa.id === deal.stageId)?.name ?? "Sem etapa"} · {deal.expectedCloseDate ? dataCurta(deal.expectedCloseDate) : "Sem previsão"}</small>
                      </span>
                      <span className={styles.negocioValor}>{valorCurto(valorDoNegocioNoCenario(deal, cenario, pipeline.stages))}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : <p className={styles.vazio}>Nenhum negócio aberto com fechamento previsto neste trimestre.</p>}
        </ShellCard>
      </div>

      <ShellCard className={styles.cartao}>
        <header className={styles.cabecalho}>
          <div>
            <h2 className={styles.titulo}>Por vendedor</h2>
            <p className={styles.subtitulo}>Meta, valor ganho e projeção de cada carteira · meta de exemplo</p>
          </div>
        </header>
        {dados.vendedores.length ? (
          <div className={styles.tabelaRolagem}>
            <table className={styles.tabela}>
              <thead>
                <tr><th>Vendedor</th><th className={styles.direita}>Meta</th><th className={styles.direita}>Ganho</th><th className={styles.direita}>Comprometido</th><th className={styles.direita}>Mais provável</th><th>Atingimento</th></tr>
              </thead>
              <tbody>
                {dados.vendedores.map((vendedor) => {
                  const atingimento = vendedor.meta > 0 ? ((vendedor.ganho + vendedor.provavel) / vendedor.meta) * 100 : 0;
                  return (
                    <tr key={vendedor.id}>
                      <td data-l="Vendedor">
                        <span className={styles.vendedor}>
                          <span className={styles.avatar} style={{ "--cor-avatar": `hsl(${[...vendedor.nome].reduce((hash, letra) => (hash * 31 + letra.charCodeAt(0)) % 360, 7)} 52% 42%)` } as CSSProperties} aria-hidden="true">{iniciais(vendedor.nome)}</span>
                          <b>{vendedor.nome}</b>
                        </span>
                      </td>
                      <td data-l="Meta" className={styles.direita}>{valorCurto(vendedor.meta)}</td>
                      <td data-l="Ganho" className={styles.direita}>{valorCurto(vendedor.ganho)}</td>
                      <td data-l="Comprometido" className={styles.direita}>{valorCurto(vendedor.comprometido)}</td>
                      <td data-l="Mais provável" className={styles.direita}>{valorCurto(vendedor.provavel)}</td>
                      <td data-l="Atingimento">
                        <span className={styles.atingimento}>
                          <span className={`${styles.barra} ${atingimento >= 100 ? styles.barraBoa : styles.barraPrimaria}`} aria-hidden="true"><span style={{ inlineSize: `${Math.min(100, Math.max(0, atingimento))}%` }} /></span>
                          <span>{Math.round(atingimento)}%</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className={styles.vazio}>Ainda não há negócios com responsável neste trimestre.</p>}
      </ShellCard>
    </main>
  );
}
