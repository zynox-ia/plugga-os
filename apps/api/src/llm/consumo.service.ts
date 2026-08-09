import { Injectable } from "@nestjs/common";

import { ConsumoRepository, type Janela } from "./consumo.repository.js";
import { NOME_DO_PROCESSO, ehProcessoConhecido } from "./processo.js";

export type LinhaDeConsumo = {
  processo: string;
  nome: string;
  chamadas: number;
  falhas: number;
  tokensEntrada: number;
  tokensSaida: number;
  tokensTotais: number;
  custoCreditos: number;
  referencias: number;
  /**
   * Custo por objeto de negócio atendido — por fatura lida, por exemplo.
   * Nulo quando o processo não informa referência: melhor ausente que um número
   * inventado dividindo por chamadas, que não é a mesma coisa.
   */
  custoPorReferencia: number | null;
  tokensPorReferencia: number | null;
};

export type ResumoDeConsumo = {
  janela: { desde: string; ate: string };
  total: {
    chamadas: number;
    falhas: number;
    tokensTotais: number;
    custoCreditos: number;
  };
  porProcesso: LinhaDeConsumo[];
  porModelo: { modelo: string; chamadas: number; tokensTotais: number; custoCreditos: number }[];
  porDia: { dia: string; chamadas: number; tokensTotais: number; custoCreditos: number }[];
};

/** Últimos 30 dias quando ninguém pede janela — o padrão que se olha. */
function janelaPadrao(): Janela {
  const ate = new Date();
  const desde = new Date(ate.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { desde, ate };
}

@Injectable()
export class ConsumoService {
  constructor(private readonly repositorio: ConsumoRepository) {}

  async resumo(janelaPedida?: Partial<Janela>): Promise<ResumoDeConsumo> {
    const padrao = janelaPadrao();
    const janela: Janela = {
      desde: janelaPedida?.desde ?? padrao.desde,
      ate: janelaPedida?.ate ?? padrao.ate,
    };

    const [porProcesso, porModelo, porDia] = await Promise.all([
      this.repositorio.porProcesso(janela),
      this.repositorio.porModelo(janela),
      this.repositorio.porDia(janela),
    ]);

    const linhas: LinhaDeConsumo[] = porProcesso.map((p) => ({
      ...p,
      // Processo desconhecido aparece com a própria chave em vez de sumir: se
      // alguém gravou fora da lista, o relatório tem de mostrar, não esconder.
      nome: ehProcessoConhecido(p.processo) ? NOME_DO_PROCESSO[p.processo] : p.processo,
      custoPorReferencia: p.referencias > 0 ? p.custoCreditos / p.referencias : null,
      tokensPorReferencia: p.referencias > 0 ? p.tokensTotais / p.referencias : null,
    }));

    return {
      janela: { desde: janela.desde.toISOString(), ate: janela.ate.toISOString() },
      total: {
        chamadas: linhas.reduce((s, l) => s + l.chamadas, 0),
        falhas: linhas.reduce((s, l) => s + l.falhas, 0),
        tokensTotais: linhas.reduce((s, l) => s + l.tokensTotais, 0),
        custoCreditos: linhas.reduce((s, l) => s + l.custoCreditos, 0),
      },
      porProcesso: linhas,
      porModelo,
      porDia,
    };
  }
}
