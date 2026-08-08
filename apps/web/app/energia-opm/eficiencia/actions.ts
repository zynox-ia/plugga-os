"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

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
      // permite a tela explicar em vez de só dizer "falhou".
      const detalhe = (await resposta.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, erro: detalhe?.message ?? `falha ${resposta.status}` };
    }

    return { ok: true };
  } catch {
    return { ok: false, erro: "não foi possível falar com a API" };
  }
}

export async function criarEstudo(formData: FormData): Promise<ResultadoDaAcao> {
  const consumerUnitId = String(formData.get("consumerUnitId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const competenceMonth = Number(formData.get("competenceMonth"));
  const competenceYear = Number(formData.get("competenceYear"));

  const resultado = await chamar("", {
    clientId,
    consumerUnitId,
    competenceMonth,
    competenceYear,
    calculationMode: "preliminar",
  });

  if (resultado.ok) revalidatePath("/energia-opm/eficiencia");
  return resultado;
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
