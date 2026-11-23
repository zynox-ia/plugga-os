"use client";

import { BarChart3 } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { passoDoEixo } from "../../lib/grafico";
import styles from "./grafico-de-colunas.module.css";

/**
 * Colunas agrupadas por período (skill dataviz), compartilhado entre Estoque e
 * Financeiro: os dois azuis da marca (#0058B0 e #00A3FF, validados: ΔE 22,4
 * normal e 21,7 para daltonismo; o mais claro fica abaixo de 3:1 com a superfície,
 * por isso a tabela "Ver os números"), eixo com escala e valores, grade sutil,
 * totais na legenda, dica por período (mouse, toque e teclado), previsto com
 * textura em vez de outra cor e estado vazio. O SVG é desenhado na largura real,
 * para o texto do eixo ficar no tamanho certo.
 */

export type SerieDoGrafico = { chave: string; rotulo: string; cor: string };
export type PontoDoGrafico = {
  /** Rótulo do período ("26 out"); `rotuloCurto` vale abaixo de 480 px. */
  rotulo: string;
  rotuloCurto?: string;
  valores: Record<string, number>;
  /** Período ainda por vir: a coluna vai com textura. */
  previsto?: boolean;
  /** O período atual: rótulo do eixo em destaque e linha tracejada. */
  atual?: boolean;
};

export const AZUL_ESCURO = "#0058B0";
export const AZUL_CLARO = "#00A3FF";

export function GraficoDeColunas({ titulo, series, pontos, formatarValor, formatarEixo, rotuloDoPonto = (p) => p.rotulo, saldo, vazio, legendaDoPrevisto = "Previsto" }: {
  /** Nome acessível do gráfico. */
  titulo: string;
  series: readonly SerieDoGrafico[];
  pontos: readonly PontoDoGrafico[];
  /** Valor na legenda, na dica e na tabela ("36 un", "R$ 1.234"). */
  formatarValor: (v: number) => string;
  /** Valor curto no eixo ("R$ 10 mil", "40"). */
  formatarEixo?: (v: number) => string;
  /** Título da dica e da linha da tabela ("Semana de 26 out"). */
  rotuloDoPonto?: (p: PontoDoGrafico) => string;
  /** Linha final da dica, como "Saldo da semana": primeira série menos a segunda. */
  saldo?: { rotulo: string; formatar: (v: number) => string };
  vazio: { titulo: string; texto: string };
  legendaDoPrevisto?: string;
}) {
  const id = useId().replace(/:/g, "");
  const area = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  const [ativo, setAtivo] = useState<number | null>(null);

  useLayoutEffect(() => { if (area.current) setLargura(area.current.clientWidth); }, []);
  useEffect(() => {
    const el = area.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(([e]) => { if (e) setLargura(Math.round(e.contentRect.width)); });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const total = (chave: string, previsto: boolean) => pontos.filter((p) => Boolean(p.previsto) === previsto).reduce((s, p) => s + (p.valores[chave] ?? 0), 0);
  const temPrevisto = pontos.some((p) => p.previsto);
  const soma = pontos.reduce((s, p) => s + series.reduce((a, se) => a + (p.valores[se.chave] ?? 0), 0), 0);
  if (pontos.length === 0 || soma === 0) {
    return <div className={styles.vazio} role="status"><BarChart3 size={22} aria-hidden="true" /><p>{vazio.titulo}</p><small>{vazio.texto}</small></div>;
  }

  const movel = largura > 0 && largura < 480;
  const W = Math.max(280, largura || 720), H = movel ? 220 : 240, L = movel ? 46 : 58, R = 6, T = 14, B = 34;
  const pw = W - L - R, ph = H - T - B;
  const maximo = Math.max(...pontos.flatMap((p) => series.map((s) => p.valores[s.chave] ?? 0)));
  const passo = passoDoEixo(maximo);
  const topo = passo * 4;
  const y = (v: number) => T + ph - (v / topo) * ph;
  const banda = pw / pontos.length;
  const espaco = 2;
  const larg = Math.max(6, Math.min(22, Math.floor((banda * 0.64 - espaco * (series.length - 1)) / series.length)));
  const eixo = formatarEixo ?? formatarValor;
  const iAtual = pontos.findIndex((p) => p.atual);

  const coluna = (x: number, v: number, cor: string, previsto: boolean, chave: string) => {
    if (v <= 0) return null;
    const h = Math.max(2, (v / topo) * ph), r = Math.min(4, h), y0 = T + ph;
    return <path key={chave} d={`M${x} ${y0}V${y0 - h + r}q0 -${r} ${r} -${r}h${larg - 2 * r}q${r} 0 ${r} ${r}V${y0}Z`} fill={previsto ? `url(#${id}-hach-${chave})` : cor} />;
  };

  const dica = ativo === null ? null : pontos[ativo];
  const posDica = ativo === null ? 0 : L + banda * ativo + banda / 2;

  return <figure className={styles.grafico}>
    <figcaption className={styles.legenda}>
      {series.map((s) => <span key={s.chave} className={styles.serie}>
        <i style={{ background: s.cor }} aria-hidden="true" /><span>{s.rotulo}</span><strong>{formatarValor(total(s.chave, false))}</strong>
        {temPrevisto ? <small>+ {formatarValor(total(s.chave, true))} {legendaDoPrevisto.toLowerCase()}</small> : null}
      </span>)}
      {temPrevisto ? <span className={`${styles.serie} ${styles.seriePrevisto}`}><i className={styles.hachura} style={{ "--cor": series[0]?.cor } as CSSProperties} aria-hidden="true" /><span>{legendaDoPrevisto}</span></span> : null}
    </figcaption>
    <div ref={area} className={styles.area} onPointerLeave={() => setAtivo(null)}>
      {largura > 0 ? <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="group" aria-label={titulo}>
        <defs>{series.map((s) => <pattern key={s.chave} id={`${id}-hach-${s.chave}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={s.cor} fillOpacity=".22" /><rect width="2.4" height="6" fill={s.cor} />
        </pattern>)}</defs>
        {[0, 1, 2, 3, 4].map((k) => <g key={k}>
          <line x1={L} x2={W - R} y1={y(passo * k)} y2={y(passo * k)} className={k ? styles.grade : styles.base} />
          <text x={L - 8} y={y(passo * k) + 4} textAnchor="end" className={styles.eixo}>{eixo(passo * k)}</text>
        </g>)}
        {iAtual > 0 ? <line x1={L + banda * iAtual} x2={L + banda * iAtual} y1={T - 4} y2={T + ph} className={styles.linhaAtual} /> : null}
        {pontos.map((p, k) => {
          const cx = L + banda * k + banda / 2;
          const inicio = cx - (series.length * larg + (series.length - 1) * espaco) / 2;
          return <g key={k}>
            {series.map((s, i) => coluna(inicio + i * (larg + espaco), p.valores[s.chave] ?? 0, s.cor, Boolean(p.previsto), s.chave))}
            <text x={cx} y={H - 12} textAnchor="middle" className={`${styles.eixo} ${p.atual ? styles.eixoAtual : ""}`}>{movel ? p.rotuloCurto ?? p.rotulo : p.rotulo}</text>
          </g>;
        })}
        {pontos.map((p, k) => <rect key={k} x={L + banda * k} y={T} width={banda} height={ph} className={`${styles.alvo} ${ativo === k ? styles.alvoAtivo : ""}`}
          tabIndex={0} role="img" aria-label={`${rotuloDoPonto(p)}${p.previsto ? ", previsto" : ""}: ${series.map((s) => `${s.rotulo.toLowerCase()} ${formatarValor(p.valores[s.chave] ?? 0)}`).join(", ")}`}
          onPointerEnter={() => setAtivo(k)} onPointerDown={() => setAtivo(k)} onFocus={() => setAtivo(k)} onBlur={() => setAtivo(null)} />)}
      </svg> : <div style={{ height: 240 }} />}
      {dica ? <div className={styles.dica} role="status" style={{ left: `clamp(4px, calc(${posDica}px - 100px), calc(100% - 204px))` }}>
        <strong>{rotuloDoPonto(dica)}</strong>
        {dica.previsto ? <small>{legendaDoPrevisto}</small> : null}
        {series.map((s) => <span key={s.chave}><i style={{ background: s.cor }} aria-hidden="true" />{s.rotulo}<b>{formatarValor(dica.valores[s.chave] ?? 0)}</b></span>)}
        {saldo && series.length >= 2 ? <span className={styles.saldo}>{saldo.rotulo}<b>{saldo.formatar((dica.valores[series[0]!.chave] ?? 0) - (dica.valores[series[1]!.chave] ?? 0))}</b></span> : null}
      </div> : null}
    </div>
    <details className={styles.tabela}>
      <summary>Ver os números</summary>
      <table>
        <caption className="sr-only">{titulo}</caption>
        <thead><tr><th scope="col">Período</th>{series.map((s) => <th key={s.chave} scope="col">{s.rotulo}</th>)}{saldo ? <th scope="col">{saldo.rotulo}</th> : null}</tr></thead>
        <tbody>{pontos.map((p, k) => <tr key={k}>
          <th scope="row">{p.rotulo}{p.previsto ? ` · ${legendaDoPrevisto.toLowerCase()}` : ""}</th>
          {series.map((s) => <td key={s.chave} data-l={s.rotulo}>{formatarValor(p.valores[s.chave] ?? 0)}</td>)}
          {saldo && series.length >= 2 ? <td data-l={saldo.rotulo}>{saldo.formatar((p.valores[series[0]!.chave] ?? 0) - (p.valores[series[1]!.chave] ?? 0))}</td> : null}
        </tr>)}</tbody>
      </table>
    </details>
  </figure>;
}
