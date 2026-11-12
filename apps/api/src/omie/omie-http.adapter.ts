import { Injectable } from "@nestjs/common";
import type { EmpresaDoOmie } from "@plugga/shared";

import { OmieFalhouError, OmiePort, type CredenciaisDoOmie } from "./omie.port";

const ENDPOINT = "https://app.omie.com.br/api/v1/geral/empresas/";
const PRAZO_MS = 10_000;

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

/**
 * API do OMIE (JSON sobre POST: `call`, `app_key`, `app_secret`, `param`). A chave
 * e o segredo vão no corpo, então nenhum erro ou log daqui inclui o corpo da
 * requisição, a causa da falha de rede nem a mensagem do OMIE: só o motivo curto.
 */
@Injectable()
export class OmieHttpAdapter extends OmiePort {
  async consultarEmpresa(credenciais: CredenciaisDoOmie): Promise<EmpresaDoOmie> {
    let resposta: Response;
    try {
      resposta = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          call: "ListarEmpresas",
          app_key: credenciais.appKey,
          app_secret: credenciais.appSecret,
          param: [{ pagina: 1, registros_por_pagina: 1 }],
        }),
        signal: AbortSignal.timeout(PRAZO_MS),
      });
    } catch {
      throw new OmieFalhouError("indisponivel");
    }

    if (resposta.status === 425 || resposta.status === 429) throw new OmieFalhouError("limite_de_consumo");

    let corpo: Record<string, unknown> | null = null;
    try {
      const lido = (await resposta.json()) as unknown;
      if (lido !== null && typeof lido === "object" && !Array.isArray(lido)) corpo = lido as Record<string, unknown>;
    } catch {
      corpo = null;
    }

    // O OMIE devolve falha como JSON com `faultstring`/`faultcode`. A mensagem só é
    // lida para classificar o motivo; ela nunca sai daqui.
    const falha = texto(corpo?.faultstring);
    if (falha !== null || texto(corpo?.faultcode) !== null) {
      const t = (falha ?? "").toLowerCase();
      if (/consumo|bloquead|redundante|limite/.test(t)) throw new OmieFalhouError("limite_de_consumo");
      if (/app_key|app_secret|chave|credencia|autentica|inv[aá]lid/.test(t)) throw new OmieFalhouError("credenciais_invalidas");
      throw new OmieFalhouError("recusada");
    }

    if (!resposta.ok) throw new OmieFalhouError(resposta.status === 401 || resposta.status === 403 ? "credenciais_invalidas" : "indisponivel");

    const empresas = corpo?.empresas_cadastro;
    if (!Array.isArray(empresas)) throw new OmieFalhouError("resposta_inesperada");

    const primeira = (empresas[0] ?? null) as Record<string, unknown> | null;
    const cnpj = texto(primeira?.cnpj)?.replace(/\D/g, "") ?? null;
    return {
      razaoSocial: texto(primeira?.razao_social),
      nomeFantasia: texto(primeira?.nome_fantasia),
      cnpj: cnpj && cnpj.length > 0 ? cnpj : null,
    };
  }
}
