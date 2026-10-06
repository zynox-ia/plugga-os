import { describe, expect, it } from "vitest";

import { LimiteExcedido, ServicoIndisponivel } from "../errors/dominio";
import { LimitadorDeUploads } from "./limitador-de-uploads";

describe("LimitadorDeUploads", () => {
  it("usa 8 no total e 2 por usuário por padrão", () => {
    const limitador = new LimitadorDeUploads();
    const liberacoes: (() => void)[] = [];
    for (let u = 0; u < 4; u += 1) {
      liberacoes.push(limitador.adquirir(`u${u}`), limitador.adquirir(`u${u}`));
    }
    expect(limitador.emAndamento).toBe(8);
    expect(() => limitador.adquirir("u9")).toThrow(ServicoIndisponivel);
  });

  it("recusa o excedente do total com 503 SERVICO_INDISPONIVEL e 'tente novamente'", () => {
    const limitador = new LimitadorDeUploads(2, 2);
    limitador.adquirir("a");
    limitador.adquirir("b");
    try {
      limitador.adquirir("c");
      expect.unreachable();
    } catch (erro) {
      expect(erro).toBeInstanceOf(ServicoIndisponivel);
      expect((erro as ServicoIndisponivel).codigo).toBe("SERVICO_INDISPONIVEL");
      expect((erro as ServicoIndisponivel).mensagemParaUsuario.toLowerCase()).toContain("tente novamente");
    }
  });

  it("recusa o terceiro envio da mesma pessoa mesmo com vaga no total", () => {
    const limitador = new LimitadorDeUploads(8, 2);
    limitador.adquirir("ana");
    limitador.adquirir("ana");
    expect(() => limitador.adquirir("ana")).toThrow(LimiteExcedido);
    expect(() => limitador.adquirir("bia")).not.toThrow();
  });

  it("liberar devolve a vaga, e liberar duas vezes não devolve duas", () => {
    const limitador = new LimitadorDeUploads(2, 2);
    const a = limitador.adquirir("ana");
    limitador.adquirir("bia");
    a();
    a();
    expect(limitador.emAndamento).toBe(1);
    expect(() => limitador.adquirir("caio")).not.toThrow();
    expect(limitador.emAndamento).toBe(2);
  });

  it("os envios em andamento não são afetados pela recusa de outros", () => {
    const limitador = new LimitadorDeUploads(1, 1);
    const liberar = limitador.adquirir("ana");
    expect(() => limitador.adquirir("bia")).toThrow();
    expect(limitador.emAndamento).toBe(1);
    liberar();
    expect(limitador.emAndamento).toBe(0);
    expect(() => limitador.adquirir("bia")).not.toThrow();
  });
});
