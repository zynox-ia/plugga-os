import type { Deal } from "@plugga/shared";

/** Datas de previsão são datas de calendário; UTC evita deslocá-las pelo fuso do navegador. */
export function mesRelativo(mes: string, deslocamento: number): string {
  const data = new Date(`${mes}-01T00:00:00Z`);
  data.setUTCMonth(data.getUTCMonth() + deslocamento);
  return data.toISOString().slice(0, 7);
}

export function montarCalendario(negocios: readonly Deal[], mes: string) {
  const primeiro = new Date(`${mes}-01T00:00:00Z`);
  const ultimo = new Date(primeiro);
  ultimo.setUTCMonth(ultimo.getUTCMonth() + 1, 0);
  const antes = (primeiro.getUTCDay() + 6) % 7;
  const quantidade = Math.ceil((antes + ultimo.getUTCDate()) / 7) * 7;
  const porData = new Map<string, Deal[]>();
  const semPrevisao: Deal[] = [];
  let totalNoMes = 0;

  for (const negocio of negocios) {
    const data = negocio.expectedCloseDate;
    if (data === null) semPrevisao.push(negocio);
    else if (data.startsWith(`${mes}-`)) {
      const grupo = porData.get(data) ?? [];
      grupo.push(negocio);
      porData.set(data, grupo);
      totalNoMes += 1;
    }
  }

  const dias = Array.from({ length: quantidade }, (_, indice) => {
    const dia = new Date(primeiro);
    dia.setUTCDate(1 - antes + indice);
    const data = dia.toISOString().slice(0, 10);
    return { data, numero: dia.getUTCDate(), noMes: data.startsWith(`${mes}-`), negocios: porData.get(data) ?? [] };
  });
  return { dias, semPrevisao, totalNoMes };
}
