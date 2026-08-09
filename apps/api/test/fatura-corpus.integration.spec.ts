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

/** Reconhecimento óptico é lento; um corpus grande estoura o prazo padrão. */
const PRAZO_MS = 30 * 60_000;

const EXTENSOES = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"];

function arquivosDe(raiz: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
    const caminho = join(raiz, entrada.name);
    if (entrada.isDirectory()) achados.push(...arquivosDe(caminho));
    else if (EXTENSOES.some((fim) => entrada.name.toLowerCase().endsWith(fim))) {
      achados.push(caminho);
    }
  }
  return achados;
}

describe.skipIf(!PASTA)("leitura de fatura — corpus real", () => {
  const caminhos = PASTA ? arquivosDe(PASTA) : [];

  it(
    "nunca devolve ficha aproveitável com item divergente",
    async () => {
      const traicoeiras: string[] = [];

      for (const caminho of caminhos) {
        const leitura = await lerFatura(readFileSync(caminho));
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
    },
    PRAZO_MS,
  );

  it(
    "sempre diz o que falta confirmar quando aproveita a fatura",
    async () => {
      for (const caminho of caminhos) {
        const leitura = await lerFatura(readFileSync(caminho));
        if (leitura.aproveitavel) expect(leitura.camposParaConfirmar.length).toBeGreaterThan(0);
      }
    },
    PRAZO_MS,
  );

  it(
    "recusa sem inventar campo",
    async () => {
      for (const caminho of caminhos) {
        const leitura = await lerFatura(readFileSync(caminho));
        // Recusa por senha, imagem ilegível ou layout novo não pode vir com
        // ficha parcial: é o caso em que um número inventado passaria despercebido.
        if (
          leitura.motivo === "protegido_por_senha" ||
          leitura.motivo === "senha_incorreta" ||
          leitura.motivo === "sem_texto" ||
          leitura.motivo === "layout_desconhecido"
        ) {
          expect(leitura.aproveitavel).toBe(false);
          expect(Object.keys(leitura.invoice)).toEqual([]);
        }
      }
    },
    PRAZO_MS,
  );

  it(
    "relata a cobertura alcançada",
    async () => {
      const contagem = { texto_direto: 0, reconhecimento_optico: 0 };
      const motivos = new Map<string, number>();
      let aproveitaveis = 0;
      let itensConfirmados = 0;
      let itensDivergentes = 0;
      let comTotal = 0;
      let comDemandaContratada = 0;

      for (const caminho of caminhos) {
        const leitura = await lerFatura(readFileSync(caminho));
        contagem[leitura.origem] += 1;
        if (leitura.motivo) motivos.set(leitura.motivo, (motivos.get(leitura.motivo) ?? 0) + 1);
        if (leitura.aproveitavel) aproveitaveis += 1;
        if (leitura.invoice.valorTotal !== undefined) comTotal += 1;
        if (leitura.invoice.demandaContratadaKw !== undefined) comDemandaContratada += 1;
        itensConfirmados += leitura.conferencia.confirmados;
        itensDivergentes += leitura.conferencia.divergentes;
      }

      console.log(
        `[fatura] ${caminhos.length} arquivos · texto ${contagem.texto_direto} · ` +
          `óptico ${contagem.reconhecimento_optico} · ficha montada ${aproveitaveis} · ` +
          `com valor total ${comTotal} · com demanda contratada ${comDemandaContratada} · ` +
          `itens confirmados ${itensConfirmados} · divergentes ${itensDivergentes} · ` +
          `motivos ${JSON.stringify(Object.fromEntries(motivos))}`,
      );

      expect(caminhos.length).toBeGreaterThan(0);
    },
    PRAZO_MS,
  );
});
