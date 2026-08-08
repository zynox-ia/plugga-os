import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { lerFatura } from "../src/energy-efficiency/fatura/leitura.js";

/**
 * Leitura contra o corpus real de faturas.
 *
 * As faturas são de clientes de verdade e **não entram no repositório**. O
 * teste roda apontando para uma pasta local:
 *
 *     CORPUS_FATURAS=/caminho/para/faturas pnpm --filter @plugga/api test
 *
 * O que se mede aqui não é "quantas faturas o módulo lê" — é que **nenhuma
 * fatura lida produz número não conferido**. Cobertura é meta móvel; a garantia
 * de não errar em silêncio é o contrato.
 */
const PASTA = process.env.CORPUS_FATURAS;

function pdfsDe(raiz: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
    const caminho = join(raiz, entrada.name);
    if (entrada.isDirectory()) achados.push(...pdfsDe(caminho));
    else if (entrada.name.toLowerCase().endsWith(".pdf")) achados.push(caminho);
  }
  return achados;
}

describe.skipIf(!PASTA)("leitura de fatura — corpus real", () => {
  const caminhos = PASTA ? pdfsDe(PASTA) : [];

  it("nunca devolve ficha aproveitável com item divergente", () => {
    const traicoeiras: string[] = [];

    for (const caminho of caminhos) {
      const leitura = lerFatura(readFileSync(caminho));
      // A trava central: se algum item não fechou na multiplicação, ele não
      // pode ter entrado na ficha sem aparecer para conferência.
      if (leitura.aproveitavel && leitura.conferencia.temDivergencia) {
        const naoAvisado = leitura.conferencia.itens
          .filter((i) => i.veredicto === "divergente")
          .some((i) => !leitura.camposParaConfirmar.some((c) => c.startsWith(i.rotulo)));
        if (naoAvisado) traicoeiras.push(caminho);
      }
    }

    expect(traicoeiras).toEqual([]);
  });

  it("sempre diz o que falta confirmar quando aproveita a fatura", () => {
    for (const caminho of caminhos) {
      const leitura = lerFatura(readFileSync(caminho));
      if (leitura.aproveitavel) expect(leitura.camposParaConfirmar.length).toBeGreaterThan(0);
    }
  });

  it("classifica digitalização sem inventar campo", () => {
    for (const caminho of caminhos) {
      const leitura = lerFatura(readFileSync(caminho));
      if (leitura.origem === "digitalizacao") {
        expect(leitura.aproveitavel).toBe(false);
        expect(Object.keys(leitura.invoice)).toEqual([]);
      }
    }
  });

  it("relata a cobertura alcançada", () => {
    const contagem = { texto_direto: 0, fonte_codificada: 0, digitalizacao: 0 };
    let aproveitaveis = 0;
    let itensConfirmados = 0;
    let itensDivergentes = 0;

    for (const caminho of caminhos) {
      const leitura = lerFatura(readFileSync(caminho));
      contagem[leitura.origem] += 1;
      if (leitura.aproveitavel) aproveitaveis += 1;
      itensConfirmados += leitura.conferencia.confirmados;
      itensDivergentes += leitura.conferencia.divergentes;
    }

    console.log(
      `[fatura] ${caminhos.length} PDFs · texto ${contagem.texto_direto} · ` +
        `codificada ${contagem.fonte_codificada} · digitalizacao ${contagem.digitalizacao} · ` +
        `ficha montada ${aproveitaveis} · itens confirmados ${itensConfirmados} · divergentes ${itensDivergentes}`,
    );

    expect(caminhos.length).toBeGreaterThan(0);
  });
});
