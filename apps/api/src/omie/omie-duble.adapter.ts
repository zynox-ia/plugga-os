import { Injectable } from "@nestjs/common";
import type { EmpresaDoOmie } from "@plugga/shared";

import { OmieFalhouError, OmiePort, type CredenciaisDoOmie } from "./omie.port";

/** CNPJ da faixa sintética do projeto (scripts/dados-sinteticos.mjs), quando a chave não traz um. */
const CNPJ_SINTETICO = "99999001000159";

/**
 * O OMIE de mentira, para a integração em `mock` (o padrão): nunca sai para a rede.
 * Chave começando com `sintetico-` vale como uma empresa sintética; com
 * `sintetico-<14 dígitos>`, aquele CNPJ (para testar o bloqueio e a confirmação).
 * Qualquer outra chave responde que o OMIE não foi chamado.
 */
@Injectable()
export class OmieDubleAdapter extends OmiePort {
  async consultarEmpresa(credenciais: CredenciaisDoOmie): Promise<EmpresaDoOmie> {
    const [empresa] = await this.listarEmpresas(credenciais);
    return empresa!;
  }

  async listarEmpresas(credenciais: CredenciaisDoOmie): Promise<EmpresaDoOmie[]> {
    const m = /^sintetico-(\d{14})?/.exec(credenciais.appKey);
    if (!m) throw new OmieFalhouError("modo_mock");
    const cnpj = m[1] ?? CNPJ_SINTETICO;
    return [{ razaoSocial: `EMPRESA SINTÉTICA ${cnpj.slice(0, 5)}`, nomeFantasia: "Sintética (modo mock)", cnpj }];
  }
}
