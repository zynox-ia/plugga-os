import { describe, expect, it } from "vitest";

import { EstadoInvalido, RequisicaoInvalida } from "../common/errors/dominio";
import {
  acoesPermitidas,
  estaAtrasada,
  gerenteDasOrdens,
  instanteEmManaus,
  mascararDocumento,
  numeroDaBusca,
  planejarAcao,
  type EstadoDaOrdem,
} from "./engenharia.rules";

// Segunda, 23/11/2026, 10:00 em Manaus.
const AGORA = new Date("2026-11-23T14:00:00Z");
const TECNICO = "00000000-0000-4000-8000-000000000101";
const APOIO = "00000000-0000-4000-8000-000000000102";
const POR = "00000000-0000-4000-8000-000000000103";
const ENGENHARIA = { plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.os"] }] } as never;
const COMPRAS = { plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro", telas: ["suprimentos.compras"] }] } as never;

const estado = (dados: Partial<EstadoDaOrdem> = {}): EstadoDaOrdem => ({ situacao: "aberta", tecnicoId: null, agendadaPara: null, fotos: 0, ...dados });
const agendada = (quando = "2026-11-23T18:00:00Z") => estado({ situacao: "agendada", tecnicoId: TECNICO, agendadaPara: new Date(quando) });

describe("ordem de serviço: ações por situação", () => {
  it("cada situação libera só as suas ações, e as encerradas nenhuma", () => {
    expect(acoesPermitidas("aberta", ENGENHARIA)).toEqual(["editar", "agendar", "cancelar", "pedir_material"]);
    expect(acoesPermitidas("agendada", ENGENHARIA)).toContain("check_in");
    expect(acoesPermitidas("em_campo", ENGENHARIA)).toEqual(expect.arrayContaining(["enviar_foto", "registrar_laudo", "adiar"]));
    expect(acoesPermitidas("laudo", ENGENHARIA)).toContain("colher_termo");
    expect(acoesPermitidas("laudo", ENGENHARIA)).not.toContain("adiar");
    expect(acoesPermitidas("concluida", ENGENHARIA)).toEqual([]);
    expect(acoesPermitidas("cancelada", ENGENHARIA)).toEqual([]);
  });

  it("sem as telas de O.S., nenhuma ação", () => {
    expect(acoesPermitidas("aberta", COMPRAS)).toEqual([]);
  });
});

describe("ordem de serviço: agendar", () => {
  it("exige data e horário futuros em Manaus e registra o técnico", () => {
    const plano = planejarAcao(estado(), { acao: "agendar", tecnicoId: TECNICO, apoioId: APOIO, data: "2026-11-24", horario: "09:00" }, AGORA, POR);
    expect(plano.alteracoes).toMatchObject({ situacao: "agendada", tecnicoId: TECNICO, apoioId: APOIO, agendadaPara: new Date("2026-11-24T13:00:00Z") });
    expect(plano.registro.tipo).toBe("agendada");
    expect(plano.pessoas).toEqual([TECNICO, APOIO]);
  });

  it("recusa data no passado e horário já passado de hoje", () => {
    expect(() => planejarAcao(estado(), { acao: "agendar", tecnicoId: TECNICO, data: "2026-11-22", horario: "15:00" }, AGORA, POR)).toThrow(RequisicaoInvalida);
    expect(() => planejarAcao(estado(), { acao: "agendar", tecnicoId: TECNICO, data: "2026-11-23", horario: "09:59" }, AGORA, POR)).toThrow(RequisicaoInvalida);
    expect(planejarAcao(estado(), { acao: "agendar", tecnicoId: TECNICO, data: "2026-11-23", horario: "10:01" }, AGORA, POR).alteracoes.situacao).toBe("agendada");
  });

  it("recusa o técnico como apoio dele mesmo", () => {
    expect(() => planejarAcao(estado(), { acao: "agendar", tecnicoId: TECNICO, apoioId: TECNICO, data: "2026-11-24", horario: "09:00" }, AGORA, POR)).toThrow(RequisicaoInvalida);
  });

  it("agendar de novo é remarcação, e a adiada volta pela agenda limpando o adiamento", () => {
    expect(planejarAcao(agendada(), { acao: "agendar", tecnicoId: TECNICO, data: "2026-11-25", horario: "08:00" }, AGORA, POR).registro.tipo).toBe("remarcada");
    const plano = planejarAcao(estado({ situacao: "adiada" }), { acao: "agendar", tecnicoId: TECNICO, data: "2026-11-25", horario: "08:00" }, AGORA, POR);
    expect(plano.alteracoes).toMatchObject({ situacao: "agendada", adiamentoMotivo: null, adiadaPara: null });
  });

  it("arrastar na agenda não reagenda O.S. com laudo, concluída nem cancelada (PLU-346)", () => {
    for (const situacao of ["laudo", "concluida", "cancelada", "em_campo"] as const) {
      expect(() => planejarAcao(estado({ situacao }), { acao: "agendar", tecnicoId: TECNICO, data: "2026-11-24", horario: "09:00" }, AGORA, POR), situacao).toThrow(EstadoInvalido);
    }
  });

  it("não agenda O.S. em campo nem encerrada", () => {
    expect(() => planejarAcao(estado({ situacao: "em_campo" }), { acao: "agendar", tecnicoId: TECNICO, data: "2026-11-24", horario: "09:00" }, AGORA, POR)).toThrow(EstadoInvalido);
    expect(() => planejarAcao(estado({ situacao: "concluida" }), { acao: "agendar", tecnicoId: TECNICO, data: "2026-11-24", horario: "09:00" }, AGORA, POR)).toThrow(EstadoInvalido);
  });
});

describe("ordem de serviço: check-in", () => {
  it("no dia agendado entra em campo, mesmo fora do horário, sem confirmação", () => {
    const plano = planejarAcao(agendada("2026-11-23T20:00:00Z"), { acao: "check_in" }, AGORA, POR);
    expect(plano.alteracoes).toEqual({ situacao: "em_campo", checkinEm: AGORA });
    expect(plano.registro.tipo).toBe("checkin");
  });

  it("antes do dia agendado pede confirmação com o motivo no envelope", () => {
    try {
      planejarAcao(agendada("2026-11-25T13:00:00Z"), { acao: "check_in" }, AGORA, POR);
      expect.unreachable();
    } catch (erro) {
      expect(erro).toBeInstanceOf(EstadoInvalido);
      expect((erro as EstadoInvalido).extras).toEqual({ motivo: "checkin_antecipado", agendadaPara: "2026-11-25T13:00:00.000Z" });
    }
  });

  it("confirmado, remarca para agora e registra o antecipado", () => {
    const plano = planejarAcao(agendada("2026-11-25T13:00:00Z"), { acao: "check_in", confirmarAntecipado: true }, AGORA, POR);
    expect(plano.alteracoes).toEqual({ situacao: "em_campo", checkinEm: AGORA, agendadaPara: AGORA });
    expect(plano.registro).toMatchObject({ tipo: "checkin_antecipado", dados: { agendadaPara: "2026-11-25T13:00:00.000Z" } });
  });

  it("só a agendada faz check-in", () => {
    expect(() => planejarAcao(estado(), { acao: "check_in" }, AGORA, POR)).toThrow(EstadoInvalido);
  });
});

describe("ordem de serviço: laudo, adiamento e cancelamento", () => {
  const laudo = { acao: "registrar_laudo", encontrado: "Inversor desligando", feito: "Troca do disjuntor" } as const;

  it("o laudo exige ao menos uma foto e grava quem fez", () => {
    expect(() => planejarAcao(estado({ situacao: "em_campo" }), laudo, AGORA, POR)).toThrow(RequisicaoInvalida);
    const plano = planejarAcao(estado({ situacao: "em_campo", fotos: 2 }), laudo, AGORA, POR);
    expect(plano.alteracoes).toMatchObject({ situacao: "laudo", laudoEncontrado: "Inversor desligando", laudoFeito: "Troca do disjuntor", laudoRecomendacao: null, laudoEm: AGORA, laudoPorId: POR });
  });

  it("adiar exige nova data que não esteja no passado, guarda o motivo e limpa a agenda", () => {
    expect(() => planejarAcao(agendada(), { acao: "adiar", motivo: "Chuva", novaData: "2026-11-22" }, AGORA, POR)).toThrow(RequisicaoInvalida);
    expect(() => planejarAcao(agendada(), { acao: "adiar", motivo: "Chuva", novaData: "2026-11-23", horario: "08:00" }, AGORA, POR)).toThrow(RequisicaoInvalida);
    const plano = planejarAcao(agendada(), { acao: "adiar", motivo: "Chuva", novaData: "2026-11-30" }, AGORA, POR);
    expect(plano.alteracoes).toMatchObject({ situacao: "adiada", adiamentoMotivo: "Chuva", adiadaPara: new Date("2026-11-30T04:00:00Z"), adiadaPorId: POR, agendadaPara: null, checkinEm: null });
    expect(plano.registro).toMatchObject({ tipo: "adiada", detalhe: "Chuva", dados: { novaData: "2026-11-30", situacaoAnterior: "agendada" } });
  });

  it("aberta e laudo não se adiam", () => {
    expect(() => planejarAcao(estado(), { acao: "adiar", motivo: "x", novaData: "2026-11-30" }, AGORA, POR)).toThrow(EstadoInvalido);
    expect(() => planejarAcao(estado({ situacao: "laudo" }), { acao: "adiar", motivo: "x", novaData: "2026-11-30" }, AGORA, POR)).toThrow(EstadoInvalido);
  });

  it("cancelar guarda motivo, quem, quando e a situação em que parou; encerrada não cancela", () => {
    const plano = planejarAcao(estado({ situacao: "laudo" }), { acao: "cancelar", motivo: "Cliente desistiu" }, AGORA, POR);
    expect(plano.alteracoes).toEqual({ situacao: "cancelada", cancelamentoMotivo: "Cliente desistiu", canceladaEm: AGORA, canceladaPorId: POR, canceladaEmSituacao: "laudo" });
    expect(() => planejarAcao(estado({ situacao: "concluida" }), { acao: "cancelar", motivo: "x" }, AGORA, POR)).toThrow(EstadoInvalido);
    expect(() => planejarAcao(estado({ situacao: "cancelada" }), { acao: "cancelar", motivo: "x" }, AGORA, POR)).toThrow(EstadoInvalido);
  });
});

describe("ordem de serviço: apoio", () => {
  it("o instante de Manaus é UTC-4 o ano todo", () => {
    expect(instanteEmManaus("2026-07-01", "00:00").toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(instanteEmManaus("2026-12-31", "23:59").toISOString()).toBe("2027-01-01T03:59:00.000Z");
  });

  it("atrasada pelo prazo vencido ou pela agenda de um dia que passou, nunca encerrada", () => {
    const prazo = new Date("2026-11-22T04:00:00Z");
    const hoje = new Date("2026-11-23T04:00:00Z");
    expect(estaAtrasada({ situacao: "aberta", prazo, agendadaPara: null }, AGORA)).toBe(true);
    expect(estaAtrasada({ situacao: "aberta", prazo: hoje, agendadaPara: null }, AGORA)).toBe(false);
    expect(estaAtrasada({ situacao: "agendada", prazo: new Date("2026-11-30T04:00:00Z"), agendadaPara: new Date("2026-11-22T13:00:00Z") }, AGORA)).toBe(true);
    expect(estaAtrasada({ situacao: "agendada", prazo: new Date("2026-11-30T04:00:00Z"), agendadaPara: new Date("2026-11-23T13:00:00Z") }, AGORA)).toBe(false);
    expect(estaAtrasada({ situacao: "concluida", prazo, agendadaPara: null }, AGORA)).toBe(false);
  });

  it("lê o número da busca e mascara o documento", () => {
    expect(numeroDaBusca("OS-0012")).toBe(12);
    expect(numeroDaBusca("os12")).toBe(12);
    expect(numeroDaBusca("12")).toBe(12);
    expect(numeroDaBusca("inversor")).toBeNull();
    expect(mascararDocumento("123.456.789-01")).toBe("•••89-01");
    expect(mascararDocumento("12")).toBe("•••");
  });
});

describe("ordem de serviço: quem muda as Configurações", () => {
  it("o gerente com uma tela de O.S. e a plataforma; nem o membro nem o gerente só de Obras", () => {
    expect(gerenteDasOrdens({ plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "gerente", telas: ["engenharia-obras.visitas"] }] } as never)).toBe(true);
    expect(gerenteDasOrdens({ plataforma: "admin", departamentos: [] } as never)).toBe(true);
    expect(gerenteDasOrdens({ plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "gerente", telas: ["engenharia-obras.obras", "engenharia-obras.usinas"] }] } as never)).toBe(false);
    expect(gerenteDasOrdens(ENGENHARIA)).toBe(false);
  });
});
