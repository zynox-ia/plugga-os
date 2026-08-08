import { describe, expect, it } from "vitest";

import { nomeDoArquivoPdf } from "./nome-arquivo.js";

const AM_QUIMICA = {
  clientName: "A M QUIMICA INDUSTRIA E COMERCIO DE PRODUTOS QUIMICOS LTDA",
  consumerUnitCode: "0000033531002-19",
  competenceMonth: 6,
  competenceYear: 2026,
};

describe("nomeDoArquivoPdf", () => {
  it("monta cliente, unidade e competência", () => {
    expect(nomeDoArquivoPdf({ ...AM_QUIMICA, clientName: "Plugga Energia" })).toBe(
      "estudo-eficiencia-energetica-plugga-energia-0000033531002-19-06-2026.pdf",
    );
  });

  it("zera à esquerda o mês, para o arquivo ordenar direito na pasta", () => {
    const nome = nomeDoArquivoPdf({ ...AM_QUIMICA, competenceMonth: 6 });
    expect(nome).toContain("-06-2026.pdf");
  });

  it("corta razão social longa em palavra inteira", () => {
    const nome = nomeDoArquivoPdf(AM_QUIMICA);

    // Sem palavra partida no meio: "industri" ou "comerci" seria pior que
    // simplesmente não ter a palavra.
    expect(nome).toBe(
      "estudo-eficiencia-energetica-a-m-quimica-industria-e-comercio-de-0000033531002-19-06-2026.pdf",
    );
    expect(nome).not.toContain("produt");
  });

  it("não deixa acento nem caractere fora de ASCII", () => {
    const nome = nomeDoArquivoPdf({
      ...AM_QUIMICA,
      clientName: "Indústria Ação & Cia. Ltda",
    });

    // Content-Disposition com acento depende de RFC 5987, que cliente de e-mail
    // antigo ainda erra — o nome chega corrompido no destino.
    expect(nome).toMatch(/^[a-z0-9.-]+$/);
    expect(nome).toContain("industria-acao-cia-ltda");
  });

  it("sobrevive a nome só de símbolo sem gerar hífen solto", () => {
    const nome = nomeDoArquivoPdf({ ...AM_QUIMICA, clientName: "???" });

    expect(nome).toBe("estudo-eficiencia-energetica-0000033531002-19-06-2026.pdf");
    expect(nome).not.toContain("--");
  });
});
