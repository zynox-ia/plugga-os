import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { catalogoEventos, eventoEstaNoCatalogo, eventosLegados, padraoNomeDeEvento } from "@plugga/shared";
import { describe, expect, it } from "vitest";

const RAIZ_SRC = path.resolve(__dirname, "../src");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = path.join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return caminho.endsWith(".ts") && !caminho.endsWith(".spec.ts") ? [caminho] : [];
  });
}

describe("catálogo de eventos de auditoria", () => {
  it("todo nome novo segue <dominio>.<entidade>.<acao_no_passado>", () => {
    for (const nome of Object.keys(catalogoEventos)) {
      expect(nome, nome).toMatch(padraoNomeDeEvento);
    }
  });

  it("nenhum evento declara dado pessoal e todos têm descrição", () => {
    for (const [nome, definicao] of Object.entries(catalogoEventos)) {
      expect(definicao.pii, nome).toBe(false);
      expect(definicao.descricao.length, nome).toBeGreaterThan(3);
      expect(["empresa", "plataforma"], nome).toContain(definicao.escopo);
    }
  });

  it("nome legado não duplica nome novo", () => {
    for (const nome of eventosLegados) {
      expect(nome in catalogoEventos, nome).toBe(false);
    }
  });

  it("todo `eventName` literal usado no código está no catálogo ou na lista de legados", () => {
    const encontrados: Array<{ arquivo: string; nome: string }> = [];
    for (const arquivo of arquivos(RAIZ_SRC)) {
      const texto = readFileSync(arquivo, "utf8");
      for (const m of texto.matchAll(/eventName:\s*"([a-z0-9_.]+)"/g)) {
        encontrados.push({ arquivo: path.relative(RAIZ_SRC, arquivo), nome: m[1]! });
      }
    }
    expect(encontrados.length).toBeGreaterThan(20);
    const fora = encontrados.filter((e) => !eventoEstaNoCatalogo(e.nome));
    expect(fora, "evento fora do catálogo: acrescente-o a packages/shared/src/events.ts no padrão novo").toEqual([]);
  });
});
