import { describe, expect, it } from "vitest";

import { avisoDeAtividadeAtrasada, avisoDeNovoLead, escaparHtml } from "./avisos";

describe("avisos do Telegram", () => {
  it("o aviso de novo lead leva só o que existe, na ordem certa", () => {
    expect(avisoDeNovoLead({ cliente: "Maria Silva", origem: "WhatsApp", pipeline: "Solar", responsavel: "João", empresa: "Plugga" })).toBe(
      "<b>Novo lead</b>\nCliente: Maria Silva\nOrigem: WhatsApp\nPipeline: Solar\nResponsável: João\nEmpresa: Plugga",
    );
    expect(avisoDeNovoLead({ cliente: "Só o nome", origem: null, responsavel: "  " })).toBe("<b>Novo lead</b>\nCliente: Só o nome");
  });

  it("o aviso de atividade atrasada mostra o prazo no horário de Manaus", () => {
    // 15:00 UTC = 11:00 em Manaus (UTC-4).
    const texto = avisoDeAtividadeAtrasada({ titulo: "Visita técnica", prazo: new Date("2026-11-12T15:00:00Z"), responsavel: "Ana", negocio: "Usina Teste" });

    expect(texto).toBe("<b>Atividade atrasada</b>\nAtividade: Visita técnica\nPrazo: 12/11/2026 11:00\nResponsável: Ana\nNegócio: Usina Teste");
  });

  it("dado de cadastro nunca vira marcação HTML", () => {
    expect(escaparHtml("<b>&</b>")).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
    const texto = avisoDeNovoLead({ cliente: "<script>alert(1)</script> & Cia", origem: '<a href="x">link</a>' });

    expect(texto).not.toContain("<script>");
    expect(texto).not.toContain("<a ");
    expect(texto).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; Cia");
    expect(texto.startsWith("<b>Novo lead</b>")).toBe(true);
  });

  it("campo gigante é cortado e quebra de linha vira espaço", () => {
    const texto = avisoDeNovoLead({ cliente: `${"a".repeat(500)}\nlinha dois` });

    const cliente = texto.split("\n")[1] ?? "";
    expect(cliente.length).toBeLessThan(220);
    expect(texto.split("\n")).toHaveLength(2);
    expect(cliente.endsWith("…")).toBe(true);
  });
});
