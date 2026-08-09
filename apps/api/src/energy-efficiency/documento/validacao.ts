import type { ProblemaDeValidacao } from "@plugga/shared";

import { MARCADORES_DO_CASO_FONTE } from "./envelope.js";

/**
 * Validação bloqueante do documento — a trava do agente virada regra de sistema.
 *
 * Hoje ela depende de alguém lembrar de conferir antes de enviar. Aqui é
 * condição para o estudo sair de `em_validacao`: se qualquer item falhar, não
 * existe documento. É a tradução literal de "não existe HTML quase certo".
 */

/** As dez seções que o documento precisa ter. Nenhuma pode sumir. */
export const TITULOS_OBRIGATORIOS = [
  "Relatório de Auditoria Energética",
  "1. Resumo da fatura",
  "2. Identificação da unidade consumidora",
  "3. Análise de demanda",
  "4. Consumo, custo médio efetivo e tarifa aplicada",
  "5. Composição da fatura, reativo e benefício fiscal",
  "6. Diagnóstico e recomendações da auditoria",
  "7. Oportunidades",
  "Análise de eficiência energética",
  "8. Próximos passos",
] as const;

/**
 * Os três gráficos grandes exigidos pela trava. O de economia acumulada é o que
 * mais escapava — inclusive o modelo congelado não o tem.
 */
export const GRAFICOS_OBRIGATORIOS = [
  "Economia anual projetada",
  "Economia acumulada projetada",
  "Fluxo de caixa acumulado",
] as const;

/**
 * Termos internos que nunca podem chegar ao cliente. "all-in" está aqui porque
 * é jargão que o cliente não entende — e escapa com facilidade: a própria
 * resposta do agente usou o termo ao descrever o CAPEX.
 */
export const TERMOS_PROIBIDOS = [
  "debug",
  "teste",
  "rascunho",
  "corrigido",
  "all-in",
  "conforme Dilkson",
] as const;

/**
 * Casa o termo no início de palavra — "teste" pega "testes" e "testando", mas
 * não dispara dentro de outra palavra.
 *
 * A busca ingênua por substring gera falso positivo em português com muita
 * facilidade: uma primeira versão desta lista incluía "TODO" e barrava o
 * documento inteiro por causa de "todo o histórico". Regra que bloqueia por
 * engano é pior que regra ausente, porque ensina a ignorar o bloqueio.
 */
function contemTermo(texto: string, termo: string): boolean {
  const escapado = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escapado}`, "i").test(texto);
}

export type EntradaDeValidacao = {
  html: string;
  capexFv: number;
  capexBess: number;
  capexTotal: number;
};

/** Extrai os títulos de h1/h2, ignorando o que estiver dentro de <style>. */
function titulosDe(html: string): string[] {
  const semEstilo = html.replace(/<style[\s\S]*?<\/style>/g, "");
  const encontrados: string[] = [];
  const padrao = /<h([12])[^>]*>([\s\S]*?)<\/h\1>/g;

  let achado = padrao.exec(semEstilo);
  while (achado !== null) {
    encontrados.push((achado[2] ?? "").replace(/<[^>]+>/g, "").trim());
    achado = padrao.exec(semEstilo);
  }
  return encontrados;
}

export function validarDocumento(entrada: EntradaDeValidacao): ProblemaDeValidacao[] {
  const problemas: ProblemaDeValidacao[] = [];
  const titulos = titulosDe(entrada.html);

  for (const obrigatorio of TITULOS_OBRIGATORIOS) {
    if (!titulos.some((titulo) => titulo.includes(obrigatorio))) {
      problemas.push({ regra: "secao_obrigatoria", detalhe: `seção ausente: ${obrigatorio}` });
    }
  }

  for (const grafico of GRAFICOS_OBRIGATORIOS) {
    if (!entrada.html.includes(grafico)) {
      problemas.push({ regra: "grafico_obrigatorio", detalhe: `gráfico ausente: ${grafico}` });
    }
  }

  // Busca só no texto visível: "teste" aparece legitimamente dentro de
  // atributos e nomes de classe do envelope, e barrar por isso seria falso
  // positivo que nunca deixaria nenhum documento sair.
  const textoVisivel = entrada.html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ");

  for (const termo of TERMOS_PROIBIDOS) {
    if (contemTermo(textoVisivel, termo)) {
      problemas.push({ regra: "termo_interno", detalhe: `termo proibido no documento: ${termo}` });
    }
  }

  // Regra dura da trava: mostrar só o CAPEX da usina foi erro registrado.
  const somaCapex = entrada.capexFv + entrada.capexBess;
  if (Math.abs(somaCapex - entrada.capexTotal) > 0.01) {
    problemas.push({
      regra: "capex_inconsistente",
      detalhe: `CAPEX Solar+BESS (${entrada.capexTotal}) não é a soma de FV (${entrada.capexFv}) e BESS (${entrada.capexBess})`,
    });
  }

  // Nenhum dado do caso que originou o modelo pode sobreviver. Sem esta trava
  // o relatório sai com o nome de outro cliente no cabeçalho — foi o erro que
  // motivou o gerador original a listar os mesmos marcadores e se recusar a
  // gravar o arquivo enquanto sobrasse qualquer um.
  for (const marcador of MARCADORES_DO_CASO_FONTE) {
    if (entrada.html.includes(marcador)) {
      problemas.push({
        regra: "residuo_do_caso_fonte",
        detalhe: `dado do caso-fonte não substituído: ${marcador}`,
      });
    }
  }

  // Dinheiro abreviado esconde ordem de grandeza que muda decisão.
  const abreviacao = textoVisivel.match(/R\$\s?[\d.,]+\s?(mi|mil|k|M)\b/i);
  if (abreviacao) {
    problemas.push({
      regra: "dinheiro_abreviado",
      detalhe: `valor financeiro abreviado: ${abreviacao[0]}`,
    });
  }

  return problemas;
}
