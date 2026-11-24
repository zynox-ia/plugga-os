import { Injectable } from "@nestjs/common";
import type { EmpresaConsultada, EnderecoConsultado } from "@plugga/shared";

import { ConsultaCadastralPort, FonteIndisponivelError } from "./consulta-cadastral.port";

const BASE = "https://brasilapi.com.br/api";
const PRAZO_MS = 8_000;
/**
 * A BrasilAPI barra com 403 (Cloudflare) o endpoint de CNPJ quando a requisição não traz
 * `User-Agent`, e o `fetch` do Node não manda um. O de CEP não tem esse filtro, então o
 * defeito só aparecia no CNPJ. Identificar o sistema também é o combinado de uso justo.
 */
const USER_AGENT = "Plugga-OS/1.0 (consulta cadastral)";

type Bruto = Record<string, unknown>;

function texto(valor: unknown): string | null {
  if (typeof valor === "number") return String(valor);
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

/**
 * BrasilAPI (https://brasilapi.com.br): dados públicos de CNPJ e CEP, sem
 * credencial. A resposta do provedor nunca sai daqui: mapeamos só o que o
 * sistema usa, e campo ausente vira `null` em vez de derrubar a consulta.
 */
@Injectable()
export class BrasilApiAdapter extends ConsultaCadastralPort {
  async consultarCnpj(cnpj: string): Promise<EmpresaConsultada | null> {
    const bruto = await this.buscar(`${BASE}/cnpj/v1/${cnpj}`);
    if (!bruto) return null;

    const razaoSocial = texto(bruto.razao_social);
    // Sem razão social a resposta não é de uma empresa: formato inesperado.
    if (!razaoSocial) throw new FonteIndisponivelError("resposta sem razão social");

    const codigo = texto(bruto.cnae_fiscal);
    const descricao = texto(bruto.cnae_fiscal_descricao);
    const cep = texto(bruto.cep)?.replace(/\D/g, "") ?? null;

    return {
      cnpj,
      razaoSocial,
      nomeFantasia: texto(bruto.nome_fantasia),
      situacao: texto(bruto.descricao_situacao_cadastral),
      naturezaJuridica: texto(bruto.natureza_juridica),
      porte: texto(bruto.porte),
      abertura: texto(bruto.data_inicio_atividade),
      atividadePrincipal: codigo && descricao ? { codigo, descricao } : null,
      telefone: texto(bruto.ddd_telefone_1),
      email: texto(bruto.email),
      endereco: cep
        ? {
            cep,
            logradouro: texto(bruto.logradouro),
            numero: texto(bruto.numero),
            complemento: texto(bruto.complemento),
            bairro: texto(bruto.bairro),
            cidade: texto(bruto.municipio),
            uf: texto(bruto.uf),
          }
        : null,
    };
  }

  async consultarCep(cep: string): Promise<EnderecoConsultado | null> {
    const bruto = await this.buscar(`${BASE}/cep/v2/${cep}`);
    if (!bruto) return null;
    return {
      cep,
      logradouro: texto(bruto.street),
      numero: null,
      complemento: null,
      bairro: texto(bruto.neighborhood),
      cidade: texto(bruto.city),
      uf: texto(bruto.state),
    };
  }

  /** `null` para 404 (não existe); erro para qualquer outra falha. */
  private async buscar(url: string): Promise<Bruto | null> {
    let resposta: Response;
    try {
      resposta = await fetch(url, { headers: { accept: "application/json", "user-agent": USER_AGENT }, signal: AbortSignal.timeout(PRAZO_MS) });
    } catch {
      throw new FonteIndisponivelError("sem resposta no prazo");
    }
    if (resposta.status === 404) return null;
    if (!resposta.ok) throw new FonteIndisponivelError(`HTTP ${resposta.status}`);

    try {
      const corpo = (await resposta.json()) as unknown;
      if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) throw new Error("formato");
      return corpo as Bruto;
    } catch {
      throw new FonteIndisponivelError("resposta ilegível");
    }
  }
}
