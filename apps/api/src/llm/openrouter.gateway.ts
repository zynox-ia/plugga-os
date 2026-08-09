import { Injectable, Logger } from "@nestjs/common";

import { ChaveDeLlmService } from "./chave.service.js";
import { ConsumoRepository } from "./consumo.repository.js";
import type { ProcessoLlm } from "./processo.js";

/**
 * A única porta do sistema para modelo de linguagem.
 *
 * É porta única de propósito, e essa é a decisão que sustenta o pedido: "quanto
 * a chave está gastando e quem gasta" só é respondível se nenhuma chamada
 * escapar. Um módulo que instancie o próprio cliente HTTP não aparece em
 * relatório nenhum, e o total passa a ser menor que a fatura sem que ninguém
 * saiba por quê. Se aparecer uma segunda porta, a métrica morre em silêncio.
 *
 * Por isso `processo` é obrigatório no tipo: não existe chamada anônima. Custa
 * uma linha por funcionalidade nova e evita a pergunta sem resposta lá na frente.
 *
 * O custo registrado é o que a OpenRouter informa na própria resposta (`usage.cost`),
 * não uma estimativa por tabela de preços: preço de modelo muda, tabela local
 * envelhece calada, e um relatório de custo errado é pior que nenhum — decide-se
 * em cima dele.
 */

const BASE = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const MODELO_PADRAO = process.env.OPENROUTER_MODELO || "anthropic/claude-sonnet-4.5";
// A variável não passa pelo schema de environment (o gateway é o único leitor);
// um valor não numérico viraria NaN e o AbortSignal.timeout estouraria
// SÍNCRONO, fazendo completar() rejeitar em vez de devolver null.
const PRAZO_PEDIDO = Number(process.env.OPENROUTER_TIMEOUT_MS);
const PRAZO_MS = Number.isFinite(PRAZO_PEDIDO) && PRAZO_PEDIDO > 0 ? PRAZO_PEDIDO : 120_000;

export type ParteDaMensagem =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagem"; conteudo: Buffer; mime: string };

export type PedidoAoModelo = {
  /** Quem está gastando. Obrigatório: sem dono não há relatório. */
  processo: ProcessoLlm;
  /** Sobrepõe o modelo padrão quando a funcionalidade precisa de outro. */
  modelo?: string;
  instrucao?: string;
  partes: ParteDaMensagem[];
  /** Schema JSON para saída estruturada; sem ele a resposta vem como texto. */
  esquema?: { nome: string; schema: Record<string, unknown> };
  maxTokens?: number;
  /**
   * Objeto de negócio que motivou a chamada — para fatura, a impressão digital
   * do arquivo. É o denominador do custo por unidade.
   */
  referencia?: string;
};

export type RespostaDoModelo = {
  texto: string;
  tokensEntrada: number;
  tokensSaida: number;
  custoCreditos: number | null;
  modeloServido: string | null;
};

type UsoDaOpenRouter = {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
};

type RespostaCrua = {
  id?: string;
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: UsoDaOpenRouter;
  error?: { message?: string };
};

function paraParteOpenAi(parte: ParteDaMensagem) {
  if (parte.tipo === "texto") return { type: "text", text: parte.texto };
  // Data URI: é como a API compatível com OpenAI recebe imagem embutida, e
  // evita depender de a OpenRouter conseguir buscar uma URL nossa.
  const dados = parte.conteudo.toString("base64");
  return { type: "image_url", image_url: { url: `data:${parte.mime};base64,${dados}` } };
}

@Injectable()
export class OpenRouterGateway {
  private readonly logger = new Logger(OpenRouterGateway.name);

  constructor(
    private readonly consumo: ConsumoRepository,
    private readonly chaves: ChaveDeLlmService,
  ) {}

  async completar(pedido: PedidoAoModelo): Promise<RespostaDoModelo | null> {
    // Do cofre, com o ambiente como reserva: quem troca a chave pela tela espera
    // que ela passe a valer, e um `.env` esquecido vencendo a tela em silêncio
    // seria a pior falha possível — tudo seguiria funcionando com a credencial
    // errada, sem sinal nenhum.
    const chave = await this.chaves.valor();
    if (!chave) return null;

    const modelo = pedido.modelo || MODELO_PADRAO;
    const comecou = Date.now();

    const corpo: Record<string, unknown> = {
      model: modelo,
      messages: [
        ...(pedido.instrucao ? [{ role: "system", content: pedido.instrucao }] : []),
        { role: "user", content: pedido.partes.map(paraParteOpenAi) },
      ],
      max_tokens: pedido.maxTokens ?? 8000,
      // Usage accounting é opt-in por requisição. Sem esta chave a OpenRouter
      // devolve só prompt/completion_tokens: `usage.cost` e os detalhes de
      // cache/raciocínio — o que este módulo existe para registrar — viriam
      // sempre vazios e o relatório de consumo mostraria custo zero.
      usage: { include: true },
    };

    if (pedido.esquema) {
      corpo.response_format = {
        type: "json_schema",
        json_schema: { name: pedido.esquema.nome, strict: true, schema: pedido.esquema.schema },
      };
    }

    // Sem AbortSignal a chamada pode ficar pendurada e segurar o envio da fatura
    // até o cliente desistir.
    const cancelamento = AbortSignal.timeout(PRAZO_MS);

    try {
      const resposta = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        signal: cancelamento,
        headers: {
          authorization: `Bearer ${chave}`,
          "content-type": "application/json",
          // Atribuição na OpenRouter: é assim que o painel deles separa o
          // consumo por aplicação, e bate com o nosso relatório.
          "http-referer": process.env.OPENROUTER_APP_URL || "https://os.plugga.app.br",
          "x-title": "Plugga OS",
        },
        body: JSON.stringify(corpo),
      });

      const dados = (await resposta.json()) as RespostaCrua;

      if (!resposta.ok || dados.error) {
        // Falha entra no registro com os tokens que chegou a consumir: uma
        // tempestade de tentativas é história de custo e sumiria do relatório
        // se só o sucesso fosse gravado.
        await this.registrar(pedido, modelo, dados, comecou, "erro", dados.error?.message ?? `HTTP ${resposta.status}`);
        return null;
      }

      const texto = dados.choices?.[0]?.message?.content ?? "";
      await this.registrar(pedido, modelo, dados, comecou, "ok", null);

      return {
        texto,
        tokensEntrada: dados.usage?.prompt_tokens ?? 0,
        tokensSaida: dados.usage?.completion_tokens ?? 0,
        custoCreditos: dados.usage?.cost ?? null,
        modeloServido: dados.model ?? null,
      };
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      await this.registrar(pedido, modelo, {}, comecou, "erro", motivo);
      return null;
    }
  }

  /**
   * O registro nunca derruba a chamada.
   *
   * Perder a linha de contabilidade é ruim; perder a leitura da fatura do
   * cliente porque o banco piscou seria pior. A falha vira log e a conta segue.
   */
  private async registrar(
    pedido: PedidoAoModelo,
    modelo: string,
    dados: RespostaCrua,
    comecou: number,
    status: "ok" | "erro",
    erro: string | null,
  ): Promise<void> {
    try {
      await this.consumo.registrar({
        processo: pedido.processo,
        modelo,
        modeloServido: dados.model ?? null,
        tokensEntrada: dados.usage?.prompt_tokens ?? 0,
        tokensSaida: dados.usage?.completion_tokens ?? 0,
        tokensCache: dados.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        tokensRaciocinio: dados.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
        custoCreditos: dados.usage?.cost ?? null,
        duracaoMs: Date.now() - comecou,
        status,
        erro,
        referencia: pedido.referencia ?? null,
        geracaoId: dados.id ?? null,
      });
    } catch (falha) {
      this.logger.error(
        `consumo não registrado para ${pedido.processo}: ${falha instanceof Error ? falha.message : String(falha)}`,
      );
    }
  }
}
