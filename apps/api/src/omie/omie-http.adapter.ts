import { Injectable } from "@nestjs/common";
import type { EmpresaDoOmie } from "@plugga/shared";

import { OmieFalhouError, OmiePort, type CategoriaDoOmie, type ContaCorrenteDoOmie, type CredenciaisDoOmie } from "./omie.port";

const BASE = "https://app.omie.com.br/api/v1";
const PRAZO_MS = 10_000;
/** 50 por página (o OMIE aceita até 100) e um teto de páginas: um plano de contas maior que isso é resposta inesperada. */
const POR_PAGINA = 50;
const MAXIMO_DE_PAGINAS = 40;

type Corpo = Record<string, unknown>;

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

const sim = (valor: unknown): boolean => texto(valor)?.toUpperCase() === "S";

/** Número ou texto de número, como o OMIE devolve os códigos inteiros. */
function codigo(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isSafeInteger(valor)) return String(valor);
  return texto(valor);
}

/**
 * API do OMIE (JSON sobre POST: `call`, `app_key`, `app_secret`, `param`). A chave
 * e o segredo vão no corpo, então nenhum erro ou log daqui inclui o corpo da
 * requisição, a causa da falha de rede nem a mensagem do OMIE: só o motivo curto.
 */
@Injectable()
export class OmieHttpAdapter extends OmiePort {
  async consultarEmpresa(credenciais: CredenciaisDoOmie): Promise<EmpresaDoOmie> {
    const [primeira] = await this.empresas(credenciais, 1);
    return primeira ?? { razaoSocial: null, nomeFantasia: null, cnpj: null };
  }

  async listarEmpresas(credenciais: CredenciaisDoOmie): Promise<EmpresaDoOmie[]> {
    return this.empresas(credenciais, 50);
  }

  async listarCategorias(credenciais: CredenciaisDoOmie): Promise<CategoriaDoOmie[]> {
    const itens = await this.paginar(credenciais, "geral/categorias", "ListarCategorias", "categoria_cadastro", {});
    return itens.flatMap((item) => {
      const c = item as Corpo;
      const cod = codigo(c.codigo);
      const descricao = texto(c.descricao);
      if (!cod || !descricao) return [];
      return [{
        codigo: cod,
        descricao,
        grupo: codigo(c.categoria_superior),
        receita: sim(c.conta_receita),
        despesa: sim(c.conta_despesa),
        totalizadora: sim(c.totalizadora),
        transferencia: sim(c.transferencia),
        ativa: !sim(c.conta_inativa) && !sim(c.nao_exibir),
      }];
    });
  }

  async listarContasCorrentes(credenciais: CredenciaisDoOmie): Promise<ContaCorrenteDoOmie[]> {
    const itens = await this.paginar(credenciais, "geral/contacorrente", "ListarContasCorrentes", "ListarContasCorrentes", { apenas_importado_api: "N" });
    return itens.flatMap((item) => {
      const c = item as Corpo;
      const cod = codigo(c.nCodCC);
      const descricao = texto(c.descricao);
      if (!cod || !descricao) return [];
      return [{
        codigo: cod,
        descricao,
        banco: texto(c.codigo_banco),
        agencia: texto(c.codigo_agencia),
        numero: texto(c.numero_conta_corrente),
        ativa: !sim(c.inativo),
      }];
    });
  }

  private async empresas(credenciais: CredenciaisDoOmie, registros: number): Promise<EmpresaDoOmie[]> {
    const corpo = await this.chamar(credenciais, "geral/empresas", "ListarEmpresas", { pagina: 1, registros_por_pagina: registros });
    const empresas = corpo.empresas_cadastro;
    if (!Array.isArray(empresas)) throw new OmieFalhouError("resposta_inesperada");
    return empresas.map((item) => {
      const empresa = (item ?? null) as Corpo | null;
      const cnpj = texto(empresa?.cnpj)?.replace(/\D/g, "") ?? null;
      return {
        razaoSocial: texto(empresa?.razao_social),
        nomeFantasia: texto(empresa?.nome_fantasia),
        cnpj: cnpj && cnpj.length > 0 ? cnpj : null,
      };
    });
  }

  /** Todas as páginas de uma listagem (`pagina`, `total_de_paginas` e a lista em `campo`). */
  private async paginar(credenciais: CredenciaisDoOmie, recurso: string, call: string, campo: string, filtros: Corpo): Promise<unknown[]> {
    const itens: unknown[] = [];
    for (let pagina = 1; ; pagina++) {
      const corpo = await this.chamar(credenciais, recurso, call, { ...filtros, pagina, registros_por_pagina: POR_PAGINA });
      const lista = corpo[campo];
      const total = typeof corpo.total_de_paginas === "number" ? corpo.total_de_paginas : null;
      if (!Array.isArray(lista) || total === null) throw new OmieFalhouError("resposta_inesperada");
      itens.push(...lista);
      if (pagina >= total) return itens;
      if (pagina >= MAXIMO_DE_PAGINAS) throw new OmieFalhouError("resposta_inesperada");
    }
  }

  private async chamar(credenciais: CredenciaisDoOmie, recurso: string, call: string, param: Corpo): Promise<Corpo> {
    let resposta: Response;
    try {
      resposta = await fetch(`${BASE}/${recurso}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ call, app_key: credenciais.appKey, app_secret: credenciais.appSecret, param: [param] }),
        signal: AbortSignal.timeout(PRAZO_MS),
      });
    } catch {
      throw new OmieFalhouError("indisponivel");
    }

    if (resposta.status === 425 || resposta.status === 429) throw new OmieFalhouError("limite_de_consumo");

    let corpo: Corpo | null = null;
    try {
      const lido = (await resposta.json()) as unknown;
      if (lido !== null && typeof lido === "object" && !Array.isArray(lido)) corpo = lido as Corpo;
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
    if (corpo === null) throw new OmieFalhouError("resposta_inesperada");
    return corpo;
  }
}
