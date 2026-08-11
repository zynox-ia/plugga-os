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
 * Porta única também é o que torna a política de dados exequível: é aqui, num
 * lugar só, que se garante que nenhuma carga sai sem exigir provedor que não a
 * retenha — ver `ROTEAMENTO_SEM_RETENCAO`. Um módulo com cliente HTTP próprio
 * não escaparia só do relatório; escaparia da política.
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

/**
 * Onde a carga pode e não pode ser processada. Vai em TODA chamada.
 *
 * O que sai por esta porta hoje é a fatura do cliente inteira — titular, CNPJ,
 * endereço, valores, linha digitável. Sem estas preferências a OpenRouter aceita
 * o roteamento padrão, que pode cair em provedor que registra o conteúdo e treina
 * em cima dele. Uma fatura não lida custa minutos de conferência humana; uma
 * fatura no corpus de treino de terceiro não volta.
 *
 * Não há chave de ambiente para afrouxar isto, e é de propósito: uma variável
 * que desliga a exigência é a mesma coisa que não ter exigência, porque um dia
 * alguém a desliga para "destravar a produção" e ninguém revisa.
 *
 * Os três campos, e por que cada um:
 *
 * - `zdr: true` — só endpoint com política de retenção zero, que é o que
 *   significa "a fatura não fica guardada do outro lado";
 * - `data_collection: "deny"` — só provedor que não coleta o conteúdo para
 *   treinar. É garantia diferente da de cima, não sinônimo: existe endpoint que
 *   não treina mas retém, e vice-versa;
 * - `require_parameters: true` — só endpoint que suporta os parâmetros que este
 *   corpo manda. Medido em 10/08/2026 na lista pública de endpoints ZDR: dos
 *   quatro endpoints ZDR do `anthropic/claude-sonnet-4.5`, os dois do Vertex
 *   (Google) **não** suportam `response_format`/`structured_outputs`. Sem esta
 *   linha, exigir retenção zero dobraria a chance de cair num endpoint que ignora
 *   a saída estruturada em silêncio — o JSON voltaria solto, `JSON.parse`
 *   falharia, e a leitura por visão morreria parecendo "o modelo não achou nada".
 *
 * O que **não** entra aqui é `allow_fallbacks: false`. Ele parece a trava contra
 * "cair num provedor que retém porque o preferido estava fora", mas não é: a
 * OpenRouter aplica o filtro de política ANTES de escolher, então todo candidato
 * de reserva já passou pelas três exigências acima. Desligar o fallback só
 * reduziria disponibilidade sem acrescentar proteção nenhuma.
 *
 * Fonte: https://openrouter.ai/docs/features/provider-routing, seções "Requiring
 * Providers to Comply with Data Policies" e "Zero Data Retention Enforcement",
 * conferida em 10/08/2026. O corpo REST usa `snake_case`; o `camelCase`
 * (`dataCollection`) que aparece na documentação é só do SDK TypeScript deles.
 */
const ROTEAMENTO_SEM_RETENCAO = {
  zdr: true,
  data_collection: "deny",
  require_parameters: true,
} as const;

/**
 * Como a OpenRouter diz "não sobrou provedor depois do seu filtro".
 *
 * Ela recusa antes de rotear — nada é enviado a provedor nenhum —, e essa recusa
 * precisa chegar diferente das outras até quem confere a fatura. A mensagem é
 * texto do lado deles e pode mudar; por isso o casamento é largo e a segurança
 * NÃO depende dele. Se a frase mudar, a chamada continua falhando fechada (o
 * corpo sempre leva a exigência, e não existe segunda tentativa sem ela) — o que
 * se perde é só a precisão do aviso na tela.
 */
const SEM_PROVEDOR =
  /no (endpoints|allowed providers)|data polic|zero data retention|\bzdr\b|guardrail/i;

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

/**
 * Por que não houve resposta.
 *
 * `sem_provedor_sem_retencao` é o único que descreve uma recusa nossa, e não uma
 * falha: a fatura não foi enviada porque não havia para quem enviar dentro da
 * política. Separá-lo dos outros é o ponto — quem confere precisa distinguir
 * "não mandamos" de "mandamos e não deu certo", e as duas coisas exigem coisas
 * diferentes de quem lê.
 */
export type MotivoDeFalha = "sem_chave" | "sem_provedor_sem_retencao" | "falha";

/**
 * Sucesso com a resposta, ou recusa com o motivo — nunca um `null` mudo.
 *
 * O `null` de antes colapsava chave ausente, rede caída e política de dados no
 * mesmo silêncio, e quem chamava não tinha como contar a diferença para o outro
 * lado da tela.
 */
export type ResultadoDoModelo =
  | ({ ok: true } & RespostaDoModelo)
  | { ok: false; motivo: MotivoDeFalha; detalhe: string | null };

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

  async completar(pedido: PedidoAoModelo): Promise<ResultadoDoModelo> {
    // Do cofre, com o ambiente como reserva: quem troca a chave pela tela espera
    // que ela passe a valer, e um `.env` esquecido vencendo a tela em silêncio
    // seria a pior falha possível — tudo seguiria funcionando com a credencial
    // errada, sem sinal nenhum.
    const chave = await this.chaves.valor();
    if (!chave) return { ok: false, motivo: "sem_chave", detalhe: null };

    const modelo = pedido.modelo || MODELO_PADRAO;
    const comecou = Date.now();

    const corpo: Record<string, unknown> = {
      model: modelo,
      // A carga não sai daqui sem dizer onde pode ser processada. Fica junto do
      // `model` de propósito: quem editar este corpo tropeça nela.
      provider: ROTEAMENTO_SEM_RETENCAO,
      messages: [
        ...(pedido.instrucao ? [{ role: "system", content: pedido.instrucao }] : []),
        { role: "user", content: pedido.partes.map(paraParteOpenAi) },
      ],
      max_tokens: pedido.maxTokens ?? 8000,
      // Usage accounting ERA opt-in por requisição, e sem esta chave `usage.cost`
      // viria vazio. Em 10/08/2026 a documentação passou a marcar
      // `usage: { include: true }` como **descontinuada e sem efeito**: o custo e
      // os detalhes de cache/raciocínio agora vêm sempre. Fica porque um campo
      // ignorado não custa nada e tirá-lo às cegas arriscaria zerar o relatório
      // de consumo se a mudança ainda não estiver de pé; sai quando alguém
      // confirmar com chamada real que o custo continua chegando sem ele.
      //
      // Ela também não interfere no `require_parameters` acima: o filtro olha a
      // lista de parâmetros de LLM (`openrouter.ai/docs/api_reference/parameters`),
      // onde `usage` não aparece.
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
        const detalhe = dados.error?.message ?? `HTTP ${resposta.status}`;
        // Falha entra no registro com os tokens que chegou a consumir: uma
        // tempestade de tentativas é história de custo e sumiria do relatório
        // se só o sucesso fosse gravado.
        await this.registrar(pedido, modelo, dados, comecou, "erro", detalhe);

        // Aqui NÃO há segunda tentativa. Nem sem as preferências, nem com outro
        // modelo: repetir sem a exigência seria exatamente mandar a fatura para
        // quem a guarda porque o provedor certo estava fora.
        if (SEM_PROVEDOR.test(detalhe)) {
          this.logger.warn(
            `${pedido.processo}: nada foi enviado — nenhum provedor sem retenção disponível (${detalhe})`,
          );
          return { ok: false, motivo: "sem_provedor_sem_retencao", detalhe };
        }

        return { ok: false, motivo: "falha", detalhe };
      }

      const texto = dados.choices?.[0]?.message?.content ?? "";
      await this.registrar(pedido, modelo, dados, comecou, "ok", null);

      return {
        ok: true,
        texto,
        tokensEntrada: dados.usage?.prompt_tokens ?? 0,
        tokensSaida: dados.usage?.completion_tokens ?? 0,
        custoCreditos: dados.usage?.cost ?? null,
        modeloServido: dados.model ?? null,
      };
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : String(erro);
      await this.registrar(pedido, modelo, {}, comecou, "erro", detalhe);
      return { ok: false, motivo: "falha", detalhe };
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
