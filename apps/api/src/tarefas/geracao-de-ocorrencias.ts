import type { Prisma } from "@prisma/client";
import { regraDeRecorrenciaSchema } from "@plugga/shared";

import { diaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";
import { diasParaGerar, prazoDaOcorrencia } from "./tarefas.rules";

/**
 * Gera as ocorrências que faltam até `ate` (inclusive), uma por tarefa e dia,
 * das tarefas não encerradas que casam com o filtro. Idempotente: o unique
 * (tarefa, dia) e o `skipDuplicates` fazem duas gerações ao mesmo tempo criarem
 * uma vez só. Serve à leitura (no login de quem lê, com RLS) e ao agendador das
 * 08h (no papel de jobs). Devolve quantas ocorrências criou.
 */
export async function gerarOcorrencias(tx: Prisma.TransactionClient, ate: string, filtro: { departamento?: string; tarefaId?: string } = {}): Promise<number> {
  const limite = inicioDoDiaEmManaus(ate);
  const tarefas = await tx.tarefa.findMany({
    where: {
      encerradaEm: null,
      ...(filtro.departamento ? { departamento: filtro.departamento } : {}),
      ...(filtro.tarefaId ? { id: filtro.tarefaId } : {}),
      OR: [{ geradaAte: null }, { geradaAte: { lt: limite } }],
    },
    select: { id: true, tipo: true, regra: true, dia: true, horarioLimite: true, geradaAte: true },
  });
  let criadas = 0;
  for (const t of tarefas) {
    const regra = t.regra === null ? null : regraDeRecorrenciaSchema.parse(t.regra);
    const dias = diasParaGerar({ tipo: t.tipo, regra, dia: diaEmManaus(t.dia), geradaAte: t.geradaAte ? diaEmManaus(t.geradaAte) : null, encerrada: false }, ate);
    if (dias.length > 0) {
      const { count } = await tx.ocorrenciaDeTarefa.createMany({
        data: dias.map((dia) => ({ tarefaId: t.id, dia: inicioDoDiaEmManaus(dia), prazoEm: prazoDaOcorrencia(dia, t.horarioLimite) })),
        skipDuplicates: true,
      });
      criadas += count;
    }
    await tx.tarefa.update({ where: { id: t.id }, data: { geradaAte: limite } });
  }
  return criadas;
}
