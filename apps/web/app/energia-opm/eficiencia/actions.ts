"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { invoiceReadingSchema, type InvoiceReading } from "@plugga/shared";

import { apiBaseUrl } from "../../lib/env";

/**
 * Escritas do estudo de eficiência energética.
 *
 * Server Actions em vez de rota de proxy: o browser fala só com a origem do
 * web, o cookie de sessão é lido no servidor e o Next já valida Origin contra
 * Host — a mesma defesa que o `/api/auth/*` implementa à mão, sem duplicar a
 * superfície.
 *
 * Nenhuma delas decide nada: a máquina de estados vive na API. Aqui é só
 * transporte, com a mensagem de erro preservada para a tela poder mostrar o
 * motivo real da recusa (ex.: "estudo tem 2 problemas de validação em aberto").
 */

export type ResultadoDaAcao = { ok: true } | { ok: false; erro: string };

const TIMEOUT_MS = 20_000;

/**
 * Ler a fatura tem prazo próprio, bem maior que o das outras chamadas.
 *
 * Uma fatura digitalizada passa por rasterização e reconhecimento óptico, o que
 * leva alguns segundos por página, e ainda pode esperar na fila se houver outra
 * leitura em curso. Com os 20 s das demais ações, a leitura que mais interessa
 * — a da foto de conta, que é a maioria do acervo real — seria cortada no meio
 * e apareceria como "não foi possível falar com a API".
 */
const TIMEOUT_LEITURA_MS = 120_000;

async function chamar(caminho: string, corpo?: unknown): Promise<ResultadoDaAcao> {
  const cabecalhos = await headers();
  const cookie = cabecalhos.get("cookie");

  try {
    const resposta = await fetch(`${apiBaseUrl()}/energy-efficiency/studies${caminho}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(corpo ?? {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!resposta.ok) {
      // A API devolve motivo legível nos conflitos de estado; repassar é o que
      // permite a tela explicar em vez de só dizer "falhou". Erro de validação
      // vem como `issues[]` (ZodValidationPipe) — concatenar como em
      // energy-client.ts, senão a tela só veria um genérico "Validation failed".
      const detalhe = (await resposta.json().catch(() => null)) as {
        message?: string;
        issues?: { path: string; message: string }[];
      } | null;
      const issues = Array.isArray(detalhe?.issues)
        ? detalhe.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")
        : null;
      return { ok: false, erro: issues || detalhe?.message || `falha ${resposta.status}` };
    }

    return { ok: true };
  } catch {
    return { ok: false, erro: "não foi possível falar com a API" };
  }
}

/**
 * Lê a conta de luz enviada e devolve o que dá para aproveitar.
 *
 * O estudo começa aqui, e não pela unidade consumidora: o que a pessoa tem na
 * mão é a fatura. O arquivo é repassado como veio, sem nada intermediário — o
 * `fetch` do servidor monta o multipart a partir do `File` do formulário.
 *
 * Não grava nada: a decisão sobre os números é da tela seguinte.
 */
export async function lerFaturaEnviada(
  formData: FormData,
): Promise<{ ok: true; leitura: InvoiceReading } | { ok: false; erro: string }> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "selecione a conta de luz" };
  }

  const cabecalhos = await headers();
  const cookie = cabecalhos.get("cookie");

  const corpo = new FormData();
  corpo.append("arquivo", arquivo, arquivo.name);

  // Só vai quando existe: um campo vazio faria a API tentar abrir um PDF sem
  // senha com senha em branco, que é um caso diferente de "sem senha".
  const senha = formData.get("senha");
  if (typeof senha === "string" && senha.length > 0) corpo.append("senha", senha);

  try {
    const resposta = await fetch(`${apiBaseUrl()}/energy-efficiency/invoices/read`, {
      method: "POST",
      // Sem `content-type` à mão: o limite do multipart é gerado pelo runtime e
      // declarar o cabeçalho manualmente quebraria a fronteira.
      headers: cookie ? { cookie } : {},
      body: corpo,
      signal: AbortSignal.timeout(TIMEOUT_LEITURA_MS),
      cache: "no-store",
    });

    if (!resposta.ok) {
      const detalhe = (await resposta.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, erro: detalhe?.message ?? `não foi possível ler a fatura (${resposta.status})` };
    }

    return { ok: true, leitura: invoiceReadingSchema.parse(await resposta.json()) };
  } catch {
    return { ok: false, erro: "não foi possível falar com a API" };
  }
}

export async function enviarFatura(id: string, formData: FormData): Promise<ResultadoDaAcao> {
  const numero = (campo: string): number => Number(formData.get(campo) ?? 0);

  // Histórico vem como texto livre separado por vírgula ou espaço: é assim que
  // a pessoa tem o dado na mão, lendo doze faturas.
  const historico = String(formData.get("demandHistory") ?? "")
    .split(/[,\s;]+/)
    .map((valor) => Number(valor.replace(",", ".")))
    .filter((valor) => Number.isFinite(valor) && valor > 0);

  const resultado = await chamar(`/${id}/invoice`, {
    invoice: {
      consumoPontaKwh: numero("consumoPontaKwh"),
      consumoForaPontaKwh: numero("consumoForaPontaKwh"),
      tarifaPonta: numero("tarifaPonta"),
      tarifaForaPonta: numero("tarifaForaPonta"),
      valorPonta: numero("valorPonta"),
      valorForaPonta: numero("valorForaPonta"),
      valorDemanda: numero("valorDemanda"),
      valorTotal: numero("valorTotal"),
      demandaContratadaKw: numero("demandaContratadaKw"),
      demandaMedidaPontaKw: numero("demandaMedidaPontaKw"),
      demandaMedidaForaPontaKw: numero("demandaMedidaForaPontaKw"),
      tarifaDemanda: numero("tarifaDemanda"),
      valorReativo: numero("valorReativo"),
      valorBeneficioFiscal: numero("valorBeneficioFiscal"),
      valorMultasJurosEncargos: numero("valorMultasJurosEncargos"),
    },
    demandHistory: historico,
    hasLoadProfile: formData.get("hasLoadProfile") === "on",
  });

  if (resultado.ok) revalidatePath(`/energia-opm/eficiencia/${id}`);
  return resultado;
}

/**
 * Abre o estudo a partir da fatura já conferida.
 *
 * Cria e envia a ficha numa chamada só porque, para quem opera, é um ato só:
 * "esta conta de luz vira um estudo". Mas a chamada única não elimina o estudo
 * órfão: se o envio da fatura falhar depois da criação, o estudo fica criado e
 * vazio, e a retentativa de hoje cria outro. A consolidação (reaproveitar o
 * estudo já criado na retentativa) está registrada como pendência.
 */
export async function abrirEstudoPelaFatura(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const cabecalhos = await headers();
  const cookie = cabecalhos.get("cookie");

  const criacao = await fetch(`${apiBaseUrl()}/energy-efficiency/studies`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({
      clientId: String(formData.get("clientId") ?? ""),
      consumerUnitId: String(formData.get("consumerUnitId") ?? ""),
      competenceMonth: Number(formData.get("competenceMonth")),
      competenceYear: Number(formData.get("competenceYear")),
      calculationMode: "preliminar",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  }).catch(() => null);

  if (!criacao?.ok) {
    const detalhe = (await criacao?.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, erro: detalhe?.message ?? "não foi possível abrir o estudo" };
  }

  const { id } = (await criacao.json()) as { id: string };

  const envio = await enviarFatura(id, formData);
  if (!envio.ok) return envio;

  revalidatePath("/energia-opm/eficiencia");
  return { ok: true, id };
}

export async function recalcular(id: string): Promise<ResultadoDaAcao> {
  const resultado = await chamar(`/${id}/recalculate`);
  if (resultado.ok) revalidatePath(`/energia-opm/eficiencia/${id}`);
  return resultado;
}

export async function aprovar(id: string, nota: string): Promise<ResultadoDaAcao> {
  const resultado = await chamar(`/${id}/approve`, nota ? { note: nota } : {});
  if (resultado.ok) revalidatePath(`/energia-opm/eficiencia/${id}`);
  return resultado;
}

export async function marcarEnviado(id: string): Promise<ResultadoDaAcao> {
  const resultado = await chamar(`/${id}/sent`);
  if (resultado.ok) revalidatePath(`/energia-opm/eficiencia/${id}`);
  return resultado;
}
