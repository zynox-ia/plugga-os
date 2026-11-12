import { describe, expect, it } from "vitest";

import { GoogleCalendarFake } from "./arquivos-de-teste";
import { GoogleApiError, type EventoDeAgenda } from "./google-calendar.port";

/**
 * O Google de mentira também é contrato: a sincronização de atividades vai
 * testar contra ele a criação, a atualização e a remoção de eventos.
 */

const EVENTO: EventoDeAgenda = {
  id: "atividade0001",
  titulo: "Visita técnica",
  inicio: new Date("2026-11-16T13:00:00.000Z"),
  fim: new Date("2026-11-16T14:00:00.000Z"),
  fusoHorario: "America/Manaus",
};

describe("GoogleCalendarFake", () => {
  it("cria, atualiza e remove eventos, guardando cada chamada", async () => {
    const google = new GoogleCalendarFake();

    const criado = await google.criarEvento("acesso", EVENTO);
    await google.atualizarEvento("acesso", criado.id, { ...EVENTO, titulo: "Visita remarcada" });
    expect(google.eventos.get("atividade0001")?.titulo).toBe("Visita remarcada");

    await google.removerEvento("acesso", criado.id);
    expect(google.eventos.size).toBe(0);
    expect(google.chamadas.map((c) => c.operacao)).toEqual(["criarEvento", "atualizarEvento", "removerEvento"]);
  });

  it("repetir a criação com o mesmo id é conflito, e atualizar o que não existe é 404, como no Google", async () => {
    const google = new GoogleCalendarFake();
    await google.criarEvento("acesso", EVENTO);

    await expect(google.criarEvento("acesso", EVENTO)).rejects.toMatchObject({ status: 409 });
    await expect(google.atualizarEvento("acesso", "nao-existe", EVENTO)).rejects.toSatisfy((e: GoogleApiError) => e.inexistente);
  });

  it("remover o que não existe não é erro", async () => {
    await expect(new GoogleCalendarFake().removerEvento("acesso", "nao-existe")).resolves.toBeUndefined();
  });
});
