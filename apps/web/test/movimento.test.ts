import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { atrasoEscalonado, COREOGRAFIA, ladoDaEntrada, MOVIMENTO, movimentoReduzido } from "../app/lib/movimento.ts";

/**
 * Contrato do movimento de entrada (PLU-325). O efeito visual é provado no
 * navegador; aqui ficam as regras que não podem regredir sem ninguém notar:
 * guarda de movimento reduzido, teto da cascata, durações, fallback sem JS e
 * só propriedades baratas.
 */
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const raiz = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
// Sem comentários: a explicação do bloco cita as próprias regras ("sem will-change").
const bloco = css.slice(css.lastIndexOf("/*", css.indexOf("MOVIMENTO (PLU-325)"))).replace(/\/\*[\s\S]*?\*\//g, "");

function token(nome: string): string {
  const achado = raiz.match(new RegExp(`${nome}:\\s*([^;]+);`));
  assert.ok(achado, `token ${nome} ausente do :root`);
  return achado[1]!.trim();
}

/** Conteúdo entre as chaves do bloco que começa em `inicio`. */
function corpo(texto: string, inicio: number): string {
  const abre = texto.indexOf("{", inicio);
  let nivel = 0;
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === "{") nivel++;
    if (texto[i] === "}" && --nivel === 0) return texto.slice(abre + 1, i);
  }
  throw new Error("bloco sem fechamento");
}

describe("constantes do movimento (GSAP)", () => {
  const tweens = [MOVIMENTO.titulo, MOVIMENTO.cartao, MOVIMENTO.kpi, MOVIMENTO.item, MOVIMENTO.barra, MOVIMENTO.pilula, MOVIMENTO.rota, MOVIMENTO.modal, MOVIMENTO.modal.parte, MOVIMENTO.modal.saida];

  it("nenhum tween passa de 800 ms, salvo as barras (0,9 s), e todos têm curva", () => {
    for (const tween of tweens) {
      assert.ok(tween.duracao > 0 && tween.duracao <= (tween === MOVIMENTO.barra ? 0.9 : 0.85), `duração ${tween.duracao}`);
      assert.match(tween.curva, /^(expo|power\d|back)\.(out|in)/);
    }
  });

  it("a saída do modal é mais curta que a entrada", () => {
    assert.ok(MOVIMENTO.modal.saida.duracao < MOVIMENTO.modal.duracao);
  });

  it("a escala de partida fica perto de 1 e o giro dos KPIs não passa de 2°", () => {
    for (const escala of [MOVIMENTO.cartao.escala, MOVIMENTO.kpi.escala, MOVIMENTO.modal.escala, MOVIMENTO.modal.saida.escala]) assert.ok(escala >= 0.9 && escala < 1, `escala ${escala}`);
    assert.ok(MOVIMENTO.kpi.giro <= 2);
  });

  it("a cascata tem teto: do 14º item em diante todos saem juntos", () => {
    assert.equal(atrasoEscalonado(0, 0.05), 0);
    assert.equal(atrasoEscalonado(3, 0.05), 0.15000000000000002);
    assert.equal(atrasoEscalonado(MOVIMENTO.teto - 1, 1), atrasoEscalonado(MOVIMENTO.teto + 20, 1));
    assert.equal(atrasoEscalonado(-1, 1), 0);
  });

  it("cada tela entra na ordem cabeçalho → KPIs → cartões → listas → barras → pílulas e termina perto de 1,8 s", () => {
    const d = COREOGRAFIA.dashboard;
    const ordem = [d.titulo, d.kpis, d.cartoes, d.itens, d.barras, d.pilulas];
    assert.deepEqual([...ordem].sort((a, b) => a - b), ordem);
    const fim = Math.max(
      d.titulo + MOVIMENTO.titulo.duracao,
      d.kpis + atrasoEscalonado(3, MOVIMENTO.kpi.passo) + MOVIMENTO.kpi.duracao,
      d.cartoes + atrasoEscalonado(MOVIMENTO.teto, MOVIMENTO.cartao.passo) + MOVIMENTO.cartao.duracao,
      d.barras + atrasoEscalonado(MOVIMENTO.teto, MOVIMENTO.barra.passo) + MOVIMENTO.barra.duracao,
      d.pilulas + atrasoEscalonado(3, MOVIMENTO.pilula.passo) + MOVIMENTO.pilula.duracao,
    );
    // Pior caso, com os grupos cheios até o teto; a tela real tem menos itens.
    assert.ok(fim >= 1.4 && fim <= 1.9, `dashboard termina em ${fim} s`);
    const k = COREOGRAFIA.kanban;
    const fimDoKanban = Math.max(k.cartoes + atrasoEscalonado(MOVIMENTO.teto, MOVIMENTO.cartao.passo) + MOVIMENTO.cartao.duracao, k.pilulas + MOVIMENTO.pilula.duracao);
    assert.ok(fimDoKanban <= 1.9, `kanban termina em ${fimDoKanban} s`);
  });

  it("movimento reduzido desliga tudo, e fora do navegador nada anima", () => {
    const janela = (reduz: boolean) => ({ matchMedia: (consulta: string) => ({ matches: reduz && consulta === "(prefers-reduced-motion: reduce)" }) });
    assert.equal(movimentoReduzido(janela(true)), true);
    assert.equal(movimentoReduzido(janela(false)), false);
    assert.equal(movimentoReduzido(undefined), true);
  });

  it("a troca de tela entra do lado da ordem do menu e sem referência não desliza", () => {
    assert.equal(ladoDaEntrada("/", "/comercial/pipelines"), 1);
    assert.equal(ladoDaEntrada("/comercial/pipelines", "/"), -1);
    assert.equal(ladoDaEntrada(null, "/"), 0);
    assert.equal(ladoDaEntrada("/clientes", "/"), 0);
    assert.equal(ladoDaEntrada("/", "/"), 0);
  });
});

describe("bloco Movimento do CSS", () => {
  const guarda = bloco.indexOf("@media (prefers-reduced-motion: no-preference) {");
  const protegido = corpo(bloco, guarda);
  const hover = corpo(bloco, bloco.indexOf("@media (prefers-reduced-motion: no-preference) and (hover: hover)"));

  it("só anima dentro de prefers-reduced-motion: no-preference", () => {
    assert.ok(guarda > 0, "bloco sem a guarda de movimento");
    const foraDaGuarda = bloco.replace(protegido, "").replace(hover, "");
    assert.doesNotMatch(foraDaGuarda, /\banimation(-name)?\s*:/, "animação fora da guarda");
    assert.doesNotMatch(foraDaGuarda, /\btransition\s*:/, "transição fora da guarda");
    assert.doesNotMatch(foraDaGuarda, /:active[^{]*\{[^}]*scale/, "clique com escala fora da guarda");
  });

  it("a espera pelo JS é só um atraso com fallback: sem JS a tela aparece sozinha", () => {
    assert.match(protegido, /\[data-plg-aguarda\]\s*\{\s*animation: plg-aguarda 0s linear var\(--motion-fallback\) backwards;/);
    assert.ok(Number.parseFloat(token("--motion-fallback")) <= 1.5);
  });

  it("animações e transições do bloco usam os tokens", () => {
    // "0s" é a espera sem animação do fallback, não uma duração.
    for (const valor of [...protegido.matchAll(/\banimation\s*:\s*([^;]+);/g)].map((m) => m[1]!.replace(" 0s ", " "))) {
      assert.doesNotMatch(valor, /\d(\.\d+)?m?s\b|cubic-bezier|(?<![-\w])ease(?![-\w])/, `valor solto em: ${valor}`);
    }
    assert.match(hover, /transition: translate var\(--motion-lift\) var\(--ease-power3-out\)/);
  });

  it("keyframes só mexem em opacity, translate e scale", () => {
    const keyframes = [...bloco.matchAll(/@keyframes (plg-[\w-]+)/g)];
    assert.ok(keyframes.length >= 3);
    for (const k of keyframes) {
      const propriedades = [...corpo(bloco, k.index!).matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]);
      for (const p of propriedades) assert.ok(["opacity", "translate", "scale"].includes(p!), `${k[1]} anima ${p}`);
    }
  });

  it("nunca esconde conteúdo fora das keyframes nem fixa will-change", () => {
    const semKeyframes = bloco.replace(/@keyframes[^{]+\{[^}]*\{[^}]*\}\s*\}/g, "");
    assert.doesNotMatch(semKeyframes, /opacity\s*:\s*0/);
    assert.doesNotMatch(bloco, /will-change/);
  });
});

describe("módulo de movimento", () => {
  const fonte = readFileSync(new URL("../app/lib/movimento.ts", import.meta.url), "utf8");

  it("cada tween limpa as propriedades ao terminar e nada usa will-change", () => {
    const tweens = [...fonte.matchAll(/\.fromTo\(/g)].length;
    const limpezas = [...fonte.matchAll(/clearProps|\.\.\.FIM/g)].length;
    assert.ok(limpezas >= tweens, `${tweens} tweens e ${limpezas} limpezas`);
    assert.doesNotMatch(fonte, /will-change|willChange/);
  });

  it("só anima transform e opacity (nunca largura, altura ou margem)", () => {
    assert.doesNotMatch(fonte, /\b(width|height|margin\w*|top|left)\s*:\s*[^"'`]/);
  });
});
